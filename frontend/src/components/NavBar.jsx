import { useEffect, useState, useRef, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { ListMusic, Clock, Library, Wrench, BarChart3, PictureInPicture2 } from 'lucide-react';
import { api } from '../utils/api';

const RATINGS = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D'];
const RATING_COLORS = {
  'A+': '#f5c542', 'A': '#e8a83e', 'B+': '#6ecf8a',
  'B': '#4aab6a', 'C+': '#5ba8d4', 'C': '#4488aa', 'D': '#88555c',
};

const NAV_LINKS = [
  { to: '/',          end: true,  icon: ListMusic, label: 'Pending' },
  { to: '/recent',    end: false, icon: Clock,     label: 'Recientes' },
  { to: '/library',   end: false, icon: Library,   label: 'Biblioteca' },
  { to: '/dashboard', end: false, icon: BarChart3,  label: 'Stats' },
  { to: '/tools',     end: false, icon: Wrench,    label: 'Herramientas' },
];

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderNowPlayingPiP(pip, track) {
  if (!track) {
    pip.document.body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
        height:100%;color:#1a1a1a;gap:10px;font-family:system-ui;background:#f5f4f0">
        <div style="font-size:1.8rem">🎵</div>
        <div style="font-size:0.82rem;color:#9ca3af">Nada reproduciendo</div>
      </div>`;
    return;
  }

  const btns = RATINGS.map(r => {
    const c = RATING_COLORS[r];
    const active = track.rating === r;
    return `<button onclick="window.__npRate('${r}')"
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
        <span style="font-size:0.65rem;color:#9ca3af;font-family:'Space Mono',monospace;
          letter-spacing:0.05em">now playing</span>
        ${track.rating
          ? `<span style="font-size:0.72rem;font-weight:700;font-family:'Space Mono',monospace;
              color:${RATING_COLORS[track.rating]}">${track.rating}</span>`
          : '<span style="font-size:0.65rem;color:#c4c4c4;font-family:\'Space Mono\',monospace">sin calificar</span>'
        }
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
    </div>`;
}

export default function NavBar() {
  const [pendingCount, setPendingCount] = useState(null);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [isPiPOpen, setIsPiPOpen] = useState(false);

  const pipWindowRef = useRef(null);
  const nowPlayingRef = useRef(null);
  const handleRateRef = useRef(null);

  useEffect(() => {
    api.getPending()
      .then(data => setPendingCount(data.length))
      .catch(() => {});
  }, []);

  const fetchNowPlaying = useCallback(async () => {
    try {
      const data = await api.getNowPlaying();
      const track = data.is_playing ? data.track : null;
      setNowPlaying(track);
      nowPlayingRef.current = track;
    } catch {
      setNowPlaying(null);
      nowPlayingRef.current = null;
    }
  }, []);

  useEffect(() => {
    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 5000);
    return () => clearInterval(interval);
  }, [fetchNowPlaying]);

  const handleRate = useCallback(async (rating) => {
    const track = nowPlayingRef.current;
    if (!track) return;

    const updated = { ...track, rating };
    setNowPlaying(updated);
    nowPlayingRef.current = updated;

    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      renderNowPlayingPiP(pipWindowRef.current, updated);
      pipWindowRef.current.__npRate = (r) => handleRateRef.current(r);
    }

    try {
      await api.rateTrack({
        track_id: track.id,
        name: track.name,
        artist: track.artist,
        album: track.album || '',
        rating,
      });
    } catch {
      setNowPlaying(track);
      nowPlayingRef.current = track;
    }
  }, []);

  handleRateRef.current = handleRate;

  // Keep PiP in sync when track changes externally (polling)
  useEffect(() => {
    if (isPiPOpen && pipWindowRef.current && !pipWindowRef.current.closed) {
      renderNowPlayingPiP(pipWindowRef.current, nowPlayingRef.current);
      pipWindowRef.current.__npRate = (r) => handleRateRef.current(r);
    }
  }, [nowPlaying, isPiPOpen]);

  const openPiP = async () => {
    if (!('documentPictureInPicture' in window)) return;

    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      pipWindowRef.current.close();
      pipWindowRef.current = null;
      setIsPiPOpen(false);
      return;
    }

    try {
      const pip = await window.documentPictureInPicture.requestWindow({
        width: 300,
        height: 380,
        disallowReturnToOpener: false,
      });

      const styleEl = pip.document.createElement('style');
      styleEl.textContent = 'html,body{margin:0;padding:0;background:#f5f4f0;height:100%;}';
      pip.document.head.appendChild(styleEl);

      pip.__npRate = (r) => handleRateRef.current(r);
      renderNowPlayingPiP(pip, nowPlayingRef.current);

      pipWindowRef.current = pip;
      setIsPiPOpen(true);

      pip.addEventListener('pagehide', () => {
        pipWindowRef.current = null;
        setIsPiPOpen(false);
      });
    } catch { /* user cancelled or browser unsupported */ }
  };

  return (
    <>
      {/* ── Mobile: tab bar ── */}
      <nav className="tab-bar">
        {NAV_LINKS.map(({ to, end, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'active' : ''}>
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* ── Desktop: sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="sidebar-logo-badge">A+</span>
          <span className="sidebar-logo-title">RateApp</span>
        </div>

        <nav className="sidebar-nav">
          {NAV_LINKS.map(({ to, end, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'active' : ''}>
              <Icon size={18} />
              <span>{label}</span>
              {to === '/' && pendingCount > 0 && (
                <span className="sidebar-nav-badge">{pendingCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          {nowPlaying ? (
            <div className="now-playing-widget">
              {nowPlaying.image && (
                <img src={nowPlaying.image} className="now-playing-img" alt="" />
              )}
              <div className="now-playing-info">
                <span className="now-playing-name">{nowPlaying.name}</span>
                <span className="now-playing-artist">{nowPlaying.artist}</span>
              </div>
              <div className="now-playing-actions">
                {nowPlaying.rating && (
                  <span className="now-playing-rating" style={{ color: RATING_COLORS[nowPlaying.rating] }}>
                    {nowPlaying.rating}
                  </span>
                )}
                <button
                  className={`now-playing-pip-btn${isPiPOpen ? ' active' : ''}`}
                  onClick={openPiP}
                  title="Abrir en PiP"
                >
                  <PictureInPicture2 size={13} />
                </button>
              </div>
            </div>
          ) : (
            <div className="sidebar-footer-status">
              <span className="sidebar-footer-dot" />
              <span>Connected</span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
