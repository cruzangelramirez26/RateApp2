import { useState, useCallback } from 'react';
import { Search, Music, List, Clock, ArrowUpDown } from 'lucide-react';
import { api } from '../utils/api';
import TrackCard from '../components/TrackCard';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { useToast } from '../hooks/useToast';

const QUICK_PLAYLISTS = ['Perla', 'Miel', 'Latte', 'Galería', '3333'];

export default function LibraryPage() {
  const [search, setSearch] = useState('');
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [lastQuery, setLastQuery] = useState('');
  const [sortMode, setSortMode] = useState('spotify');
  const toast = useToast();

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    setLastQuery(q.trim());
    try {
      const data = await api.getLibrary(q);
      setTracks(data);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const handleSearch = () => doSearch(search);
  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSearch(); };
  const handleChip = (name) => { setSearch(name); doSearch(name); };

  const handleRate = async (track, rating) => {
    setTracks(prev => prev.map(t => t.id === track.id ? { ...t, rating } : t));
    try {
      await api.rateTrack({
        track_id: track.id, name: track.name,
        artist: track.artist, album: track.album || '', rating,
      });
      toast(`${track.name} → ${rating}`, 'success');
    } catch (err) {
      setTracks(prev => prev.map(t => t.id === track.id ? { ...t, rating: track.rating } : t));
      toast(`Error: ${err.message}`, 'error');
    }
  };

  const sorted = [...tracks].sort((a, b) => {
    if (sortMode === 'recent') {
      return new Date(b.added_at || 0) - new Date(a.added_at || 0);
    }
    // Orden Spotify: posición en la playlist
    const oa = a.spotify_position ?? a.manual_order ?? 999;
    const ob = b.spotify_position ?? b.manual_order ?? 999;
    return oa - ob;
  });

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Biblioteca</div>
        <div className="page-subtitle">Busca por playlist o por nombre de canción</div>
      </div>

      {/* Buscador */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={16} style={{
            position: 'absolute', left: '12px', top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)', pointerEvents: 'none',
          }} />
          <input
            type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Perla, Miel, Latte, nombre de canción..."
            style={{
              width: '100%', padding: '10px 12px 10px 36px',
              background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
              borderRadius: '10px', color: 'var(--text-primary)',
              fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <button className="btn" onClick={handleSearch} disabled={loading || !search.trim()}>
          Buscar
        </button>
      </div>

      {/* Chips */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {QUICK_PLAYLISTS.map(pl => (
          <button key={pl} onClick={() => handleChip(pl)} style={{
            padding: '5px 14px', borderRadius: '20px',
            fontSize: '0.78rem', fontWeight: 600,
            border: '1px solid var(--border-subtle)',
            background: lastQuery.toLowerCase() === pl.toLowerCase() ? 'var(--accent)' : 'var(--bg-card)',
            color: lastQuery.toLowerCase() === pl.toLowerCase() ? '#fff' : 'var(--text-muted)',
            cursor: 'pointer', transition: 'all 0.15s',
          }}>
            {pl}
          </button>
        ))}
      </div>

      {/* Controles de orden */}
      {tracks.length > 0 && !loading && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', alignItems: 'center' }}>
          <ArrowUpDown size={13} style={{ color: 'var(--text-muted)' }} />
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginRight: '2px' }}>Orden:</span>
          {[
            { key: 'spotify', icon: <List size={12} />, label: 'Spotify' },
            { key: 'recent',  icon: <Clock size={12} />, label: 'Recientes' },
          ].map(({ key, icon, label }) => (
            <button key={key} onClick={() => setSortMode(key)} style={{
              padding: '5px 12px', borderRadius: '20px',
              fontSize: '0.78rem', fontWeight: 600, border: '1px solid',
              borderColor: sortMode === key ? 'var(--accent)' : 'var(--border-subtle)',
              background: sortMode === key ? 'var(--accent)' : 'transparent',
              color: sortMode === key ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer', transition: 'all 0.15s',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              {icon} {label}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {tracks.length} canción{tracks.length !== 1 ? 'es' : ''}
          </span>
        </div>
      )}

      {/* Contenido */}
      {loading ? (
        <LoadingSkeleton count={8} />
      ) : !searched ? (
        <div className="empty-state">
          <Music />
          <div>Busca por playlist o canción</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Toca un chip arriba o escribe el nombre
          </div>
        </div>
      ) : sorted.length === 0 ? (
        <div className="empty-state">
          <Music />
          <div>Sin resultados para "{lastQuery}"</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {sorted.map((t, i) => (
            <TrackCard key={t.id} track={t} onRate={handleRate} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
