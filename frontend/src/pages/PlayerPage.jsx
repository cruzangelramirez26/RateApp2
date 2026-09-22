import { useState, useEffect, useRef, useCallback } from 'react';
import { SkipBack, SkipForward, Play, Pause, Heart } from 'lucide-react';
import { api } from '../utils/api';
import { ratingColor, ratingDim, ratingSoft } from '../utils/theme';

const RATINGS = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D'];
const POLL_MS = 4000;

/**
 * El reproductor, como RUTA propia.
 *
 * POR QUÉ ES UNA RUTA Y NO UN COMPONENTE MÁS. Los dos PiP que existen hoy
 * (NavBar y PendingPage) se dibujan reescribiendo `innerHTML` completo en cada
 * poll: por eso parpadean, pierden el foco y no se pueden animar. Y sobre todo,
 * **una ventana nativa de Tauri necesita una URL a la que apuntar** — mientras
 * el reproductor fueran cadenas de HTML dentro de `NavBar.jsx`, la ventana
 * flotante del escritorio estaba bloqueada. Esta ruta la destraba, y de paso
 * sirve igual en el navegador y en el celular.
 *
 * Va FUERA del layout con sidebar (ver `App.jsx`): la ventana flotante mide
 * ~360px y no tiene por qué cargar la navegación.
 *
 * OJO AL CALIFICAR DESDE AQUÍ: usa el flujo COMPLETO (`rateTrack`), igual que
 * el widget del sidebar, o sea distribuye a playlists y toca el Me Gusta. Es lo
 * correcto para lo que suena en el momento, pero por eso mismo **no se debe
 * usar mientras corre la cola de `/backfill`**: ahí las canciones son viejas y
 * hay que fecharlas con su primera escucha. `/backfill` tiene su propio panel.
 */
export default function PlayerPage() {
  const [data, setData] = useState(null);       // respuesta cruda de now-playing
  const [saved, setSaved] = useState(null);     // corazón: null = todavía no se sabe
  const [rating, setRating] = useState(null);
  const [error, setError] = useState(null);
  const [scrubbing, setScrubbing] = useState(null);  // posición mientras se arrastra

  // Base para interpolar el progreso entre polls. Spotify se consulta cada 4s;
  // sin esto la barra avanzaría a saltos de 4 segundos.
  const baseRef = useRef({ ms: 0, at: Date.now() });
  const [, setTick] = useState(0);
  const trackIdRef = useRef(null);
  // Spotify tarda en aplicar un seek. Sin esta ventana, el primer poll después
  // de mover la barra devuelve la posición VIEJA y la barra salta hacia atrás
  // para volver a saltar adelante al poll siguiente. Es el mismo tipo de
  // desfase que obligó a pasar `offset` en play-in-context el 2026-09-04.
  const ignorarProgresoHastaRef = useRef(0);

  const track = data?.track || null;
  const isPlaying = !!data?.is_playing;
  const duration = data?.duration_ms || 0;

  const fetchNow = useCallback(async () => {
    try {
      const r = await api.getNowPlaying();
      setError(null);
      // Un error de red o un 204 no deben vaciar la barra: se conserva lo
      // último conocido y solo se marca como pausado. Es la misma decisión que
      // se tomó en el widget del sidebar el 2026-08-21.
      if (!r?.track) {
        setData((prev) => (prev?.track ? { ...prev, is_playing: false } : r));
        return;
      }
      setData(r);
      const cambioCancion = r.track.id !== trackIdRef.current;
      // Una canción distinta manda siempre: si Angel le dio a "siguiente"
      // justo después de un seek, el progreso nuevo es el bueno aunque la
      // ventana de gracia siga abierta.
      if (typeof r.progress_ms === 'number'
          && (cambioCancion || Date.now() >= ignorarProgresoHastaRef.current)) {
        baseRef.current = { ms: r.progress_ms, at: Date.now() };
      }
      if (cambioCancion) {
        trackIdRef.current = r.track.id;
        setRating(r.track.rating || null);
        setSaved(null);
        // El corazón se pregunta SOLO al cambiar de canción, no en cada poll:
        // es una llamada a Spotify y el poll va cada 4 segundos.
        try {
          const s = await api.isTrackSaved(r.track.id);
          setSaved(!!s.saved);
        } catch { setSaved(null); }
      }
    } catch {
      setError('No se pudo hablar con Spotify');
    }
  }, []);

  useEffect(() => {
    fetchNow();
    const id = setInterval(() => {
      // Con la ventana escondida no tiene sentido gastar llamadas a Spotify.
      if (!document.hidden) fetchNow();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [fetchNow]);

  // Reloj local para la interpolación. 500ms basta para que se vea continuo.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, []);

  const progreso = (() => {
    if (scrubbing != null) return scrubbing;
    const { ms, at } = baseRef.current;
    const extra = isPlaying ? Date.now() - at : 0;
    return duration > 0 ? Math.min(ms + extra, duration) : ms + extra;
  })();

  const pct = duration > 0 ? Math.min(100, (progreso / duration) * 100) : 0;

  const handleRate = async (r) => {
    if (!track) return;
    const previo = rating;
    setRating(r);                       // optimista: el botón responde al toque
    try {
      await api.rateTrack({ track_id: track.id, rating: r });
    } catch {
      setRating(previo);
      setError('No se pudo guardar la calificación');
    }
  };

  const handleToggle = async () => {
    try {
      if (isPlaying) await api.playerPause();
      else await api.playerPlay();
      setData((prev) => (prev ? { ...prev, is_playing: !isPlaying } : prev));
      if (!isPlaying) baseRef.current = { ms: progreso, at: Date.now() };
      setTimeout(fetchNow, 600);
    } catch { setError('No hay ningún dispositivo de Spotify activo'); }
  };

  const handleSkip = async (dir) => {
    try {
      await (dir > 0 ? api.playerNext() : api.playerPrevious());
      setTimeout(fetchNow, 600);
    } catch { setError('No hay ningún dispositivo de Spotify activo'); }
  };

  const handleHeart = async () => {
    if (!track || saved == null) return;
    const previo = saved;
    setSaved(!saved);
    try {
      if (previo) await api.unlikeTracks([track.id]);
      else await api.likeTracks([track.id]);
    } catch {
      setSaved(previo);
      setError('Spotify no aceptó el cambio de Me Gusta');
    }
  };

  const handleSeek = async (e) => {
    if (!duration) return;
    const caja = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX ?? 0) - caja.left;
    const ms = Math.max(0, Math.min(1, x / caja.width)) * duration;
    setScrubbing(ms);
    try {
      await api.playerSeek(ms);
      baseRef.current = { ms, at: Date.now() };
      ignorarProgresoHastaRef.current = Date.now() + 2500;
    } catch {
      setError('No se pudo mover la canción');
    } finally {
      setScrubbing(null);
    }
  };

  if (!track) {
    return (
      <div className="player-page player-empty">
        <p className="player-empty-text">{error || 'Nada sonando en Spotify'}</p>
      </div>
    );
  }

  return (
    <div className="player-page">
      <div className="player-top">
        {track.image
          ? <img className="player-art" src={track.image} alt="" />
          : <div className="player-art player-art-vacia" />}

        <div className="player-meta">
          <div className="player-name" title={track.name}>{track.name}</div>
          <div className="player-artist" title={track.artist}>{track.artist}</div>
          <div className="player-meta-fila">
            {rating && (
              <span
                className="player-rating-actual"
                style={{
                  color: ratingColor(rating),
                  background: ratingDim(rating),
                  borderColor: ratingSoft(rating),
                }}
              >
                {rating}
              </span>
            )}
            <button
              className={`player-heart${saved ? ' is-saved' : ''}`}
              onClick={handleHeart}
              disabled={saved == null}
              title={saved == null
                ? 'Consultando Me Gusta…'
                : (saved ? 'Quitar de Me Gusta' : 'Agregar a Me Gusta')}
            >
              <Heart size={15} fill={saved ? 'currentColor' : 'none'} />
            </button>
          </div>
        </div>
      </div>

      <div className="player-barra-zona">
        <div className="player-barra" onClick={handleSeek}>
          <div className="player-barra-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="player-tiempos">
          <span>{fmt(progreso)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      <div className="player-controles">
        <button onClick={() => handleSkip(-1)} title="Anterior"><SkipBack size={18} /></button>
        <button
          className="player-btn-grande"
          onClick={handleToggle}
          title={isPlaying ? 'Pausar' : 'Reproducir'}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button onClick={() => handleSkip(1)} title="Siguiente"><SkipForward size={18} /></button>
      </div>

      <div className="player-ratings">
        {RATINGS.map((r) => (
          <button
            key={r}
            className={`player-rating-btn${rating === r ? ' is-activo' : ''}`}
            style={rating === r
              ? { color: ratingColor(r), background: ratingDim(r), borderColor: ratingColor(r) }
              : { color: ratingColor(r), borderColor: ratingSoft(r) }}
            onClick={() => handleRate(r)}
          >
            {r}
          </button>
        ))}
      </div>

      {error && <div className="player-error">{error}</div>}
    </div>
  );
}

function fmt(ms) {
  if (!ms || ms < 0) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
