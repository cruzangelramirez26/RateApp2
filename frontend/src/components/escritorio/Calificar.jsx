import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, List, Square, RefreshCw, PictureInPicture2 } from 'lucide-react';
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
 * la pantalla "Calificar" del lienzo Design; la lógica es la de siempre, en
 * hooks/useCalificar.js.
 *
 * Lo que decidió Angel al pasarla a React:
 *  - La fila de reproducción (controles + barra) aparece SOLO cuando lo que
 *    suena es la canción en turno. Si no, solo "Escuchar" y las notas; al
 *    picar "Escuchar" la fila entra y empuja a los botones hacia abajo.
 *  - Si suena algo que no es la de turno, una píldora translúcida arriba lo
 *    dice (como las pestañas del reproductor flotante).
 *  - La vista de lista se conserva.
 *  - Los featurings solo se muestran (vienen de Spotify en /tracks/pending).
 */

const RETENER_MS = 900;       // el velo de "CALIFICADA" antes de avanzar
const SALIDA_MS = 900;        // la portada calificada saliéndose de la pila
const ESCUCHA_MS = 8000;      // cuánto se cree en un "Escuchar" sin que Spotify lo confirme
const GRACIA_SEEK_MS = 2500;  // Spotify tarda en aplicar un seek (ver PlayerPage)

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

function Portada({ src, className }) {
  return src
    ? <img src={src} alt="" className={className} />
    : <div className={`${className} esc-sin-portada`} />;
}

function Tarjeta({ t, derecha }) {
  return (
    <div className="esc-tarjeta">
      <Portada src={t.image} className="esc-tarjeta-img" />
      <div className="esc-tarjeta-texto">
        <div className="esc-tarjeta-nombre">{t.name}</div>
        <div className="esc-tarjeta-artista">{t.artist}</div>
      </div>
      {derecha}
    </div>
  );
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
  const [retenida, setRetenida] = useState(null);     // {track, rating}: el velo de "calificada"
  const [salida, setSalida] = useState(null);         // la que se va de la pila
  const [adelantada, setAdelantada] = useState(null); // id que se pidió calificar ya
  const [escuchando, setEscuchando] = useState(null); // {id, hasta}: "Escuchar" aún sin confirmar
  const [recientes, setRecientes] = useState([]);
  const [total, setTotal] = useState(0);              // tamaño de la cola al entrar, para el contador
  const [, setTick] = useState(0);
  const retenerRef = useRef(null);
  const seekRef = useRef({ ms: 0, at: 0, hasta: 0 });

  // ── La cola, con la adelantada al frente ───────────────────────────
  const orden = adelantada && cola.some((t) => t.id === adelantada)
    ? [cola.find((t) => t.id === adelantada), ...cola.filter((t) => t.id !== adelantada)]
    : cola;
  const actual = retenida?.track || orden[0] || null;
  const siguientes = orden.filter((t) => t.id !== actual?.id).slice(0, 3);

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

  // ── Calificar, con el velo ─────────────────────────────────────────
  const retenidaRef = useRef(null);
  retenidaRef.current = retenida;
  const terminarRetencion = useCallback(() => {
    clearTimeout(retenerRef.current);
    const r = retenidaRef.current;
    if (!r) return;
    setRetenida(null);
    setSalida(r.track);
    setTimeout(() => setSalida((s) => (s?.id === r.track.id ? null : s)), SALIDA_MS);
  }, []);

  const onCalificar = useCallback((track, rating) => {
    if (!track) return;
    setRetenida({ track, rating });
    setAdelantada((a) => (a === track.id ? null : a));
    setRecientes((prev) => [{ ...track, rating }, ...prev.filter((r) => r.id !== track.id)]);
    clearTimeout(retenerRef.current);
    retenerRef.current = setTimeout(terminarRetencion, RETENER_MS);
    calificar(track, rating);
  }, [calificar, terminarRetencion]);

  useEffect(() => () => clearTimeout(retenerRef.current), []);

  const onSaltar = useCallback(() => {
    if (retenida) { terminarRetencion(); return; }
    if (!actual) return;
    setAdelantada((a) => (a === actual.id ? null : a));
    saltar(actual);
  }, [retenida, actual, saltar, terminarRetencion]);

  // 1-7 califica (durante el velo re-califica la que se ve), S salta.
  const teclasRef = useRef({});
  teclasRef.current = { actual, onCalificar, onSaltar, vista };
  useEffect(() => {
    const h = (e) => {
      if (esEscritura(e) || e.ctrlKey || e.altKey || e.metaKey) return;
      const { actual: a, onCalificar: cal, onSaltar: sal, vista: v } = teclasRef.current;
      if (v !== 'individual' || !a) return;
      const r = ratingDeTecla(e.key);
      if (r) { e.preventDefault(); cal(a, r); }
      else if (e.key === 's' || e.key === 'S') { e.preventDefault(); sal(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // ── Lo que suena ───────────────────────────────────────────────────
  const idSonando = sonando?.track?.id || null;
  const esperando = escuchando && actual && escuchando.id === actual.id && Date.now() < escuchando.hasta;
  const suenaActual = !!actual && (idSonando === actual.id || esperando);
  const enPausa = idSonando === actual?.id ? !sonando.is_playing : false;
  const fuera = !!idSonando && sonando.is_playing && idSonando !== actual?.id && !esperando;
  const fueraEnCola = fuera && cola.some((t) => t.id === idSonando);
  // La nota de lo que suena: la de aquí gana, porque now-playing la reporta
  // hasta el siguiente sondeo y la recién calificada saldría sin nota.
  const notaSonando = (fuera && tracks.find((t) => t.id === idSonando)?.rating) || sonando?.track?.rating || null;

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
      if (!(await alternarReproductor('cola'))) {
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
  const posicion = actual ? Math.min(total, hechas + (retenida ? 0 : 1)) : total;
  const pad = (n) => String(n).padStart(2, '0');

  const cabecera = (
    <div className="esc-cal-cabecera">
      <div className="esc-cal-cola">
        <span className="esc-rotulo">COLA &lt;3333&gt;</span>
        {total > 0 && total <= 16 ? (
          <span className="esc-cal-segs" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={i < hechas ? 'hecha' : i === hechas && actual ? 'actual' : ''} />
            ))}
          </span>
        ) : total > 16 ? (
          <span className="esc-cal-avance" aria-hidden="true">
            <span style={{ width: `${(hechas / total) * 100}%` }} />
          </span>
        ) : null}
        <span className="esc-rotulo">{actual ? `${pad(posicion)} / ${pad(total)}` : 'LISTO'}</span>
      </div>

      {fuera && (
        <div className="esc-cal-fuera" key={idSonando}>
          <Portada src={sonando.track.image} className="esc-cal-fuera-img" />
          <Ecualizador activo />
          <span className="esc-cal-fuera-texto">
            <b>{sonando.track.name}</b> · {sonando.track.artist}
          </span>
          {notaSonando && <Nota rating={notaSonando} />}
          {fueraEnCola && vista === 'individual' && (
            <button className="esc-cal-fuera-btn" onClick={() => { if (retenida) terminarRetencion(); setAdelantada(idSonando); }}>
              Calificarla
            </button>
          )}
        </div>
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

  const lista = (
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
  const pila = [
    ...(salida && salida.id !== actual?.id ? [{ t: salida, rol: 'salida' }] : []),
    ...(actual ? [{ t: actual, rol: 'actual' }] : []),
    ...siguientes.slice(0, 2).map((t, i) => ({ t, rol: `sig${i + 1}` })),
  ];
  const activa = retenida?.rating || actual?.rating || null;
  const largo = (actual?.name || '').length;

  const individual = !actual ? (
    <div className="esc-cal-aldia">
      <div className="esc-rotulo">COLA VACÍA</div>
      <h1>Al día.</h1>
      <p>Lo nuevo que agregues a &lt;3333&gt; aparece aquí, con su portada, listo para calificar.</p>
      <button className="esc-fantasma" onClick={refresh} disabled={refreshing}>Revisar de nuevo</button>
    </div>
  ) : (
    <div className="esc-cal-escena">
      <div className="esc-cal-pila">
        {pila.map(({ t, rol }) => (
          <Portada key={t.id} src={t.image} className={`esc-cal-portada ${rol}`} />
        ))}
        {retenida && (
          <div className="esc-cal-velo" key={`${retenida.track.id}-${retenida.rating}`}>
            <span className="esc-rotulo">CALIFICADA</span>
            <span className="esc-cal-velo-nota">{retenida.rating}</span>
          </div>
        )}
      </div>

      <div className="esc-cal-lado">
        <div className="esc-cal-titulo" key={actual.id}>
          <div className="esc-rotulo">
            {[actual.added_at && `Agregada ${fechaCorta(actual.added_at)}`, actual.album].filter(Boolean).join(' · ')}
          </div>
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
          <button className="esc-fantasma" onClick={onSaltar}>
            Saltar <span className="esc-kbd">S</span>
          </button>
          {!suenaActual && (
            <button className="esc-fantasma" onClick={onEscuchar} disabled={playing}>
              <Play size={12} fill="currentColor" /> Escuchar en &lt;3333&gt;
            </button>
          )}
          {info && <span className="esc-cal-pista">B+ o más entra a {info.nombre}, Galería Anual y Me Gusta</span>}
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
            <div className="esc-rotulo">A CONTINUACIÓN</div>
            <div className="esc-cal-tarjetas">
              {siguientes.map((t, i) => (
                <Tarjeta key={t.id} t={t} derecha={<span className="esc-rotulo esc-tarjeta-pos">{pad(posicion + i + 1)}</span>} />
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
            {recientes.slice(0, 3).map((t) => (
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
      {loading ? (
        <div className="esc-cal-cargando" aria-label="Cargando">
          <div className="esc-cal-portada actual esc-sin-portada" />
        </div>
      ) : vista === 'lista' ? lista : individual}

      {vista === 'individual' && !loading && pie}
    </div>
  );
}
