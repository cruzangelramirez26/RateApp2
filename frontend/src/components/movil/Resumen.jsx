import { useEffect, useMemo, useState } from 'react';
import { api } from '../../utils/api';
import { preloadCache } from '../../utils/preloadCache';
import { RATINGS_ORDEN } from '../../utils/ratings';
import { anioActual, cuatriActual, cuatriInfo, SLOTS } from '../../utils/cuatrimestres';
import { useToast } from '../../hooks/useToast';
import { usePortadaDeFondo } from '../escritorio/FondoPortada';
import { NotaMv, claseNota } from './Notas';

/**
 * Resumen, versión móvil (fase 4 del rediseño móvil, 2026-09-26). Sale de la
 * pantalla Resumen del lienzo: los tres cuatrimestres del año en tarjetas que
 * se deslizan y, abajo, Top set, Cómo calificas y Artistas.
 *
 * Mismas reglas que el escritorio (components/escritorio/Resumen.jsx):
 *  - Cada tarjeta lleva los dos números: calificadas en esos meses y cuántas
 *    hay en la playlist (no son lo mismo: la playlist trae las migradas).
 *  - Tocar una tarjeta pone abajo los números de ese cuatrimestre; tocarla
 *    otra vez regresa al año. Un cuatrimestre que no ha empezado no se toca.
 *  - "Siempre" (arriba) cambia los paneles a toda la historia.
 * Sin cambios de backend: todo sale de /tracks/stats.
 */

const MESES = { perla: 'ene – abr', miel: 'may – ago', latte: 'sep – dic' };
const EMPIEZA = { perla: 'enero', miel: 'mayo', latte: 'septiembre' };
const TOP_SET = ['A+', 'A', 'B+'];

const miles = (n) => Number(n || 0).toLocaleString('es-MX');
const suma = (o) => Object.values(o || {}).reduce((s, n) => s + (n || 0), 0);
const juntar = (lista) => lista.reduce((acc, o) => {
  Object.entries(o || {}).forEach(([r, n]) => { acc[r] = (acc[r] || 0) + n; });
  return acc;
}, {});

export default function ResumenMovil() {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  // 'año' | 'todo' | 'c:<slot>'
  const [periodo, setPeriodo] = useState('año');
  const [enPlaylist, setEnPlaylist] = useState({});

  const anio = anioActual();
  const actual = cuatriActual();
  const elegido = periodo.startsWith('c:') ? periodo.slice(2) : null;

  useEffect(() => {
    api.getStats().then(setStats).catch((e) => toast(e.message, 'error'));
    preloadCache.load('distribution', api.getDistribution).then((d) => {
      SLOTS.forEach((k) => {
        if (!d?.[k]) return;
        preloadCache.load(`playlist_${k}`, () => api.getPlaylistTracks(d[k]))
          .then((ts) => { if (Array.isArray(ts)) setEnPlaylist((m) => ({ ...m, [k]: ts.length })); })
          .catch(() => {});
      });
    }).catch(() => {});
  }, [toast]);

  const delAnio = (stats?.by_cuatri || []).filter((c) => c.year === anio);
  const fondo = cuatriInfo(elegido || actual || 'perla', anio);
  usePortadaDeFondo(fondo.imgGrande || fondo.img || null);

  // El cuatrimestre actual primero: es el que más se consulta.
  const orden = actual ? [actual, ...SLOTS.filter((k) => k !== actual)] : SLOTS;
  const partes = orden.map((k) => {
    const info = cuatriInfo(k, anio);
    const c = delAnio.find((x) => x.cuatri === k);
    return {
      key: k, nombre: info.nombre, img: info.imgGrande || info.img, meses: MESES[k],
      calificadas: c?.count || 0, playlist: enPlaylist[k], vivo: k === actual,
      futuro: actual ? SLOTS.indexOf(k) > SLOTS.indexOf(actual) : false,
    };
  });

  const notas = useMemo(() => {
    if (periodo === 'todo') return stats?.by_rating || {};
    if (elegido) return delAnio.find((c) => c.cuatri === elegido)?.by_rating || {};
    return juntar(delAnio.map((c) => c.by_rating));
  }, [periodo, stats, delAnio, elegido]);

  const total = suma(notas);
  const maxNota = Math.max(1, ...Object.values(notas));
  const top = TOP_SET.reduce((s, r) => s + (notas[r] || 0), 0);
  const pct = total ? Math.round((top / total) * 100) : 0;
  const nombreElegido = elegido ? cuatriInfo(elegido, anio).nombre : '';
  const nombrePeriodo = periodo === 'todo' ? 'siempre' : elegido ? nombreElegido : String(anio);
  const artistas = ((periodo === 'todo' ? stats?.top_artists
    : elegido ? (stats?.top_artists_cuatri?.[elegido] ?? stats?.top_artists_year)
      : stats?.top_artists_year) || []).slice(0, 5);

  return (
    <div className="mv-pag">
      <header className="mv-cab">
        <div>
          <div className="mv-eyebrow">Resumen</div>
          <h1 className="mv-tit">Tu {anio}, en tres partes</h1>
        </div>
      </header>

      <div className="mv-cuatris" role="group" aria-label="Cuatrimestres">
        {partes.map((p, i) => {
          const dentro = (
            <>
              {p.img ? <img src={p.img} alt="" /> : <span className="mv-sin" />}
              <span className="mv-ct-arriba">{p.meses}{p.vivo ? ' · en curso' : ''}</span>
              <span className="mv-ct-tx">
                <b>{p.nombre}</b>
                {p.futuro ? <span>Empieza en {EMPIEZA[p.key]}</span> : (
                  <>
                    <span>{stats ? miles(p.calificadas) : '…'} calificadas</span>
                    {p.playlist != null && <span>{miles(p.playlist)} en la playlist</span>}
                  </>
                )}
              </span>
            </>
          );
          const cls = `mv-ct${elegido === p.key ? ' on' : ''}${(elegido && elegido !== p.key) || p.futuro ? ' apagada' : ''}`;
          return p.futuro ? (
            <div key={p.key} className={cls} style={{ animationDelay: `${i * 70}ms` }}>{dentro}</div>
          ) : (
            <button key={p.key} type="button" className={cls} style={{ animationDelay: `${i * 70}ms` }}
                    aria-pressed={elegido === p.key}
                    onClick={(e) => {
                      e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                      setPeriodo(elegido === p.key ? 'año' : `c:${p.key}`);
                    }}>
              {dentro}
            </button>
          );
        })}
      </div>

      <div className="mv-chips" role="group" aria-label="Periodo">
        <button type="button" className={`mv-chip${periodo === 'año' ? ' on' : ''}`} aria-pressed={periodo === 'año'}
                onClick={() => setPeriodo('año')}>{anio}</button>
        {elegido && (
          <button type="button" className="mv-chip on" aria-pressed="true" onClick={() => setPeriodo('año')}>
            {nombreElegido} ✕
          </button>
        )}
        <button type="button" className={`mv-chip${periodo === 'todo' ? ' on' : ''}`} aria-pressed={periodo === 'todo'}
                onClick={() => setPeriodo('todo')}>Siempre</button>
      </div>

      <section className="mv-panel" key={`top-${periodo}`}>
        <h4><span>Top set · {nombrePeriodo}</span><span>{miles(total)} canciones</span></h4>
        <div className="mv-grande">{total ? pct : '—'}<small>{total ? '%' : ''}</small></div>
        <p className="mv-panel-p">
          {total
            ? `${miles(top)} en A+, A o B+: las que entran a tus playlists.`
            : 'Todavía no hay canciones calificadas en este periodo.'}
        </p>
      </section>

      <section className="mv-panel" key={`dist-${periodo}`}>
        <h4><span>Cómo calificas</span></h4>
        <div className="mv-dist">
          {RATINGS_ORDEN.map((r) => (
            <div key={r}>
              <NotaMv rating={r} />
              <span className="mv-dist-bar"><i className={claseNota(r)} style={{ width: `${((notas[r] || 0) / maxNota) * 100}%` }} /></span>
              <span className="mv-dist-n">{miles(notas[r] || 0)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mv-panel" key={`art-${periodo}`}>
        <h4><span>Artistas de {nombrePeriodo}</span><span>canciones</span></h4>
        <ol className="mv-artistas">
          {artistas.map((a, i) => (
            <li key={a.artist}><span className="mv-num">{i + 1}</span><b>{a.artist}</b><span>{a.count}</span></li>
          ))}
          {!artistas.length && <li className="mv-vacio">{stats ? 'Sin datos todavía.' : '…'}</li>}
        </ol>
      </section>
    </div>
  );
}
