import { useState, useEffect, useCallback, useRef } from 'react';
import { Music, RefreshCw, PictureInPicture2, List, Square } from 'lucide-react';
import { api } from '../utils/api';
import TrackCard from '../components/TrackCard';
import SearchBar from '../components/SearchBar';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { useToast } from '../hooks/useToast';

const RATINGS = ['D', 'C', 'C+', 'B', 'B+', 'A', 'A+'];
const RATING_COLORS = {
  'A+': '#f5c542', 'A': '#e8a83e', 'B+': '#6ecf8a',
  'B': '#4aab6a', 'C+': '#5ba8d4', 'C': '#4488aa', 'D': '#88555c',
};

// ── PiP (light theme) ─────────────────────────────────────────────

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderPiPContent(pip, queue, index) {
  const track = queue[index];

  if (!track) {
    pip.document.body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
        height:100%;color:#1a1a1a;gap:10px;font-family:system-ui;background:#f5f4f0">
        <div style="font-size:2.5rem">🎉</div>
        <div style="font-size:0.95rem;font-weight:600">¡Todas calificadas!</div>
        <div style="font-size:0.75rem;color:#9ca3af">Puedes cerrar esta ventana</div>
      </div>`;
    return;
  }

  const btns = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D'].map(r => {
    const c = RATING_COLORS[r];
    const active = track.rating === r;
    return `<button onclick="window.__pipRate('${r}')"
      style="padding:5px 10px;border:1.5px solid ${active ? c : 'rgba(0,0,0,0.1)'};
      border-radius:8px;cursor:pointer;font-size:0.78rem;font-weight:700;
      font-family:'Space Mono',monospace;
      background:${active ? `${c}20` : 'transparent'};
      color:${active ? c : '#9ca3af'};transition:all 0.15s;"
      onmouseover="this.style.borderColor='${c}';this.style.color='${c}'"
      onmouseout="this.style.borderColor='${active ? c : 'rgba(0,0,0,0.1)'}';this.style.color='${active ? c : '#9ca3af'}'">
      ${r}</button>`;
  }).join('');

  pip.document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;padding:14px 12px 12px;gap:9px;
      background:#f5f4f0;min-height:100%;box-sizing:border-box;
      font-family:'DM Sans',system-ui,sans-serif;color:#1a1a1a;">

      <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
        <span style="font-size:0.68rem;color:#9ca3af;font-family:'Space Mono',monospace;
          letter-spacing:0.05em">&lt;3333&gt;</span>
        <span style="font-size:0.68rem;color:#9ca3af;font-family:'Space Mono',monospace">
          ${index + 1}&nbsp;/&nbsp;${queue.length}</span>
      </div>

      ${track.image
        ? `<img src="${escapeHtml(track.image)}" style="width:130px;height:130px;object-fit:cover;
            border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,0.14)" />`
        : `<div style="width:130px;height:130px;border-radius:10px;background:#eeede9;
            display:flex;align-items:center;justify-content:center;font-size:2rem">🎵</div>`
      }

      <div style="text-align:center;width:100%;overflow:hidden">
        <div style="font-weight:700;font-size:0.9rem;line-height:1.3;margin-bottom:2px;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 4px">
          ${escapeHtml(track.name)}
        </div>
        <div style="color:#6b7280;font-size:0.78rem;white-space:nowrap;overflow:hidden;
          text-overflow:ellipsis;padding:0 4px">
          ${escapeHtml(track.artist)}
        </div>
      </div>

      <div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:center">
        ${btns}
      </div>

      <button onclick="window.__pipSkip()"
        style="background:transparent;border:1.5px solid rgba(0,0,0,0.08);color:#9ca3af;
        padding:4px 14px;border-radius:8px;cursor:pointer;font-size:0.72rem;
        font-family:'DM Sans',system-ui;transition:all 0.15s;margin-top:2px"
        onmouseover="this.style.borderColor='rgba(0,0,0,0.18)';this.style.color='#6b7280'"
        onmouseout="this.style.borderColor='rgba(0,0,0,0.08)';this.style.color='#9ca3af'">
        saltar →
      </button>
    </div>`;
}

// ── Component ─────────────────────────────────────────────────────

export default function PendingPage() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [isPiPOpen, setIsPiPOpen] = useState(false);
  const [skippedIds, setSkippedIds] = useState(new Set());
  const [viewMode, setViewMode] = useState('individual'); // 'individual' | 'lista'
  const toast = useToast();

  const pipWindowRef = useRef(null);
  const pipQueueRef = useRef([]);
  const pipIndexRef = useRef(0);
  const tracksRef = useRef([]);
  const handleRateRef = useRef(null);
  const handleSkipRef = useRef(null);
  const desktopUnratedRef = useRef([]);

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

  useEffect(() => {
    return () => {
      if (pipWindowRef.current && !pipWindowRef.current.closed) {
        pipWindowRef.current.close();
      }
    };
  }, []);

  // Keyboard shortcuts for individual view
  useEffect(() => {
    const KEY_TO_RATING = { '1': 'D', '2': 'C', '3': 'C+', '4': 'B', '5': 'B+', '6': 'A', '7': 'A+' };
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (viewMode !== 'individual') return;
      const current = desktopUnratedRef.current[0];
      if (!current) return;
      if (KEY_TO_RATING[e.key]) {
        handleRateRef.current(current, KEY_TO_RATING[e.key]);
      }
      if (e.key === 's' || e.key === 'S') {
        handleSkipRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [viewMode]);

  const handleRate = async (track, rating) => {
    setTracks(prev =>
      prev.map(t => t.id === track.id ? { ...t, rating } : t)
    );
    setSkippedIds(prev => {
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
      toast(`${track.name} → ${rating}`, 'success');
    } catch (err) {
      setTracks(prev =>
        prev.map(t => t.id === track.id ? { ...t, rating: track.rating } : t)
      );
      toast(`Error: ${err.message}`, 'error');
    }
  };

  const handleSkip = () => {
    const current = desktopUnratedRef.current[0];
    if (!current) return;
    setSkippedIds(prev => new Set([...prev, current.id]));
  };

  tracksRef.current = tracks;
  handleRateRef.current = handleRate;
  handleSkipRef.current = handleSkip;

  const advancePiP = (pip, justRatedId = null) => {
    pipIndexRef.current++;
    if (pipIndexRef.current < pipQueueRef.current.length) {
      renderPiPContent(pip, pipQueueRef.current, pipIndexRef.current);
      return;
    }
    const nowUnrated = tracksRef.current.filter(t => !t.rating && t.id !== justRatedId);
    if (nowUnrated.length === 0) {
      renderPiPContent(pip, [], 0);
      return;
    }
    pipQueueRef.current = nowUnrated;
    pipIndexRef.current = 0;
    renderPiPContent(pip, pipQueueRef.current, 0);
  };

  const openPiP = async () => {
    if (!('documentPictureInPicture' in window)) {
      toast('Picture-in-Picture solo funciona en Chrome desktop', 'error');
      return;
    }
    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      pipWindowRef.current.close();
      pipWindowRef.current = null;
      setIsPiPOpen(false);
      return;
    }
    const unrated = tracks.filter(t => !t.rating);
    if (unrated.length === 0) {
      toast('No hay canciones sin calificar', 'error');
      return;
    }
    const pip = await window.documentPictureInPicture.requestWindow({
      width: 300,
      height: 460,
      disallowReturnToOpener: false,
    });
    // Set light background before first render to avoid dark flash
    const styleEl = pip.document.createElement('style');
    styleEl.textContent = 'html,body{margin:0;padding:0;background:#f5f4f0;height:100%;}';
    pip.document.head.appendChild(styleEl);
    pipQueueRef.current = unrated;
    pipIndexRef.current = 0;
    pip.__pipRate = (rating) => {
      const track = pipQueueRef.current[pipIndexRef.current];
      if (!track) return;
      advancePiP(pip, track.id);
      handleRateRef.current(track, rating);
    };
    pip.__pipSkip = () => { advancePiP(pip); };
    renderPiPContent(pip, pipQueueRef.current, 0);
    pipWindowRef.current = pip;
    setIsPiPOpen(true);
    pip.addEventListener('pagehide', () => {
      pipWindowRef.current = null;
      setIsPiPOpen(false);
    });
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
  const rated  = filtered.filter(t => t.rating);

  const individualUnrated = [
    ...unrated.filter(t => !skippedIds.has(t.id)),
    ...unrated.filter(t => skippedIds.has(t.id)),
  ];
  desktopUnratedRef.current = individualUnrated;

  const currentTrack = individualUnrated[0] ?? null;

  // ── Individual view (shared between mobile/desktop) ─────────────
  const IndividualView = () => (
    !currentTrack ? (
      <div className="empty-state">
        <Music />
        <div>{search ? 'Sin resultados' : 'No hay canciones sin calificar'}</div>
      </div>
    ) : (
      <div className="pending-individual-grid">
        {/* Main column */}
        <div>
          {currentTrack.image ? (
            <img src={currentTrack.image} className="pending-album-art" alt="" />
          ) : (
            <div className="pending-album-art card" style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '4rem',
            }}>🎵</div>
          )}

          <div className="pending-track-info">
            <div className="pending-track-label">NOW RATING</div>
            <div className="pending-track-name">{currentTrack.name}</div>
            <div className="pending-track-artist">{currentTrack.artist}</div>
            {currentTrack.album && (
              <div className="pending-track-album">{currentTrack.album}</div>
            )}
            <a
              href={`https://open.spotify.com/track/${currentTrack.id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                color: 'var(--accent)', fontSize: '0.82rem', fontWeight: 600,
                marginTop: '10px', textDecoration: 'none',
              }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: 'var(--accent)', display: 'inline-block',
              }} />
              Open in Spotify
            </a>
          </div>

          <div className="pending-rating-row">
            {RATINGS.map((r, i) => (
              <div key={r} className="pending-rating-col">
                <button
                  className="rating-btn pending-rating-btn-lg"
                  data-rating={r}
                  data-active={currentTrack.rating === r ? 'true' : 'false'}
                  onClick={() => handleRate(currentTrack, r)}
                >
                  {r}
                </button>
                <span className="pending-rating-shortcut">{i + 1}</span>
              </div>
            ))}
          </div>

          <div className="pending-skip-row">
            <button className="btn btn-sm" onClick={handleSkip}>
              ⏭ Skip · S
            </button>
            <span>{individualUnrated.length} sin calificar</span>
          </div>
        </div>

        {/* UP NEXT panel — hidden on narrow screens */}
        <div className="upnext-panel pending-upnext-hide-mobile">
          <div className="upnext-header">
            <span className="upnext-title">UP NEXT</span>
            <span className="upnext-subtitle">From recent additions</span>
          </div>

          {individualUnrated.slice(1, 6).length === 0 ? (
            <div style={{
              color: 'var(--text-muted)', fontSize: '0.82rem',
              textAlign: 'center', padding: '20px 0',
            }}>
              Última canción
            </div>
          ) : (
            individualUnrated.slice(1, 6).map(t => (
              <div key={t.id} className="upnext-item">
                {t.image ? (
                  <img src={t.image} className="upnext-swatch" alt="" />
                ) : (
                  <div className="upnext-swatch" style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '1rem',
                  }}>🎵</div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div className="upnext-item-name">{t.name}</div>
                  <div className="upnext-item-artist">{t.artist}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    )
  );

  // ── Lista view ───────────────────────────────────────────────────
  const ListaView = () => (
    filtered.length === 0 ? (
      <div className="empty-state">
        <Music />
        <div>{search ? 'Sin resultados' : 'No hay canciones en la playlist <3333>'}</div>
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {unrated.map((t, i) => (
          <TrackCard key={t.id} track={t} onRate={handleRate} index={i} />
        ))}
        {unrated.length > 0 && rated.length > 0 && (
          <div style={{
            fontSize: '0.78rem', color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            fontWeight: 600, padding: '12px 0 4px',
            fontFamily: 'var(--font-mono)',
          }}>
            ya calificadas ({rated.length})
          </div>
        )}
        {rated.map((t, i) => (
          <TrackCard key={t.id} track={t} onRate={handleRate} index={unrated.length + i} />
        ))}
      </div>
    )
  );

  return (
    <div className="page">
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div>
          <div className="page-title">Pending</div>
          <div className="page-subtitle">
            {tracks.length} canciones · {unrated.length} sin calificar
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {viewMode === 'individual' && (
            <span className="pending-desktop-only" style={{
              fontSize: '0.75rem', color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)', marginRight: '4px',
            }}>
              1–7 · S skip
            </span>
          )}
          {/* Toggle lista / individual */}
          <button
            className="btn btn-sm"
            onClick={() => setViewMode(m => m === 'individual' ? 'lista' : 'individual')}
            title={viewMode === 'individual' ? 'Ver lista' : 'Ver individual'}
          >
            {viewMode === 'individual' ? <List size={14} /> : <Square size={14} />}
          </button>
          <button
            className="btn btn-sm"
            onClick={openPiP}
            title="Picture-in-Picture"
            disabled={loading}
            style={{
              opacity: loading ? 0.4 : 1,
              color: isPiPOpen ? 'var(--accent)' : undefined,
              borderColor: isPiPOpen ? 'var(--accent)' : undefined,
            }}
          >
            <PictureInPicture2 size={14} />
          </button>
          <button
            className="btn btn-sm"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ opacity: refreshing ? 0.5 : 1 }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar canción o artista..." />
      </div>

      {loading ? (
        <LoadingSkeleton count={8} />
      ) : viewMode === 'individual' ? (
        <IndividualView />
      ) : (
        <ListaView />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
