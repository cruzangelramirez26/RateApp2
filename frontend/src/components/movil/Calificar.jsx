import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../utils/api';
import { cuatriActual, cuatriInfo } from '../../utils/cuatrimestres';
import { useCalificar } from '../../hooks/useCalificar';
import { useToast } from '../../hooks/useToast';
import { usePortadaDeFondo } from '../escritorio/FondoPortada';
import { useSonando } from '../escritorio/sonando';
import { FilaNotas, NotaMv } from './Notas';
import {
  IcoRecargar, IcoPlay, IcoPausa, IcoAnterior, IcoSiguiente, IcoCorazon,
} from './Iconos';

/**
 * Calificar, versión móvil (fase 2 del rediseño móvil, 2026-09-25). Sale de
 * la sección 01 del lienzo; la lógica de la cola es la de siempre
 * (hooks/useCalificar.js), la misma que usa el escritorio.
 *
 * Lo que decidió Angel:
 *  - Deslizar la portada SOLO navega entre canciones. Nunca califica: una nota
 *    es siempre un toque en su botón.
 *  - Notas en una fila, sin relleno (ver Notas.jsx).
 *  - Los controles salen solo si la de enfrente es la que suena; si no,
 *    "Escuchar" y "Saltar".
 *  - Si suena otra cosa, una píldora arriba lo dice. Si es de <3333> te lleva a
 *    ella; si no, entra el modo "sonando" (2026-09-26, como el escritorio): lo
 *    que suena va al frente y detrás se apila la cola de reproducción de
 *    Spotify (/tracks/player/queue). A diferencia del escritorio, esa cola SE
 *    DESLIZA, para calificar lo que viene antes de que suene (Angel). Cuando
 *    cambia la canción, la nueva pasa al frente si estabas viendo la que
 *    sonaba; si andabas más adelante en la cola, te quedas donde estabas. Si
 *    la nueva es de <3333>, se regresa a la cola en ella.
 *
 * Califica siempre con el FLUJO COMPLETO, como el widget de siempre: no sirve
 * para la cola de /backfill.
 */

const RETENER_MS = 900;       // el velo de "calificada" antes de avanzar
const ESCUCHA_MS = 8000;      // cuánto se cree en un "Escuchar" sin que Spotify lo confirme
const GRACIA_SEEK_MS = 2500;  // Spotify tarda en aplicar un seek
const UMBRAL_PX = 70;         // cuánto hay que deslizar para cambiar de canción

const pad = (n) => String(n).padStart(2, '0');
const reloj = (ms) => {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
};

function conFeat(nombres) {
  if (!nombres?.length) return '';
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

/** Posición de cada portada según su distancia al frente. */
function estilo(d) {
  if (d < 0) return { transform: 'translateX(-135%) rotate(-14deg)', opacity: 0 };
  if (d === 0) return { transform: 'none', opacity: 1 };
  // Profundidad oscureciendo, no transparentando: con opacidad, la que pasaba
  // al frente se veía a través durante la transición (Angel, 2026-09-26).
  if (d === 1) return { transform: 'translateY(-24px) scale(.91)', opacity: 1, filter: 'brightness(.5)' };
  if (d === 2) return { transform: 'translateY(-44px) scale(.82)', opacity: 0.55, filter: 'brightness(.35)' };
  return { transform: 'translateY(-56px) scale(.75)', opacity: 0 };
}

export default function Calificar() {
  const toast = useToast();
  const { sonando, refrescar } = useSonando();
  const { unrated, cola, loading, refreshing, refresh, playing, calificar, escuchar, saltar } = useCalificar();

  const [modo, setModo] = useState('cola');           // 'cola' | 'sonando'
  const [focoIdx, setFocoIdx] = useState(0);          // posición en la cola de <3333>
  const [sonFocoId, setSonFocoId] = useState(null);   // modo sonando: la del frente (null = lo que suena)
  const [spot, setSpot] = useState({ actual: null, cola: [] }); // /tracks/player/queue
  const [notas, setNotas] = useState({});             // id -> nota puesta aquí
  const [retenida, setRetenida] = useState(null);     // {track, rating}: el velo
  const [escuchando, setEscuchando] = useState(null); // {id, hasta}
  const [total, setTotal] = useState(0);
  const [guardada, setGuardada] = useState(null);     // ♥ de lo que suena (null = no se sabe)
  const [, setTick] = useState(0);
  const retenerRef = useRef(null);
  const seekRef = useRef({ ms: 0, at: 0, hasta: 0 });
  const pilaRef = useRef(null);
  const arrastre = useRef(null);

  const idSonando = sonando?.track?.id || null;

  // Durante el velo la calificada ya salió de la cola (tiene nota), pero tiene
  // que seguir al frente 0.9 s.
  let lista;
  let centro;
  if (modo === 'sonando') {
    const primera = spot.actual?.id === idSonando ? spot.actual : (sonando?.track && {
      ...sonando.track,
      // now-playing junta a todos los artistas; el principal es el primero.
      artist: (sonando.track.artist || '').split(', ')[0],
    });
    lista = [primera, ...spot.cola].filter(Boolean)
      .filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i);
    centro = Math.max(0, lista.findIndex((t) => t.id === sonFocoId));
  } else if (retenida) {
    const base = cola.filter((t) => t.id !== retenida.track.id);
    centro = Math.min(focoIdx, base.length);
    lista = [...base.slice(0, centro), retenida.track, ...base.slice(centro)];
  } else {
    lista = cola;
    centro = Math.min(focoIdx, Math.max(0, cola.length - 1));
  }
  const actual = lista[centro] || null;

  useEffect(() => { setTotal((n) => Math.max(n, unrated.length)); }, [unrated.length]);
  usePortadaDeFondo(actual?.image || null);

  // ── Navegar ────────────────────────────────────────────────────────
  const retenidaRef = useRef(null);
  retenidaRef.current = retenida;
  const modoRef = useRef(modo);
  modoRef.current = modo;
  const terminarRetencion = useCallback(() => {
    clearTimeout(retenerRef.current);
    if (retenidaRef.current) setRetenida(null);
  }, []);
  useEffect(() => () => clearTimeout(retenerRef.current), []);

  const irA = useCallback((id) => {
    if (retenidaRef.current) terminarRetencion();
    if (modoRef.current === 'sonando') { setSonFocoId(id); return; }
    const i = cola.findIndex((t) => t.id === id);
    if (i >= 0) setFocoIdx(i);
  }, [cola, terminarRetencion]);

  const mover = useCallback((paso) => {
    const t = lista[centro + paso];
    if (t) irA(t.id);
  }, [lista, centro, irA]);

  // ── Calificar, con el velo ─────────────────────────────────────────
  const onCalificar = useCallback((rating) => {
    const track = retenidaRef.current?.track || actual;
    if (!track) return;
    setRetenida({ track, rating });
    setNotas((n) => ({ ...n, [track.id]: rating }));
    clearTimeout(retenerRef.current);
    retenerRef.current = setTimeout(terminarRetencion, RETENER_MS);
    navigator.vibrate?.(12);
    calificar(track, rating);
  }, [actual, calificar, terminarRetencion]);

  const empezarEscucha = useCallback((t) => {
    setEscuchando({ id: t.id, hasta: Date.now() + ESCUCHA_MS });
    setTimeout(refrescar, 700);
    setTimeout(refrescar, 2200);
  }, [refrescar]);

  // Saltar = la siguiente pendiente. Si lo que suena es la del frente, la pone
  // a sonar en <3333> (igual que el PiP y el escritorio).
  const onSaltar = useCallback(() => {
    if (modo !== 'cola') return;
    const saliente = retenida ? retenida.track : actual;
    if (!saliente) return;
    const destino = lista[centro + 1] || null;
    if (retenida) terminarRetencion();
    else saltar(actual);
    if (destino && idSonando === saliente.id) {
      escuchar(destino).then((ok) => { if (ok) empezarEscucha(destino); });
    }
  }, [modo, retenida, actual, lista, centro, saltar, terminarRetencion, idSonando, escuchar, empezarEscucha]);

  const onEscuchar = async () => {
    if (actual && await escuchar(actual)) empezarEscucha(actual);
  };

  // ── Deslizar: solo navega ──────────────────────────────────────────
  const onDown = (e) => {
    if (!e.target.closest('.mv-carta.frente')) return;
    arrastre.current = { x0: e.clientX, dx: 0, el: e.target.closest('.mv-carta') };
    arrastre.current.el.classList.add('arrastre');
    pilaRef.current.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    const a = arrastre.current;
    if (!a) return;
    a.dx = e.clientX - a.x0;
    a.el.style.transform = `translateX(${a.dx}px) rotate(${a.dx / 18}deg)`;
  };
  const onUp = () => {
    const a = arrastre.current;
    if (!a) return;
    arrastre.current = null;
    a.el.classList.remove('arrastre');
    a.el.style.transform = '';
    if (a.dx < -UMBRAL_PX) mover(1);
    else if (a.dx > UMBRAL_PX) mover(-1);
  };

  // ── Lo que suena ───────────────────────────────────────────────────
  const esperando = escuchando && actual && escuchando.id === actual.id && Date.now() < escuchando.hasta;
  const suenaActual = !!actual && (idSonando === actual.id || esperando);
  const enPausa = idSonando === actual?.id ? !sonando.is_playing : false;
  const fuera = !!idSonando && sonando.is_playing && idSonando !== actual?.id && !esperando
    && !(modo === 'sonando' && lista.some((t) => t.id === idSonando));
  // La nota de una canción: la puesta aquí gana, porque now-playing y la cola
  // de Spotify la reportan hasta la siguiente lectura.
  const notaDe = (t) => (t ? notas[t.id] || t.rating || null : null);

  useEffect(() => {
    if (escuchando && idSonando === escuchando.id) setEscuchando(null);
  }, [idSonando, escuchando]);

  useEffect(() => {
    if (!suenaActual) return undefined;
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [suenaActual]);

  // El ♥ se pregunta solo al cambiar de canción: es una llamada a Spotify.
  useEffect(() => {
    setGuardada(null);
    if (!idSonando) return undefined;
    let vivo = true;
    api.isTrackSaved(idSonando).then((s) => { if (vivo) setGuardada(!!s.saved); }).catch(() => {});
    return () => { vivo = false; };
  }, [idSonando]);

  const duracion = idSonando === actual?.id ? sonando.duration_ms || 0 : 0;
  const progresoMs = (() => {
    if (!duracion) return 0;
    const ahora = Date.now();
    const s = seekRef.current;
    const ms = ahora < s.hasta
      ? s.ms + (enPausa ? 0 : ahora - s.at)
      : (sonando.progress_ms || 0) + (sonando.is_playing ? ahora - sonando.leidoEn : 0);
    return Math.min(duracion, Math.max(0, ms));
  })();

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

  const onCorazon = async () => {
    if (!idSonando || guardada == null) return;
    const previo = guardada;
    setGuardada(!previo);
    try {
      if (previo) await api.unlikeTracks([idSonando]);
      else await api.likeTracks([idSonando]);
    } catch {
      setGuardada(previo);
      toast('Spotify no aceptó el cambio de Me Gusta', 'error');
    }
  };

  // ── Modo sonando ─────────────────────────────────────────────────
  const cargarSpot = useCallback(() => {
    api.getPlayerQueue(10)
      .then((d) => setSpot({ actual: d?.currently_playing || null, cola: d?.queue || [] }))
      .catch(() => {});
  }, []);

  // La píldora: si lo que suena está en <3333> te lleva a ella; si no, la pone
  // al frente con la cola de Spotify detrás.
  const onPildora = () => {
    if (!idSonando) return;
    if (retenidaRef.current) terminarRetencion();
    const i = cola.findIndex((t) => t.id === idSonando);
    if (i >= 0) { setModo('cola'); setFocoIdx(i); return; }
    setSpot({ actual: null, cola: [] });
    setSonFocoId(null);
    setModo('sonando');
    cargarSpot();
  };

  const volverACola = () => {
    if (retenidaRef.current) terminarRetencion();
    setModo('cola');
  };

  // Cambió la canción. En modo sonando: si estabas viendo la que sonaba, la
  // nueva pasa al frente; si andabas más adelante, te quedas en esa carta.
  const ultimoSonandoRef = useRef(idSonando);
  const focoIdRef = useRef(null);
  focoIdRef.current = modo === 'sonando' ? actual?.id || null : null;
  useEffect(() => {
    const previo = ultimoSonandoRef.current;
    if (idSonando === previo) return;
    ultimoSonandoRef.current = idSonando;
    if (modoRef.current !== 'sonando' || !idSonando) return;
    const enCola = cola.findIndex((t) => t.id === idSonando);
    if (enCola >= 0) { setModo('cola'); setFocoIdx(enCola); return; }
    const visto = focoIdRef.current;
    if (!visto || visto === previo || visto === idSonando) setSonFocoId(null);
    cargarSpot();
  }, [idSonando, cola, cargarSpot]);

  // ── Pantalla ───────────────────────────────────────────────────────
  const slot = cuatriActual();
  const info = slot ? cuatriInfo(slot) : null;
  const hechas = Math.max(0, total - unrated.length);
  const posicion = actual ? Math.min(total, hechas + centro + (retenida ? 0 : 1)) : total;
  const enSonando = modo === 'sonando';

  const cabecera = (
    <div className="mv-cal-cab">
      <div>
        <div className="mv-eyebrow">{enSonando ? 'Sonando · Spotify' : `Calificar${info ? ` · ${info.nombre}` : ''}`}</div>
        <div className="mv-cal-tit">{enSonando ? 'Tu cola' : <>&lt;3333&gt;</>}</div>
      </div>
      <div className="mv-cal-cab-d">
        {enSonando ? (
          <button type="button" className="mv-pill mv-pill-btn" onClick={volverACola}>
            ← &lt;3333&gt;{unrated.length > 0 && <span className="mv-mono">{unrated.length}</span>}
          </button>
        ) : (
          <span className="mv-pill"><span className="mv-mono">{unrated.length}</span> sin nota</span>
        )}
        <button type="button" className="mv-ic" onClick={enSonando ? cargarSpot : refresh}
                disabled={!enSonando && refreshing} aria-label="Recargar la cola">
          <IcoRecargar />
        </button>
      </div>
    </div>
  );

  const pildora = fuera && (
    <button type="button" className="mv-sonando" key={idSonando} onClick={onPildora}>
      {sonando.track.image ? <img src={sonando.track.image} alt="" /> : <span className="mv-sin" />}
      <span className="mv-sonando-txt">
        <span className="mv-eq"><i /><i /><i /></span> <b>{sonando.track.name}</b> · {(sonando.track.artist || '').split(', ')[0]}
      </span>
      {notaDe(sonando.track) ? <NotaMv rating={notaDe(sonando.track)} /> : null}
      <span className="mv-sonando-ir">Calificarla</span>
    </button>
  );

  if (loading) {
    return (
      <div className="mv-cal">
        {cabecera}
        <div className="mv-cargando" aria-label="Cargando"><div /></div>
      </div>
    );
  }

  if (!actual && !enSonando) {
    return (
      <div className="mv-cal">
        {cabecera}
        {pildora && <div className="mv-sonando-fila">{pildora}</div>}
        <div className="mv-aldia">
          <div className="mv-eyebrow">Cola vacía</div>
          <h1>Al día.</h1>
          <p>Lo nuevo que agregues a &lt;3333&gt; aparece aquí, listo para calificar.</p>
          <button type="button" className="mv-vidrio" onClick={refresh} disabled={refreshing}>Revisar de nuevo</button>
        </div>
      </div>
    );
  }

  const cartas = [];
  for (let d = -1; d <= 3; d++) {
    const t = lista[centro + d];
    if (t) cartas.push({ t, d });
  }
  const notaActual = enSonando ? notaDe(actual) : retenida?.rating || null;
  const posTexto = enSonando
    ? (actual?.id === idSonando ? 'Sonando' : `En tu cola · ${pad(centro)}`)
    : `${pad(posicion)} / ${pad(total)}`;

  return (
    <div className="mv-cal">
      {cabecera}
      {pildora && <div className="mv-sonando-fila">{pildora}</div>}

      <div className="mv-pila-zona">
        <div className="mv-pila-caja">
        <div className="mv-resplandor" style={actual.image ? { backgroundImage: `url("${actual.image}")` } : undefined} />
        <div className="mv-pila" ref={pilaRef}
             onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {cartas.map(({ t, d }) => (
            <div key={t.id} className={`mv-carta${d === 0 ? ' frente' : ''}`}
                 style={{ ...estilo(d), zIndex: 100 - Math.abs(d), visibility: d > 2 ? 'hidden' : 'visible' }}
                 onClick={d > 0 ? () => irA(t.id) : undefined}
                 aria-hidden={d !== 0}>
              {t.image ? <img src={t.image} alt="" draggable="false" /> : null}
              <div className="mv-carta-brillo" />
            </div>
          ))}
          {retenida && (
            <div className="mv-velo" key={`${retenida.track.id}-${retenida.rating}`}>
              <b>{retenida.rating}</b><span>Calificada</span>
            </div>
          )}
        </div>
        </div>

        <div className="mv-info" key={actual.id}>
          <div className="mv-info-pos">{posTexto}</div>
          <div className="mv-info-nom">{actual.name}</div>
          <div className="mv-info-art">
            <span>{actual.artist}{actual.featuring?.length ? <small> con {conFeat(actual.featuring)}</small> : null}</span>
            <NotaMv rating={notaActual} />
          </div>
        </div>
      </div>

      <div className={`mv-rep${suenaActual ? ' on' : ''}`} aria-hidden={!suenaActual}>
        <div>
          <button type="button" className="mv-barra" onClick={onSeek} disabled={!duracion}
                  tabIndex={suenaActual ? 0 : -1} aria-label="Mover la canción">
            <i style={{ width: `calc(${duracion ? (progresoMs / duracion) * 100 : 0}% - 4px)` }} />
          </button>
          <div className="mv-tiempos"><span>{reloj(progresoMs)}</span><span>-{reloj(duracion - progresoMs)}</span></div>
          <div className="mv-ctrl">
            <button type="button" className={`mv-corazon${guardada ? ' on' : ''}`} onClick={onCorazon}
                    disabled={guardada == null} tabIndex={suenaActual ? 0 : -1}
                    aria-label={guardada ? 'Quitar de Me Gusta' : 'Agregar a Me Gusta'}>
              <IcoCorazon />
            </button>
            <button type="button" onClick={() => control(api.playerPrevious)} tabIndex={suenaActual ? 0 : -1} aria-label="Anterior">
              <IcoAnterior />
            </button>
            <button type="button" className="mv-pp" tabIndex={suenaActual ? 0 : -1}
                    onClick={() => control(enPausa ? api.playerPlay : api.playerPause)}
                    aria-label={enPausa ? 'Reproducir' : 'Pausar'}>
              {enPausa ? <IcoPlay /> : <IcoPausa />}
            </button>
            <button type="button" onClick={enSonando ? () => control(api.playerNext) : onSaltar}
                    tabIndex={suenaActual ? 0 : -1} aria-label={enSonando ? 'Siguiente' : 'Siguiente pendiente'}>
              <IcoSiguiente />
            </button>
            <span style={{ width: 40 }} />
          </div>
        </div>
      </div>

      <div className={`mv-escuchar${suenaActual ? ' off' : ''}`} aria-hidden={suenaActual}>
        <div>
          {enSonando ? (
            // Spotify no deja saltar a una canción de su cola sin tirar la
            // cola: aquí solo se califica lo que viene.
            <div className="mv-esc-fila">
              <button type="button" className="mv-vidrio" onClick={() => setSonFocoId(null)} tabIndex={suenaActual ? -1 : 0}>
                Volver a lo que suena
              </button>
            </div>
          ) : (
            <div className="mv-esc-fila">
              <button type="button" className="mv-vidrio" onClick={onEscuchar} disabled={playing} tabIndex={suenaActual ? -1 : 0}>
                <IcoPlay /> Escuchar
              </button>
              <button type="button" className="mv-vidrio chico" onClick={onSaltar} tabIndex={suenaActual ? -1 : 0}>Saltar</button>
            </div>
          )}
        </div>
      </div>

      <FilaNotas actual={notaActual} onNota={onCalificar} />
    </div>
  );
}
