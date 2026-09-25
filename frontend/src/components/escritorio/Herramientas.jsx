import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Check, GripVertical, X } from 'lucide-react';
import { api } from '../../utils/api';
import { preloadCache } from '../../utils/preloadCache';
import { portadaMedia } from '../../utils/portadas';
import { anioActual, cuatriActual, cuatriInfo, SLOTS } from '../../utils/cuatrimestres';
import { useHerramientas, REORDER_RATINGS } from '../../hooks/useHerramientas';
import { usePortadaDeFondo } from './FondoPortada';
import Nota from './Nota';

/**
 * Herramientas, versión de escritorio (fase 6 del rediseño, 2026-09-25). Sale
 * de la pantalla "Herramientas" del lienzo Design; la lógica es la de siempre,
 * en hooks/useHerramientas.js.
 *
 * Lo que decidió Angel al pasarla a React:
 *  - El tablero del lienzo: tres colas arriba y el mantenimiento abajo.
 *  - Al abrir una herramienta, NI panel lateral NI pantalla aparte: la misma
 *    tarjeta sale de su lugar y crece hasta quedar grande en medio ("algo más
 *    dinámico, bonito, con animación, no pantalla de carga"). El tablero se
 *    difumina detrás; Esc, clic afuera o la X la regresan a su lugar.
 *  - Sin la tarjeta "Apariencia": el escritorio es solo oscuro. El selector
 *    sigue en la vista del móvil.
 *  - Las dos colas (backfill y limpieza) abren sus pantallas de siempre por
 *    ahora; su versión nueva va en otra sesión.
 */

const PREV = { perla: null, miel: 'perla', latte: 'miel' };
const MORPH_MS = 560;
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

const sinMovimiento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function unicas(xs, n) {
  return xs.map((t) => t.image).filter(Boolean).filter((s, i, a) => a.indexOf(s) === i).slice(0, n);
}

/**
 * Dónde queda la ventana abierta: centrada bajo la barra de arriba. `chica`
 * para las herramientas de poco contenido (Modo virtual, A+), que en la grande
 * se veían vacías.
 */
function destino(chica = false) {
  const barra = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--barra-h')) || 44;
  const vw = window.innerWidth;
  const vh = window.innerHeight - barra;
  const width = Math.min(chica ? 980 : 1240, vw - Math.max(96, vw * 0.1));
  const height = Math.min(chica ? 640 : 920, vh - Math.max(48, vh * 0.08));
  return { left: (vw - width) / 2, top: barra + (vh - height) / 2, width, height };
}

const px = (r) => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });

/**
 * La tarjeta hecha ventana. Nace con el tamaño y la posición de la tarjeta
 * (`origen`) y crece hasta `destino()`; al cerrar hace el camino de regreso
 * hacia donde esté la tarjeta en ese momento y luego avisa con `onCerrada`.
 */
function Ventana({ origen, dameOrigen, chica, cerrando, onCerrada, onCerrar, children }) {
  const caja = useRef(null);
  const velo = useRef(null);
  const [rect, setRect] = useState(() => destino(chica));

  useLayoutEffect(() => {
    if (sinMovimiento()) return;
    caja.current?.animate(
      [{ ...px(origen), borderRadius: '16px' }, { ...px(destino(chica)), borderRadius: '22px' }],
      { duration: MORPH_MS, easing: EASE },
    );
    velo.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MORPH_MS * 0.8, easing: 'ease-out' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onResize = () => setRect(destino(chica));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [chica]);

  useEffect(() => {
    if (!cerrando) return;
    if (sinMovimiento() || !caja.current) { onCerrada(); return; }
    const hacia = dameOrigen() || origen;
    const a = caja.current.animate(
      [{ ...px(rect), borderRadius: '22px' }, { ...px(hacia), borderRadius: '16px' }],
      { duration: MORPH_MS * 0.8, easing: EASE, fill: 'forwards' },
    );
    velo.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: MORPH_MS * 0.7, fill: 'forwards' });
    // `onfinish` llega con el siguiente cuadro: con la ventana en segundo plano
    // no habría cuadros y se quedaría abierta. El temporizador la cierra igual.
    let hecho = false;
    const fin = () => { if (!hecho) { hecho = true; onCerrada(); } };
    a.onfinish = fin;
    const t = setTimeout(fin, MORPH_MS * 0.8 + 120);
    return () => clearTimeout(t);
  }, [cerrando]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCerrar]);

  return (
    <div className={`esc-her-capa${cerrando ? ' cerrando' : ''}`}>
      <div ref={velo} className="esc-her-velo" onClick={onCerrar} />
      <section ref={caja} className="esc-her-ventana" style={px(rect)} role="dialog" aria-modal="true">
        {children}
      </section>
    </div>
  );
}

/** La cabeza que comparten la tarjeta y su ventana: arte, título y texto. */
function Cabeza({ arte, titulo, texto, extra }) {
  return (
    <div className="esc-her-cabeza">
      {arte && <div className="esc-her-arte">{arte}</div>}
      <div className="esc-her-textos">
        <h2>{titulo}</h2>
        <p>{texto}</p>
      </div>
      {extra}
    </div>
  );
}

function Pila({ imgs, gris = false }) {
  if (!imgs.length) return <div className="esc-her-pila"><span className="esc-sin-portada" /></div>;
  return (
    <div className={`esc-her-pila${gris ? ' gris' : ''}`}>
      {imgs.map((src) => <img key={src} src={portadaMedia(src)} alt="" />)}
    </div>
  );
}

function Portada({ src, className = '' }) {
  return src
    ? <img className={className} src={portadaMedia(src)} alt="" loading="lazy" />
    : <span className={`${className} esc-sin-portada`} />;
}

// ─── Contenidos de cada ventana ──────────────────────────────────────────────

function Reordenador({ h, nombreActual }) {
  const src = useRef(null);
  const [sobre, setSobre] = useState(null);      // { rating, index }
  const [arrastrando, setArrastrando] = useState(null);

  if (!h.reorderData) return <div className="esc-her-leyendo">Leyendo {nombreActual}…</div>;

  const soltar = (e, rating, index) => {
    e.preventDefault();
    setSobre(null);
    setArrastrando(null);
    if (!src.current) return;
    const desde = src.current;
    src.current = null;
    h.moverEnReorder(desde, { rating, index });
  };
  const encima = (e, rating, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (sobre?.rating !== rating || sobre?.index !== index) setSobre({ rating, index });
  };
  const linea = (rating, index) => sobre?.rating === rating && sobre?.index === index;

  return (
    <div className="esc-her-bloques">
      {REORDER_RATINGS.map((rating, bi) => {
        const block = h.reorderData.blocks[rating] ?? [];
        return (
          <div key={rating} className="esc-her-bloque" style={{ animationDelay: `${bi * 50}ms` }}
            onDragOver={(e) => encima(e, rating, block.length)} onDrop={(e) => soltar(e, rating, block.length)}>
            <div className="esc-her-bloque-cab">
              <Nota rating={rating} />
              <span>{block.length}</span>
            </div>
            <ol className="esc-her-bloque-lista">
              {block.map((t, index) => {
                const cambio = t.rating !== rating;
                const va = arrastrando?.rating === rating && arrastrando?.index === index;
                return (
                  <li key={t.tid} draggable
                    className={`esc-her-arrastra${va ? ' va' : ''}${linea(rating, index) ? ' linea' : ''}${cambio ? ' cambio' : ''}`}
                    style={{ animationDelay: `${Math.min(index, 12) * 25 + bi * 50}ms` }}
                    onDragStart={(e) => { src.current = { rating, index }; setArrastrando({ rating, index }); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragOver={(e) => { e.stopPropagation(); encima(e, rating, index); }}
                    onDrop={(e) => { e.stopPropagation(); soltar(e, rating, index); }}
                    onDragEnd={() => { src.current = null; setArrastrando(null); setSobre(null); }}>
                    <GripVertical size={12} className="esc-her-agarre" />
                    <Portada src={t.image} className="esc-her-mini-img" />
                    <span className="esc-her-fila-texto">
                      <span className="esc-her-fila-nombre">{t.name}</span>
                      <span className="esc-her-fila-artista">
                        {cambio && <s>{t.rating}</s>}{t.artist}
                      </span>
                    </span>
                  </li>
                );
              })}
              <li className={`esc-her-fin${linea(rating, block.length) ? ' linea' : ''}`} aria-hidden="true">
                {!block.length && `Suelta aquí para ${rating}`}
              </li>
            </ol>
          </div>
        );
      })}
    </div>
  );
}

function Virtual({ h }) {
  const activo = !!h.virtualStatus?.active;
  return (
    <div className="esc-her-virtual">
      <div className="esc-her-acciones">
        {!activo ? (
          <button type="button" className="esc-primario" disabled={!!h.actionLoading} onClick={h.virtualIniciar}>
            {h.actionLoading === 'vstart' ? 'Iniciando…' : 'Iniciar'}
          </button>
        ) : (
          <>
            <button type="button" className="esc-fantasma" disabled={!!h.actionLoading} onClick={h.virtualSimular}>
              {h.actionLoading === 'vsim' ? 'Simulando…' : 'Simular'}
            </button>
            <button type="button" className="esc-primario" disabled={!!h.actionLoading} onClick={h.virtualAplicar}>
              {h.actionLoading === 'vapply' ? 'Aplicando…' : 'Aplicar cambios'}
            </button>
            <button type="button" className="esc-fantasma" disabled={!!h.actionLoading} onClick={h.virtualFinalizar}>
              {h.actionLoading === 'vend' ? 'Finalizando…' : 'Finalizar'}
            </button>
          </>
        )}
      </div>
      <div className="esc-her-dos">
        <div>
          <div className="esc-rotulo">Fronteras</div>
          {h.virtualBoundaries.length ? (
            <ol className="esc-her-tabla">
              {h.virtualBoundaries.map((b, i) => (
                <li key={b.pair} style={{ animationDelay: `${i * 40}ms` }}>
                  <span className="esc-her-par">{b.pair}</span>
                  <span>{b.upper}</span>
                  <span>{b.lower}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="esc-her-nada">
              {activo ? 'Pica "Simular" para ver dónde quedaron las fronteras.' : 'Al iniciar se congelan aquí la última canción de cada nota y la primera de la siguiente.'}
            </p>
          )}
        </div>
        <div>
          <div className="esc-rotulo">{h.simulateChanges.length ? `${h.simulateChanges.length} cambios detectados` : 'Cambios'}</div>
          {h.simulateChanges.length ? (
            <ol className="esc-her-tabla">
              {h.simulateChanges.map((ch, i) => (
                <li key={ch.tid} className="esc-her-cambio" style={{ animationDelay: `${i * 30}ms` }}>
                  <Nota rating={ch.old} /><ArrowRight size={12} /><Nota rating={ch.new} />
                  <span className="esc-her-fila-nombre">{ch.name}</span>
                  <span className="esc-her-fila-artista">{ch.artist}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="esc-her-nada">Mueve canciones en Spotify y luego simula: aquí sale qué nota cambiaría.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Casilla({ marcada, deshabilitada }) {
  return (
    <span className={`esc-her-casilla${marcada ? ' marcada' : ''}${deshabilitada ? ' muerta' : ''}`} aria-hidden="true">
      {marcada && <Check size={11} strokeWidth={3} />}
    </span>
  );
}

function Aplus({ h, escaneado, portadas }) {
  if (!escaneado) return <div className="esc-her-leyendo">Buscando Me Gusta nuevos desde el corte…</div>;
  if (!h.aplusCandidates.length) {
    return <div className="esc-her-vacio">Nada nuevo desde el corte. Cuando le des corazón a algo en Spotify, sale aquí.</div>;
  }
  const todas = h.selectedAplusIds.size === h.aplusCandidates.length;
  return (
    <>
      <div className="esc-her-barra">
        <span className="esc-rotulo">{h.selectedAplusIds.size} de {h.aplusCandidates.length} marcadas</span>
        <button type="button" className="esc-fantasma esc-fantasma-chico" onClick={h.aplusAlternarTodo}>
          {todas ? 'Desmarcar todo' : 'Marcar todo'}
        </button>
      </div>
      <ol className="esc-her-lista">
        {h.aplusCandidates.map((c, i) => {
          const sel = h.selectedAplusIds.has(c.id);
          return (
            <li key={c.id || i} style={{ animationDelay: `${Math.min(i, 16) * 30}ms` }}>
              <button type="button" className={`esc-her-fila${sel ? '' : ' apagada'}`} aria-pressed={sel}
                onClick={() => h.aplusAlternar(c.id)}>
                <Casilla marcada={sel} />
                <Portada src={portadas[c.id]} className="esc-her-fila-img" />
                <span className="esc-her-fila-texto">
                  <span className="esc-her-fila-nombre">{c.name}</span>
                  <span className="esc-her-fila-artista">{c.artist}</span>
                </span>
                <span className="esc-her-fila-album">{c.album}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function Migracion({ h, escaneado }) {
  const d = h.migData;
  if (!d) {
    return escaneado && h.actionLoading !== 'mig-scan'
      ? <div className="esc-her-vacio">No hay migración disponible para este cuatrimestre.</div>
      : <div className="esc-her-leyendo">Leyendo las candidatas…</div>;
  }
  if (!d.candidates.length) {
    return <div className="esc-her-vacio">No hay canciones en {cuatriInfo(d.from_cuatri).nombre} para migrar.</div>;
  }
  const destinoNombre = cuatriInfo(d.to_cuatri).nombre;
  return (
    <>
      <div className="esc-her-barra">
        <span className="esc-rotulo">
          {h.migSelectedIds.size} / {d.migrables ?? d.candidates.length} marcadas
          {d.ya_migradas > 0 && ` · ${d.ya_migradas} ya en ${destinoNombre}`}
        </span>
        <div className="esc-her-barra-der">
          <div className="esc-segmento" role="group" aria-label="Orden">
            {[['playlist', 'Playlist'], ['rating', 'Calificación'], ['recent', 'Recientes']].map(([k, l]) => (
              <button key={k} type="button" className={h.migSort === k ? 'activo' : ''} aria-pressed={h.migSort === k}
                onClick={() => h.setMigSort(k)}>{l}</button>
            ))}
          </div>
          <label className="esc-bib-filtro">
            <input value={h.migSearch} onChange={(e) => h.setMigSearch(e.target.value)} placeholder="Filtrar" aria-label="Filtrar candidatas" />
          </label>
          <button type="button" className="esc-fantasma esc-fantasma-chico" onClick={h.toggleMigAll}>
            {h.migTodasVisibles ? 'Desmarcar visibles' : 'Marcar visibles'}
          </button>
        </div>
      </div>
      {d.orden_playlist === false && (
        <p className="esc-her-nota-aviso">Spotify no contestó: el orden no es el de la playlist.</p>
      )}
      <ol className="esc-her-lista">
        {h.filteredMigCandidates.map((c, i) => {
          const sel = c.migrated || h.migSelectedIds.has(c.track_id);
          return (
            <li key={c.track_id} style={{ animationDelay: `${Math.min(i, 16) * 25}ms` }}>
              <button type="button" disabled={!!c.migrated}
                className={`esc-her-fila${c.migrated ? ' migrada' : sel ? '' : ' apagada'}`}
                aria-pressed={sel} onClick={() => h.migAlternar(c)}>
                <Casilla marcada={sel} deshabilitada={!!c.migrated} />
                <Portada src={c.image} className="esc-her-fila-img" />
                <span className="esc-her-fila-texto">
                  <span className="esc-her-fila-nombre">{c.name}</span>
                  <span className="esc-her-fila-artista">{c.artist}</span>
                </span>
                <span className="esc-her-fila-album">
                  {c.migrated ? `ya en ${destinoNombre}` : c.en_playlist === false ? 'fuera de la playlist' : c.album}
                </span>
                <Nota rating={c.rating} />
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}

// ─── La pantalla ─────────────────────────────────────────────────────────────

export default function HerramientasEscritorio() {
  const navigate = useNavigate();
  const h = useHerramientas();
  const anio = anioActual();
  const actual = cuatriActual();
  const prev = actual ? PREV[actual] : null;
  const nombreActual = actual ? cuatriInfo(actual, anio).nombre : '';

  const [liked, setLiked] = useState([]);
  const [muestra, setMuestra] = useState([]);           // la playlist del cuatrimestre, para el arte del Reordenador
  const [abierta, setAbierta] = useState(null);          // { key, origen }
  const [cerrando, setCerrando] = useState(false);
  const [escaneado, setEscaneado] = useState({});        // key -> ya se pidió al abrir
  const tarjetas = useRef({});

  usePortadaDeFondo(actual ? cuatriInfo(actual, anio).imgGrande : null);

  useEffect(() => {
    preloadCache.load('likedAll', () => api.getLikedAll(500, 0)).then((ts) => Array.isArray(ts) && setLiked(ts)).catch(() => {});
    if (!actual) return;
    preloadCache.load('distribution', api.getDistribution).then((d) => {
      if (d?.[actual]) preloadCache.load(`playlist_${actual}`, () => api.getPlaylistTracks(d[actual]))
        .then((ts) => Array.isArray(ts) && setMuestra(ts)).catch(() => {});
    }).catch(() => {});
  }, [actual]);

  const portadas = useMemo(() => Object.fromEntries(liked.filter((t) => t.image).map((t) => [t.id || t.track_id, t.image])), [liked]);
  const sinNota = useMemo(() => unicas(liked.filter((t) => !t.rating), 4), [liked]);
  const viejas = useMemo(() => unicas([...liked].reverse(), 4), [liked]);

  const abrir = (key) => {
    const el = tarjetas.current[key];
    if (!el || abierta) return;
    setAbierta({ key, origen: el.getBoundingClientRect() });
    setCerrando(false);
    // Lo que cada herramienta pide al abrirse: sale mientras la tarjeta crece,
    // así no hay pantalla de carga.
    if (key === 'reordenar' && !h.reorderData) h.loadReorder();
    if (key === 'migrar' && !h.migData) h.migBuscar().then(() => setEscaneado((s) => ({ ...s, migrar: true })));
    if (key === 'aplus' && !h.aplusCandidates.length) h.aplusEscanear().then(() => setEscaneado((s) => ({ ...s, aplus: true })));
  };
  const cerrar = useCallback(() => setCerrando(true), []);
  const cerrada = useCallback(() => { setAbierta(null); setCerrando(false); }, []);
  const dameOrigen = useCallback(() => (abierta ? tarjetas.current[abierta.key]?.getBoundingClientRect() : null), [abierta]);

  const aplicarYCerrar = async (fn) => { if (await fn()) cerrar(); };

  const virtualActivo = !!h.virtualStatus?.active;
  const ocupado = (k) => h.actionLoading === k;

  const herramientas = {
    aplus: {
      arte: (
        <div className="esc-her-aplus">
          <span className="esc-her-aplus-a">A+</span>
          <span>Corte fijo desde<br />tu primer escaneo</span>
        </div>
      ),
      titulo: 'A+ instantáneos',
      chica: true,
      texto: 'Revisa los Me Gusta nuevos desde el corte y marca de una vez los que son A+.',
      boton: 'Escanear',
      estado: h.aplusCandidates.length ? `${h.aplusCandidates.length} candidatas` : null,
      cuerpo: <Aplus h={h} escaneado={escaneado.aplus || h.aplusCandidates.length > 0} portadas={portadas} />,
      pie: h.aplusCandidates.length > 0 && (
        <button type="button" className="esc-primario" disabled={!!h.actionLoading || !h.selectedAplusIds.size}
          onClick={() => aplicarYCerrar(h.aplusAplicar)}>
          {ocupado('aplus-apply') ? 'Aplicando…' : `Aplicar ${h.selectedAplusIds.size} como A+`}
        </button>
      ),
    },
    reordenar: {
      arte: (
        <div className="esc-her-muestra">
          {muestra.slice(0, 2).map((t, i) => (
            <div key={t.id || i} className={`esc-her-muestra-fila${i === 1 ? ' alzada' : ''}`}>
              <GripVertical size={12} />
              <Portada src={t.image} className="esc-her-muestra-img" />
              <span>{t.name}</span>
              <Nota rating={t.rating} />
            </div>
          ))}
        </div>
      ),
      titulo: 'Reordenador',
      texto: 'Arrastra entre bloques para cambiar la nota. Spotify, la base y Me Gusta en un paso.',
      boton: `Abrir ${nombreActual}`,
      estado: h.reorderData ? (h.reorderPendingChanges ? `${h.reorderPendingChanges} ${h.reorderPendingChanges === 1 ? 'nota' : 'notas'} por cambiar` : nombreActual) : null,
      cuerpo: <Reordenador h={h} nombreActual={nombreActual} />,
      pie: h.reorderData && (
        <>
          <button type="button" className="esc-fantasma" disabled={h.reorderApplying}
            onClick={() => { h.setReorderData(null); cerrar(); }}>Descartar</button>
          <button type="button" className="esc-primario" disabled={h.reorderApplying}
            onClick={() => aplicarYCerrar(h.applyReorder)}>
            {h.reorderApplying ? 'Aplicando…' : h.reorderPendingChanges ? `Aplicar (${h.reorderPendingChanges} ${h.reorderPendingChanges === 1 ? 'cambio' : 'cambios'})` : 'Aplicar orden'}
          </button>
        </>
      ),
    },
    virtual: {
      arte: (
        <div className="esc-her-virtual-arte">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" />
          </svg>
          <span className={`esc-her-pildora${virtualActivo ? ' viva' : ''}`}>
            {virtualActivo ? `Activo · ${cuatriInfo(h.virtualStatus.cuatri, anio).nombre}` : 'Inactivo'}
          </span>
        </div>
      ),
      titulo: 'Modo virtual',
      chica: true,
      texto: 'Congela las fronteras de nota, mueve canciones en Spotify y luego simula y aplica.',
      boton: virtualActivo ? 'Continuar' : 'Abrir',
      cuerpo: <Virtual h={h} />,
    },
    migrar: {
      arte: prev ? (
        <div className="esc-her-migra">
          <Portada src={cuatriInfo(prev, anio).img} className="esc-her-migra-de" />
          <ArrowRight size={22} />
          <Portada src={cuatriInfo(actual, anio).img} className="esc-her-migra-a" />
        </div>
      ) : null,
      titulo: 'Migración',
      texto: prev
        ? `Pasa canciones de ${cuatriInfo(prev, anio).nombre} a ${nombreActual} sin tocar su fecha ni su nota.`
        : 'Es el primer cuatrimestre del año: no hay uno anterior del cual migrar.',
      boton: 'Ver candidatas',
      sinBoton: !prev,
      cuerpo: <Migracion h={h} escaneado={escaneado.migrar} />,
      pie: h.migData?.candidates?.length > 0 && (
        <button type="button" className="esc-primario" disabled={!!h.actionLoading || !h.migSelectedIds.size}
          onClick={() => aplicarYCerrar(h.migMover)}>
          {ocupado('migrate') ? 'Moviendo…' : `Mover ${h.migSelectedIds.size ? `${h.migSelectedIds.size} ` : ''}a ${cuatriInfo(h.migData.to_cuatri, anio).nombre}`}
        </button>
      ),
    },
  };

  const tarjeta = (key, delay) => {
    const t = herramientas[key];
    return (
      <section key={key} ref={(el) => { tarjetas.current[key] = el; }}
        className={`esc-her-card${abierta?.key === key ? ' oculta' : ''}`} style={{ animationDelay: `${delay}ms` }}>
        <Cabeza arte={t.arte} titulo={t.titulo} texto={t.texto} />
        {!t.sinBoton && (
          <button type="button" className="esc-fantasma esc-her-boton" onClick={() => abrir(key)}>{t.boton}</button>
        )}
      </section>
    );
  };

  const abiertaT = abierta ? herramientas[abierta.key] : null;

  return (
    <div className={`esc-her${abierta ? ' con-ventana' : ''}`}>
      <header className="esc-esc-cab">
        <div>
          <div className="esc-rotulo">Lo que mueve tu biblioteca por detrás</div>
          <h1 className="esc-esc-titulo">Herramientas</h1>
        </div>
      </header>

      <div className="esc-rotulo esc-her-seccion">Colas · ponerte al día con tus Me Gusta</div>
      <div className="esc-her-fila3">
        <section className="esc-her-card" style={{ animationDelay: '50ms' }}>
          <Cabeza arte={<Pila imgs={sinNota} />} titulo="Califica lo que sí escuchas"
            texto="Tus Me Gusta que nunca pasaron por RateApp, ordenados por lo que de verdad pones. Aquí calificar solo cataloga." />
          <button type="button" className="esc-fantasma esc-her-boton" onClick={() => navigate('/backfill')}>Abrir la cola</button>
        </section>
        <section className="esc-her-card" style={{ animationDelay: '120ms' }}>
          <Cabeza arte={<Pila imgs={viejas} gris />} titulo="Limpiar Me Gusta"
            texto="De menos a más escuchadas. Tú pones el corte; nada se quita sin que lo marques." />
          <button type="button" className="esc-fantasma esc-her-boton" onClick={() => navigate('/abandoned')}>Ordenar por escuchas</button>
        </section>
        {tarjeta('aplus', 190)}
      </div>

      <div className="esc-rotulo esc-her-seccion">Playlists · orden y mantenimiento</div>
      <div className="esc-her-fila4">
        {tarjeta('reordenar', 260)}
        {tarjeta('virtual', 330)}
        {tarjeta('migrar', 400)}
        <section className="esc-her-card" style={{ animationDelay: '470ms' }}>
          <Cabeza titulo="Orden de playlists"
            texto="Vuelve a acomodar por nota y novedad. Reconstruir rehace la playlist desde la base." />
          <div className="esc-her-ordenes">
            {SLOTS.map((c) => (
              <button key={c} type="button" className="esc-fantasma esc-fantasma-chico" disabled={!!h.actionLoading} onClick={() => h.ordenar(c)}>
                {ocupado(`order-${c}`) ? 'Ordenando…' : `Ordenar ${cuatriInfo(c, anio).nombre.replace(`${anio} `, '')}`}
              </button>
            ))}
            <button type="button" className="esc-fantasma esc-fantasma-chico" disabled={!!h.actionLoading} onClick={h.ordenarAnual}>
              {ocupado('order-anual') ? 'Ordenando…' : 'Ordenar Galería'}
            </button>
          </div>
          <button type="button" className="esc-primario esc-her-reconstruir" disabled={!!h.actionLoading} onClick={h.reconstruirAnual}>
            {ocupado('rebuild-anual') ? 'Reconstruyendo…' : 'Reconstruir Galería Anual'}
          </button>
          <div className="esc-her-reconstruir-otras">
            <span>Reconstruir</span>
            {SLOTS.map((c) => (
              <button key={c} type="button" disabled={!!h.actionLoading} onClick={() => h.reconstruir(c)}>
                {ocupado(`rebuild-${c}`) ? '…' : cuatriInfo(c, anio).nombre.replace(`${anio} `, '')}
              </button>
            ))}
          </div>
        </section>
      </div>

      {abiertaT && (
        <Ventana origen={abierta.origen} dameOrigen={dameOrigen} chica={!!abiertaT.chica} cerrando={cerrando} onCerrada={cerrada} onCerrar={cerrar}>
          <Cabeza arte={abiertaT.arte} titulo={abiertaT.titulo} texto={abiertaT.texto} extra={(
            <div className="esc-her-cabeza-der">
              {abiertaT.estado && <span className="esc-rotulo">{abiertaT.estado}</span>}
              <button type="button" className="esc-icono" onClick={cerrar} aria-label="Cerrar"><X size={16} /></button>
            </div>
          )} />
          <div className="esc-her-cuerpo">{abiertaT.cuerpo}</div>
          {abiertaT.pie && <div className="esc-her-pie">{abiertaT.pie}</div>}
        </Ventana>
      )}
    </div>
  );
}
