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

function ctrlBtn(icon, fn) {
  return `<button onclick="window.${fn}()"
    style="padding:4px 10px;border:1px solid rgba(0,0,0,0.1);border-radius:6px;
    cursor:pointer;font-size:0.85rem;background:transparent;color:#9ca3af;transition:all 0.15s;"
    onmouseover="this.style.borderColor='#1db954';this.style.color='#1db954'"
    onmouseout="this.style.borderColor='rgba(0,0,0,0.1)';this.style.color='#9ca3af'">
    ${icon}
  </button>`;
}

function renderNowPlayingPiP(pip, track, isPlaying, layout = 'vertical') {
  if (!track) {
    pip.document.body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
        height:100%;color:#1a1a1a;gap:10px;font-family:system-ui;background:#f5f4f0">
        <div style="font-size:1.8rem">🎵</div>
        <div style="font-size:0.82rem;color:#9ca3af">Nada reproduciendo</div>
      </div>`;
    return;
  }

  const toggleBtn = `
    <button onclick="window.__npToggleLayout()"
      title="${layout === 'vertical' ? 'Vista horizontal' : 'Vista vertical'}"
      style="padding:3px 6px;border:1px solid rgba(0,0,0,0.12);border-radius:5px;
      cursor:pointer;font-size:0.72rem;background:transparent;color:#9ca3af;
      transition:all 0.15s;line-height:1;"
      onmouseover="this.style.borderColor='#1db954';this.style.color='#1db954'"
      onmouseout="this.style.borderColor='rgba(0,0,0,0.12)';this.style.color='#9ca3af'">
      ${layout === 'vertical' ? '↔' : '↕'}
    </button>`;

  const ratingBtns = RATINGS.map(r => {
    const c = RATING_COLORS[r];
    const active = track.rating === r;
    const pad = layout === 'horizontal' ? '3px 7px' : '5px 10px';
    const fs  = layout === 'horizontal' ? '0.72rem' : '0.78rem';
    return `<button onclick="window.__npRate('${r}')"
      style="padding:${pad};border:1.5px solid ${active ? c : 'rgba(0,0,0,0.1)'};
      border-radius:7px;cursor:pointer;font-size:${fs};font-weight:700;
      font-family:'Space Mono',monospace;
      background:${active ? `${c}20` : 'transparent'};
      color:${active ? c : '#9ca3af'};transition:all 0.15s;"
      onmouseover="this.style.borderColor='${c}';this.style.color='${c}'"
      onmouseout="this.style.borderColor='${active ? c : 'rgba(0,0,0,0.1)'}';this.style.color='${active ? c : '#9ca3af'}'">
      ${r}</button>`;
  }).join('');

  const imgSize = layout === 'horizontal' ? 80 : 118;
  const imgRadius = layout === 'horizontal' ? 8 : 10;
  const imgHtml = track.image
    ? `<img src="${escapeHtml(track.image)}" style="width:${imgSize}px;height:${imgSize}px;object-fit:cover;
        border-radius:${imgRadius}px;box-shadow:0 4px 16px rgba(0,0,0,0.14);flex-shrink:0" />`
    : `<div style="width:${imgSize}px;height:${imgSize}px;border-radius:${imgRadius}px;background:#eeede9;
        display:flex;align-items:center;justify-content:center;font-size:${layout==='horizontal'?'1.5':'2'}rem;flex-shrink:0">🎵</div>`;

  if (layout === 'horizontal') {
    pip.document.body.innerHTML = `
      <div style="display:flex;flex-direction:column;height:100%;background:#f5f4f0;
        padding:10px 12px;gap:8px;box-sizing:border-box;
        font-family:'DM Sans',system-ui,sans-serif;color:#1a1a1a;">

        <div style="display:flex;gap:10px;align-items:center;flex:1;min-height:0">
          ${imgHtml}
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px">
            <div style="font-weight:700;font-size:0.85rem;line-height:1.2;
              white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${escapeHtml(track.name)}
            </div>
            <div style="color:#6b7280;font-size:0.75rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
              ${escapeHtml(track.artist)}
            </div>
            <div style="display:flex;gap:5px;align-items:center;margin-top:4px">
              ${ctrlBtn('⏮', '__npPrev')}
              ${ctrlBtn(isPlaying ? '⏸' : '▶', '__npToggle')}
              ${ctrlBtn('⏭', '__npNext')}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;flex-shrink:0">
            ${track.rating
              ? `<span style="font-size:0.72rem;font-weight:700;font-family:'Space Mono',monospace;color:${RATING_COLORS[track.rating]}">${track.rating}</span>`
              : ''}
            ${toggleBtn}
          </div>
        </div>

        <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:center">
          ${ratingBtns}
        </div>
      </div>`;
  } else {
    pip.document.body.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;padding:14px 12px 12px;gap:9px;
        background:#f5f4f0;min-height:100%;box-sizing:border-box;
        font-family:'DM Sans',system-ui,sans-serif;color:#1a1a1a;">

        <div style="display:flex;justify-content:space-between;width:100%;align-items:center">
          <span style="font-size:0.65rem;color:#9ca3af;font-family:'Space Mono',monospace;
            letter-spacing:0.05em">now playing</span>
          <div style="display:flex;align-items:center;gap:6px">
            ${track.rating
              ? `<span style="font-size:0.72rem;font-weight:700;font-family:'Space Mono',monospace;
                  color:${RATING_COLORS[track.rating]}">${track.rating}</span>`
              : `<span style="font-size:0.65rem;color:#c4c4c4;font-family:'Space Mono',monospace">sin calificar</span>`}
            ${toggleBtn}
          </div>
        </div>

        ${imgHtml}

        <div style="text-align:center;width:100%;overflow:hidden">
          <div style="font-weight:700;font-size:0.88rem;line-height:1.3;margin-bottom:2px;
            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 4px">
            ${escapeHtml(track.name)}
          </div>
          <div style="color:#6b7280;font-size:0.76rem;white-space:nowrap;overflow:hidden;
            text-overflow:ellipsis;padding:0 4px">
            ${escapeHtml(track.artist)}
          </div>
        </div>

        <div style="display:flex;gap:5px;align-items:center">
          ${ctrlBtn('⏮', '__npPrev')}
          ${ctrlBtn(isPlaying ? '⏸' : '▶', '__npToggle')}
          ${ctrlBtn('⏭', '__npNext')}
        </div>

        <div style="display:flex;gap:5px;flex-wrap:wrap;justify-content:center">
          ${ratingBtns}
        </div>
      </div>`;
  }
}

export default function NavBar() {
  const [pendingCount, setPendingCount] = useState(null);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPiPOpen, setIsPiPOpen] = useState(false);
  const [showRatingPanel, setShowRatingPanel] = useState(false);
  const [pipLayout, setPipLayout] = useState('vertical');

  const pipWindowRef = useRef(null);
  const nowPlayingRef = useRef(null);
  const isPlayingRef = useRef(false);
  const pipLayoutRef = useRef('vertical');
  const handleRateRef = useRef(null);
  const handleToggleRef = useRef(null);
  const handleNextRef = useRef(null);
  const handlePrevRef = useRef(null);
  const handleToggleLayoutRef = useRef(null);

  useEffect(() => {
    api.getPending()
      .then(data => setPendingCount(data.length))
      .catch(() => {});
  }, []);

  const fetchNowPlaying = useCallback(async () => {
    try {
      const data = await api.getNowPlaying();
      const track = data.track;
      setNowPlaying(track);
      setIsPlaying(data.is_playing);
      nowPlayingRef.current = track;
      isPlayingRef.current = data.is_playing;
    } catch {
      setNowPlaying(null);
      setIsPlaying(false);
      nowPlayingRef.current = null;
      isPlayingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 5000);
    return () => clearInterval(interval);
  }, [fetchNowPlaying]);

  const rewirePiP = useCallback((pip) => {
    pip.__npRate         = (r) => handleRateRef.current(r);
    pip.__npToggle       = ()  => handleToggleRef.current();
    pip.__npNext         = ()  => handleNextRef.current();
    pip.__npPrev         = ()  => handlePrevRef.current();
    pip.__npToggleLayout = ()  => handleToggleLayoutRef.current?.();
  }, []);

  const handleRate = useCallback(async (rating) => {
    const track = nowPlayingRef.current;
    if (!track) return;

    const updated = { ...track, rating };
    setNowPlaying(updated);
    nowPlayingRef.current = updated;

    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      renderNowPlayingPiP(pipWindowRef.current, updated, isPlayingRef.current);
      rewirePiP(pipWindowRef.current);
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
  }, [rewirePiP]);

  const handleTogglePlay = useCallback(async () => {
    try {
      if (isPlayingRef.current) {
        await api.playerPause();
      } else {
        await api.playerPlay();
      }
      setTimeout(fetchNowPlaying, 300);
    } catch {}
  }, [fetchNowPlaying]);

  const handleNext = useCallback(async () => {
    try {
      await api.playerNext();
      setTimeout(fetchNowPlaying, 500);
    } catch {}
  }, [fetchNowPlaying]);

  const handlePrev = useCallback(async () => {
    try {
      await api.playerPrevious();
      setTimeout(fetchNowPlaying, 500);
    } catch {}
  }, [fetchNowPlaying]);

  const handleToggleLayout = useCallback(() => {
    setPipLayout(prev => {
      const next = prev === 'vertical' ? 'horizontal' : 'vertical';
      pipLayoutRef.current = next;
      return next;
    });
  }, []);

  handleRateRef.current         = handleRate;
  handleToggleRef.current       = handleTogglePlay;
  handleNextRef.current         = handleNext;
  handlePrevRef.current         = handlePrev;
  handleToggleLayoutRef.current = handleToggleLayout;

  // Keep PiP in sync when track, play state, or layout changes
  useEffect(() => {
    if (isPiPOpen && pipWindowRef.current && !pipWindowRef.current.closed) {
      const [w, h] = pipLayout === 'horizontal' ? [420, 190] : [300, 420];
      try { pipWindowRef.current.resizeTo(w, h); } catch {}
      renderNowPlayingPiP(pipWindowRef.current, nowPlayingRef.current, isPlayingRef.current, pipLayout);
      rewirePiP(pipWindowRef.current);
    }
  }, [nowPlaying, isPlaying, isPiPOpen, pipLayout, rewirePiP]);

  const openPiP = async () => {
    if (!('documentPictureInPicture' in window)) return;

    if (pipWindowRef.current && !pipWindowRef.current.closed) {
      pipWindowRef.current.close();
      pipWindowRef.current = null;
      setIsPiPOpen(false);
      return;
    }

    try {
      const [initW, initH] = pipLayoutRef.current === 'horizontal' ? [420, 190] : [300, 420];
      const pip = await window.documentPictureInPicture.requestWindow({
        width: initW,
        height: initH,
        disallowReturnToOpener: false,
      });

      const styleEl = pip.document.createElement('style');
      styleEl.textContent = 'html,body{margin:0;padding:0;background:#f5f4f0;height:100%;}';
      pip.document.head.appendChild(styleEl);

      rewirePiP(pip);
      renderNowPlayingPiP(pip, nowPlayingRef.current, isPlayingRef.current, pipLayoutRef.current);

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

      {/* ── Mobile: Now Playing mini-bar (above tab bar) ── */}
      {nowPlaying && (
        <div className="np-mobile-bar" onClick={() => setShowRatingPanel(p => !p)}>
          <div className="np-mobile-bar-collapsed">
            <div className={`np-play-dot${isPlaying ? '' : ' paused'}`} />
            {nowPlaying.image && (
              <img src={nowPlaying.image} alt="" />
            )}
            <div className="np-mobile-bar-info">
              <div className="np-mobile-bar-name">{nowPlaying.name}</div>
              <div className="np-mobile-bar-artist">{nowPlaying.artist}</div>
            </div>
            {nowPlaying.rating && (
              <span
                className="np-mobile-bar-rating"
                style={{ color: RATING_COLORS[nowPlaying.rating] }}
              >
                {nowPlaying.rating}
              </span>
            )}
            <span className="np-mobile-bar-chevron">{showRatingPanel ? '▾' : '▸'}</span>
          </div>

          {showRatingPanel && (
            <div className="np-mobile-panel" onClick={e => e.stopPropagation()}>
              <div className="np-mobile-panel-label">calificar</div>
              <div className="np-mobile-panel-btns">
                {RATINGS.map(r => {
                  const c = RATING_COLORS[r];
                  const active = nowPlaying.rating === r;
                  return (
                    <button
                      key={r}
                      className={`np-mobile-panel-btn${active ? ' active' : ''}`}
                      style={{
                        borderColor: active ? c : undefined,
                        color: active ? c : undefined,
                        background: active ? `${c}20` : undefined,
                      }}
                      onClick={() => handleRate(r)}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

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
          <div className="sidebar-footer-status">
            <span className="sidebar-footer-dot" />
            <span>{nowPlaying ? 'now playing' : 'Connected'}</span>
          </div>
          {nowPlaying && (
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
          )}
        </div>
      </aside>
    </>
  );
}
