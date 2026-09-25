import { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/api';
import { preloadCache } from '../utils/preloadCache';
import { useToast } from './useToast';

/**
 * La cola de "califica lo que sí escuchas" (/backfill), sin nada de pantalla.
 * Salió de BackfillPage el 2026-09-26, tal cual estaba, cuando la pantalla
 * pasó al estilo nuevo (vistas en components/escritorio y components/movil).
 *
 * 1,537 de los 2,328 Me Gusta (66%) nunca pasaron por RateApp. 1,520 de esas
 * son de antes de 2026: calificarlas con el flujo normal las metería a
 * PT.-3 y a la Galería Anual, arriba de todo por el bloque de novedades. Por
 * eso hay DOS acciones distintas y visibles:
 *
 *   catalogar -> soft + fecha de la PRIMERA escucha real: queda en su época y
 *     no toca ninguna playlist. Es el default.
 *   subir -> el flujo completo ("a mi rotación"): entra al cuatrimestre
 *     actual + MMG + Galería + like, con override (rate_track ya lo hace bien
 *     porque la canción nace fechada en su época).
 *
 * Lo que suena se toma del SonandoCtx del marco (un solo sondeo), no de un
 * sondeo propio como antes.
 */
const CACHE_KEY = 'backfillQueue';
export const LOTE = 50;

export function useBackfill() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [soloActivas, setSoloActivas] = useState(true);
  const [busy, setBusy] = useState(null);
  const [hechas, setHechas] = useState(0);
  const [armando, setArmando] = useState(false);
  const [linkCola, setLinkCola] = useState(null);

  // Cacheada en sesión: la petición recorre los ~2,300 Me Gusta de Spotify y tarda.
  const cargar = useCallback((forzar = false) => {
    setLoading(true);
    setError(null);
    if (forzar) preloadCache.invalidate(CACHE_KEY);
    preloadCache.load(CACHE_KEY, api.getBackfillQueue)
      .then((d) => setData(d))
      .catch(() => setError('No se pudo cargar la cola.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const lista = (data?.tracks || []).filter((t) => !soloActivas || t.activa);

  const quitar = useCallback((id) => {
    setData((d) => {
      if (!d) return d;
      const next = {
        ...d,
        total_pending: d.total_pending - 1,
        activas: d.activas - (d.tracks.find((x) => x.track_id === id)?.activa ? 1 : 0),
        tracks: d.tracks.filter((x) => x.track_id !== id),
      };
      preloadCache.set(CACHE_KEY, next);   // que el cache no quede viejo
      return next;
    });
  }, []);

  const args = (t, rating) => ({
    track_id: t.track_id, name: t.name, artist: t.artist, album: t.album || '', rating,
    // undefined y no null: con null el backend fecharía hoy.
    added_at: t.suggested_added_at || undefined,
  });

  /** Califica = cataloga. Soft + primera escucha: no toca Spotify. */
  const catalogar = useCallback(async (t, rating) => {
    setBusy(t.track_id);
    try {
      await api.rateTrackSoft(args(t, rating));
      quitar(t.track_id);
      setHechas((h) => h + 1);
      toast(`${t.name} → ${rating}`, 'success');
      return true;
    } catch {
      toast('No se pudo guardar la calificación', 'error');
      return false;
    } finally {
      setBusy(null);
    }
  }, [quitar, toast]);

  /** Flujo completo: se comporta como una canción nueva y entra a las playlists. */
  const subir = useCallback(async (t, rating) => {
    setBusy(t.track_id);
    try {
      await api.rateTrack(args(t, rating));
      quitar(t.track_id);
      setHechas((h) => h + 1);
      toast(`${t.name} → ${rating}, y a tu rotación de este cuatrimestre`, 'success');
      return true;
    } catch {
      toast('No se pudo subir a la rotación', 'error');
      return false;
    } finally {
      setBusy(null);
    }
  }, [quitar, toast]);

  /**
   * Arma una playlist real con el tramo EXACTO que se ve (desde `desde`) y la
   * reproduce. Si no pudo sonar, deja el link (la playlist sí quedó armada).
   */
  const escuchar = useCallback(async (desde = 0) => {
    setArmando(true);
    try {
      const ids = lista.slice(desde, desde + LOTE).map((x) => x.track_id);
      const r = await api.buildQueuePlaylist('backfill', LOTE, true, ids);
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
    data, loading, error, cargar, lista, soloActivas, setSoloActivas,
    busy, hechas, catalogar, subir,
    armando, escuchar, linkCola, cerrarLinkCola: () => setLinkCola(null),
  };
}
