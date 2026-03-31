/**
 * LibraryPage — Search and re-rate any song in the database.
 * For songs not in <3333> anymore.
 */
import { useState } from 'react';
import { Library, Search } from 'lucide-react';
import { api } from '../utils/api';
import TrackCard from '../components/TrackCard';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { useToast } from '../hooks/useToast';

export default function LibraryPage() {
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const toast = useToast();

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const data = await api.searchTracks(query.trim(), 100);
      setTracks(data);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

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

  return (
    <div className="page">
      <div style={{ marginBottom: '12px' }}>
        <div className="page-title">Biblioteca</div>
        <div className="page-subtitle">Busca cualquier canción calificada para editar su rating</div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            className="input"
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Nombre o artista..."
            style={{ paddingLeft: '36px' }}
          />
        </div>
        <button
          className="btn"
          onClick={handleSearch}
          disabled={loading || !query.trim()}
        >
          Buscar
        </button>
      </div>

      {loading ? (
        <LoadingSkeleton count={6} />
      ) : !searched ? (
        <div className="empty-state">
          <Library />
          <div>Busca por nombre o artista para encontrar canciones</div>
        </div>
      ) : tracks.length === 0 ? (
        <div className="empty-state">
          <Search />
          <div>No se encontraron canciones para "{query}"</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{
            fontSize: '0.78rem',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            marginBottom: '4px',
          }}>
            {tracks.length} resultados
          </div>
          {tracks.map((t, i) => (
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
