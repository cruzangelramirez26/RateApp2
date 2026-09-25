import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, MoreHorizontal, LayoutGrid, List, Search, X } from 'lucide-react';
import { api } from '../../utils/api';
import { preloadCache } from '../../utils/preloadCache';
import { RATINGS_ORDEN } from '../../utils/ratings';
import { cuatriActual, cuatriInfo, anioActual, SLOTS } from '../../utils/cuatrimestres';
import { portadaMedia } from '../../utils/portadas';
import { useBiblioteca, ordenar, idDe, getCuatriLabel } from '../../hooks/useBiblioteca';
import { useToast } from '../../hooks/useToast';
import ListeningModal from '../ListeningModal';
import { useSonando } from './sonando';
import Calificador, { useTeclasNota } from './Calificador';

/**
 * Biblioteca, versión de escritorio (fase 4 del rediseño, 2026-09-25). Sale de
 * la pantalla "Biblioteca" del lienzo Design; la lógica es la de siempre, en
 * hooks/useBiblioteca.js.
 *
 * Lo que decidió Angel al pasarla a React:
 *  - Una fila de tarjetas (Me Gusta, <3333>, los cuatrimestres del año,
 *    Galería, Mis Me Gusta). Picar una muestra esa lista abajo. "Me Gusta" va
 *    primero, como tarjeta, para regresar.
 *  - Cuadrícula de portadas, con un botón para cambiar a lista (álbum y
 *    cuatrimestre), como Calificar.
 *  - Se conserva el filtro de texto; el CSV se queda en la vista de siempre.
 *  - La nota abre las 7 (1-7 y Esc), como en Escuchas. ⋯ lleva "Mis escuchas"
 *    y "Abrir en Spotify".
 *
 * Calificar en Me Gusta es SOFT (solo DB); en una playlist, flujo completo.
 * El ▶ reproduce dentro de la playlist, o dentro de tus Me Gusta.
 */

const RANGO = { perla: 'ene – abr', miel: 'may – ago', latte: 'sep – dic' };

const ORDENES = [
  { key: 'recent', label: 'Recientes' },
  { key: 'rating', label: 'Calificación' },
  { key: 'spotify', label: 'Orden de Spotify' },
];

const norm = (s) => (s || '').toLowerCase().trim();

function detalle(err) {
  const msg = String(err?.message || err || '').replace(/^\d+:\s*/, '');
  try { return JSON.parse(msg).detail || msg; } catch { return msg; }
}

function Mosaico({ imgs }) {
  const cuatro = [...imgs, ...imgs, ...imgs, ...imgs].slice(0, 4);
  if (!cuatro.length) return <span className="esc-sin-portada esc-bib-card-img" />;
  return (
    <span className="esc-bib-mosaico">
      {cuatro.map((src, i) => <img key={i} src={portadaMedia(src)} alt="" />)}
    </span>
  );
}

function Eq() {
  return <span className="esc-eq" aria-label="Sonando"><span /><span /><span /></span>;
}

export default function BibliotecaEscritorio() {
  const toast = useToast();
  const { sonando, refrescar } = useSonando();
  const {
    lista, isLikedView, tracks, loading, loadingMore, hasMoreLiked,
    loadMoreLiked, seleccionar, calificar,
  } = useBiblioteca();

  const [dist, setDist] = useState(null);
  const [muestras, setMuestras] = useState({});      // key -> canciones, para las tarjetas
  const [orden, setOrden] = useState('spotify');
  const [nota, setNota] = useState('todas');          // 'todas' | 'sin' | una nota
  const [filtro, setFiltro] = useState('');
  const [vista, setVista] = useState('cuadricula');   // 'cuadricula' | 'lista'
  const [eligiendo, setEligiendo] = useState(null);   // id con las notas abiertas
  const [menu, setMenu] = useState(null);             // id con el ⋯ abierto
  const [escuchas, setEscuchas] = useState(null);     // canción del modal "Mis escuchas"
  const [ocupado, setOcupado] = useState(null);
  const menuRef = useRef(null);

  // Las tarjetas: portadas y conteos de cada lista. App.jsx ya precarga casi
  // todas; Mis Me Gusta es la única que se pide aquí la primera vez.
  useEffect(() => {
    let vivo = true;
    const poner = (k, ts) => { if (vivo && Array.isArray(ts)) setMuestras((m) => ({ ...m, [k]: ts })); };
    preloadCache.load('likedAll', () => api.getLikedAll(500, 0)).then((ts) => poner('liked', ts)).catch(() => {});
    preloadCache.load('distribution', api.getDistribution).then((d) => {
      if (!vivo || !d) return;
      setDist(d);
      ['calificar', ...SLOTS, 'anual', 'mis_me_gusta'].forEach((k) => {
        if (d[k]) preloadCache.load(`playlist_${k}`, () => api.getPlaylistTracks(d[k])).then((ts) => poner(k, ts)).catch(() => {});
      });
    }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  // Una nota puesta aquí se ve también en la muestra de la tarjeta (el "N por
  // calificar" de <3333>).
  useEffect(() => {
    if (lista && tracks.length) setMuestras((m) => ({ ...m, [lista]: tracks }));
  }, [lista, tracks]);

  useEffect(() => { setEligiendo(null); setMenu(null); setFiltro(''); setNota('todas'); }, [lista]);

  useEffect(() => {
    if (!menu) return undefined;
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(null); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menu]);

  const tarjetas = useMemo(() => {
    const imgs = (k, soloSin = false) => (muestras[k] || [])
      .filter((t) => !soloSin || !t.rating).map((t) => t.image).filter(Boolean)
      // Sin repetir: varias canciones seguidas del mismo álbum darían cuatro
      // veces la misma portada (le pasaba a Mis Me Gusta).
      .filter((src, i, a) => a.indexOf(src) === i).slice(0, 4);
    const actual = cuatriActual();
    const anio = anioActual();
    const hasta = Math.max(0, SLOTS.indexOf(actual));
    const cuatris = SLOTS.slice(0, hasta + 1).reverse().map((k) => {
      const info = cuatriInfo(k, anio);
      const n = muestras[k]?.length;
      return {
        key: k, nombre: info.nombre, img: info.img,
        meta: `${RANGO[k]}${n != null ? ` · ${n}` : ''}`,
        tag: k === actual ? 'en curso' : null,
      };
    });
    const sinNota = (muestras.calificar || []).filter((t) => !t.rating).length;
    const liked = muestras.liked;
    return [
      { key: 'liked', nombre: 'Me Gusta', mosaico: imgs('liked'),
        meta: liked ? `${liked.length}${liked.length >= 500 ? '+' : ''} canciones` : 'Tus likes de Spotify' },
      { key: 'calificar', nombre: '<3333>', mosaico: imgs('calificar', sinNota > 0).length ? imgs('calificar', sinNota > 0) : imgs('calificar'),
        meta: 'Tu bandeja de entrada', tag: sinNota ? `${sinNota} por calificar` : null },
      ...cuatris,
      { key: 'anual', nombre: 'Galería Anual', mosaico: imgs('anual'), meta: `Lo mejor de ${anio}` },
      { key: 'mis_me_gusta', nombre: 'Mis Me Gusta', mosaico: imgs('mis_me_gusta'), meta: 'B+ en adelante' },
    ].filter((c) => c.key === 'liked' || !dist || dist[c.key]);
  }, [muestras, dist]);

  const activa = tarjetas.find((c) => c.key === lista);

  const visibles = useMemo(() => {
    let xs = tracks;
    if (nota === 'sin') xs = xs.filter((t) => !t.rating);
    else if (nota !== 'todas') xs = xs.filter((t) => t.rating === nota);
    const q = norm(filtro);
    if (q) xs = xs.filter((t) => norm(`${t.name} ${t.artist} ${t.album || ''}`).includes(q));
    return ordenar(xs, orden);
  }, [tracks, nota, filtro, orden]);

  const abierta = eligiendo ? visibles.find((t) => idDe(t) === eligiendo) || null : null;

  async function elegir(t, r) {
    if (ocupado) return;
    setOcupado(idDe(t));
    const ok = await calificar(t, r);
    setOcupado(null);
    if (ok) setEligiendo(null);
  }
  useTeclasNota(abierta, () => setEligiendo(null), elegir);

  async function reproducir(t) {
    try {
      if (isLikedView || !lista || !dist?.[lista]) await api.playTrack(idDe(t));
      else await api.playInContext(idDe(t), dist[lista]);
      setTimeout(refrescar, 700);
      setTimeout(refrescar, 2200);
    } catch (e) {
      toast(detalle(e) || 'No se pudo reproducir', 'error');
    }
  }

  const pista = sonando?.is_playing ? sonando.track : null;
  const suena = (t) => !!pista && (pista.id === idDe(t)
    || (norm(pista.name) === norm(t.name) && norm((pista.artist || '').split(', ')[0]) === norm(t.artist)));

  const subtitulo = {
    recent: 'lo calificado más reciente primero',
    rating: 'de A+ a D',
    spotify: isLikedView ? 'lo más reciente primero' : 'en el orden de la playlist',
  }[orden];

  const menuDe = (t) => menu === idDe(t) && (
    <div className="esc-bib-menu" ref={menuRef} role="menu">
      <button type="button" role="menuitem" onClick={() => { setEscuchas({ ...t, track_id: idDe(t) }); setMenu(null); }}>
        Mis escuchas
      </button>
      <a role="menuitem" href={`https://open.spotify.com/track/${idDe(t)}`} target="_blank" rel="noopener noreferrer"
        onClick={() => setMenu(null)}>
        Abrir en Spotify
      </a>
    </div>
  );

  const calificadorDe = (t, abierto) => (
    <Calificador t={t} abierto={abierto}
      ocupado={ocupado === idDe(t)}
      onAbrir={() => { setMenu(null); setEligiendo(idDe(t)); }}
      onElegir={(r) => elegir(t, r)} />
  );

  let cuerpo;
  if (loading) {
    cuerpo = (
      <div className="esc-bib-cuadricula">
        {Array.from({ length: 14 }, (_, i) => <div key={i} className="esc-bib-hueco" style={{ animationDelay: `${i * 60}ms` }} />)}
      </div>
    );
  } else if (!visibles.length) {
    cuerpo = (
      <div className="esc-bib-vacio">
        {tracks.length ? 'Nada coincide con el filtro.' : 'Esta lista está vacía.'}
      </div>
    );
  } else if (vista === 'cuadricula') {
    cuerpo = (
      <div className="esc-bib-cuadricula">
        {visibles.map((t, i) => {
          const id = idDe(t);
          const abierto = eligiendo === id;
          return (
            <div key={id} className={`esc-bib-tile${abierto || menu === id ? ' activa' : ''}`}
              style={{ animationDelay: `${Math.min(i, 20) * 30}ms` }}>
              <div className="esc-bib-tile-portada">
                {t.image
                  ? <img src={portadaMedia(t.image)} alt="" loading="lazy" decoding="async" />
                  : <span className="esc-sin-portada" />}
                {suena(t) && <span className="esc-bib-sonando"><Eq /></span>}
                <button type="button" className="esc-bib-play" onClick={() => reproducir(t)}
                  aria-label={`Reproducir ${t.name}`}><Play size={13} fill="currentColor" /></button>
                <button type="button" className="esc-bib-mas" onClick={() => { setEligiendo(null); setMenu(menu === id ? null : id); }}
                  aria-label={`Más opciones de ${t.name}`} aria-expanded={menu === id}><MoreHorizontal size={15} /></button>
                {menuDe(t)}
                {abierto && <div className="esc-bib-sobre">{calificadorDe(t, true)}</div>}
              </div>
              <div className="esc-bib-tile-pie">
                <div className="esc-bib-tile-texto">
                  <div className="esc-bib-nombre">{t.name || '(sin nombre)'}</div>
                  <div className="esc-bib-artista">{t.artist}</div>
                </div>
                {!abierto && calificadorDe(t, false)}
              </div>
            </div>
          );
        })}
      </div>
    );
  } else {
    cuerpo = (
      <ol className="esc-bib-filas">
        {visibles.map((t, i) => {
          const id = idDe(t);
          const abierto = eligiendo === id;
          return (
            <li key={id} className={`esc-bib-fila${abierto ? ' eligiendo' : ''}${suena(t) ? ' suena' : ''}`}>
              <button type="button" className="esc-bib-fila-play" onClick={() => reproducir(t)} title="Reproducir">
                <span className="esc-esc-rank">
                  {suena(t) ? <Eq /> : <span className="esc-esc-rank-num">{i + 1}</span>}
                  <Play size={13} fill="currentColor" className="esc-esc-rank-play" />
                </span>
                {t.image
                  ? <img src={portadaMedia(t.image)} alt="" loading="lazy" className="esc-bib-fila-img" />
                  : <span className="esc-bib-fila-img esc-sin-portada" />}
                <span className="esc-bib-fila-texto">
                  <span className="esc-bib-nombre">{t.name || '(sin nombre)'}</span>
                  <span className="esc-bib-artista">{t.artist}</span>
                </span>
              </button>
              <span className="esc-bib-fila-album">{t.album}</span>
              {/* Solo en Me Gusta: las playlists no traen la fecha ni el override, y
                  dentro de una de cuatrimestre la columna sobra. */}
              {isLikedView && <span className="esc-bib-fila-cuatri">{getCuatriLabel(t) || '—'}</span>}
              <div className="esc-bib-fila-nota">{calificadorDe(t, abierto)}</div>
              <div className="esc-bib-fila-mas">
                <button type="button" className="esc-icono" onClick={() => { setEligiendo(null); setMenu(menu === id ? null : id); }}
                  aria-label={`Más opciones de ${t.name}`} aria-expanded={menu === id}><MoreHorizontal size={15} /></button>
                {menuDe(t)}
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <div className="esc-bib">
      <header className="esc-esc-cab">
        <div>
          <div className="esc-rotulo">Tu música, ordenada</div>
          <h1 className="esc-esc-titulo">Biblioteca</h1>
        </div>
        <div className="esc-segmento" role="group" aria-label="Ordenar">
          {ORDENES.map((o) => (
            <button key={o.key} type="button" aria-pressed={orden === o.key}
              className={orden === o.key ? 'activo' : ''} onClick={() => setOrden(o.key)}>{o.label}</button>
          ))}
        </div>
      </header>

      <div className="esc-bib-tarjetas" role="group" aria-label="Listas">
        {tarjetas.map((c, i) => (
          <button key={c.key} type="button" aria-pressed={lista === c.key}
            className={`esc-bib-card${lista === c.key ? ' activa' : ''}`}
            style={{ animationDelay: `${i * 70}ms` }} onClick={() => seleccionar(c.key)}>
            <span className="esc-bib-card-portada">
              {c.mosaico
                ? <Mosaico imgs={c.mosaico} />
                : (c.img ? <img className="esc-bib-card-img" src={c.img} alt="" /> : <span className="esc-sin-portada esc-bib-card-img" />)}
              {c.tag && <span className="esc-bib-tag"><span />{c.tag}</span>}
            </span>
            <span className="esc-bib-card-nombre">{c.nombre}</span>
            <span className="esc-bib-card-meta">{c.meta}</span>
          </button>
        ))}
      </div>

      <div className="esc-bib-barra">
        <div className="esc-bib-titulo">
          <h2>{activa?.nombre || 'Búsqueda'}</h2>
          <span>{loading ? '…' : `${visibles.length}${visibles.length !== tracks.length ? ` de ${tracks.length}` : ''} · ${subtitulo}`}</span>
        </div>
        <div className="esc-bib-controles">
          <div className="esc-bib-chips" role="group" aria-label="Filtrar por nota">
            {['todas', 'sin', ...RATINGS_ORDEN].map((k) => (
              <button key={k} type="button" aria-pressed={nota === k}
                className={nota === k ? 'activo' : ''} onClick={() => setNota(k)}>
                {k === 'todas' ? 'Todas' : k === 'sin' ? 'Sin calificar' : k}
              </button>
            ))}
          </div>
          <label className="esc-bib-filtro">
            <Search size={13} />
            <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar" aria-label="Filtrar por nombre, artista o álbum" />
            {filtro && <button type="button" onClick={() => setFiltro('')} aria-label="Borrar filtro"><X size={12} /></button>}
          </label>
          <div className="esc-bib-vistas" role="group" aria-label="Vista">
            <button type="button" className={`esc-icono${vista === 'cuadricula' ? ' activo' : ''}`} aria-pressed={vista === 'cuadricula'}
              onClick={() => setVista('cuadricula')} title="Cuadrícula"><LayoutGrid size={15} /></button>
            <button type="button" className={`esc-icono${vista === 'lista' ? ' activo' : ''}`} aria-pressed={vista === 'lista'}
              onClick={() => setVista('lista')} title="Lista"><List size={15} /></button>
          </div>
        </div>
      </div>

      {cuerpo}

      {!loading && isLikedView && hasMoreLiked && (
        <div className="esc-bib-mas-cargar">
          <button type="button" className="esc-fantasma" onClick={loadMoreLiked} disabled={loadingMore}>
            {loadingMore ? 'Cargando…' : 'Cargar 500 más'}
          </button>
        </div>
      )}

      {escuchas && <ListeningModal track={escuchas} onClose={() => setEscuchas(null)} />}
    </div>
  );
}
