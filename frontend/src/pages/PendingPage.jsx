import { useState, useEffect, useCallback, useRef } from 'react';
import { Music, RefreshCw, PictureInPicture2 } from 'lucide-react';
import { api } from '../utils/api';
import TrackCard from '../components/TrackCard';
import SearchBar from '../components/SearchBar';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { useToast } from '../hooks/useToast';

// Rating colors matching the app design system
const RATINGS = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D'];
const RATING_COLORS = {
  'A+': '#f5c542', 'A': '#e8a83e', 'B+': '#6ecf8a',
  'B': '#4aab6a', 'C+': '#5ba8d4', 'C': '#4488aa', 'D': '#88555c',
};

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
        height:100%;color:#eeeef4;gap:10px;font-family:system-ui;background:#0a0a0f">
        <div style="font-size:2.5rem">🎉</div>
        <div style="font-size:0.95rem;font-weight:600">¡Todas calificadas!</div>
        <div style="font-size:0.75rem;color:#666677">Puedes cerrar esta ventana</div>
      </div>`;
    return;
  }

  const btns = RATINGS.map(r => {
    const c = RATING_COLORS[r];
    const active = track.rating === r;
    return `<button onclick="window.__pipRate('${r}')"
      style="padding:5px 10px;border:1.5px solid ${active ? c : 'rgba(255,255,255,0.08)'};
      border-radius:8px;cursor:pointer;font-size:0.78rem;font-weight:700;
      font-family:'Space Mono',monospace;
      background:${active ? `${c}22` : 'transparent'};
      color:${active ? c : '#666677'};transition:all 0.15s;"
      onmouseover="this.style.borderColor='${c}';this.style.color='${c}'"
      onmouseout="this.style.borderColor='${active ? c : 'rgba(255,255,255,0.08)'}';this.style.color='${active ? c : '#666677'}'">
      ${r}</button>`;
  }).join('');

  pip.document.body.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;padding:14px 12px 12px;gap:9px;
      background:#0a0a0f;min-height:100%;box-sizing:border-box;
      font-family:'DM Sans',system-ui,sans-serif;color:#eeeef4;">

      <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
        <span style="font-size:0.68rem;color:#666677;font-family:'Space Mono',monospace;
          letter-spacing:0.05em">&lt;3333&gt;</span>
        <span style="font-size:0.68rem;color:#666677;font-family:'Space Mono',monospace">
          ${index + 1}&nbsp;/&nbsp;${queue.length}</span>
      </div>

      ${track.image
        ? `<img src="${escapeHtml(track.image)}" style="width:130px;height:130px;object-fit:cover;
            border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,0.6)" />`
        : `<div style="width:130px;height:130px;border-radius:10px;background:#16161f;
            display:flex;align-items:center;justify-content:center;font-size:2rem">🎵</div>`
      }

      <div style="text-align:center;width:100%;overflow:hidden">
        <div style="font-weight:700;font-size:0.9rem;line-height:1.3;margin-bottom:2px;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 4px">
          ${escapeHtml(track.name)}
        </div>
        <div style="color:#9999aa;font-size:0.78rem;white-space:nowrap;overflow:hidden;
          text-overflow:ellipsis;padding:0 4px">
          ${escapeHtml(track.artist)}
        </div>
      </div>

      <div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:center">
        ${btns}
      </div>

      <button onclick="window.__pipSkip()"
        style="background:transparent;border:1.5px solid rgba(255,255,255,0.06);color:#666677;
        padding:4px 14px;border-radius:8px;cursor:pointer;font-size:0.72rem;
        font-family:'DM Sans',system-ui;transition:all 0.15s;margin-top:2px"
        onmouseover="this.style.borderColor='rgba(255,255,255,0.15)';this.style.color='#9999aa'"
        onmouseout="this.style.borderColor='rgba(255,255,255,0.06)';this.style.color='#666677'">
        saltar →
      </button>
    </div>`;
}

export default function PendingPage() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [isPiPOpen, setIsPiPOpen] = useState(false);
  const toast = useToast();

  const pipWindowRef = useRef(null);
  const pipQueueRef = useRef([]);
  const pipIndexRef = useRef(0);
  // Kept current every render — safe to read from PiP callbacks
  const tracksRef = useRef([]);
  const handleRateRef = useRef(null);

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

  useEffect(() => {
    return () => {
      if (pipWindowRef.current && !pipWindowRef.current.closed) {
        pipWindowRef.current.close();
      }
    };
  }, []);

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

  // Update refs every render
  tracksRef.current = tracks;
  handleRateRef.current = handleRate;

  // Advances the PiP queue. When reaching the end, rebuilds from current unrated tracks.
  // justRatedId: exclude a track that was just rated but hasn't hit state yet.
  const advancePiP = (pip, justRatedId = null) => {
    pipIndexRef.current++;

    if (pipIndexRef.current < pipQueueRef.current.length) {
      renderPiPContent(pip, pipQueueRef.current, pipIndexRef.current);
      return;
    }

    // End of queue — rebuild with whatever's still unrated
    const nowUnrated = tracksRef.current.filter(
      t => !t.rating && t.id !== justRatedId
    );
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

    // Toggle: close if already open
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

    pipQueueRef.current = unrated;
    pipIndexRef.current = 0;

    pip.__pipRate = (rating) => {
      const track = pipQueueRef.current[pipIndexRef.current];
      if (!track) return;
      advancePiP(pip, track.id);
      handleRateRef.current(track, rating);
    };

    pip.__pipSkip = () => {
      advancePiP(pip);
    };

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
        <div style={{ display: 'flex', gap: '6px' }}>
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
            <RefreshCw size={14} style={{
              animation: refreshing ? 'spin 1s linear infinite' : 'none',
            }} />
          </button>
        </div>
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
