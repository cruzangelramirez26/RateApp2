import { useState, useCallback, useEffect } from 'react';
import { Search, Music, ArrowUpDown } from 'lucide-react';
import { api } from '../utils/api';
import TrackCard from '../components/TrackCard';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { useToast } from '../hooks/useToast';

const QUICK_PLAYLISTS = [
  { label: 'Me Gusta', key: 'liked' },
  { label: 'Perla',   key: 'perla' },
  { label: 'Miel',    key: 'miel' },
  { label: 'Latte',   key: 'latte' },
  { label: 'Galería', key: 'anual' },
  { label: '3333',    key: 'calificar' },
];

export default function LibraryPage() {
  const [search, setSearch] = useState('');
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeChip, setActiveChip] = useState('liked');
  const [sortMode, setSortMode] = useState('spotify');
  const [isLikedView, setIsLikedView] = useState(true);
  const toast = useToast();

  const loadLiked = useCallback(async () => {
    setLoading(true);
    setActiveChip('liked');
    setIsLikedView(true);
    setSearch('');
    try {
      const data = await api.getLikedAll();
      setTracks(data);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadLiked(); }, [loadLiked]);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) return;
    setLoading(true);
    setActiveChip('');
    setIsLikedView(false);
    try {
      const data = await api.searchTracks(q.trim(), 200);
      setTracks(data);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const handleChip = useCallback(async (key) => {
    if (key === 'liked') { loadLiked(); return; }
    setLoading(true);
    setActiveChip(key);
    setIsLikedView(false);
    setSearch('');
    try {
      const dist = await api.getDistribution();
      const playlistId = key === 'calificar' ? dist.calificar : dist[key];
      if (!playlistId) throw new Error(`No hay playlist para esta opción`);
      const data = await api.getPlaylistTracks(playlistId);
      setTracks(data);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast, loadLiked]);

  const handleSearch = () => doSearch(search);
  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSearch(); };

  const handleRate = async (track, rating) => {
    const tid = track.track_id || track.id;
    setTracks(prev => prev.map(t => (t.track_id || t.id) === tid ? { ...t, rating } : t));
    try {
      const rateArgs = {
        track_id: tid, name: track.name,
        artist: track.artist, album: track.album || '', rating,
      };
      await (isLikedView ? api.rateTrackSoft(rateArgs) : api.rateTrack(rateArgs));
      toast(`${track.name} → ${rating}`, 'success');
    } catch (err) {
      setTracks(prev => prev.map(t => (t.track_id || t.id) === tid ? { ...t, rating: track.rating } : t));
      toast(`Error: ${err.message}`, 'error');
    }
  };

  const filtered = search
    ? tracks.filter(t =>
        `${t.name} ${t.artist} ${t.album || ''}`.toLowerCase().includes(search.toLowerCase())
      )
    : tracks;

  const sorted = sortMode === 'recent'
    ? [...filtered].sort((a, b) => {
        const da = new Date(a.rated_at || a.added_at || 0);
        const db = new Date(b.rated_at || b.added_at || 0);
        return db - da;
      })
    : filtered;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Biblioteca</div>
        <div className="page-subtitle">
          {isLikedView ? 'Tus Me Gusta de Spotify' : 'Busca por playlist o canción'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={16} style={{
            position: 'absolute', left: '12px', top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)', pointerEvents: 'none',
          }} />
          <input
            className="input"
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isLikedView ? 'Filtrar por nombre, artista o álbum...' : 'Nombre o artista...'}
            style={{ paddingLeft: '36px' }}
          />
        </div>
        {!isLikedView && (
          <button className="btn" onClick={handleSearch} disabled={loading || !search.trim()}>
            Buscar
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {QUICK_PLAYLISTS.map(({ label, key }) => (
          <button key={key} onClick={() => handleChip(key)} style={{
            padding: '5px 14px', borderRadius: '20px',
            fontSize: '0.78rem', fontWeight: 600,
            border: '1px solid var(--border-subtle)',
            background: activeChip === key ? 'var(--accent)' : 'var(--bg-card)',
            color: activeChip === key ? '#fff' : 'var(--text-muted)',
            cursor: 'pointer', transition: 'all 0.15s',
          }}>
            {label}
          </button>
        ))}
      </div>

      {sorted.length > 0 && !loading && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', alignItems: 'center' }}>
          <ArrowUpDown size={13} style={{ color: 'var(--text-muted)' }} />
          {[
            { key: 'spotify', label: 'Spotify' },
            { key: 'recent',  label: 'Recientes' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setSortMode(key)} style={{
              padding: '5px 12px', borderRadius: '20px',
              fontSize: '0.78rem', fontWeight: 600, border: '1px solid',
              borderColor: sortMode === key ? 'var(--accent)' : 'var(--border-subtle)',
              background: sortMode === key ? 'var(--accent)' : 'transparent',
              color: sortMode === key ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer', transition: 'all 0.15s',
            }}>
              {label}
            </button>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {sorted.length} canción{sorted.length !== 1 ? 'es' : ''}
          </span>
        </div>
      )}

      {loading ? (
        <LoadingSkeleton count={8} />
      ) : sorted.length === 0 ? (
        <div className="empty-state">
          <Music />
          <div>{search ? 'Sin resultados' : 'No hay canciones'}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {sorted.map((t, i) => (
            <TrackCard
              key={t.track_id || t.id}
              track={{ ...t, id: t.track_id || t.id }}
              onRate={handleRate}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}
