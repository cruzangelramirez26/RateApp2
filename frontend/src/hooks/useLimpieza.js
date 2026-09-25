import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api';
import { preloadCache } from '../utils/preloadCache';
import { useToast } from './useToast';

/**
 * Limpiar Me Gusta (/abandoned), sin nada de pantalla. Salió de CleanupPage
 * el 2026-09-26, tal cual estaba, cuando la pantalla pasó al estilo nuevo.
 *
 * El umbral lo pone Angel, no la app: con la mediana de sus Me Gusta en 20
 * escuchas, 5 ya es "casi nunca" (y en su momento se le dijo que "no existían"
 * midiendo mal). Se trae todo, se ordena de menos a más escuchada y él corta.
 *
 *  - Las SIN DATO van al final en "menos escuchadas": encabezaban la lista
 *    como si tuvieran 0 escuchas (eran las primeras candidatas a borrar).
 *  - Calificar aquí cataloga: soft + primera escucha real.
 *  - Quitar el like es la ÚNICA acción destructiva de la app: nunca sola,
 *    siempre de una selección, con confirmación y a lo más 200 por vez. No
 *    escribe ninguna nota: abandonada no es lo mismo que mala.
 */
const CACHE_KEY = 'cleanupQueue';
export const LOTE = 50;
export const TOPE = 200;

export const ORDENES = [
  { key: 'menos', label: 'Menos escuchadas' },
  { key: 'abandonadas', label: 'Abandonadas' },
  { key: 'mas', label: 'Más escuchadas' },
];

export function useLimpieza() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [orden, setOrden] = useState('menos');
  const [maxPlays, setMaxPlays] = useState('');
  const [q, setQ] = useState('');
  const [soloSinCalificar, setSoloSinCalificar] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [quitando, setQuitando] = useState(false);
  const [armando, setArmando] = useState(false);
  const [linkCola, setLinkCola] = useState(null);
  const [busy, setBusy] = useState(null);

  const cargar = useCallback((forzar = false) => {
    setLoading(true);
    setError(null);
    if (forzar) preloadCache.invalidate(CACHE_KEY);
    preloadCache.load(CACHE_KEY, api.getCleanupQueue)
      .then((d) => setData(d))
      .catch(() => setError('No se pudo cargar tus Me Gusta.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Mantener el cache al día evita que salir y volver muestre datos viejos.
  const aplicarLocal = useCallback((fn) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = fn(prev);
      preloadCache.set(CACHE_KEY, next);
      return next;
    });
  }, []);

  const lista = useMemo(() => {
    let l = data?.tracks || [];
    const tope = parseInt(maxPlays, 10);
    if (!Number.isNaN(tope)) l = l.filter((t) => t.plays <= tope);
    if (soloSinCalificar) l = l.filter((t) => !t.rating);
    if (q.trim()) {
      const s = q.toLowerCase();
      l = l.filter((t) => (t.name || '').toLowerCase().includes(s) || (t.artist || '').toLowerCase().includes(s));
    }
    const copia = [...l];
    if (orden === 'menos') copia.sort((a, b) => (a.sin_datos ? 1 : 0) - (b.sin_datos ? 1 : 0) || a.plays - b.plays);
    else if (orden === 'mas') copia.sort((a, b) => b.plays - a.plays);
    else copia.sort((a, b) => (b.meses_sin_oir || 0) - (a.meses_sin_oir || 0) || b.plays - a.plays);
    return copia;
  }, [data, orden, maxPlays, q, soloSinCalificar]);

  const sinDatos = (data?.tracks || []).filter((x) => x.sin_datos).length;

  const alternar = useCallback((id) => {
    setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);

  /** Marca (o desmarca, si ya estaban todas) las canciones de `ids`. */
  const alternarVarias = useCallback((ids) => {
    setSel((p) => {
      const todas = ids.length > 0 && ids.every((i) => p.has(i));
      const n = new Set(p);
      ids.forEach((i) => (todas ? n.delete(i) : n.add(i)));
      return n;
    });
  }, []);

  const limpiarSeleccion = useCallback(() => setSel(new Set()), []);

  /** Quita el like a las marcadas (las primeras TOPE). Solo tras confirmar. */
  const quitar = useCallback(async () => {
    const ids = [...sel].slice(0, TOPE);
    if (!ids.length) return false;
    setQuitando(true);
    try {
      await api.unlikeTracks(ids);
      const fuera = new Set(ids);
      aplicarLocal((d) => ({ ...d, total: d.total - ids.length, tracks: d.tracks.filter((t) => !fuera.has(t.track_id)) }));
      setSel(new Set());
      toast(`${ids.length} fuera de tus Me Gusta`, 'success', 4000);
      return true;
    } catch (e) {
      toast(e.message || 'No se pudo quitar el like', 'error');
      return false;
    } finally {
      setQuitando(false);
    }
  }, [sel, aplicarLocal, toast]);

  /** Siempre cataloga: soft + primera escucha real. */
  const calificar = useCallback(async (t, rating) => {
    setBusy(t.track_id);
    try {
      await api.rateTrackSoft({
        track_id: t.track_id, name: t.name, artist: t.artist, album: t.album || '', rating,
        added_at: t.suggested_added_at || undefined,
      });
      aplicarLocal((d) => ({ ...d, tracks: d.tracks.map((x) => (x.track_id === t.track_id ? { ...x, rating } : x)) }));
      toast(`${t.name} → ${rating}`, 'success');
      return true;
    } catch {
      toast('No se pudo guardar la calificación', 'error');
      return false;
    } finally {
      setBusy(null);
    }
  }, [aplicarLocal, toast]);

  /** El tramo exacto que se ve, desde `desde`, como playlist real. */
  const escuchar = useCallback(async (desde = 0) => {
    setArmando(true);
    try {
      const ids = lista.slice(desde, desde + LOTE).map((t) => t.track_id);
      const r = await api.buildQueuePlaylist('cleanup', LOTE, true, ids);
      setLinkCola(r.playing ? null : { url: r.spotify_url, count: r.count, error: r.error });
      toast(
        r.playing ? `Sonando ${r.count} canciones desde la #${desde + 1}` : (r.error || 'Playlist lista, pero no se pudo reproducir'),
        r.playing ? 'success' : 'error', 5000,
      );
    } catch (e) {
      setLinkCola(null);
      toast(e.message || 'No se pudo armar la playlist', 'error');
    } finally {
      setArmando(false);
    }
  }, [lista, toast]);

  return {
    data, loading, error, cargar, lista, sinDatos,
    orden, setOrden, maxPlays, setMaxPlays, q, setQ, soloSinCalificar, setSoloSinCalificar,
    sel, alternar, alternarVarias, limpiarSeleccion, quitar, quitando,
    busy, calificar, armando, escuchar, linkCola, cerrarLinkCola: () => setLinkCola(null),
  };
}
