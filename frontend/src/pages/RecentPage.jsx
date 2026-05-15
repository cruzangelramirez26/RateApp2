/**
 * RecentPage — Toggle between recently rated and recently played on Spotify.
 */
import { useState, useEffect, useCallback } from 'react';
import { Clock } from 'lucide-react';
import { api } from '../utils/api';
import TrackCard from '../components/TrackCard';
import SearchBar from '../components/SearchBar';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { useToast } from '../hooks/useToast';

const TABS = [
  { id: 'rated', label: 'Calificados' },
  { id: 'played', label: 'Escuchados' },
];

export default function RecentPage() {
  const [tab, setTab] = useState('rated');
  const [rated, setRated] = useState([]);
  const [played, setPlayed] = useState([]);
  const [loadingRated, setLoadingRated] = useState(true);
  const [loadingPlayed, setLoadingPlayed] = useState(false);
  const [playedFetched, setPlayedFetched] = useState(false);
  const [search, setSearch] = useState('');
  const toast = useToast();

  const fetchRated = useCallback(async () => {
    try {
      const data = await api.getRecent(100);
      setRated(data);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoadingRated(false);
    }
  }, [toast]);

  const fetchPlayed = useCallback(async () => {
    if (playedFetched) return;
    setLoadingPlayed(true);
    try {
      const data = await api.getRecentlyPlayed();
      setPlayed(data);
      setPlayedFetched(true);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoadingPlayed(false);
    }
  }, [playedFetched, toast]);

  useEffect(() => { fetchRated(); }, [fetchRated]);

  useEffect(() => {
    if (tab === 'played') fetchPlayed();
  }, [tab, fetchPlayed]);

  const handleRate = async (track, rating, isPlayed = false) => {
    const tid = track.track_id || track.id;
    const setter = isPlayed ? setPlayed : setRated;

    setter(prev =>
      prev.map(t => (t.track_id || t.id) === tid ? { ...t, rating } : t)
    );

    try {
      await api.rateTrack({
        track_id: tid,
        name: track.name,
        artist: track.artist,
        album: track.album || '',
        rating,
      });
      toast(`${track.name} → ${rating}`, 'success');
    } catch (err) {
      setter(prev =>
        prev.map(t => (t.track_id || t.id) === tid ? { ...t, rating: track.rating } : t)
      );
      toast(`Error: ${err.message}`, 'error');
    }
  };

  const tracks = tab === 'rated' ? rated : played;
  const loading = tab === 'rated' ? loadingRated : loadingPlayed;
  const isPlayed = tab === 'played';

  const filtered = search
    ? tracks.filter(t =>
        `${t.name} ${t.artist}`.toLowerCase().includes(search.toLowerCase())
      )
    : tracks;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Recientes</div>
        <div className="stats-filter-tabs" style={{ marginTop: '12px', marginBottom: '4px' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`stats-filter-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => { setTab(t.id); setSearch(''); }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="page-subtitle">
          {loading ? '…' : `${filtered.length} canciones`}
        </div>
        <div style={{ marginTop: '12px' }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar..." />
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton count={8} />
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Clock />
          <div>{search ? 'Sin resultados' : 'No hay canciones'}</div>
        </div>
      ) : (
        <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filtered.map((t, i) => (
            <TrackCard
              key={t.track_id || t.id}
              track={{ ...t, id: t.track_id || t.id }}
              onRate={(track, rating) => handleRate(track, rating, isPlayed)}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}
