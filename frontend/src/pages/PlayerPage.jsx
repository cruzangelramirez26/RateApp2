import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import {
  SkipBack, SkipForward, Play, Pause, Heart, Disc3, ListMusic,
  ChevronsRight, RefreshCw, Check, Headphones,
} from 'lucide-react';
import { api } from '../utils/api';
import { ratingColor, ratingDim, ratingSoft } from '../utils/theme';
import { RATINGS_ORDEN, ratingDeTecla, teclaDeRating, esEscritura } from '../utils/ratings';
import { anunciarCalificada, escucharCalificadas } from '../utils/reproductor';

const POLL_MS = 4000;
const MODOS = ['sonando', 'cola'];

/**
 * EL reproductor: una sola ventana con dos pestañas.
 *
 *   Sonando  lo que suena en Spotify: progreso con seek, controles, corazón.
 *   Cola     las pendientes de <3333>, una por una: calificar, saltar, escuchar.
 *
 * Es la misma ruta para el PiP del navegador (un iframe, ver utils/reproductor.js)
 * y para la ventana flotante del escritorio (Tauri). Antes había dos PiP
 * distintos hechos con cadenas de HTML; Angel pidió que fuera uno, y que
 * "con que lo mueva yo, la forma se modifique y se vea bien".
 *
 * LA FORMA SALE DEL TAMAÑO REAL DE LA VENTANA (`calcularLayout`), no de un
 * botón: alto (portada grande, tipo tarjeta), normal, compacta, ancho
 * (portada al lado) y mini (una fila). Cambia sola mientras se arrastra el borde.
 *
 * TECLADO: 1..7 califica (1 = A+ … 7 = D, ver utils/ratings.js), S salta en la
 * Cola, espacio pausa, ← → canción anterior/siguiente.
 *
 * OJO AL CALIFICAR DESDE AQUÍ: usa el flujo COMPLETO (`rateTrack`), o sea
 * distribuye a playlists y toca el Me Gusta. Es lo correcto para lo que suena y
 * para <3333>, pero **no se debe usar durante la cola de `/backfill`**: ahí las
 * canciones son viejas y hay que fecharlas con su primera escucha.
 */

function modoInicial() {
  const m = new URLSearchParams(window.location.search).get('modo');
  return MODOS.includes(m) ? m : 'sonando';
}

/**
 * La forma del reproductor según el tamaño de la ventana.
 *
 * Las fronteras salen de MEDIR, no de adivinar: se barrieron 77 tamaños
 * (220x140 a 640x800) en las dos pestañas buscando desbordes. La primera
 * versión dejaba un hueco entre 210 y 280 px de alto donde no cabía ninguna
 * forma — justo el tamaño de un PiP achaparrado —, y de ahí salió `compacta`.
 */
export function calcularLayout(w, h) {
  if (w >= 440 && w >= h * 1.45 && h >= 235 && h < 360) return 'ancho';
  if (h < 245) return 'mini';
  if (h >= 470 && h >= w * 1.15) return 'alto';
  if (h < 300) return 'compacta';
  return 'normal';
}

/** El lado de la portada, en px, para cada forma. */
export function tamanoPortada(layout, w, h, modo = 'sonando') {
  const entre = (min, v, max) => Math.round(Math.max(min, Math.min(v, max)));
  switch (layout) {
    case 'mini':  return 40;
    case 'ancho': return entre(64, h - 128, 200);
    // La alta: "lo que sobra" despues de pestanas, texto, controles y notas
    // (~330 px; ~360 en la Cola, que ademas muestra la siguiente). Con un
    // porcentaje de la altura se desbordaba a 480.
    case 'alto':  return entre(100, Math.min(w - 56, h - (modo === 'cola' ? 360 : 330)), 340);
    case 'compacta': return entre(48, Math.min(w * 0.2, h * 0.22), 72);
    default:      return entre(56, Math.min(w * 0.24, h * 0.26), 120);
  }
}

function useVentana() {
  const leer = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [tam, setTam] = useState(leer);
  useEffect(() => {
    // Directo, sin requestAnimationFrame: el navegador ya entrega `resize` a lo
    // mas una vez por cuadro, y rAF no corre con la ventana oculta — la
    // flotante del escritorio pasa mucho tiempo escondida en la bandeja y
    // tiene que volver con la forma correcta.
    const onResize = () => setTam(leer());
    window.addEventListener('resize', onResize);
    // Releer AL REGISTRAR: entre el primer render (que lee el tamano) y este
    // efecto pasa un momento, y un resize que caiga ahi se perdia — la forma se
    // quedaba con el tamano viejo hasta el siguiente cambio. Se vio en el
    // navegador: portada de la forma alta encimada sobre el texto de la compacta.
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return tam;
}

function mensajeDeError(err, fallback) {
  const msg = String(err?.message || '').replace(/^\d+:\s*/, '');
  try { return JSON.parse(msg).detail || fallback; } catch { return msg || fallback; }
}

export default function PlayerPage() {
  const { w, h } = useVentana();
  const layout = calcularLayout(w, h);
  const [modo, setModo] = useState(modoInicial);
  const modoRef = useRef(modo);
  modoRef.current = modo;
  const retencionRef = useRef(null);
  const portada = tamanoPortada(layout, w, h, modo);
  const [error, setError] = useState(null);
  const [destello, setDestello] = useState(null);   // {id, r, n}: la marca de "calificada"

  // ── Sonando ───────────────────────────────────────────────────────
  const [data, setData] = useState(null);
  const [saved, setSaved] = useState(null);         // corazón: null = todavía no se sabe
  const [rating, setRating] = useState(null);
  const [, setTick] = useState(0);

  // Base para interpolar el progreso entre polls: sin esto la barra avanzaría
  // a saltos de 4 segundos.
  const baseRef = useRef({ ms: 0, at: Date.now() });
  const trackIdRef = useRef(null);
  const ratingRef = useRef(null);
  // Spotify tarda en aplicar un seek: el primer poll después de mover la barra
  // devuelve la posición VIEJA. Sin esta ventana la barra salta hacia atrás.
  const ignorarProgresoHastaRef = useRef(0);

  const track = data?.track || null;
  const isPlaying = !!data?.is_playing;
  const duracion = data?.duration_ms || 0;
  ratingRef.current = rating;

  // ── Cola ──────────────────────────────────────────────────────────
  const [cola, setCola] = useState({ estado: 'sin-cargar', items: [] });
  const [saltadas, setSaltadas] = useState([]);   // ids, en el orden en que se saltaron
  const [escuchando, setEscuchando] = useState(false);
  // La recien calificada se queda un momento en pantalla con su nota. Sin esto
  // la Cola saltaba a la siguiente EN EL MISMO INSTANTE de apretar la tecla y
  // la marca de "calificada" nunca se alcanzaba a ver: no habia confirmacion
  // de que nota quedo.
  const [retenida, setRetenida] = useState(null);

  // ── Errores: se van solos ─────────────────────────────────────────
  useEffect(() => {
    if (!error) return undefined;
    const t = setTimeout(() => setError(null), 4500);
    return () => clearTimeout(t);
  }, [error]);

  // La marca de "calificada" se quita sola (tambien sin animaciones).
  useEffect(() => {
    if (!destello) return undefined;
    const t = setTimeout(() => setDestello(null), 1150);
    return () => clearTimeout(t);
  }, [destello]);

  // ── Modo: desde la URL, desde la ventana madre, y a la URL ───────
  useEffect(() => {
    const onMsg = (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.tipo === 'rateapp:modo' && MODOS.includes(e.data.modo)) setModo(e.data.modo);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => {
    // Recargar la ventana conserva la pestaña.
    const url = new URL(window.location.href);
    url.searchParams.set('modo', modo);
    window.history.replaceState(null, '', url);
    // Dentro del PiP, avisar a la app que la pestana cambio: si no, el boton
    // del sidebar seguiria creyendo que esta en Sonando y al picarlo CERRARIA
    // la ventana en vez de regresarla. (Fuera de un iframe, parent === window
    // y el mensaje, de otro tipo, se ignora.)
    if (window.parent !== window) {
      window.parent.postMessage({ tipo: 'rateapp:modo-actual', modo }, window.location.origin);
    }
  }, [modo]);

  // ── Lo que suena ──────────────────────────────────────────────────
  const fetchNow = useCallback(async () => {
    try {
      const r = await api.getNowPlaying();
      // Un 204 o un error de red no vacían la ventana: se conserva lo último
      // conocido, marcado como pausado (la decisión del 2026-08-21).
      if (!r?.track) {
        setData((prev) => (prev?.track ? { ...prev, is_playing: false } : r));
        return;
      }
      setData(r);
      const cambio = r.track.id !== trackIdRef.current;
      if (typeof r.progress_ms === 'number'
          && (cambio || Date.now() >= ignorarProgresoHastaRef.current)) {
        baseRef.current = { ms: r.progress_ms, at: Date.now() };
      }
      if (cambio) {
        trackIdRef.current = r.track.id;
        setRating(r.track.rating || null);
        setSaved(null);
        // El corazón se pregunta SOLO al cambiar de canción: es una llamada a
        // Spotify y el poll va cada 4 segundos.
        try {
          const s = await api.isTrackSaved(r.track.id);
          if (trackIdRef.current === r.track.id) setSaved(!!s.saved);
        } catch { /* se queda en "no se sabe" */ }
      }
    } catch {
      setData((prev) => (prev?.track ? { ...prev, is_playing: false } : prev));
    }
  }, []);

  useEffect(() => {
    fetchNow();
    const id = setInterval(() => { if (!document.hidden) fetchNow(); }, POLL_MS);
    return () => clearInterval(id);
  }, [fetchNow]);

  // Reloj local de la interpolación.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, []);

  const progreso = (() => {
    const { ms, at } = baseRef.current;
    const v = ms + (isPlaying ? Date.now() - at : 0);
    return duracion > 0 ? Math.min(v, duracion) : v;
  })();

  // ── La cola ───────────────────────────────────────────────────────
  const cargarCola = useCallback(async () => {
    setCola((c) => ({ ...c, estado: 'cargando' }));
    try {
      const items = await api.getPending();
      setCola({ estado: 'lista', items });
      setSaltadas([]);
    } catch {
      setCola((c) => ({ ...c, estado: 'error' }));
    }
  }, []);

  // Se carga al entrar a la pestaña, no antes: abrir el reproductor en
  // Sonando no tiene por qué pagar la lectura de <3333>.
  useEffect(() => {
    if (modo === 'cola' && cola.estado === 'sin-cargar') cargarCola();
  }, [modo, cola.estado, cargarCola]);

  const ordenCola = useMemo(() => {
    const pend = cola.items.filter((t) => !t.rating);
    const atras = new Set(saltadas);
    return [
      ...pend.filter((t) => !atras.has(t.id)),
      ...saltadas.map((id) => pend.find((t) => t.id === id)).filter(Boolean),
    ];
  }, [cola.items, saltadas]);

  const actualCola = retenida || ordenCola[0] || null;
  const siguienteCola = (retenida ? ordenCola[0] : ordenCola[1]) || null;
  const colaSuena = !!(actualCola && track && actualCola.id === track.id);

  // ── Calificar (las dos pestañas) ─────────────────────────────────
  const aplicarRating = useCallback((id, r) => {
    if (trackIdRef.current === id) setRating(r);
    setCola((c) => ({ ...c, items: c.items.map((t) => (t.id === id ? { ...t, rating: r } : t)) }));
  }, []);

  // Lo que se califica en otra ventana (Pendientes, el sidebar, la otra
  // pestaña de otra ventana) se refleja aquí sin esperar al siguiente poll.
  useEffect(() => escucharCalificadas(aplicarRating), [aplicarRating]);

  const calificar = useCallback(async (t, r) => {
    if (!t) return;
    const previoSonando = trackIdRef.current === t.id ? ratingRef.current : undefined;
    const previoCola = t.rating ?? null;
    aplicarRating(t.id, r);
    setDestello({ id: t.id, r, n: Date.now() });
    if (modoRef.current === 'cola') {
      setRetenida({ ...t, rating: r });
      clearTimeout(retencionRef.current);
      retencionRef.current = setTimeout(() => setRetenida(null), 700);
    }
    try {
      // Con los nombres: una canción nueva sin ellos quedaría anónima en la DB.
      await api.rateTrack({
        track_id: t.id, name: t.name || '', artist: t.artist || '', album: t.album || '', rating: r,
      });
      anunciarCalificada(t.id, r);
    } catch {
      if (previoSonando !== undefined) setRating(previoSonando);
      setCola((c) => ({ ...c, items: c.items.map((x) => (x.id === t.id ? { ...x, rating: previoCola } : x)) }));
      setDestello(null);
      setError('No se pudo guardar la calificación');
    }
  }, [aplicarRating]);

  // ── Controles ─────────────────────────────────────────────────────
  const alternarPlay = useCallback(async () => {
    try {
      if (isPlaying) await api.playerPause();
      else await api.playerPlay();
      setData((prev) => (prev ? { ...prev, is_playing: !isPlaying } : prev));
      baseRef.current = { ms: progreso, at: Date.now() };
      setTimeout(fetchNow, 600);
    } catch (e) { setError(mensajeDeError(e, 'No hay ningún dispositivo de Spotify activo')); }
  }, [isPlaying, progreso, fetchNow]);

  const saltarCancion = useCallback(async (dir) => {
    try {
      await (dir > 0 ? api.playerNext() : api.playerPrevious());
      setTimeout(fetchNow, 600);
    } catch (e) { setError(mensajeDeError(e, 'No hay ningún dispositivo de Spotify activo')); }
  }, [fetchNow]);

  const buscar = useCallback(async (ms) => {
    baseRef.current = { ms, at: Date.now() };
    ignorarProgresoHastaRef.current = Date.now() + 2500;
    setTick((t) => t + 1);
    try { await api.playerSeek(ms); } catch { setError('No se pudo mover la canción'); }
  }, []);

  const alternarCorazon = useCallback(async () => {
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
  }, [track, saved]);

  const saltarEnCola = useCallback(() => {
    if (retenida) { clearTimeout(retencionRef.current); setRetenida(null); return; }
    if (!actualCola) return;
    setSaltadas((prev) => [...prev.filter((id) => id !== actualCola.id), actualCola.id]);
  }, [actualCola, retenida]);

  const escucharEnCola = useCallback(async () => {
    if (!actualCola || escuchando) return;
    if (colaSuena) { alternarPlay(); return; }
    setEscuchando(true);
    try {
      // Sin playlist_id: el backend usa <3333>, así lo que sigue es la
      // siguiente pendiente y no la radio de Spotify.
      await api.playInContext(actualCola.id);
      setTimeout(fetchNow, 700);
    } catch (e) {
      setError(mensajeDeError(e, 'No se pudo reproducir'));
    } finally {
      setEscuchando(false);
    }
  }, [actualCola, escuchando, colaSuena, alternarPlay, fetchNow]);

  // ── Teclado ───────────────────────────────────────────────────────
  // Por ref para registrar el listener una sola vez con las funciones al día.
  const teclasRef = useRef(null);
  teclasRef.current = (e) => {
    if (esEscritura(e) || e.ctrlKey || e.altKey || e.metaKey) return;
    const r = ratingDeTecla(e.key);
    if (r) {
      e.preventDefault();
      calificar(modo === 'cola' ? actualCola : track, r);
      return;
    }
    if (e.key === ' ') { e.preventDefault(); alternarPlay(); return; }
    if (modo === 'cola' && (e.key === 's' || e.key === 'S')) { saltarEnCola(); return; }
    if (modo === 'sonando' && e.key === 'ArrowRight') saltarCancion(1);
    if (modo === 'sonando' && e.key === 'ArrowLeft') saltarCancion(-1);
  };
  useEffect(() => {
    const h = (e) => teclasRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // ── Qué se muestra ────────────────────────────────────────────────
  const enCola = modo === 'cola';
  const actual = enCola ? actualCola : track;
  const ratingActual = enCola ? actualCola?.rating ?? null : rating;
  const nCola = cola.estado === 'lista' ? ordenCola.length : null;   // la retenida ya no cuenta

  return (
    <div
      className="rp"
      data-layout={layout}
      data-estrecho={w < 300 ? 'si' : undefined}
      style={{ '--art': `${portada}px` }}
      // Los botones no se quedan con el foco al hacer clic: si no, la barra
      // espaciadora "volvería a picar" el último botón en vez de pausar.
      onMouseDown={(e) => { if (e.target.closest('button')) e.preventDefault(); }}
    >
      <div className="rp-fondo" aria-hidden="true">
        {actual?.image && (
          <div key={actual.image} className="rp-fondo-img" style={{ backgroundImage: `url("${actual.image}")` }} />
        )}
      </div>

      <nav className="rp-tabs" role="tablist" data-modo={modo}>
        <span className="rp-tabs-ind" aria-hidden="true" />
        <button role="tab" aria-selected={!enCola} className="rp-tab" onClick={() => setModo('sonando')} title="Lo que suena en Spotify">
          <Disc3 size={14} /><span className="rp-tab-txt">Sonando</span>
        </button>
        <button role="tab" aria-selected={enCola} className="rp-tab" onClick={() => setModo('cola')} title="Las pendientes de <3333">
          <ListMusic size={14} /><span className="rp-tab-txt">Cola</span>
          {nCola != null && <span className="rp-tab-n">{nCola}</span>}
        </button>
      </nav>

      <main className="rp-cuerpo" key={modo}>
        {enCola
          ? <Cola
              estado={cola.estado}
              actual={actualCola}
              siguiente={siguienteCola}
              total={ordenCola.length}
              retenida={!!retenida}
              suena={colaSuena}
              isPlaying={isPlaying}
              escuchando={escuchando}
              progreso={progreso}
              duracion={duracion}
              layout={layout}
              onEscuchar={escucharEnCola}
              onSaltar={saltarEnCola}
              onSeek={buscar}
              onRecargar={cargarCola}
            />
          : <Sonando
              track={track}
              rating={rating}
              isPlaying={isPlaying}
              progreso={progreso}
              duracion={duracion}
              saved={saved}
              layout={layout}
              onPlay={alternarPlay}
              onSaltar={saltarCancion}
              onSeek={buscar}
              onCorazon={alternarCorazon}
            />}

        {actual && (
          <Portada
            track={actual}
            destello={destello?.id === actual.id ? destello : null}
          />
        )}

        {actual && (
          <Notas
            actual={ratingActual}
            mostrarTeclas={layout !== 'mini' && w >= 300}
            onRate={(r) => calificar(actual, r)}
          />
        )}
      </main>

      {error && <div className="rp-error" role="status">{error}</div>}
    </div>
  );
}

// ── Piezas ──────────────────────────────────────────────────────────

function Portada({ track, destello }) {
  return (
    <div className="rp-art">
      {track.image
        ? <img key={track.image} src={track.image} alt="" draggable="false" />
        : <div className="rp-art-vacia"><Disc3 /></div>}
      {destello && (
        <div
          key={destello.n}
          className="rp-destello"
          style={{ '--c': ratingColor(destello.r) }}
        >
          <Check />
          <span>{destello.r}</span>
        </div>
      )}
    </div>
  );
}

function Info({ titulo, subtitulo, children }) {
  return (
    <div className="rp-info">
      <Marquesina texto={titulo} className="rp-titulo" />
      <Marquesina texto={subtitulo} className="rp-subtitulo" />
      {children && <div className="rp-chips">{children}</div>}
    </div>
  );
}

function ChipRating({ r }) {
  if (!r) return <span className="rp-chip rp-chip-vacio">sin calificar</span>;
  return (
    <span className="rp-chip rp-chip-rating" style={{ color: ratingColor(r), background: ratingDim(r), borderColor: ratingSoft(r) }}>
      {r}
    </span>
  );
}

function Sonando({ track, rating, isPlaying, progreso, duracion, saved, layout, onPlay, onSaltar, onSeek, onCorazon }) {
  if (!track) {
    return (
      <div className="rp-vacio">
        <Headphones />
        <div className="rp-vacio-titulo">Nada sonando en Spotify</div>
        <div className="rp-vacio-sub">Pon algo a sonar, o califica desde la Cola.</div>
      </div>
    );
  }
  const mini = layout === 'mini';
  return (
    <>
      <Info titulo={track.name} subtitulo={track.artist}>
        {!mini && <ChipRating r={rating} />}
        {!mini && (
          <button
            className={`rp-corazon${saved ? ' activo' : ''}`}
            onClick={onCorazon}
            disabled={saved == null}
            title={saved == null ? 'Consultando Me Gusta…' : (saved ? 'Quitar de Me Gusta' : 'Agregar a Me Gusta')}
          >
            <Heart size={14} fill={saved ? 'currentColor' : 'none'} />
          </button>
        )}
      </Info>
      <div className="rp-medio">
        {!mini && <Barra progreso={progreso} duracion={duracion} onSeek={onSeek} />}
        <div className="rp-controles">
          {!mini && <button className="rp-btn" onClick={() => onSaltar(-1)} title="Anterior (←)"><SkipBack size={17} /></button>}
          <button className="rp-btn rp-btn-principal" onClick={onPlay} title={isPlaying ? 'Pausar (espacio)' : 'Reproducir (espacio)'}>
            {isPlaying ? <Pause size={mini ? 15 : 19} /> : <Play size={mini ? 15 : 19} />}
          </button>
          {!mini && <button className="rp-btn" onClick={() => onSaltar(1)} title="Siguiente (→)"><SkipForward size={17} /></button>}
        </div>
      </div>
    </>
  );
}

function Cola({ estado, actual, siguiente, total, retenida, suena, isPlaying, escuchando, progreso, duracion, layout, onEscuchar, onSaltar, onSeek, onRecargar }) {
  if (estado === 'sin-cargar' || estado === 'cargando') {
    return (
      <div className="rp-vacio">
        <RefreshCw className="rp-girando" />
        <div className="rp-vacio-sub">Cargando las pendientes de &lt;3333…</div>
      </div>
    );
  }
  if (estado === 'error') {
    return (
      <div className="rp-vacio">
        <ListMusic />
        <div className="rp-vacio-titulo">No se pudo cargar la cola</div>
        <button className="rp-btn-texto" onClick={onRecargar}><RefreshCw size={13} /> Reintentar</button>
      </div>
    );
  }
  if (!actual) {
    return (
      <div className="rp-vacio">
        <Check className="rp-ok" />
        <div className="rp-vacio-titulo">Todo calificado</div>
        <div className="rp-vacio-sub">No queda nada pendiente en &lt;3333.</div>
        <button className="rp-btn-texto" onClick={onRecargar}><RefreshCw size={13} /> Recargar</button>
      </div>
    );
  }
  const mini = layout === 'mini';
  return (
    <>
      <Info titulo={actual.name} subtitulo={actual.artist}>
        {!mini && (retenida ? <ChipRating r={actual.rating} /> : <span className="rp-chip">1 de {total}</span>)}
        {!mini && suena && <span className="rp-chip rp-chip-suena"><span className="rp-punto" />sonando</span>}
      </Info>
      <div className="rp-medio">
        {!mini && suena && <Barra progreso={progreso} duracion={duracion} onSeek={onSeek} />}
        <div className="rp-controles">
          <button
            className={`rp-btn ${mini ? '' : 'rp-btn-texto-grande'}`}
            onClick={onEscuchar}
            disabled={escuchando}
            title={suena ? (isPlaying ? 'Pausar' : 'Reanudar') : 'Escuchar en <3333'}
          >
            {suena && isPlaying ? <Pause size={15} /> : <Play size={15} />}
            {!mini && <span>{suena ? (isPlaying ? 'Pausar' : 'Reanudar') : 'Escuchar'}</span>}
          </button>
          <button className={`rp-btn ${mini ? '' : 'rp-btn-texto-grande'}`} onClick={onSaltar} title="Saltar (S)">
            <ChevronsRight size={16} />
            {!mini && <span>Saltar</span>}
          </button>
        </div>
        {layout === 'alto' && siguiente && (
          <div className="rp-siguiente">
            <span className="rp-siguiente-et">Sigue</span>
            {siguiente.image && <img src={siguiente.image} alt="" />}
            <Marquesina texto={`${siguiente.name} · ${siguiente.artist}`} className="rp-siguiente-txt" />
          </div>
        )}
      </div>
    </>
  );
}

function Notas({ actual, mostrarTeclas, onRate }) {
  return (
    <div className="rp-notas">
      {RATINGS_ORDEN.map((r) => {
        const activo = actual === r;
        return (
          <button
            key={r}
            className={`rp-nota${activo ? ' activa' : ''}`}
            style={{
              '--c': ratingColor(r),
              '--c-dim': ratingDim(r),
              '--c-soft': ratingSoft(r),
            }}
            onClick={() => onRate(r)}
            title={`${r} (tecla ${teclaDeRating(r)})`}
          >
            <span>{r}</span>
            {mostrarTeclas && <kbd>{teclaDeRating(r)}</kbd>}
          </button>
        );
      })}
    </div>
  );
}

/** Barra de progreso que se arrastra, no solo se pica. */
function Barra({ progreso, duracion, onSeek }) {
  const ref = useRef(null);
  const [arrastre, setArrastre] = useState(null);

  const msDe = (clientX) => {
    const c = ref.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - c.left) / c.width)) * duracion;
  };

  const mostrado = arrastre ?? progreso;
  const pct = duracion > 0 ? Math.min(100, (mostrado / duracion) * 100) : 0;

  return (
    <div className="rp-barra-zona">
      <div
        ref={ref}
        className={`rp-barra${arrastre != null ? ' arrastrando' : ''}`}
        role="slider"
        tabIndex={0}
        aria-label="Posición en la canción"
        aria-valuemin={0}
        aria-valuemax={duracion}
        aria-valuenow={Math.round(mostrado)}
        onPointerDown={(e) => {
          if (!duracion) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          setArrastre(msDe(e.clientX));
        }}
        onPointerMove={(e) => { if (arrastre != null) setArrastre(msDe(e.clientX)); }}
        onPointerUp={(e) => {
          if (arrastre == null) return;
          const ms = msDe(e.clientX);
          setArrastre(null);
          onSeek(ms);
        }}
        onPointerCancel={() => setArrastre(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            e.stopPropagation();   // aquí las flechas mueven la barra, no cambian de canción
            onSeek(Math.max(0, Math.min(duracion, progreso + (e.key === 'ArrowRight' ? 5000 : -5000))));
          }
        }}
      >
        <div className="rp-barra-riel"><div className="rp-barra-fill" style={{ width: `${pct}%` }} /></div>
        <div className="rp-barra-perilla" style={{ left: `${pct}%` }} />
      </div>
      <div className="rp-tiempos">
        <span>{fmt(mostrado)}</span>
        <span>-{fmt(Math.max(0, duracion - mostrado))}</span>
      </div>
    </div>
  );
}

/** Texto de una línea que, si no cabe, se desliza de ida y vuelta. */
function Marquesina({ texto, className }) {
  const caja = useRef(null);
  const txt = useRef(null);
  const [dist, setDist] = useState(0);

  useLayoutEffect(() => {
    const medir = () => {
      if (!caja.current || !txt.current) return;
      setDist(Math.max(0, txt.current.scrollWidth - caja.current.clientWidth));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(caja.current);
    return () => ro.disconnect();
  }, [texto]);

  const on = dist > 2;
  return (
    <div
      ref={caja}
      className={`rp-marq${on ? ' on' : ''} ${className || ''}`}
      style={on ? { '--dist': `${dist}px`, '--dur': `${Math.max(6, dist / 22 + 4)}s` } : undefined}
      title={texto}
    >
      <span ref={txt} key={texto}>{texto}</span>
    </div>
  );
}

function fmt(ms) {
  if (!ms || ms < 0) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
