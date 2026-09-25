import { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/api';
import { preloadCache } from '../utils/preloadCache';
import { useToast } from './useToast';

/**
 * La lógica de "Mis más escuchadas" (/window), sin nada de pantalla.
 *
 * La usan las dos vistas: la de siempre (WindowPage, el móvil y las ventanas
 * angostas) y la de escritorio (components/escritorio/Escuchas.jsx). Salió de
 * WindowPage en la fase 3 del rediseño (2026-09-24) tal cual estaba.
 *
 * LA REGLA QUE NO SE MUEVE: calificar aquí es SIEMPRE soft y SIEMPRE con la
 * fecha de la primera escucha real (`suggested_added_at`, que sale del
 * agregado). El `first_played` de la ventana es la primera escucha DENTRO de
 * la ventana: fechar con eso una canción de 2019 la volvería "nueva" y la
 * metería al cuatrimestre actual + Galería + Me Gusta. En el top de 30 días,
 * 48 de 100 son de antes de 2026 (medido el 2026-09-21).
 */
export function useEscuchas(dias) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);         // track_id que se está guardando
  const [armando, setArmando] = useState(false);  // playlist de la ventana en vuelo
  const [linkCola, setLinkCola] = useState(null);
  const toast = useToast();

  // Una clave de cache POR VENTANA: son consultas distintas, y cambiar de
  // pestaña no debe volver a esperar la que ya se pidió.
  const cacheKey = `window_${dias}`;

  const cargar = useCallback((forzar = false) => {
    setLoading(true);
    setError(null);
    if (forzar) preloadCache.invalidate(cacheKey);
    preloadCache.load(cacheKey, () => api.getListeningWindow(dias, 100))
      .then((d) => setData(d))
      .catch(() => setError('No se pudo leer tu historial de escuchas.'))
      .finally(() => setLoading(false));
  }, [dias, cacheKey]);

  useEffect(() => { cargar(); }, [cargar]);

  const aplicarLocal = useCallback((fn) => {
    setData((d) => {
      if (!d) return d;
      const next = fn(d);
      preloadCache.set(cacheKey, next);   // que el cache no quede viejo
      return next;
    });
  }, [cacheKey]);

  const calificar = useCallback(async (t, rating) => {
    setBusy(t.track_id);
    try {
      await api.rateTrackSoft({
        track_id: t.track_id, name: t.name, artist: t.artist,
        album: t.album || '', rating,
        added_at: t.suggested_added_at || undefined,
      });
      aplicarLocal((d) => ({
        ...d,
        sin_calificar: Math.max(0, (d.sin_calificar || 0) - (t.rating ? 0 : 1)),
        items: d.items.map((x) => (x.track_id === t.track_id ? { ...x, rating } : x)),
      }));
      return true;
    } catch {
      toast('No se pudo guardar la calificación', 'error');
      return false;
    } finally {
      setBusy(null);
    }
  }, [aplicarLocal, toast]);

  // El mix de una ventana: una playlist REAL con sus favoritas de ese periodo.
  // Se manda el tramo exacto de `lista` que se pidió, desde `desde`.
  const escuchar = useCallback(async (lista, desde = 0) => {
    setArmando(true);
    try {
      const ids = lista.slice(desde, desde + 50).map((t) => t.track_id);
      const r = await api.buildQueuePlaylist('window', 50, true, ids);
      setLinkCola(r.playing ? null : { url: r.spotify_url, count: r.count, error: r.error });
      toast(
        r.playing
          ? `Sonando ${r.count} canciones desde la #${desde + 1}`
          : (r.error || 'Playlist lista, pero no se pudo reproducir'),
        r.playing ? 'success' : 'error', 5000,
      );
      return !!r.playing;
    } catch (e) {
      setLinkCola(null);
      toast(e.message || 'No se pudo armar la playlist', 'error');
      return false;
    } finally {
      setArmando(false);
    }
  }, [toast]);

  return {
    data, loading, error, cargar, busy, calificar,
    armando, escuchar, linkCola, cerrarLinkCola: () => setLinkCola(null),
  };
}
