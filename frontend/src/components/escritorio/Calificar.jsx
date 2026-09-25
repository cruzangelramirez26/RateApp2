import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play, Pause, SkipBack, SkipForward, List, Square, RefreshCw, PictureInPicture2,
  ChevronLeft, ChevronRight, ArrowLeft,
} from 'lucide-react';
import { api } from '../../utils/api';
import { preloadCache } from '../../utils/preloadCache';
import { RATINGS_ORDEN, ratingDeTecla, esEscritura } from '../../utils/ratings';
import { cuatriActual, cuatriInfo } from '../../utils/cuatrimestres';
import { alternarReproductor } from '../../utils/reproductor';
import { useCalificar } from '../../hooks/useCalificar';
import { useToast } from '../../hooks/useToast';
import { usePortadaDeFondo } from './FondoPortada';
import { useSonando } from './sonando';
import Nota from './Nota';

/**
 * Calificar, versión de escritorio (fase 2 del rediseño, 2026-09-24). Sale de
 * la pantalla "Calificar" del lienzo Design; la lógica de la cola es la de
 * siempre, en hooks/useCalificar.js.
 *
 * Dos modos de escenario:
 *  - `cola`: la cola de <3333> (las sin nota). Se navega con ← →, con las
 *    flechas bajo la pila o picando cualquier portada o tarjeta: la pila se
 *    mueve en las dos direcciones (las anteriores se apilan a la izquierda).
 *  - `sonando`: lo que suena en Spotify cuando NO es de <3333>. Se entra
 *    picando la píldora de arriba; detrás se asoma la cola de reproducción de
 *    Spotify (/tracks/player/queue) y cuando cambia la canción la nueva pasa
 *    al frente sola. Si la nueva es de <3333>, se regresa al modo cola en ella.
 *
 * Lo que decidió Angel al pasarla a React:
 *  - La fila de reproducción aparece SOLO cuando lo que está al frente es lo
 *    que suena; al picar "Escuchar" entra y empuja a las teclas.
 *  - Si suena otra cosa, una píldora translúcida arriba lo dice; picarla la
 *    pone en grande.
 *  - La vista de lista se conserva.
 *  - Los featurings solo se muestran (vienen de Spotify, no de MySQL).
 *
 * Califica siempre con el FLUJO COMPLETO, como el widget de siempre: no sirve
 * para la cola de /backfill.
 */

const RETENER_MS = 900;       // el velo de "CALIFICADA" antes de avanzar
const SALIDA_MS = 900;        // la portada calificada saliéndose de la pila
const ESCUCHA_MS = 8000;      // cuánto se cree en un "Escuchar" sin que Spotify lo confirme
const GRACIA_SEEK_MS = 2500;  // Spotify tarda en aplicar un seek (ver PlayerPage)
const LADO = 2;               // portadas que se asoman a cada lado

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const RANGO = { perla: 'ene – abr', miel: 'may – ago', latte: 'sep – dic' };

function fechaCorta(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? `${d.getDate()} ${MESES[d.getMonth()]}` : '';
}

function conFeat(nombres) {
  if (!nombres?.length) return '';
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

const pad = (n) => String(n).padStart(2, '0');

function Portada({ src, className, onClick, etiqueta }) {
  if (onClick) {
    return (
      <button type="button" className={`${className} esc-portada-btn`} onClick={onClick} aria-label={etiqueta}>
        {src ? <img src={src} alt="" /> : <span className="esc-sin-portada" />}
      </button>
    );
  }
  return src
    ? <img src={src} alt="" className={className} />
    : <div className={`${className} esc-sin-portada`} />;
}

function Tarjeta({ t, derecha, onClick }) {
  const cuerpo = (
    <>
      <Portada src={t.image} className="esc-tarjeta-img" />
      <div className="esc-tarjeta-texto">
        <div className="esc-tarjeta-nombre">{t.name}</div>
        <div className="esc-tarjeta-artista">{t.artist}</div>
      </div>
      {derecha}
    </>
  );
  return onClick
    ? <button type="button" className="esc-tarjeta esc-tarjeta-btn" onClick={onClick} title={`Ver ${t.name}`}>{cuerpo}</button>
    : <div className="esc-tarjeta">{cuerpo}</div>;
}

function Ecualizador({ activo }) {
  return (
    <span className={`esc-eq${activo ? '' : ' quieto'}`} aria-hidden="true">
      <span /><span /><span />
    </span>
  );
}

export default function Calificar() {
  const toast = useToast();
  const { sonando, refrescar } = useSonando();
  const {
    tracks, unrated, rated, cola, loading, refreshing, refresh,
    playing, calificar, escuchar, saltar,
  } = useCalificar();

  const [vista, setVista] = useState('individual');   // 'individual' | 'lista'
  const [modo, setModo] = useState('cola');           // 'cola' | 'sonando'
  const [focoIdx, setFocoIdx] = useState(0);          // posición en la cola de <3333>
  const [sonFoco, setSonFoco] = useState(0);          // posición en la cola de Spotify
  const [spot, setSpot] = useState({ actual: null, cola: [] }); // /tracks/player/queue
  const [retenida, setRetenida] = useState(null);     // {track, rating}: el velo de "calificada"
  const [salida, setSalida] = useState(null);         // la que se va de la pila
  const [notas, setNotas] = useState({});             // id -> nota puesta aquí (modo sonando)
  const [escuchando, setEscuchando] = useState(null); // {id, hasta}: "Escuchar" aún sin confirmar
  const [recientes, setRecientes] = useState([]);
  const [total, setTotal] = useState(0);              // tamaño de la cola al entrar, para el contador
  const [, setTick] = useState(0);
  const retenerRef = useRef(null);
  const seekRef = useRef({ ms: 0, at: 0, hasta: 0 });

  const idSonando = sonando?.track?.id || null;

  // ── Qué hay en el escenario ────────────────────────────────────────
  // `lista` es lo que se puede navegar y `centro` el índice del frente.
  // Durante el velo la calificada se mete en su lugar: para <3333> ya salió
  // de la cola (se calificó), pero tiene que seguir al frente 0.9 s.
  let lista;
  let centro;
  if (modo === 'sonando') {
    const primera = spot.actual?.id === idSonando ? spot.actual : (sonando?.track && {
      ...sonando.track,
      // now-playing junta a todos los artistas en uno; el principal es el primero.
      artist: (sonando.track.artist || '').split(', ')[0],
    });
    lista = [primera, ...spot.cola].filter(Boolean)
      .filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i);
    centro = Math.min(sonFoco, Math.max(0, lista.length - 1));
  } else if (retenida) {
    const base = cola.filter((t) => t.id !== retenida.track.id);
    centro = Math.min(focoIdx, base.length);
    lista = [...base.slice(0, centro), retenida.track, ...base.slice(centro)];
  } else {
    lista = cola;
    centro = Math.min(focoIdx, Math.max(0, cola.length - 1));
  }
  const actual = lista[centro] || null;
  const siguientes = lista.slice(centro + 1, centro + 6);
  const modoRef = useRef(modo);
  modoRef.current = modo;

  useEffect(() => {
    // El total crece si llegan más, nunca baja al calificar: así el contador avanza.
    setTotal((n) => Math.max(n, unrated.length));
  }, [unrated.length]);

  usePortadaDeFondo(actual?.image || null);

  // Recién calificadas: las de la DB (App.jsx primea 'recent') y encima las
  // de esta sesión.
  useEffect(() => {
    preloadCache.load('recent', api.getRecent)
      .then((rows) => setRecientes((rows || []).map((r) => ({
        id: r.track_id || r.id, name: r.name, artist: r.artist, image: r.image, rating: r.rating,
      }))))
      .catch(() => {});
  }, []);

  // ── Navegar ────────────────────────────────────────────────────────
  const retenidaRef = useRef(null);
  retenidaRef.current = retenida;
  const terminarRetencion = useCallback(() => {
    clearTimeout(retenerRef.current);
    const r = retenidaRef.current;
    if (!r) return;
    setRetenida(null);
    // En modo sonando la calificada se queda al frente (sigue sonando).
    if (modoRef.current !== 'cola') return;
    setSalida(r.track);
    setTimeout(() => setSalida((s) => (s?.id === r.track.id ? null : s)), SALIDA_MS);
  }, []);

  // Pone al frente la canción con ese id, en el modo en que se esté.
  const irA = useCallback((id) => {
    if (retenidaRef.current) terminarRetencion();
    if (modoRef.current === 'sonando') {
      const i = lista.findIndex((t) => t.id === id);
      if (i >= 0) setSonFoco(i);
      return;
    }
    const i = cola.findIndex((t) => t.id === id);
    if (i >= 0) setFocoIdx(i);
  }, [lista, cola, terminarRetencion]);

  const mover = useCallback((paso) => {
    const t = lista[centro + paso];
    if (t) irA(t.id);
  }, [lista, centro, irA]);

  const cargarSpot = useCallback(() => {
    api.getPlayerQueue(10)
      .then((d) => setSpot({ actual: d?.currently_playing || null, cola: d?.queue || [] }))
      .catch(() => setSpot((s) => s));
  }, []);

  // La píldora: lo que suena, en grande.
  const verSonando = useCallback(() => {
    if (!idSonando) return;
    const enCola = cola.findIndex((t) => t.id === idSonando);
    if (retenidaRef.current) terminarRetencion();
    if (enCola >= 0) {
      setModo('cola');
      setFocoIdx(enCola);
      return;
    }
    setSpot({ actual: null, cola: [] });
    setSonFoco(0);
    setModo('sonando');
    cargarSpot();
  }, [idSonando, cola, cargarSpot, terminarRetencion]);

  const volverACola = () => {
    if (retenidaRef.current) terminarRetencion();
    setModo('cola');
  };

  // En modo sonando, cuando cambia la canción la nueva pasa al frente; si es
  // de <3333>, se regresa a la cola en ella.
  const ultimoSonandoRef = useRef(idSonando);
  useEffect(() => {
    if (idSonando === ultimoSonandoRef.current) return;
    ultimoSonandoRef.current = idSonando;
    if (modo !== 'sonando' || !idSonando) return;
    const enCola = cola.findIndex((t) => t.id === idSonando);
    if (enCola >= 0) {
      setModo('cola');
      setFocoIdx(enCola);
      return;
    }
    setSonFoco(0);
    cargarSpot();
  }, [idSonando, modo, cola, cargarSpot]);

  // ── Calificar, con el velo ─────────────────────────────────────────
  const onCalificar = useCallback((track, rating) => {
    if (!track) return;
    setRetenida({ track, rating });
    setNotas((n) => ({ ...n, [track.id]: rating }));
    setRecientes((prev) => [{ ...track, rating }, ...prev.filter((r) => r.id !== track.id)]);
    clearTimeout(retenerRef.current);
    retenerRef.current = setTimeout(terminarRetencion, RETENER_MS);
    calificar(track, rating);
  }, [calificar, terminarRetencion]);

  useEffect(() => () => clearTimeout(retenerRef.current), []);

  // Saltar también cambia la canción SI lo que suena es la del frente (Angel,
  // 2026-09-25, igual que en el PiP): pone a sonar la siguiente PENDIENTE en
  // <3333>, no el ⏭ de Spotify, que caería en una ya calificada. La que queda
  // al frente tras saltar es siempre lista[centro + 1], con o sin velo.
  const onSaltar = useCallback(() => {
    if (modo !== 'cola') { if (retenida) terminarRetencion(); return; }
    const saliente = retenida ? retenida.track : actual;
    if (!saliente) return;
    const destino = lista[centro + 1] || null;
    if (retenida) terminarRetencion();
    else saltar(actual);
    if (destino && idSonando === saliente.id) {
      escuchar(destino).then((ok) => {
        if (!ok) return;
        setEscuchando({ id: destino.id, hasta: Date.now() + ESCUCHA_MS });
        setTimeout(refrescar, 700);
        setTimeout(refrescar, 2200);
      });
    }
  }, [retenida, actual, modo, saltar, terminarRetencion, lista, centro, idSonando, escuchar, refrescar]);

  // 1-7 califica (durante el velo re-califica la que se ve), S salta, ← → navegan.
  const teclasRef = useRef({});
  teclasRef.current = { actual, onCalificar, onSaltar, vista, mover };
  useEffect(() => {
    const h = (e) => {
      if (esEscritura(e) || e.ctrlKey || e.altKey || e.metaKey) return;
      const { actual: a, onCalificar: cal, onSaltar: sal, vista: v, mover: mv } = teclasRef.current;
      if (v !== 'individual' || !a) return;
      const r = ratingDeTecla(e.key);
      if (r) { e.preventDefault(); cal(a, r); }
      else if (e.key === 's' || e.key === 'S') { e.preventDefault(); sal(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); mv(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); mv(1); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // ── Lo que suena ───────────────────────────────────────────────────
  const esperando = escuchando && actual && escuchando.id === actual.id && Date.now() < escuchando.hasta;
  const suenaActual = !!actual && (idSonando === actual.id || esperando);
  const enPausa = idSonando === actual?.id ? !sonando.is_playing : false;
  const fuera = !!idSonando && sonando.is_playing && idSonando !== actual?.id && !esperando
    && !(modo === 'sonando' && lista.some((t) => t.id === idSonando));
  // La nota de lo que suena: la de aquí gana, porque now-playing la reporta
  // hasta el siguiente sondeo y la recién calificada saldría sin nota.
  const notaDe = (t) => (t ? notas[t.id] || tracks.find((x) => x.id === t.id)?.rating || t.rating || null : null);
  const notaSonando = fuera ? notaDe(sonando.track) : null;

  // Spotify ya confirmó: se deja de suponer.
  useEffect(() => {
    if (escuchando && idSonando === escuchando.id) setEscuchando(null);
  }, [idSonando, escuchando]);

  useEffect(() => {
    if (!suenaActual) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [suenaActual]);

  const duracion = idSonando === actual?.id ? sonando.duration_ms || 0 : 0;
  const progreso = (() => {
    if (!duracion) return 0;
    const ahora = Date.now();
    const s = seekRef.current;
    let ms;
    if (ahora < s.hasta) ms = s.ms + (enPausa ? 0 : ahora - s.at);
    else ms = (sonando.progress_ms || 0) + (sonando.is_playing ? ahora - sonando.leidoEn : 0);
    return Math.min(1, Math.max(0, ms / duracion));
  })();

  const onEscuchar = async () => {
    if (!actual) return;
    const t = actual;
    if (await escuchar(t)) {
      setEscuchando({ id: t.id, hasta: Date.now() + ESCUCHA_MS });
      setTimeout(refrescar, 700);
      setTimeout(refrescar, 2200);
    }
  };

  const control = async (fn) => {
    try { await fn(); } catch (err) { toast(String(err.message || err).replace(/^\d+:\s*/, ''), 'error'); }
    setTimeout(refrescar, 450);
  };

  const onSeek = (e) => {
    if (!duracion) return;
    const caja = e.currentTarget.getBoundingClientRect();
    const ms = Math.round(Math.min(1, Math.max(0, (e.clientX - caja.left) / caja.width)) * duracion);
    seekRef.current = { ms, at: Date.now(), hasta: Date.now() + GRACIA_SEEK_MS };
    setTick((n) => n + 1);
    control(() => api.playerSeek(ms));
  };

  const onFlotante = async () => {
    try {
      if (!(await alternarReproductor(modo === 'cola' ? 'cola' : 'sonando'))) {
        toast('El reproductor flotante solo funciona en Chrome o en la app de escritorio', 'error');
      }
    } catch (err) {
      toast(`No se pudo abrir el reproductor: ${err?.message || err}`, 'error');
    }
  };

  // ── Cabecera ───────────────────────────────────────────────────────
  const slot = cuatriActual();
  const info = slot ? cuatriInfo(slot) : null;
  const hechas = Math.max(0, total - unrated.length);
  const posicion = modo === 'sonando'
    ? centro + 1
    : (actual ? Math.min(total, hechas + centro + (retenida ? 0 : 1)) : total);
  const totalVisible = modo === 'sonando' ? lista.length : total;

  const cabecera = (
    <div className="esc-cal-cabecera">
      <div className="esc-cal-cola">
        {modo === 'sonando' ? (
          <button className="esc-fantasma esc-fantasma-chico" onClick={volverACola}>
            <ArrowLeft size={14} /> Volver a &lt;3333&gt;
            {unrated.length > 0 && <span className="esc-kbd">{unrated.length}</span>}
          </button>
        ) : (
          <span className="esc-rotulo">COLA &lt;3333&gt;</span>
        )}
        {modo === 'cola' && total > 0 && total <= 16 ? (
          <span className="esc-cal-segs" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={i < hechas ? 'hecha' : i === posicion - 1 && actual ? 'actual' : ''} />
            ))}
          </span>
        ) : modo === 'cola' && total > 16 ? (
          <span className="esc-cal-avance" aria-hidden="true">
            <span style={{ width: `${(hechas / total) * 100}%` }} />
          </span>
        ) : null}
        {modo === 'sonando' && <span className="esc-rotulo">COLA DE SPOTIFY</span>}
        <span className="esc-rotulo">{actual ? `${pad(posicion)} / ${pad(totalVisible)}` : 'LISTO'}</span>
      </div>

      {fuera && (
        <button type="button" className="esc-cal-fuera" key={idSonando} onClick={verSonando}
                title="Verla en grande">
          <Portada src={sonando.track.image} className="esc-cal-fuera-img" />
          <Ecualizador activo />
          <span className="esc-cal-fuera-texto">
            <b>{sonando.track.name}</b> · {sonando.track.artist}
          </span>
          {notaSonando && <Nota rating={notaSonando} />}
          {vista === 'individual' && <span className="esc-cal-fuera-btn">Ver</span>}
        </button>
      )}

      <div className="esc-cal-derecha">
        {info && (
          <div className="esc-cal-cuatri">
            {info.img && <img src={info.img} alt="" />}
            <span className="esc-cal-cuatri-nombre">{info.nombre}</span>
            <span className="esc-cal-cuatri-rango">{RANGO[slot]} · en curso</span>
          </div>
        )}
        <div className="esc-cal-herramientas">
          <button className="esc-icono" onClick={() => setVista((v) => (v === 'individual' ? 'lista' : 'individual'))}
                  title={vista === 'individual' ? 'Ver lista' : 'Ver una por una'}
                  aria-label={vista === 'individual' ? 'Ver lista' : 'Ver una por una'}>
            {vista === 'individual' ? <List size={15} /> : <Square size={15} />}
          </button>
          <button className="esc-icono" onClick={refresh} disabled={refreshing} title="Recargar la cola" aria-label="Recargar la cola">
            <RefreshCw size={15} className={refreshing ? 'esc-girando' : ''} />
          </button>
        </div>
      </div>
    </div>
  );

  // ── Vista lista ────────────────────────────────────────────────────
  const fila = (t) => (
    <div key={t.id} className="esc-cal-fila">
      <Portada src={t.image} className="esc-cal-fila-img" />
      <div className="esc-cal-fila-texto">
        <div className="esc-tarjeta-nombre">{t.name}</div>
        <div className="esc-tarjeta-artista">
          {t.artist}{t.featuring?.length ? <span className="esc-feat"> con {conFeat(t.featuring)}</span> : null}
        </div>
      </div>
      <div className="esc-cal-fila-album">{t.album}</div>
      <button className="esc-icono" title="Escuchar en <3333>" aria-label={`Escuchar ${t.name}`}
              disabled={playing} onClick={() => escuchar(t)}>
        <Play size={14} />
      </button>
      <div className="esc-cal-fila-notas">
        {RATINGS_ORDEN.map((r) => (
          <button key={r} className={`esc-mini${t.rating === r ? ' activa' : ''}`}
                  aria-label={`Calificar ${t.name} con ${r}`} onClick={() => calificar(t, r)}>
            {r}
          </button>
        ))}
      </div>
    </div>
  );

  const vistaLista = (
    <div className="esc-cal-lista">
      {tracks.length === 0 && <div className="esc-cal-lista-vacia">No hay canciones en &lt;3333&gt;</div>}
      {unrated.map(fila)}
      {unrated.length > 0 && rated.length > 0 && (
        <div className="esc-rotulo esc-cal-lista-sep">YA CALIFICADAS ({rated.length})</div>
      )}
      {rated.map(fila)}
    </div>
  );

  // ── Vista individual ───────────────────────────────────────────────
  // Cada portada lleva su distancia al frente (-2..2); la clase cambia y la
  // transición la mueve, en la dirección que sea.
  const pila = [];
  for (let d = -LADO; d <= LADO; d++) {
    const t = lista[centro + d];
    if (t) pila.push({ t, d });
  }
  if (salida && !pila.some((p) => p.t.id === salida.id)) pila.push({ t: salida, d: 'salida' });
  const activa = retenida?.rating || notaDe(actual);
  const largo = (actual?.name || '').length;
  const enSonando = modo === 'sonando';
  const rotulo = enSonando
    ? [idSonando === actual?.id ? 'Sonando' : 'En la cola de Spotify', 'fuera de <3333>', actual?.album].filter(Boolean).join(' · ')
    : [actual?.added_at && `Agregada ${fechaCorta(actual.added_at)}`, actual?.album].filter(Boolean).join(' · ');

  const individual = !actual ? (
    <div className="esc-cal-aldia">
      <div className="esc-rotulo">COLA VACÍA</div>
      <h1>Al día.</h1>
      <p>Lo nuevo que agregues a &lt;3333&gt; aparece aquí, con su portada, listo para calificar.</p>
      <button className="esc-fantasma" onClick={refresh} disabled={refreshing}>Revisar de nuevo</button>
    </div>
  ) : (
    <div className="esc-cal-escena">
      <div className="esc-cal-izq">
        <div className="esc-cal-pila">
          {pila.map(({ t, d }) => (
            <Portada key={t.id} src={t.image}
                     className={`esc-cal-portada ${d === 'salida' ? 'salida' : `o${d < 0 ? 'm' : ''}${Math.abs(d)}`}`}
                     onClick={typeof d === 'number' && d !== 0 ? () => irA(t.id) : undefined}
                     etiqueta={typeof d === 'number' && d !== 0 ? `Ver ${t.name}` : undefined} />
          ))}
          {retenida && (
            <div className="esc-cal-velo" key={`${retenida.track.id}-${retenida.rating}`}>
              <span className="esc-rotulo">CALIFICADA</span>
              <span className="esc-cal-velo-nota">{retenida.rating}</span>
            </div>
          )}
        </div>
        <div className="esc-cal-nav">
          <button className="esc-icono" onClick={() => mover(-1)} disabled={centro === 0}
                  aria-label="Anterior de la cola" title="Anterior  ←">
            <ChevronLeft size={18} />
          </button>
          <span className="esc-rotulo">{pad(centro + 1)} / {pad(lista.length)}</span>
          <button className="esc-icono" onClick={() => mover(1)} disabled={centro >= lista.length - 1}
                  aria-label="Siguiente de la cola" title="Siguiente  →">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="esc-cal-lado">
        <div className="esc-cal-titulo" key={actual.id}>
          <div className="esc-rotulo">{rotulo}</div>
          <h1 className={largo > 42 ? 'muy-largo' : largo > 24 ? 'largo' : ''}>{actual.name}</h1>
          <div className="esc-cal-artista">
            <span>{actual.artist}</span>
            {actual.featuring?.length > 0 && <span className="esc-feat">con {conFeat(actual.featuring)}</span>}
          </div>
        </div>

        <div className={`esc-cal-repro${suenaActual ? ' abierta' : ''}`} aria-hidden={!suenaActual}>
          <div className="esc-cal-repro-dentro">
            <button className="esc-ctrl" aria-label="Anterior" tabIndex={suenaActual ? 0 : -1}
                    onClick={() => control(api.playerPrevious)}>
              <SkipBack size={18} fill="currentColor" />
            </button>
            <button className="esc-ctrl esc-ctrl-play" tabIndex={suenaActual ? 0 : -1}
                    aria-label={enPausa ? 'Reproducir' : 'Pausar'}
                    onClick={() => control(enPausa ? api.playerPlay : api.playerPause)}>
              {enPausa ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}
            </button>
            <button className="esc-ctrl" aria-label="Siguiente" tabIndex={suenaActual ? 0 : -1}
                    onClick={() => control(api.playerNext)}>
              <SkipForward size={18} fill="currentColor" />
            </button>
            <button className="esc-cal-barra" onClick={onSeek} tabIndex={suenaActual ? 0 : -1}
                    aria-label="Mover la canción" disabled={!duracion}>
              <span style={{ width: `${progreso * 100}%` }} />
            </button>
            <Ecualizador activo={!enPausa} />
            <span className="esc-cal-repro-estado">{enPausa ? 'En pausa' : 'Sonando en Spotify'}</span>
            <button className="esc-fantasma esc-fantasma-chico" onClick={onFlotante} tabIndex={suenaActual ? 0 : -1}>
              <PictureInPicture2 size={14} /> Flotante
            </button>
          </div>
        </div>

        <div className="esc-rotulo esc-cal-tu">TU CALIFICACIÓN</div>
        <div className="esc-cal-teclas">
          {RATINGS_ORDEN.map((r, i) => (
            <button key={r} className={`esc-tecla${activa === r ? ' activa' : ''}`}
                    aria-label={`Calificar ${r}`} onClick={() => onCalificar(retenida?.track || actual, r)}>
              <span className="esc-tecla-num">{i + 1}</span>
              <span className="esc-tecla-nota">{r}</span>
            </button>
          ))}
        </div>

        <div className="esc-cal-acciones">
          {!enSonando && (
            <button className="esc-fantasma" onClick={onSaltar}>
              Saltar <span className="esc-kbd">S</span>
            </button>
          )}
          {!enSonando && !suenaActual && (
            <button className="esc-fantasma" onClick={onEscuchar} disabled={playing}>
              <Play size={12} fill="currentColor" /> Escuchar en &lt;3333&gt;
            </button>
          )}
          {info && (
            <span className="esc-cal-pista">
              {enSonando && 'No está en <3333>. '}B+ o más entra a {info.nombre}, Galería Anual y Me Gusta
            </span>
          )}
        </div>
      </div>
    </div>
  );

  // ── Pie: a continuación + recién calificadas ───────────────────────
  const pie = (
    <div className="esc-cal-pie">
      {actual && siguientes.length > 0 && (
        <>
          <div className="esc-cal-grupo">
            <div className="esc-rotulo">{enSonando ? 'DESPUÉS EN SPOTIFY' : 'A CONTINUACIÓN'}</div>
            <div className="esc-cal-tarjetas">
              {siguientes.map((t, i) => (
                <Tarjeta key={t.id} t={t} onClick={() => irA(t.id)}
                         derecha={enSonando && notaDe(t)
                           ? <Nota rating={notaDe(t)} />
                           : <span className="esc-rotulo esc-tarjeta-pos">{pad(posicion + i + 1)}</span>} />
              ))}
            </div>
          </div>
          <div className="esc-cal-divisor" />
        </>
      )}
      {recientes.length > 0 && (
        <div className="esc-cal-grupo">
          <div className="esc-rotulo">RECIÉN CALIFICADAS</div>
          <div className="esc-cal-tarjetas">
            {recientes.slice(0, 5).map((t) => (
              <Tarjeta key={t.id} t={t} derecha={<Nota rating={t.rating} />} />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="esc-cal">
      {cabecera}
      <div className="esc-cal-centro">
        {loading ? (
          <div className="esc-cal-cargando" aria-label="Cargando">
            <div className="esc-cal-portada o0 esc-sin-portada" />
          </div>
        ) : vista === 'lista' ? vistaLista : individual}
      </div>
      {vista === 'individual' && !loading && pie}
    </div>
  );
}
