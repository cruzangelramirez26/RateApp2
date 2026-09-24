import { useEffect, useState, useRef, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { ListMusic, Clock, Library, Wrench, BarChart3, PictureInPicture2 } from 'lucide-react';
import { api } from '../utils/api';
import ThemeToggle from './ThemeToggle';
import { pipThemeCss, ratingColor, ratingDim } from '../utils/theme';

const RATINGS = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D'];

const NAV_LINKS = [
  { to: '/',          end: true,  icon: ListMusic, label: 'Pending' },
  { to: '/recent',    end: false, icon: Clock,     label: 'Recientes' },
  { to: '/library',   end: false, icon: Library,   label: 'Biblioteca' },
  { to: '/dashboard', end: false, icon: BarChart3,  label: 'Stats' },
  { to: '/tools',     end: false, icon: Wrench,    label: 'Herramientas' },
];

// El PiP ya no dibuja nada por su cuenta: carga /player en un iframe (ver
// PlayerPage.jsx). Antes eran ~130 lineas de HTML en cadenas reescritas con
// innerHTML en cada poll — de ahi el parpadeo — y un toggle vertical/horizontal
// hecho a mano. /player es fluido, asi que el toggle sobra: el layout lo decide
// el tamano real de la ventana.
const PIP_SIZE_KEY = 'rateapp_np_pip_size';
const PIP_DEFAULT = [360, 330];
const PIP_MIN_W = 220;
const PIP_MIN_H = 200;

function loadPipSize() {
  try {
    const s = JSON.parse(localStorage.getItem(PIP_SIZE_KEY) || 'null');
    // Formato viejo: {vertical: [w, h], horizontal: [w, h]}. Se hereda el
    // vertical, que es el unico que cabe el reproductor completo.
    const v = Array.isArray(s) ? s : s?.vertical;
    if (Array.isArray(v) && v.length === 2 && v.every(Number.isFinite)
        && v[0] >= PIP_MIN_W && v[1] >= PIP_MIN_H) {
      return v;
    }
  } catch {}
  return PIP_DEFAULT;
}

function savePipSize(w, h) {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < PIP_MIN_W || h < PIP_MIN_H) return;
  try { localStorage.setItem(PIP_SIZE_KEY, JSON.stringify([Math.round(w), Math.round(h)])); } catch {}
}

export default function NavBar() {
  const [pendingCount, setPendingCount] = useState(null);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPiPOpen, setIsPiPOpen] = useState(false);
  const [showRatingPanel, setShowRatingPanel] = useState(false);

  const pipWindowRef = useRef(null);
  const nowPlayingRef = useRef(null);
  const isPlayingRef = useRef(false);
  const sizeSaveTimerRef = useRef(null);

  useEffect(() => {
    api.getPending()
      .then(data => setPendingCount(data.length))
      .catch(() => {});
  }, []);

  const fetchNowPlaying = useCallback(async () => {
    // Spotify deja de reportar (204 vacio en /me/player) en cuanto el dispositivo
    // se vuelve inactivo tras la pausa. Antes eso vaciaba el widget y parecia que
    // no habia nada sonando; ahora el ultimo track conocido se queda, marcado
    // como pausado, hasta que suene otra cosa o se recargue la pagina.
    //
    // Un error de red cae al mismo camino a proposito: un 500 pasajero tampoco
    // tiene por que borrar la barra.
    try {
      const data = await api.getNowPlaying();
      if (data.track) {
        setNowPlaying(data.track);
        setIsPlaying(data.is_playing);
        nowPlayingRef.current = data.track;
        isPlayingRef.current = data.is_playing;
        return;
      }
    } catch {
      // mismo tratamiento que "Spotify no reporta nada"
    }
    setIsPlaying(false);
    isPlayingRef.current = false;
  }, []);

  useEffect(() => {
    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 5000);
    return () => clearInterval(interval);
  }, [fetchNowPlaying]);

  // Lo usa la mini-barra del celular. El PiP ya no: /player califica solo.
  const handleRate = useCallback(async (rating) => {
    const track = nowPlayingRef.current;
    if (!track) return;

    const updated = { ...track, rating };
    setNowPlaying(updated);
    nowPlayingRef.current = updated;

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

  const cerrarPiP = useCallback((pip) => {
    clearTimeout(sizeSaveTimerRef.current);
    savePipSize(pip.outerWidth || pip.innerWidth, pip.outerHeight || pip.innerHeight);
    pipWindowRef.current = null;
    setIsPiPOpen(false);
  }, []);

  const openPiP = async () => {
    if (!('documentPictureInPicture' in window)) return;

    const abierto = pipWindowRef.current;
    if (abierto && !abierto.closed) {
      cerrarPiP(abierto);
      abierto.close();
      return;
    }

    try {
      const [w, h] = loadPipSize();
      const pip = await window.documentPictureInPicture.requestWindow({
        width: w,
        height: h,
        disallowReturnToOpener: false,
      });

      // Solo el marco: fondo del tema (para no destellar blanco mientras carga
      // el iframe) y un iframe a pantalla completa. Todo lo demas es /player.
      const estilo = pip.document.createElement('style');
      estilo.textContent = pipThemeCss()
        + 'html,body{margin:0;height:100%;background:var(--bg-deep);overflow:hidden}'
        + 'iframe{display:block;border:0;width:100%;height:100%}';
      pip.document.head.appendChild(estilo);

      const marco = pip.document.createElement('iframe');
      // URL ABSOLUTA a proposito: el documento del PiP nace como about:blank, y
      // una ruta relativa dependeria de que herede la base de la ventana madre.
      marco.src = `${window.location.origin}/player`;
      marco.title = 'Reproductor';
      pip.document.body.appendChild(marco);

      pipWindowRef.current = pip;
      setIsPiPOpen(true);

      // Recuerda el tamano que el usuario deja (debounce para no escribir en cada frame)
      pip.addEventListener('resize', () => {
        clearTimeout(sizeSaveTimerRef.current);
        sizeSaveTimerRef.current = setTimeout(() => {
          savePipSize(pip.outerWidth || pip.innerWidth, pip.outerHeight || pip.innerHeight);
        }, 400);
      });
      pip.addEventListener('pagehide', () => {
        if (pipWindowRef.current === pip) cerrarPiP(pip);
      });
    } catch { /* el usuario cancelo o el navegador no lo soporta */ }
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
                style={{ color: ratingColor(nowPlaying.rating) }}
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
                  const c = ratingColor(r);
                  const active = nowPlaying.rating === r;
                  return (
                    <button
                      key={r}
                      className={`np-mobile-panel-btn${active ? ' active' : ''}`}
                      style={{
                        borderColor: active ? c : undefined,
                        color: active ? c : undefined,
                        background: active ? ratingDim(r) : undefined,
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
            <span className="sidebar-footer-status-left">
              <span className="sidebar-footer-dot" />
              <span>{nowPlaying ? 'now playing' : 'Connected'}</span>
            </span>
            <ThemeToggle />
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
                  <span className="now-playing-rating" style={{ color: ratingColor(nowPlaying.rating) }}>
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
