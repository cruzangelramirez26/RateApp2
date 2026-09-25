import { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/api';
import { preloadCache } from '../utils/preloadCache';
import { nombreCuatri } from '../utils/cuatrimestres';
import { useToast } from './useToast';

/**
 * La lógica de Biblioteca, sin nada de pantalla.
 *
 * La usan las dos vistas: la de siempre (LibraryPage, el móvil y las ventanas
 * angostas) y la de escritorio (components/escritorio/Biblioteca.jsx). Salió de
 * LibraryPage en la fase 4 del rediseño (2026-09-25) tal cual estaba.
 *
 * `lista` es 'liked' (los Me Gusta nativos, de 500 en 500), una playlist
 * ('perla', 'miel', 'latte', 'anual', 'calificar', 'mis_me_gusta') o '' tras
 * una búsqueda.
 *
 * LA REGLA QUE NO SE MUEVE: en Me Gusta se califica en SOFT (solo DB, sin
 * distribuir); en cualquier playlist, con el flujo completo.
 */
export const PAGE_SIZE = 500;

export const RATING_ORDER = { D: 0, C: 1, 'C+': 2, B: 3, 'B+': 4, A: 5, 'A+': 6 };

export const idDe = (t) => t.track_id || t.id;

/** El cuatrimestre de una canción: override, o el mes de su primera nota. */
export function computeCuatrimestre(track) {
  if (track.cuatrimestre_override) return track.cuatrimestre_override;
  const dateStr = track.db_added_at;
  if (!dateStr) return null;
  const dt = new Date(dateStr);
  if (isNaN(dt.getTime())) return null;
  const m = dt.getMonth() + 1;
  if (m <= 4) return 'perla';
  if (m <= 8) return 'miel';
  return 'latte';
}

/** Su nombre visible (el del año que le toca: en 2025 eran Savia/Lirio/Marea). */
export function getCuatriLabel(track) {
  const cuatri = computeCuatrimestre(track);
  if (!cuatri) return null;
  let year;
  if (track.cuatrimestre_override) {
    year = new Date().getFullYear();
  } else {
    const dt = track.db_added_at ? new Date(track.db_added_at) : null;
    year = dt && !isNaN(dt.getTime()) ? dt.getFullYear() : new Date().getFullYear();
  }
  return nombreCuatri(cuatri, year);
}

/** 'spotify' deja el orden de la lista; 'recent' por fecha de nota; 'rating'. */
export function ordenar(tracks, modo) {
  if (modo === 'recent') {
    return [...tracks].sort((a, b) => {
      const da = new Date(a.rated_at || a.db_added_at || a.added_at || 0);
      const db = new Date(b.rated_at || b.db_added_at || b.added_at || 0);
      return db - da;
    });
  }
  if (modo === 'rating') {
    return [...tracks].sort((a, b) => (RATING_ORDER[b.rating] ?? -1) - (RATING_ORDER[a.rating] ?? -1));
  }
  return tracks;
}

export function useBiblioteca() {
  const [lista, setLista] = useState('liked');
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [likedOffset, setLikedOffset] = useState(0);
  const [hasMoreLiked, setHasMoreLiked] = useState(false);
  const toast = useToast();

  const isLikedView = lista === 'liked';

  const loadLiked = useCallback(async () => {
    setLoading(true);
    setLista('liked');
    setLikedOffset(0);
    try {
      const data = await preloadCache.load('likedAll', () => api.getLikedAll(PAGE_SIZE, 0));
      setTracks(data || []);
      setHasMoreLiked((data?.length ?? 0) >= PAGE_SIZE);
      setLikedOffset(PAGE_SIZE);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadMoreLiked = useCallback(async () => {
    setLoadingMore(true);
    try {
      const data = await api.getLikedAll(PAGE_SIZE, likedOffset);
      setTracks((prev) => [...prev, ...data]);
      setHasMoreLiked(data.length >= PAGE_SIZE);
      setLikedOffset((prev) => prev + PAGE_SIZE);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoadingMore(false);
    }
  }, [likedOffset, toast]);

  useEffect(() => { loadLiked(); }, [loadLiked]);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) return;
    setLoading(true);
    setLista('');
    setHasMoreLiked(false);
    try {
      const data = await api.searchTracks(q.trim(), 200);
      setTracks(data);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const seleccionar = useCallback(async (key) => {
    if (key === 'liked') { loadLiked(); return; }
    setLoading(true);
    setLista(key);
    setHasMoreLiked(false);
    try {
      const dist = await preloadCache.load('distribution', () => api.getDistribution());
      const playlistId = dist[key];
      if (!playlistId) throw new Error('No hay playlist para esta opción');
      const data = await preloadCache.load(`playlist_${key}`, () => api.getPlaylistTracks(playlistId));
      setTracks(data || []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, loadLiked]);

  // La nota nueva también se escribe en el cache de esa lista: si no, al salir
  // y volver la canción aparecería con la nota vieja.
  const reflejarEnCache = useCallback((key, tid, rating) => {
    if (!key) return;
    const cacheKey = key === 'liked' ? 'likedAll' : `playlist_${key}`;
    // peek y no load: load con un fetcher vacío dejaría `null` en el cache.
    const d = preloadCache.peek(cacheKey);
    if (Array.isArray(d)) preloadCache.set(cacheKey, d.map((t) => (idDe(t) === tid ? { ...t, rating } : t)));
  }, []);

  const calificar = useCallback(async (track, rating) => {
    const tid = idDe(track);
    const previo = track.rating;
    const soft = lista === 'liked';
    setTracks((prev) => prev.map((t) => (idDe(t) === tid ? { ...t, rating } : t)));
    try {
      const rateArgs = {
        track_id: tid, name: track.name,
        artist: track.artist, album: track.album || '', rating,
      };
      await (soft ? api.rateTrackSoft(rateArgs) : api.rateTrack(rateArgs));
      reflejarEnCache(lista, tid, rating);
      toast(`${track.name} → ${rating}`, 'success');
      return true;
    } catch (err) {
      setTracks((prev) => prev.map((t) => (idDe(t) === tid ? { ...t, rating: previo } : t)));
      toast(`Error: ${err.message}`, 'error');
      return false;
    }
  }, [lista, reflejarEnCache, toast]);

  return {
    lista, isLikedView, tracks, loading, loadingMore, hasMoreLiked,
    loadLiked, loadMoreLiked, seleccionar, doSearch, calificar,
  };
}
