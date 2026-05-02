import { useState, useEffect, useCallback } from 'react';
import { Music, RefreshCw } from 'lucide-react';
import { api } from '../utils/api';
import TrackCard from '../components/TrackCard';
import SearchBar from '../components/SearchBar';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { useToast } from '../hooks/useToast';

export default function PendingPage() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();

  const fetchTracks = useCallback(async () => {
    try {
      const data = await api.getPending();
      setTracks(data);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { fetchTracks(); }, [fetchTracks]);

  const handleRate = async (track, rating) => {
    setTracks(prev =>
      prev.map(t => t.id === track.id ? { ...t, rating } : t)
    );
    try {
      await api.rateTrack({
        track_id: track.id,
        name: track.name,
        artist: track.artist,
        album: track.album || '',
        rating,
      });
      toast(`${track.name} → ${rating}`, 'success');
    } catch (err) {
      setTracks(prev =>
        prev.map(t => t.id === track.id ? { ...t, rating: track.rating } : t)
      );
      toast(`Error: ${err.message}`, 'error');
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    fetchTracks();
  };

  const filtered = search
    ? tracks.filter(t =>
        `${t.name} ${t.artist}`.toLowerCase().includes(search.toLowerCase())
      )
    : tracks;

  const unrated = filtered.filter(t => !t.rating);
  const rated = filtered.filter(t => t.rating);

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div>
          <div className="page-title">Calificar</div>
          <div className="page-subtitle">
            {tracks.length} canciones · {unrated.length} sin calificar
          </div>
        </div>
        <button
          className="btn btn-sm"
          onClick={handleRefresh}
          disabled={refreshing}
          style={{ opacity: refreshing ? 0.5 : 1 }}
        >
          <RefreshCw size={14} style={{
            animation: refreshing ? 'spin 1s linear infinite' : 'none',
          }} />
        </button>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Buscar canción o artista..."
        />
      </div>

      {loading ? (
        <LoadingSkeleton count={8} />
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Music />
          <div>
            {search ? 'Sin resultados' : 'No hay canciones en la playlist <3333>'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {unrated.map((t, i) => (
            <TrackCard key={t.id} track={t} onRate={handleRate} index={i} />
          ))}

          {unrated.length > 0 && rated.length > 0 && (
            <div style={{
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontWeight: 600,
              padding: '12px 0 4px',
              fontFamily: 'var(--font-mono)',
            }}>
              ya calificadas ({rated.length})
            </div>
          )}

          {rated.map((t, i) => (
            <TrackCard key={t.id} track={t} onRate={handleRate} index={unrated.length + i} />
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
