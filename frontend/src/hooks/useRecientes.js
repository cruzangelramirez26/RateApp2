import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../utils/api';
import { preloadCache } from '../utils/preloadCache';
import { useToast } from './useToast';

/**
 * La lógica de Recientes, sin nada de pantalla: lo último que sonó en Spotify
 * (`recently-played`, 50 como máximo) y lo último calificado (la base, las 100
 * con la primera nota más nueva).
 *
 * La usan las dos vistas: la de escritorio (components/escritorio/Recientes.jsx)
 * y la del móvil (components/movil/). La pantalla vieja (RecentPage) se borró el
 * 2026-09-26, cuando el móvil tuvo todas las suyas. Salió de
 * RecentPage en la fase 6 del rediseño (2026-09-25).
 *
 * Calificar aquí es con el FLUJO COMPLETO, como siempre en esta pantalla (no
 * es la cola de /backfill). La nota nueva se pinta en las dos listas y en el
 * cache, y "Calificadas" se vuelve a pedir la próxima vez que se abra, para
 * que la recién calificada aparezca ahí.
 */
export const TABS = [
  { id: 'played', label: 'Escuchadas' },
  { id: 'rated', label: 'Calificadas' },
];

export const idDe = (t) => t.track_id || t.id;

export function useRecientes() {
  const [tab, setTab] = useState('played');
  const [rated, setRated] = useState([]);
  const [played, setPlayed] = useState([]);
  const [loadingRated, setLoadingRated] = useState(true);
  const [loadingPlayed, setLoadingPlayed] = useState(true);
  const [ocupado, setOcupado] = useState(null);   // id que se está guardando
  const ratedPedido = useRef(false);   // ya se pidió "Calificadas"
  const ratedViejo = useRef(false);    // hubo una nota nueva desde entonces
  const toast = useToast();

  const fetchRated = useCallback(async () => {
    setLoadingRated(true);
    if (ratedViejo.current) preloadCache.invalidate('recent');
    ratedPedido.current = true;
    ratedViejo.current = false;
    try {
      const data = await preloadCache.load('recent', () => api.getRecent(100));
      setRated(data || []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoadingRated(false);
    }
  }, [toast]);

  useEffect(() => {
    preloadCache.load('recentlyPlayed', () => api.getRecentlyPlayed())
      .then((data) => setPlayed(data || []))
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoadingPlayed(false));
  }, [toast]);

  useEffect(() => {
    if (tab === 'rated' && (!ratedPedido.current || ratedViejo.current)) fetchRated();
  }, [tab, fetchRated]);

  const ponerNota = (tid, rating) => {
    // Una lista que no se ha cargado va vacía: no se escribe al cache, que la
    // dejaría vacía para siempre.
    const f = (key) => (xs) => {
      if (!xs.length) return xs;
      const n = xs.map((t) => (idDe(t) === tid ? { ...t, rating } : t));
      preloadCache.set(key, n);
      return n;
    };
    setPlayed(f('recentlyPlayed'));
    setRated(f('recent'));
  };

  const calificar = useCallback(async (track, rating) => {
    const tid = idDe(track);
    setOcupado(tid);
    ponerNota(tid, rating);
    try {
      await api.rateTrack({
        track_id: tid,
        name: track.name,
        artist: track.artist,
        album: track.album || '',
        rating,
      });
      ratedViejo.current = true;
      toast(`${track.name} → ${rating}`, 'success');
      return true;
    } catch (err) {
      ponerNota(tid, track.rating);
      toast(`Error: ${err.message}`, 'error');
      return false;
    } finally {
      setOcupado(null);
    }
  }, [toast]);

  return {
    tab, setTab, rated, played, loadingRated, loadingPlayed, ocupado, calificar,
    tracks: tab === 'rated' ? rated : played,
    loading: tab === 'rated' ? loadingRated : loadingPlayed,
  };
}
