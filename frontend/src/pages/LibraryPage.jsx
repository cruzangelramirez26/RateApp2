import { useState, useCallback, useEffect, useRef } from 'react';
import { Search, Music, MoreHorizontal } from 'lucide-react';
import { api } from '../utils/api';
import { preloadCache } from '../utils/preloadCache';
import TrackCard from '../components/TrackCard';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { useToast } from '../hooks/useToast';

const QUICK_PLAYLISTS = [
  { label: 'Me Gusta', key: 'liked' },
  { label: 'Perla',   key: 'perla' },
  { label: 'Miel',    key: 'miel' },
  { label: 'Latte',   key: 'latte' },
  { label: 'Galería', key: 'anual' },
  { label: '<3333',   key: 'calificar' },
];

const RATING_ORDER = { D: 0, C: 1, 'C+': 2, B: 3, 'B+': 4, A: 5, 'A+': 6 };
const RATING_COLORS = {
  'A+': '#f5c542', 'A': '#e8a83e', 'B+': '#6ecf8a',
  'B': '#4aab6a', 'C+': '#5ba8d4', 'C': '#4488aa', 'D': '#88555c',
};
const YEAR_NAMES = {
  2025: { perla: 'Savia', miel: 'Lirio', latte: 'Marea' },
  2026: { perla: 'Perla', miel: 'Miel', latte: 'Latte' },
};

function computeCuatrimestre(track) {
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

function getCuatriLabel(track) {
  const cuatri = computeCuatrimestre(track);
  if (!cuatri) return null;
  let year;
  if (track.cuatrimestre_override) {
    year = new Date().getFullYear();
  } else {
    const dt = track.db_added_at ? new Date(track.db_added_at) : null;
    year = dt && !isNaN(dt.getTime()) ? dt.getFullYear() : new Date().getFullYear();
  }
  const names = YEAR_NAMES[year];
  return (names && names[cuatri]) || cuatri;
}

function exportCSV(tracks) {
  const header = ['#', 'Título', 'Artista', 'Álbum', 'Cuatrimestre', 'Rating'];
  const rows = tracks.map((t, i) => [
    i + 1,
    `"${(t.name || '').replace(/"/g, '""')}"`,
    `"${(t.artist || '').replace(/"/g, '""')}"`,
    `"${(t.album || '').replace(/"/g, '""')}"`,
    getCuatriLabel(t) || '—',
    t.rating || '—',
  ]);
  const csv = [header, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'biblioteca.csv';
  a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 500;

export default function LibraryPage() {
  const [search, setSearch] = useState('');
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeChip, setActiveChip] = useState('liked');
  const [sortMode, setSortMode] = useState('spotify');
  const [isLikedView, setIsLikedView] = useState(true);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [ratingPickerOpen, setRatingPickerOpen] = useState(false);
  const [likedOffset, setLikedOffset] = useState(0);
  const [hasMoreLiked, setHasMoreLiked] = useState(false);
  const menuRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null);
        setRatingPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadLiked = useCallback(async () => {
    setLoading(true);
    setActiveChip('liked');
    setIsLikedView(true);
    setSearch('');
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

  const loadMoreLiked = async () => {
    setLoadingMore(true);
    try {
      const data = await api.getLikedAll(PAGE_SIZE, likedOffset);
      setTracks(prev => [...prev, ...data]);
      setHasMoreLiked(data.length >= PAGE_SIZE);
      setLikedOffset(prev => prev + PAGE_SIZE);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => { loadLiked(); }, [loadLiked]);

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) return;
    setLoading(true);
    setActiveChip('');
    setIsLikedView(false);
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

  const handleChip = useCallback(async (key) => {
    if (key === 'liked') { loadLiked(); return; }
    setLoading(true);
    setActiveChip(key);
    setIsLikedView(false);
    setHasMoreLiked(false);
    setSearch('');
    try {
      const dist = await preloadCache.load('distribution', () => api.getDistribution());
      const playlistId = key === 'calificar' ? dist.calificar : dist[key];
      if (!playlistId) throw new Error(`No hay playlist para esta opción`);
      const data = await preloadCache.load(`playlist_${key}`, () => api.getPlaylistTracks(playlistId));
      setTracks(data || []);
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
    setOpenMenuId(null);
    setRatingPickerOpen(false);
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
        const da = new Date(a.rated_at || a.db_added_at || a.added_at || 0);
        const db = new Date(b.rated_at || b.db_added_at || b.added_at || 0);
        return db - da;
      })
    : sortMode === 'rating'
    ? [...filtered].sort((a, b) =>
        (RATING_ORDER[b.rating] ?? -1) - (RATING_ORDER[a.rating] ?? -1)
      )
    : filtered;

  const aTierCount = sorted.filter(t => ['A', 'A+'].includes(t.rating)).length;

  return (
    <div className="page">
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div>
          <div className="page-title">Biblioteca</div>
          <div className="page-subtitle">
            {loading ? '…' : `${sorted.length} canciones · ${aTierCount} A-tier`}
          </div>
        </div>
        {!loading && sorted.length > 0 && (
          <button className="btn btn-sm library-desktop-only" onClick={() => exportCSV(sorted)}>
            Export
          </button>
        )}
      </div>

      {/* ── Search bar ── */}
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

      {/* ── Chips + sort pills ── */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
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
        <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', alignItems: 'center' }}>
          <div className="stats-filter-tabs">
            {[
              { key: 'spotify',  label: 'Spotify' },
              { key: 'recent',   label: 'Recientes' },
              { key: 'rating',   label: 'Rating' },
            ].map(({ key, label }) => (
              <button
                key={key}
                className={`stats-filter-tab${sortMode === key ? ' active' : ''}`}
                onClick={() => setSortMode(key)}
              >
                {label}
              </button>
            ))}
          </div>
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
        <>
          {/* ══ MOBILE layout ══ */}
          <div className="library-mobile-only">
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
          </div>

          {/* ══ DESKTOP layout ══ */}
          <div className="library-desktop-only" ref={menuRef}>
            <table className="library-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>Título</th>
                  <th>Álbum</th>
                  <th>Cuatrimestre</th>
                  <th>Rating</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((t, i) => {
                  const tid = t.track_id || t.id;
                  const cuatri = computeCuatrimestre(t);
                  const isMenuOpen = openMenuId === tid;
                  return (
                    <tr key={tid}>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontFamily: 'var(--font-mono)' }}>
                        {i + 1}
                      </td>
                      <td>
                        <div className="library-table-title-cell">
                          {t.image
                            ? <img src={t.image} className="library-table-art" alt="" />
                            : <div className="library-table-art" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>🎵</div>
                          }
                          <div style={{ minWidth: 0 }}>
                            <div className="library-table-name">{t.name}</div>
                            <div className="library-table-artist">{t.artist}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.album || '—'}
                      </td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        {getCuatriLabel(t) || '—'}
                      </td>
                      <td>
                        {t.rating ? (
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 10px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono)',
                            color: RATING_COLORS[t.rating] || 'var(--text-muted)',
                            background: `${RATING_COLORS[t.rating]}18` || 'transparent',
                            border: `1px solid ${RATING_COLORS[t.rating]}44` || 'transparent',
                          }}>
                            {t.rating}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>—</span>
                        )}
                      </td>
                      <td style={{ position: 'relative' }}>
                        <button
                          onClick={() => {
                            if (isMenuOpen) { setOpenMenuId(null); setRatingPickerOpen(false); }
                            else { setOpenMenuId(tid); setRatingPickerOpen(false); }
                          }}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', padding: '4px',
                            borderRadius: '4px', display: 'flex', alignItems: 'center',
                          }}
                        >
                          <MoreHorizontal size={16} />
                        </button>
                        {isMenuOpen && (
                          <div style={{
                            position: 'absolute', right: 0, top: '100%', zIndex: 20,
                            background: '#fff', borderRadius: 'var(--radius-md)',
                            boxShadow: 'var(--shadow-lg)',
                            border: '1px solid var(--border-subtle)',
                            minWidth: 170, overflow: 'hidden',
                          }}>
                            {!ratingPickerOpen ? (
                              <>
                                <button
                                  onClick={() => setRatingPickerOpen(true)}
                                  style={{
                                    display: 'block', width: '100%', textAlign: 'left',
                                    padding: '9px 14px', background: 'none', border: 'none',
                                    cursor: 'pointer', fontSize: '0.85rem',
                                    color: 'var(--text-secondary)', fontWeight: 400,
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface)'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                >
                                  Cambiar calificación
                                </button>
                                <a
                                  href={`https://open.spotify.com/track/${tid}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() => { setOpenMenuId(null); setRatingPickerOpen(false); }}
                                  style={{
                                    display: 'block', padding: '9px 14px',
                                    fontSize: '0.85rem', color: 'var(--text-secondary)',
                                    textDecoration: 'none',
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface)'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                >
                                  Open in Spotify
                                </a>
                              </>
                            ) : (
                              <div style={{ padding: '8px 10px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                {['A+', 'A', 'B+', 'B', 'C+', 'C', 'D'].map(r => (
                                  <button
                                    key={r}
                                    onClick={() => handleRate({ ...t, id: tid }, r)}
                                    style={{
                                      padding: '4px 9px',
                                      border: `1.5px solid ${t.rating === r ? RATING_COLORS[r] : 'rgba(0,0,0,0.1)'}`,
                                      borderRadius: '7px', cursor: 'pointer',
                                      fontSize: '0.75rem', fontWeight: 700,
                                      fontFamily: 'var(--font-mono)',
                                      background: t.rating === r ? `${RATING_COLORS[r]}18` : 'transparent',
                                      color: t.rating === r ? RATING_COLORS[r] : 'var(--text-muted)',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = RATING_COLORS[r]; e.currentTarget.style.color = RATING_COLORS[r]; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = t.rating === r ? RATING_COLORS[r] : 'rgba(0,0,0,0.1)'; e.currentTarget.style.color = t.rating === r ? RATING_COLORS[r] : 'var(--text-muted)'; }}
                                  >
                                    {r}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Cargar más (Me Gusta) ── */}
          {isLikedView && hasMoreLiked && (
            <div style={{ textAlign: 'center', marginTop: '20px' }}>
              <button
                className="btn"
                onClick={loadMoreLiked}
                disabled={loadingMore}
                style={{ opacity: loadingMore ? 0.6 : 1 }}
              >
                {loadingMore ? 'Cargando…' : 'Cargar 500 más'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
