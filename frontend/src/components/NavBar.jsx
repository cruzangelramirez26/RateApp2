import { useEffect, useState, useRef, useCallback } from 'react';
import { NavLink } from 'react-router-dom';
import { ListMusic, Clock, Library, Wrench, BarChart3, PictureInPicture2 } from 'lucide-react';
import { api } from '../utils/api';
import ThemeToggle from './ThemeToggle';
import { RATINGS_ORDEN as RATINGS } from '../utils/ratings';
import { ratingColor, ratingDim } from '../utils/theme';
import { alternarReproductor, suscribirReproductor, escucharCalificadas, anunciarCalificada } from '../utils/reproductor';


const NAV_LINKS = [
  { to: '/',          end: true,  icon: ListMusic, label: 'Pending' },
  { to: '/recent',    end: false, icon: Clock,     label: 'Recientes' },
  { to: '/library',   end: false, icon: Library,   label: 'Biblioteca' },
  { to: '/dashboard', end: false, icon: BarChart3,  label: 'Stats' },
  { to: '/tools',     end: false, icon: Wrench,    label: 'Herramientas' },
];

export default function NavBar() {
  const [pendingCount, setPendingCount] = useState(null);
  const [nowPlaying, setNowPlaying] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPiPOpen, setIsPiPOpen] = useState(false);
  const [showRatingPanel, setShowRatingPanel] = useState(false);

  const nowPlayingRef = useRef(null);
  const isPlayingRef = useRef(false);

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
      anunciarCalificada(track.id, rating);
    } catch {
      setNowPlaying(track);
      nowPlayingRef.current = track;
    }
  }, []);

  // El boton del sidebar pide EL reproductor en la pestana Sonando. Es la
  // misma ventana que abre Pendientes en la Cola: nunca hay dos.
  useEffect(() => suscribirReproductor(({ abierto, modo }) => {
    setIsPiPOpen(abierto && modo === 'sonando');
  }), []);

  // Lo que se califica en el reproductor (u otra ventana) se ve aqui al tiro.
  useEffect(() => escucharCalificadas((id, rating) => {
    if (nowPlayingRef.current?.id !== id) return;
    const updated = { ...nowPlayingRef.current, rating };
    nowPlayingRef.current = updated;
    setNowPlaying(updated);
  }), []);

  const openPiP = () => { alternarReproductor('sonando'); };

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
