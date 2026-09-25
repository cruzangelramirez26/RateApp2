import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { preloadCache } from '../../utils/preloadCache';
import { portadaMedia } from '../../utils/portadas';
import { anioActual, cuatriActual, cuatriInfo, SLOTS } from '../../utils/cuatrimestres';
import { useHerramientas, REORDER_RATINGS } from '../../hooks/useHerramientas';
import { usePortadaDeFondo } from '../escritorio/FondoPortada';
import Hoja from './Hoja';
import { NotaMv, claseNota } from './Notas';
import {
  IcoCerrar, IcoOrdenar, IcoVirtual, IcoMigrar, IcoEstrella, IcoArchivo, IcoLimpiar, IcoAsa, IcoBiblioteca,
} from './Iconos';

/**
 * Herramientas, versión móvil (fase 4 del rediseño móvil, 2026-09-26). Sale de
 * la pantalla Herramientas del lienzo: tarjetas en dos columnas y, al tocar
 * una, la tarjeta crece hasta ocupar la pantalla (la misma idea del
 * escritorio). La lógica es la de siempre (hooks/useHerramientas.js).
 *
 *  - Reordenador en UNA columna. El arrastre de HTML5 no existe con el dedo,
 *    así que se arrastra desde el agarre (⋮⋮) con eventos de puntero; y tocar
 *    una canción abre sus notas para mandarla al principio de otro bloque,
 *    que en listas de 300 es más práctico que arrastrar.
 *  - Catalogar y Limpiar abren sus pantallas de siempre (se rediseñan aparte,
 *    junto con las del escritorio).
 *  - Sin "Apariencia": el móvil también es solo oscuro.
 */

const PREV = { perla: null, miel: 'perla', latte: 'miel' };
const MORPH_MS = 520;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const corto = (nombre, anio) => nombre.replace(`${anio} `, '');
const sinMovimiento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const caja = (r) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });

/**
 * La tarjeta hecha pantalla. El tamaño final lo pone el CSS (debajo de la
 * barra de la hora, encima de la de abajo); aquí solo se anima desde la caja
 * de la tarjeta hasta ahí, y de regreso al cerrar.
 */
function Crece({ origen, dameOrigen, cerrando, onCerrada, onCerrar, children }) {
  const ref = useRef(null);
  const velo = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || sinMovimiento()) return;
    const fin = el.getBoundingClientRect();
    el.animate([{ ...caja(origen), borderRadius: '20px' }, { ...caja(fin), borderRadius: '28px' }],
      { duration: MORPH_MS, easing: EASE });
    velo.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MORPH_MS * 0.8 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cerrando) return undefined;
    const el = ref.current;
    if (!el || sinMovimiento()) { onCerrada(); return undefined; }
    const desde = el.getBoundingClientRect();
    const hacia = dameOrigen() || origen;
    const a = el.animate([{ ...caja(desde), borderRadius: '28px' }, { ...caja(hacia), borderRadius: '20px' }],
      { duration: MORPH_MS * 0.75, easing: EASE, fill: 'forwards' });
    velo.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MORPH_MS * 0.7, fill: 'forwards' });
    // Sin cuadros (app en segundo plano) onfinish no llega: el temporizador cierra igual.
    let hecho = false;
    const fin = () => { if (!hecho) { hecho = true; onCerrada(); } };
    a.onfinish = fin;
    const t = setTimeout(fin, MORPH_MS * 0.75 + 120);
    return () => clearTimeout(t);
  }, [cerrando]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`mv-crece-capa${cerrando ? ' cerrando' : ''}`}>
      <div ref={velo} className="mv-crece-velo" onClick={onCerrar} />
      <section ref={ref} className="mv-crece" role="dialog" aria-modal="true">{children}</section>
    </div>
  );
}

function Mini({ src }) {
  return src ? <img src={portadaMedia(src)} alt="" loading="lazy" /> : <span className="mv-sin" />;
}

function Casilla({ marcada, muerta }) {
  return <span className={`mv-casilla${marcada ? ' on' : ''}${muerta ? ' muerta' : ''}`} aria-hidden="true">{marcada ? '✓' : ''}</span>;
}

// ─── Reordenador ─────────────────────────────────────────────────────────────

function Reordenador({ h, nombreActual, cuerpoRef }) {
  const [arr, setArr] = useState(null);          // { desde: {rating,index}, hacia: {rating,index} }
  const [moviendo, setMoviendo] = useState(null); // { rating, index, t } con la hoja abierta
  const arrRef = useRef(null);
  const auto = useRef(null);
  arrRef.current = arr;

  const destinoEn = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest('[data-r]');
    if (!el) return null;
    const rating = el.dataset.r;
    const len = h.reorderData.blocks[rating]?.length ?? 0;
    if (el.dataset.cab != null) return { rating, index: 0 };
    if (el.dataset.i == null) return { rating, index: len };
    const i = Number(el.dataset.i);
    const r = el.getBoundingClientRect();
    return { rating, index: y > r.top + r.height / 2 ? i + 1 : i };
  };

  // Cerca de las orillas el cuerpo se desplaza solo, para llegar a otro bloque.
  const moverScroll = (y) => {
    cancelAnimationFrame(auto.current);
    const cuerpo = cuerpoRef.current;
    if (!cuerpo) return;
    const r = cuerpo.getBoundingClientRect();
    const v = y < r.top + 70 ? -(r.top + 70 - y) / 5 : y > r.bottom - 70 ? (y - (r.bottom - 70)) / 5 : 0;
    if (!v) return;
    const paso = () => { cuerpo.scrollTop += v; auto.current = requestAnimationFrame(paso); };
    auto.current = requestAnimationFrame(paso);
  };
  useEffect(() => () => cancelAnimationFrame(auto.current), []);

  if (!h.reorderData) return <p className="mv-vacio">Leyendo {nombreActual}…</p>;

  const onDown = (e, rating, index) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    navigator.vibrate?.(8);
    setArr({ desde: { rating, index }, hacia: { rating, index } });
  };
  const onMove = (e) => {
    if (!arrRef.current) return;
    moverScroll(e.clientY);
    const d = destinoEn(e.clientX, e.clientY);
    if (d && (d.rating !== arrRef.current.hacia?.rating || d.index !== arrRef.current.hacia?.index)) {
      setArr((a) => (a ? { ...a, hacia: d } : a));
    }
  };
  const onUp = () => {
    cancelAnimationFrame(auto.current);
    const a = arrRef.current;
    setArr(null);
    if (a?.hacia) h.moverEnReorder(a.desde, a.hacia);
  };
  const linea = (rating, index) => arr?.hacia?.rating === rating && arr.hacia.index === index
    && !(arr.desde.rating === rating && (arr.desde.index === index || arr.desde.index + 1 === index));

  const mandarA = (rating) => {
    if (!moviendo) return;
    h.moverEnReorder({ rating: moviendo.rating, index: moviendo.index }, { rating, index: 0 });
    setMoviendo(null);
  };

  return (
    <div className={`mv-reord${arr ? ' arrastrando' : ''}`}>
      {REORDER_RATINGS.map((rating) => {
        const block = h.reorderData.blocks[rating] ?? [];
        return (
          <div key={rating} className="mv-reord-bloque">
            <div className="mv-reord-cab" data-r={rating} data-cab=""><NotaMv rating={rating} /><span>{block.length}</span></div>
            {block.map((t, index) => {
              const cambio = t.rating !== rating;
              const va = arr?.desde.rating === rating && arr.desde.index === index;
              return (
                <div key={t.tid} data-r={rating} data-i={index}
                     className={`mv-mini${va ? ' va' : ''}${linea(rating, index) ? ' linea' : ''}${cambio ? ' cambio' : ''}`}>
                  <button type="button" className="mv-mini-tx" onClick={() => setMoviendo({ rating, index, t })}>
                    <Mini src={t.image} />
                    <span>
                      <b>{t.name}</b>
                      <small>{cambio && <s>{t.rating}</s>}{t.artist}</small>
                    </span>
                  </button>
                  <span className="mv-asa" role="button" aria-label={`Arrastrar ${t.name}`}
                        onPointerDown={(e) => onDown(e, rating, index)} onPointerMove={onMove}
                        onPointerUp={onUp} onPointerCancel={onUp}>
                    <IcoAsa />
                  </span>
                </div>
              );
            })}
            <div data-r={rating} className={`mv-reord-fin${linea(rating, block.length) ? ' linea' : ''}`}>
              {!block.length && `Suelta aquí para ${rating}`}
            </div>
          </div>
        );
      })}

      <Hoja abierta={!!moviendo} onCerrar={() => setMoviendo(null)} etiqueta="Mover a otra nota">
        {moviendo && (
          <>
            <div className="mv-hoja-t">
              <Mini src={moviendo.t.image} />
              <div><b>{moviendo.t.name}</b><span>{moviendo.t.artist}</span></div>
            </div>
            <div className="mv-notas seis">
              {REORDER_RATINGS.map((r) => (
                <button key={r} type="button" className={`mv-bn ${claseNota(r)}${moviendo.rating === r ? ' actual' : ''}`}
                        onClick={() => mandarA(r)} aria-label={`Mover a ${r}`}>{r}</button>
              ))}
            </div>
            <div className="mv-hoja-aviso">Va al principio de ese bloque. Nada cambia hasta que aplicas.</div>
          </>
        )}
      </Hoja>
    </div>
  );
}

// ─── Modo virtual, A+ y Migración ────────────────────────────────────────────

function Virtual({ h }) {
  const activo = !!h.virtualStatus?.active;
  const ocupado = !!h.actionLoading;
  return (
    <>
      <div className="mv-her-acc">
        {!activo ? (
          <button type="button" className="mv-boton pri" disabled={ocupado} onClick={h.virtualIniciar}>
            {h.actionLoading === 'vstart' ? 'Iniciando…' : 'Iniciar'}
          </button>
        ) : (
          <>
            <button type="button" className="mv-boton" disabled={ocupado} onClick={h.virtualSimular}>
              {h.actionLoading === 'vsim' ? 'Simulando…' : 'Simular'}
            </button>
            <button type="button" className="mv-boton pri" disabled={ocupado} onClick={h.virtualAplicar}>
              {h.actionLoading === 'vapply' ? 'Aplicando…' : 'Aplicar'}
            </button>
            <button type="button" className="mv-boton" disabled={ocupado} onClick={h.virtualFinalizar}>
              {h.actionLoading === 'vend' ? '…' : 'Finalizar'}
            </button>
          </>
        )}
      </div>
      <div className="mv-dia"><span>Fronteras</span></div>
      {h.virtualBoundaries.length ? h.virtualBoundaries.map((b) => (
        <div key={b.pair} className="mv-frontera">
          <span className="mv-eyebrow">{b.pair}</span>
          <span>{b.upper}</span>
          <span>{b.lower}</span>
        </div>
      )) : (
        <p className="mv-her-p">
          {activo ? 'Toca "Simular" para ver dónde quedaron las fronteras.' : 'Al iniciar se congelan la última canción de cada nota y la primera de la siguiente.'}
        </p>
      )}
      <div className="mv-dia"><span>{h.simulateChanges.length ? `${h.simulateChanges.length} cambios` : 'Cambios'}</span></div>
      {h.simulateChanges.length ? h.simulateChanges.map((ch) => (
        <div key={ch.tid} className="mv-cambio">
          <NotaMv rating={ch.old} /><span className="mv-flecha">→</span><NotaMv rating={ch.new} />
          <span><b>{ch.name}</b><small>{ch.artist}</small></span>
        </div>
      )) : <p className="mv-her-p">Mueve canciones en Spotify y luego simula: aquí sale qué nota cambiaría.</p>}
    </>
  );
}

function Aplus({ h, escaneado, portadas }) {
  if (!escaneado) return <p className="mv-vacio">Buscando Me Gusta nuevos desde el corte…</p>;
  if (!h.aplusCandidates.length) return <p className="mv-vacio">Nada nuevo desde el corte. Cuando le des ♥ a algo en Spotify, sale aquí.</p>;
  const todas = h.selectedAplusIds.size === h.aplusCandidates.length;
  return (
    <>
      <div className="mv-her-barra">
        <span className="mv-eyebrow">{h.selectedAplusIds.size} de {h.aplusCandidates.length}</span>
        <button type="button" className="mv-pill mv-pill-btn" onClick={h.aplusAlternarTodo}>{todas ? 'Desmarcar todo' : 'Marcar todo'}</button>
      </div>
      {h.aplusCandidates.map((c, i) => {
        const sel = h.selectedAplusIds.has(c.id);
        return (
          <button key={c.id || i} type="button" className={`mv-marca${sel ? '' : ' apagada'}`} aria-pressed={sel}
                  onClick={() => h.aplusAlternar(c.id)}>
            <Casilla marcada={sel} />
            <Mini src={portadas[c.id]} />
            <span><b>{c.name}</b><small>{c.artist}</small></span>
          </button>
        );
      })}
    </>
  );
}

function Migracion({ h, escaneado }) {
  const d = h.migData;
  if (!d) {
    return escaneado && h.actionLoading !== 'mig-scan'
      ? <p className="mv-vacio">No hay migración disponible para este cuatrimestre.</p>
      : <p className="mv-vacio">Leyendo las candidatas…</p>;
  }
  if (!d.candidates.length) return <p className="mv-vacio">No hay canciones en {cuatriInfo(d.from_cuatri).nombre} para migrar.</p>;
  const destinoNombre = cuatriInfo(d.to_cuatri).nombre;
  return (
    <>
      <div className="mv-seg">
        {[['playlist', 'Playlist'], ['rating', 'Nota'], ['recent', 'Recientes']].map(([k, l]) => (
          <button key={k} type="button" className={h.migSort === k ? 'on' : ''} aria-pressed={h.migSort === k}
                  onClick={() => h.setMigSort(k)}>{l}</button>
        ))}
      </div>
      <input className="mv-buscar" type="search" value={h.migSearch} onChange={(e) => h.setMigSearch(e.target.value)}
             placeholder="Filtrar" aria-label="Filtrar candidatas" />
      <div className="mv-her-barra">
        <span className="mv-eyebrow">
          {h.migSelectedIds.size} / {d.migrables ?? d.candidates.length}
          {d.ya_migradas > 0 && ` · ${d.ya_migradas} ya en ${corto(destinoNombre, anioActual())}`}
        </span>
        <button type="button" className="mv-pill mv-pill-btn" onClick={h.toggleMigAll}>
          {h.migTodasVisibles ? 'Desmarcar' : 'Marcar visibles'}
        </button>
      </div>
      {d.orden_playlist === false && <p className="mv-her-p">Spotify no contestó: el orden no es el de la playlist.</p>}
      {h.filteredMigCandidates.map((c) => {
        const sel = c.migrated || h.migSelectedIds.has(c.track_id);
        return (
          <button key={c.track_id} type="button" disabled={!!c.migrated}
                  className={`mv-marca${c.migrated ? ' migrada' : sel ? '' : ' apagada'}`}
                  aria-pressed={sel} onClick={() => h.migAlternar(c)}>
            <Casilla marcada={sel} muerta={!!c.migrated} />
            <Mini src={c.image} />
            <span>
              <b>{c.name}</b>
              <small>{c.migrated ? `ya en ${destinoNombre}` : c.en_playlist === false ? 'fuera de la playlist' : c.artist}</small>
            </span>
            <NotaMv rating={c.rating} />
          </button>
        );
      })}
    </>
  );
}

function Orden({ h, anio }) {
  const ocupado = (k) => h.actionLoading === k;
  return (
    <>
      <p className="mv-her-p">Vuelve a acomodar por nota y novedad. Reconstruir rehace la playlist desde la base.</p>
      <div className="mv-dia"><span>Ordenar</span></div>
      <div className="mv-her-rejilla">
        {SLOTS.map((c) => (
          <button key={c} type="button" className="mv-boton" disabled={!!h.actionLoading} onClick={() => h.ordenar(c)}>
            {ocupado(`order-${c}`) ? 'Ordenando…' : corto(cuatriInfo(c, anio).nombre, anio)}
          </button>
        ))}
        <button type="button" className="mv-boton" disabled={!!h.actionLoading} onClick={h.ordenarAnual}>
          {ocupado('order-anual') ? 'Ordenando…' : 'Galería'}
        </button>
      </div>
      <div className="mv-dia"><span>Reconstruir</span></div>
      <div className="mv-her-rejilla">
        {SLOTS.map((c) => (
          <button key={c} type="button" className="mv-boton" disabled={!!h.actionLoading} onClick={() => h.reconstruir(c)}>
            {ocupado(`rebuild-${c}`) ? '…' : corto(cuatriInfo(c, anio).nombre, anio)}
          </button>
        ))}
        <button type="button" className="mv-boton" disabled={!!h.actionLoading} onClick={h.reconstruirAnual}>
          {ocupado('rebuild-anual') ? '…' : 'Galería'}
        </button>
      </div>
    </>
  );
}

// ─── La pantalla ─────────────────────────────────────────────────────────────

export default function HerramientasMovil() {
  const navigate = useNavigate();
  const h = useHerramientas();
  const anio = anioActual();
  const actual = cuatriActual();
  const prev = actual ? PREV[actual] : null;
  const nombreActual = actual ? cuatriInfo(actual, anio).nombre : '';

  const [liked, setLiked] = useState([]);
  const [abierta, setAbierta] = useState(null);   // { key, origen }
  const [cerrando, setCerrando] = useState(false);
  const [escaneado, setEscaneado] = useState({});
  const tarjetas = useRef({});
  const cuerpoRef = useRef(null);

  usePortadaDeFondo(actual ? (cuatriInfo(actual, anio).imgGrande || cuatriInfo(actual, anio).img) : null);

  useEffect(() => {
    preloadCache.load('likedAll', () => api.getLikedAll(500, 0)).then((ts) => Array.isArray(ts) && setLiked(ts)).catch(() => {});
  }, []);
  const portadas = useMemo(() => Object.fromEntries(liked.filter((t) => t.image).map((t) => [t.id || t.track_id, t.image])), [liked]);

  const abrir = (key) => {
    const el = tarjetas.current[key];
    if (!el || abierta) return;
    setAbierta({ key, origen: el.getBoundingClientRect() });
    setCerrando(false);
    // Lo que pide cada herramienta sale mientras la tarjeta crece.
    if (key === 'reordenar' && !h.reorderData) h.loadReorder();
    if (key === 'migrar' && !h.migData) h.migBuscar().then(() => setEscaneado((s) => ({ ...s, migrar: true })));
    if (key === 'aplus' && !h.aplusCandidates.length) h.aplusEscanear().then(() => setEscaneado((s) => ({ ...s, aplus: true })));
  };
  const cerrar = useCallback(() => setCerrando(true), []);
  const cerrada = useCallback(() => { setAbierta(null); setCerrando(false); }, []);
  const dameOrigen = useCallback(() => (abierta ? tarjetas.current[abierta.key]?.getBoundingClientRect() : null), [abierta]);
  const aplicarYCerrar = async (fn) => { if (await fn()) cerrar(); };

  const virtualActivo = !!h.virtualStatus?.active;
  const cambios = h.reorderPendingChanges;

  const herramientas = {
    reordenar: {
      ico: <IcoOrdenar />, titulo: 'Reordenador', ancha: true,
      texto: `Arrastra entre notas para cambiarlas${nombreActual ? ` · ${corto(nombreActual, anio)}` : ''}`,
      cuerpo: <Reordenador h={h} nombreActual={nombreActual} cuerpoRef={cuerpoRef} />,
      pie: h.reorderData && (
        <>
          <button type="button" className="mv-boton" disabled={h.reorderApplying}
                  onClick={() => { h.setReorderData(null); cerrar(); }}>Descartar</button>
          <button type="button" className="mv-boton pri" disabled={h.reorderApplying} onClick={() => aplicarYCerrar(h.applyReorder)}>
            {h.reorderApplying ? 'Aplicando…' : cambios ? `Aplicar (${cambios})` : 'Aplicar orden'}
          </button>
        </>
      ),
    },
    virtual: {
      ico: <IcoVirtual />, titulo: 'Modo virtual',
      texto: virtualActivo ? `Activo · ${corto(cuatriInfo(h.virtualStatus.cuatri, anio).nombre, anio)}` : 'Reordena en Spotify y detecta cambios',
      cuerpo: <Virtual h={h} />,
    },
    aplus: {
      ico: <IcoEstrella />, titulo: 'A+ instantáneos', texto: 'Tus Me Gusta nuevos, directo a A+',
      cuerpo: <Aplus h={h} escaneado={escaneado.aplus || h.aplusCandidates.length > 0} portadas={portadas} />,
      pie: h.aplusCandidates.length > 0 && (
        <button type="button" className="mv-boton pri" disabled={!!h.actionLoading || !h.selectedAplusIds.size}
                onClick={() => aplicarYCerrar(h.aplusAplicar)}>
          {h.actionLoading === 'aplus-apply' ? 'Aplicando…' : `Aplicar ${h.selectedAplusIds.size} como A+`}
        </button>
      ),
    },
    migrar: {
      ico: <IcoMigrar />, titulo: 'Migración', sinAbrir: !prev,
      texto: prev ? `De ${corto(cuatriInfo(prev, anio).nombre, anio)} a ${corto(nombreActual, anio)}` : 'No hay cuatrimestre anterior',
      cuerpo: <Migracion h={h} escaneado={escaneado.migrar} />,
      pie: h.migData?.candidates?.length > 0 && (
        <button type="button" className="mv-boton pri" disabled={!!h.actionLoading || !h.migSelectedIds.size}
                onClick={() => aplicarYCerrar(h.migMover)}>
          {h.actionLoading === 'migrate' ? 'Moviendo…' : `Mover ${h.migSelectedIds.size ? `${h.migSelectedIds.size} ` : ''}a ${corto(cuatriInfo(h.migData.to_cuatri, anio).nombre, anio)}`}
        </button>
      ),
    },
    catalogar: { ico: <IcoArchivo />, titulo: 'Catalogar', texto: 'Me Gusta viejos, con su fecha real', ir: '/backfill' },
    limpiar: { ico: <IcoLimpiar />, titulo: 'Limpiar Me Gusta', texto: 'Las que casi no escuchas', ir: '/abandoned' },
    orden: {
      ico: <IcoBiblioteca />, titulo: 'Orden de playlists', texto: 'Ordenar y reconstruir',
      cuerpo: <Orden h={h} anio={anio} />,
    },
  };

  const abiertaT = abierta ? herramientas[abierta.key] : null;

  return (
    <div className="mv-pag">
      <header className="mv-cab">
        <div>
          <div className="mv-eyebrow">Herramientas</div>
          <h1 className="mv-tit">Mantenimiento</h1>
        </div>
      </header>

      <div className="mv-herr">
        {Object.entries(herramientas).map(([key, t], i) => (
          <button key={key} type="button" ref={(el) => { tarjetas.current[key] = el; }}
                  className={`mv-hc${t.ancha ? ' ancha' : ''}${abierta?.key === key ? ' oculta' : ''}`}
                  style={{ animationDelay: `${i * 45}ms` }} disabled={t.sinAbrir}
                  onClick={() => (t.ir ? navigate(t.ir) : abrir(key))}>
            {t.ico}
            <div><b>{t.titulo}</b><span>{t.texto}</span></div>
          </button>
        ))}
      </div>

      {abiertaT && (
        <Crece origen={abierta.origen} dameOrigen={dameOrigen} cerrando={cerrando} onCerrada={cerrada} onCerrar={cerrar}>
          <div className="mv-crece-cab">
            <div>
              <div className="mv-eyebrow">Herramienta</div>
              <h3>{abiertaT.titulo}</h3>
              <p>{abiertaT.texto}</p>
            </div>
            <button type="button" className="mv-ic" onClick={cerrar} aria-label="Cerrar"><IcoCerrar /></button>
          </div>
          <div className="mv-crece-cuerpo" ref={cuerpoRef}>{abiertaT.cuerpo}</div>
          {abiertaT.pie && <div className="mv-crece-pie">{abiertaT.pie}</div>}
        </Crece>
      )}
    </div>
  );
}
