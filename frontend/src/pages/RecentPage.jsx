/**
 * RecentPage — View and re-rate recently classified tracks.
 */
import { useState, useEffect, useCallback } from 'react';
import { Clock } from 'lucide-react';
import { api } from '../utils/api';
import TrackCard from '../components/TrackCard';
import SearchBar from '../components/SearchBar';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { useToast } from '../hooks/useToast';

export default function RecentPage() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const toast = useToast();

  const fetchRecent = useCallback(async () => {
    try {
      const data = await api.getRecent(100);
      setTracks(data);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchRecent(); }, [fetchRecent]);

  const handleRate = async (track, rating) => {
    const tid = track.track_id || track.id;
    setTracks(prev =>
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
      setTracks(prev =>
        prev.map(t => (t.track_id || t.id) === tid ? { ...t, rating: track.rating } : t)
      );
      toast(`Error: ${err.message}`, 'error');
    }
  };

  const filtered = search
    ? tracks.filter(t =>
        `${t.name} ${t.artist}`.toLowerCase().includes(search.toLowerCase())
      )
    : tracks;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Recientes</div>
        <div className="page-subtitle">{tracks.length} canciones calificadas</div>
        <div style={{ marginTop: '12px' }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar en recientes..." />
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton count={8} />
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Clock />
          <div>{search ? 'Sin resultados' : 'No hay canciones recientes'}</div>
        </div>
      ) : (
        <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filtered.map((t, i) => (
            <TrackCard
              key={t.track_id || t.id}
              track={{
                ...t,
                id: t.track_id || t.id,
              }}
              onRate={handleRate}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}
