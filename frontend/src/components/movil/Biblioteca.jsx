import { useEffect, useMemo, useState } from 'react';
import { api } from '../../utils/api';
import { preloadCache } from '../../utils/preloadCache';
import { RATINGS_ORDEN } from '../../utils/ratings';
import { cuatriActual, cuatriInfo, anioActual, SLOTS } from '../../utils/cuatrimestres';
import { portadaMedia } from '../../utils/portadas';
import { useBiblioteca, ordenar, idDe } from '../../hooks/useBiblioteca';
import { useToast } from '../../hooks/useToast';
import ListeningModal from '../ListeningModal';
import { usePortadaDeFondo } from '../escritorio/FondoPortada';
import { useSonando } from '../escritorio/sonando';
import { NotaMv, HojaNota } from './Notas';
import { IcoPlay } from './Iconos';

/**
 * Biblioteca, versión móvil (fase 4 del rediseño móvil, 2026-09-26). Sale de
 * la pantalla Biblioteca del lienzo: tus listas en fila, chips de nota y las
 * portadas en cuadrícula de 3. La lógica es la de siempre
 * (hooks/useBiblioteca.js), la misma del escritorio.
 *
 *  - Las listas son las del escritorio: Me Gusta, <3333>, los cuatrimestres
 *    del año hasta el actual, Galería y Mis Me Gusta.
 *  - Tocar una portada abre la hoja: las 7 notas, y abajo Escuchar, Mis
 *    escuchas y Abrir en Spotify.
 *  - El filtro de texto y el orden (Spotify / Recientes / Calificación) son
 *    los del escritorio; el orden va en una píldora que rota.
 *
 * LA REGLA QUE NO SE MUEVE (la aplica el hook): en Me Gusta se califica en
 * SOFT (solo la base); en cualquier playlist, con el flujo completo.
 */

const ORDENES = [
  { key: 'spotify', label: 'Orden de Spotify' },
  { key: 'recent', label: 'Recientes' },
  { key: 'rating', label: 'Calificación' },
];

const norm = (s) => (s || '').toLowerCase().trim();

function detalle(err) {
  const msg = String(err?.message || err || '').replace(/^\d+:\s*/, '');
  try { return JSON.parse(msg).detail || msg; } catch { return msg; }
}

function Arte({ imgs, img }) {
  if (imgs?.length) {
    const cuatro = imgs.length >= 4 ? imgs.slice(0, 4) : imgs.slice(0, 1);
    return (
      <span className={`mv-lista-art${cuatro.length === 1 ? ' una' : ''}`}>
        {cuatro.map((src, i) => <img key={i} src={portadaMedia(src)} alt="" />)}
      </span>
    );
  }
  return (
    <span className="mv-lista-art una">
      {img ? <img src={img} alt="" /> : <span className="mv-sin" />}
    </span>
  );
}

export default function BibliotecaMovil() {
  const toast = useToast();
  const { sonando, refrescar } = useSonando();
  const {
    lista, isLikedView, tracks, loading, loadingMore, hasMoreLiked,
    loadMoreLiked, seleccionar, calificar,
  } = useBiblioteca('liked');

  const [dist, setDist] = useState(null);
  const [muestras, setMuestras] = useState({});      // key -> canciones, para el arte de las listas
  const [orden, setOrden] = useState('spotify');
  const [nota, setNota] = useState('todas');          // 'todas' | 'sin' | una nota
  const [filtro, setFiltro] = useState('');
  const [eligiendo, setEligiendo] = useState(null);   // id con la hoja abierta
  const [escuchas, setEscuchas] = useState(null);     // canción del modal "Mis escuchas"
  const [ocupado, setOcupado] = useState(false);

  // El arte y los conteos de cada lista. App.jsx ya precarga casi todas.
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

  // Una nota puesta aquí se ve también en el conteo de la lista.
  useEffect(() => {
    if (lista && tracks.length) setMuestras((m) => ({ ...m, [lista]: tracks }));
  }, [lista, tracks]);

  useEffect(() => { setEligiendo(null); setFiltro(''); setNota('todas'); }, [lista]);

  const listas = useMemo(() => {
    const imgs = (k, soloSin = false) => (muestras[k] || [])
      .filter((t) => !soloSin || !t.rating).map((t) => t.image).filter(Boolean)
      .filter((src, i, a) => a.indexOf(src) === i).slice(0, 4);
    const actual = cuatriActual();
    const anio = anioActual();
    const hasta = Math.max(0, SLOTS.indexOf(actual));
    const cuatris = SLOTS.slice(0, hasta + 1).reverse().map((k) => {
      const n = muestras[k]?.length;
      return { key: k, nombre: cuatriInfo(k, anio).nombre, img: cuatriInfo(k, anio).img,
        meta: n != null ? `${n} canciones` : (k === actual ? 'En curso' : '') };
    });
    const sinNota = (muestras.calificar || []).filter((t) => !t.rating).length;
    const liked = muestras.liked;
    return [
      { key: 'liked', nombre: 'Me Gusta', imgs: imgs('liked'),
        meta: liked ? `${liked.length}${liked.length >= 500 ? '+' : ''} · tus ♥` : 'Tus ♥' },
      { key: 'calificar', nombre: '<3333>', imgs: sinNota ? imgs('calificar', true) : imgs('calificar'),
        meta: sinNota ? `${sinNota} por calificar` : 'Tu bandeja' },
      ...cuatris,
      { key: 'anual', nombre: 'Galería Anual', imgs: imgs('anual'), meta: `Lo mejor de ${anio}` },
      { key: 'mis_me_gusta', nombre: 'Mis Me Gusta', imgs: imgs('mis_me_gusta'), meta: 'B+ en adelante' },
    ].filter((c) => c.key === 'liked' || !dist || dist[c.key]);
  }, [muestras, dist]);

  const activa = listas.find((c) => c.key === lista);
  usePortadaDeFondo(activa?.imgs?.[0] || activa?.img || null);

  const visibles = useMemo(() => {
    let xs = tracks;
    if (nota === 'sin') xs = xs.filter((t) => !t.rating);
    else if (nota !== 'todas') xs = xs.filter((t) => t.rating === nota);
    const q = norm(filtro);
    if (q) xs = xs.filter((t) => norm(`${t.name} ${t.artist} ${t.album || ''}`).includes(q));
    return ordenar(xs, orden);
  }, [tracks, nota, filtro, orden]);

  const abierta = eligiendo ? tracks.find((t) => idDe(t) === eligiendo) || null : null;

  async function elegir(r) {
    if (!abierta || ocupado) return;
    setOcupado(true);
    const ok = await calificar(abierta, r);
    setOcupado(false);
    if (ok) setEligiendo(null);
  }

  async function reproducir(t) {
    setEligiendo(null);
    try {
      if (isLikedView || !lista || !dist?.[lista]) await api.playTrack(idDe(t));
      else await api.playInContext(idDe(t), dist[lista]);
      toast(`▶ ${t.name}`, 'success');
      setTimeout(refrescar, 700);
      setTimeout(refrescar, 2200);
    } catch (e) {
      toast(detalle(e) || 'No se pudo reproducir', 'error');
    }
  }

  const pista = sonando?.is_playing ? sonando.track : null;
  const suena = (t) => !!pista && (pista.id === idDe(t)
    || (norm(pista.name) === norm(t.name) && norm((pista.artist || '').split(', ')[0]) === norm(t.artist)));

  const ordenActual = ORDENES.find((o) => o.key === orden);
  const rotarOrden = () => setOrden(ORDENES[(ORDENES.indexOf(ordenActual) + 1) % ORDENES.length].key);

  let cuerpo;
  if (loading) {
    cuerpo = (
      <div className="mv-rejilla">
        {Array.from({ length: 12 }, (_, i) => <div key={i} className="mv-celda-hueco" style={{ animationDelay: `${i * 50}ms` }} />)}
      </div>
    );
  } else if (!visibles.length) {
    cuerpo = <p className="mv-vacio">{tracks.length ? 'Ninguna con ese filtro.' : 'Esta lista está vacía.'}</p>;
  } else {
    cuerpo = (
      <div className="mv-rejilla">
        {visibles.map((t, i) => (
          <button key={idDe(t)} type="button" className={`mv-celda${suena(t) ? ' suena' : ''}`}
                  style={{ animationDelay: `${Math.min(i, 15) * 25}ms` }}
                  onClick={() => setEligiendo(idDe(t))}
                  aria-label={`${t.name}, ${t.artist}${t.rating ? `, ${t.rating}` : ', sin calificar'}`}>
            <span className="mv-celda-c">
              {t.image ? <img src={portadaMedia(t.image)} alt="" loading="lazy" decoding="async" /> : <span className="mv-sin" />}
              {suena(t) && <span className="mv-celda-eq"><span className="mv-eq"><i /><i /><i /></span></span>}
              {t.rating && <NotaMv rating={t.rating} />}
            </span>
            <b>{t.name || '(sin nombre)'}</b>
            <span>{t.artist}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="mv-pag">
      <header className="mv-cab">
        <div>
          <div className="mv-eyebrow">Biblioteca</div>
          <h1 className="mv-tit">Tu música</h1>
        </div>
        <button type="button" className="mv-pill mv-pill-btn" onClick={rotarOrden} aria-label={`Orden: ${ordenActual.label}. Tocar para cambiar`}>
          {ordenActual.label}
        </button>
      </header>

      <div className="mv-listas" role="group" aria-label="Listas">
        {listas.map((c) => (
          <button key={c.key} type="button" aria-pressed={lista === c.key}
                  className={`mv-lista${lista === c.key ? ' on' : ''}`} onClick={() => seleccionar(c.key)}>
            <Arte imgs={c.imgs} img={c.img} />
            <b>{c.nombre}</b>
            <span>{c.meta}</span>
          </button>
        ))}
      </div>

      <input className="mv-buscar" type="search" value={filtro} onChange={(e) => setFiltro(e.target.value)}
             placeholder={`Buscar en ${activa?.nombre || 'la lista'}`} aria-label="Filtrar por nombre, artista o álbum" />

      <div className="mv-chips" role="group" aria-label="Filtrar por nota">
        {['todas', 'sin', ...RATINGS_ORDEN].map((k) => (
          <button key={k} type="button" aria-pressed={nota === k}
                  className={`mv-chip${nota === k ? ' on' : ''}`} onClick={() => setNota(k)}>
            {k === 'todas' ? 'Todas' : k === 'sin' ? 'Sin nota' : k}
          </button>
        ))}
      </div>

      {!loading && (
        <div className="mv-bib-cuenta">
          {visibles.length}{visibles.length !== tracks.length ? ` de ${tracks.length}` : ''} canciones
        </div>
      )}

      {cuerpo}

      {!loading && isLikedView && hasMoreLiked && (
        <div className="mv-bib-mas">
          <button type="button" className="mv-vidrio chico" onClick={loadMoreLiked} disabled={loadingMore}>
            {loadingMore ? 'Cargando…' : 'Cargar 500 más'}
          </button>
        </div>
      )}

      <HojaNota abierta={!!abierta} onCerrar={() => setEligiendo(null)} track={abierta}
        actual={abierta?.rating || null} onNota={elegir} ocupado={ocupado}
        aviso={isLikedView
          ? 'En Me Gusta solo se guarda la nota. No toca tus playlists.'
          : 'Se reparte a tus playlists como siempre.'}>
        {abierta && (
          <div className="mv-hoja-acc">
            <button type="button" onClick={() => reproducir(abierta)}><IcoPlay /> Escuchar</button>
            <button type="button" onClick={() => { setEscuchas({ ...abierta, track_id: idDe(abierta) }); setEligiendo(null); }}>
              Mis escuchas
            </button>
            <a href={`https://open.spotify.com/track/${idDe(abierta)}`} target="_blank" rel="noopener noreferrer"
               onClick={() => setEligiendo(null)}>Spotify</a>
          </div>
        )}
      </HojaNota>

      {escuchas && <ListeningModal track={escuchas} onClose={() => setEscuchas(null)} />}
    </div>
  );
}
