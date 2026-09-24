import { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/api';
import { preloadCache } from '../utils/preloadCache';
import { useToast } from './useToast';
import { escucharCalificadas, anunciarCalificada } from '../utils/reproductor';

/**
 * La lógica de Calificar (la cola de <3333>), sin nada de pantalla.
 *
 * La usan las dos vistas: la de siempre (PendingPage, el móvil y las ventanas
 * angostas) y la de escritorio (components/escritorio/Calificar.jsx). Salió de
 * PendingPage en la fase 2 del rediseño (2026-09-24) tal cual estaba, para que
 * el móvil no cambie en nada.
 *
 * `search` filtra por nombre y artista. `cola` son las SIN nota, con las
 * saltadas al final en el orden en que se saltaron.
 */
export function useCalificar(search = '') {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [skippedIds, setSkippedIds] = useState(() => new Set());
  const [calificarId, setCalificarId] = useState(null);   // id de la playlist <3333
  const [playing, setPlaying] = useState(false);          // request de play en vuelo
  const toast = useToast();

  const fetchTracks = useCallback(async () => {
    try {
      const data = await api.getPending();
      setTracks(data);
      setSkippedIds(new Set());
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { fetchTracks(); }, [fetchTracks]);

  // Id de <3333> para poder reproducir la canción DENTRO de la playlist.
  // App.jsx ya primea 'distribution', así que normalmente sale de cache.
  useEffect(() => {
    preloadCache.load('distribution', api.getDistribution)
      .then((dist) => setCalificarId(dist?.calificar ?? null))
      .catch(() => {});
  }, []);

  // Lo calificado en el reproductor (u otra ventana) se refleja en la lista.
  useEffect(() => escucharCalificadas((id, rating) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, rating } : t)));
  }), []);

  const refresh = useCallback(() => {
    setRefreshing(true);
    fetchTracks();
  }, [fetchTracks]);

  /** Califica con el flujo completo. Devuelve true si el backend respondió bien. */
  const calificar = useCallback(async (track, rating) => {
    setTracks((prev) => prev.map((t) => (t.id === track.id ? { ...t, rating } : t)));
    setSkippedIds((prev) => {
      if (!prev.has(track.id)) return prev;
      const next = new Set(prev);
      next.delete(track.id);
      return next;
    });
    try {
      await api.rateTrack({
        track_id: track.id,
        name: track.name,
        artist: track.artist,
        album: track.album || '',
        rating,
      });
      anunciarCalificada(track.id, rating);
      toast(`${track.name} → ${rating}`, 'success');
      return true;
    } catch (err) {
      setTracks((prev) => prev.map((t) => (t.id === track.id ? { ...t, rating: track.rating } : t)));
      toast(`Error: ${err.message}`, 'error');
      return false;
    }
  }, [toast]);

  /** Reproduce la canción dentro de <3333> con shuffle apagado. */
  const escuchar = useCallback(async (track) => {
    if (!track || playing) return false;
    setPlaying(true);
    try {
      await api.playInContext(track.id, calificarId);
      toast(`▶ ${track.name} en <3333>`, 'success');
      return true;
    } catch (err) {
      // El backend manda el motivo real (sin dispositivo / sin Premium)
      const msg = String(err.message || '').replace(/^\d+:\s*/, '');
      let detail = msg;
      try { detail = JSON.parse(msg).detail || msg; } catch { /* no era JSON */ }
      toast(detail, 'error');
      return false;
    } finally {
      setPlaying(false);
    }
  }, [playing, calificarId, toast]);

  const saltar = useCallback((track) => {
    if (!track) return;
    setSkippedIds((prev) => new Set([...prev, track.id]));
  }, []);

  const filtered = search
    ? tracks.filter((t) => `${t.name} ${t.artist}`.toLowerCase().includes(search.toLowerCase()))
    : tracks;
  const unrated = filtered.filter((t) => !t.rating);
  const rated = filtered.filter((t) => t.rating);
  const cola = [
    ...unrated.filter((t) => !skippedIds.has(t.id)),
    ...unrated.filter((t) => skippedIds.has(t.id)),
  ];

  return {
    tracks, filtered, unrated, rated, cola,
    loading, refreshing, refresh,
    calificarId, playing,
    calificar, escuchar, saltar,
  };
}
