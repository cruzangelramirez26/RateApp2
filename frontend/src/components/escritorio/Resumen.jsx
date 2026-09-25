import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { preloadCache } from '../../utils/preloadCache';
import { RATINGS_ORDEN } from '../../utils/ratings';
import { anioActual, cuatriActual, cuatriInfo, SLOTS } from '../../utils/cuatrimestres';
import { useToast } from '../../hooks/useToast';
import { usePortadaDeFondo } from './FondoPortada';

/**
 * Resumen, versión de escritorio (fase 5 del rediseño, 2026-09-25). Sale de
 * la pantalla "Resumen" del lienzo Design. Todo viene de /tracks/stats, más
 * el largo de cada playlist, que App.jsx ya precarga.
 *
 * Lo que decidió Angel al pasarla a React:
 *  - Cada tarjeta lleva LOS DOS números: calificadas en esos meses y cuántas
 *    hay en la playlist. No son lo mismo (PT.-2: 138 calificadas, 303 en la
 *    playlist): la segunda incluye las migradas, las D quedan fuera de la
 *    primera. La barra de notas mide las calificadas.
 *  - Las tres tarjetas son siempre del año; el selector Cuatrimestre / Año /
 *    Todo cambia solo los paneles de abajo.
 *  - Sin la proporción A+ por A (lo de 6b se mide aparte, en enero).
 *  - Picar una tarjeta abre ese cuatrimestre en Biblioteca.
 */

const PERIODOS = [
  { key: 'cuatrimestre', label: 'Cuatrimestre' },
  { key: 'año', label: 'Año' },
  { key: 'todo', label: 'Todo' },
];
const MESES = { perla: 'ENE — ABR', miel: 'MAY — AGO', latte: 'SEP — DIC' };
const EMPIEZA = { perla: 'enero', miel: 'mayo', latte: 'septiembre' };
// Escala de crema: el escritorio no usa colores por nota (decisión de Angel).
const TONO = {
  'A+': '#f3efe7', A: 'rgba(243,239,231,.8)', 'B+': 'rgba(243,239,231,.64)', B: 'rgba(243,239,231,.5)',
  'C+': 'rgba(243,239,231,.38)', C: 'rgba(243,239,231,.28)', D: 'rgba(243,239,231,.18)',
};
const TOP_SET = ['A+', 'A', 'B+'];

const miles = (n) => Number(n || 0).toLocaleString('es-MX');
const suma = (o) => Object.values(o || {}).reduce((s, n) => s + (n || 0), 0);

function juntar(lista) {
  return lista.reduce((acc, o) => {
    Object.entries(o || {}).forEach(([r, n]) => { acc[r] = (acc[r] || 0) + n; });
    return acc;
  }, {});
}

export default function ResumenEscritorio() {
  const toast = useToast();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [periodo, setPeriodo] = useState('año');
  const [enPlaylist, setEnPlaylist] = useState({});   // slot -> canciones en la playlist

  const anio = anioActual();
  const actual = cuatriActual();

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

  usePortadaDeFondo(actual ? cuatriInfo(actual, anio).img : null);

  const byCuatri = stats?.by_cuatri || [];
  const delAnio = byCuatri.filter((c) => c.year === anio);

  const partes = SLOTS.map((k, i) => {
    const info = cuatriInfo(k, anio);
    const c = delAnio.find((x) => x.cuatri === k);
    const notas = c?.by_rating || {};
    const total = suma(notas);
    return {
      key: k,
      nombre: info.nombre,
      img: info.img,
      meses: MESES[k],
      calificadas: c?.count || 0,
      playlist: enPlaylist[k],
      aplus: notas['A+'] || 0,
      futuro: actual ? SLOTS.indexOf(k) > SLOTS.indexOf(actual) : false,
      vivo: k === actual,
      segs: RATINGS_ORDEN.filter((r) => notas[r]).map((r) => ({ r, w: `${((notas[r] / total) * 100).toFixed(2)}%` })),
      delay: `${i * 90}ms`,
    };
  });

  // Los paneles de abajo: el periodo elegido.
  const notas = useMemo(() => {
    if (periodo === 'todo') return stats?.by_rating || {};
    if (periodo === 'cuatrimestre') return delAnio.find((c) => c.cuatri === actual)?.by_rating || {};
    return juntar(delAnio.map((c) => c.by_rating));
  }, [periodo, stats, delAnio, actual]);

  const total = suma(notas);
  const maxNota = Math.max(1, ...Object.values(notas));
  const top = TOP_SET.reduce((s, r) => s + (notas[r] || 0), 0);
  const pct = total ? Math.round((top / total) * 100) : 0;
  const artistas = ((periodo === 'todo' ? stats?.top_artists : stats?.top_artists_year) || []).slice(0, 5);
  const dePeriodo = {
    cuatrimestre: `de ${cuatriInfo(actual, anio).nombre}`,
    año: `de ${anio}`,
    todo: 'de siempre',
  }[periodo];

  return (
    <div className="esc-res">
      <header className="esc-esc-cab">
        <div>
          <div className="esc-rotulo">Resumen</div>
          <h1 className="esc-esc-titulo">Tu {anio}, en tres partes</h1>
        </div>
        <div className="esc-segmento" role="group" aria-label="Periodo de los paneles">
          {PERIODOS.map((p) => (
            <button key={p.key} type="button" aria-pressed={periodo === p.key}
              className={periodo === p.key ? 'activo' : ''} onClick={() => setPeriodo(p.key)}>{p.label}</button>
          ))}
        </div>
      </header>

      <div className="esc-res-partes">
        {partes.map((p) => {
          const cuerpo = (
            <>
              {p.img ? <img className="esc-res-img" src={p.img} alt="" /> : <span className="esc-res-img esc-sin-portada" />}
              <span className="esc-res-velo" />
              <span className="esc-res-arriba">
                <span className="esc-res-meses">{p.meses}</span>
                {p.vivo && <span className="esc-bib-tag esc-res-vivo"><span />en curso</span>}
              </span>
              <span className="esc-res-abajo">
                <span className="esc-res-nombre">{p.nombre}</span>
                {p.futuro ? (
                  <span className="esc-res-datos"><span>Empieza en {EMPIEZA[p.key]}</span></span>
                ) : (
                  <>
                    <span className="esc-res-datos">
                      <span>
                        {stats ? `${miles(p.calificadas)} calificadas` : '…'}
                        {p.playlist != null && ` · ${miles(p.playlist)} en la playlist`}
                      </span>
                      <span>{p.aplus} A+</span>
                    </span>
                    <span className="esc-res-mezcla" aria-label="Mezcla de notas">
                      {p.segs.map((s) => (
                        <span key={s.r} title={s.r} style={{ width: s.w, background: TONO[s.r], animationDelay: p.delay }} />
                      ))}
                    </span>
                  </>
                )}
              </span>
            </>
          );
          return p.futuro ? (
            <div key={p.key} className="esc-res-parte futuro" style={{ animationDelay: p.delay }}>{cuerpo}</div>
          ) : (
            <button key={p.key} type="button" className="esc-res-parte" style={{ animationDelay: p.delay }}
              onClick={() => navigate('/library', { state: { lista: p.key } })}
              aria-label={`Abrir ${p.nombre} en Biblioteca`}>
              {cuerpo}
            </button>
          );
        })}
      </div>

      <div className="esc-res-paneles">
        <section className="esc-res-panel" style={{ animationDelay: '300ms' }}>
          <div className="esc-res-panel-cab">
            <h2>Cómo calificas</h2>
            <span className="esc-rotulo">{miles(total)} canciones</span>
          </div>
          <div className="esc-res-dist">
            {RATINGS_ORDEN.map((r, i) => (
              <div key={r} className="esc-res-dist-fila">
                <span className="esc-res-dist-nota">{r}</span>
                <span className="esc-res-dist-barra">
                  <span style={{ width: `${((notas[r] || 0) / maxNota) * 100}%`, background: TONO[r], animationDelay: `${350 + i * 60}ms` }} />
                </span>
                <span className="esc-res-dist-n">{miles(notas[r] || 0)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="esc-res-panel" style={{ animationDelay: '380ms' }}>
          <div className="esc-res-panel-cab"><h2>Top set</h2></div>
          <div className="esc-res-top">
            <div className="esc-res-pct">{total ? `${pct}%` : '—'}</div>
            <p>
              {total
                ? <>{miles(top)} de tus {miles(total)} canciones {dePeriodo} son B+ o más: las que viven en tus playlists, en la Galería Anual y en tus Me Gusta.</>
                : 'Todavía no hay canciones calificadas en este periodo.'}
            </p>
          </div>
        </section>

        <section className="esc-res-panel" style={{ animationDelay: '460ms' }}>
          <div className="esc-res-panel-cab">
            <h2>{periodo === 'todo' ? 'Artistas de siempre' : 'Artistas del año'}</h2>
            <span className="esc-rotulo esc-res-opcional">Canciones calificadas</span>
          </div>
          <ol className="esc-res-artistas">
            {artistas.map((a, i) => (
              <li key={a.artist}>
                <span className="esc-res-art-pos">{i + 1}</span>
                <span className="esc-res-art-ini" aria-hidden="true">{(a.artist || '?').charAt(0)}</span>
                <span className="esc-res-art-nombre">{a.artist}</span>
                <span className="esc-res-art-n">{a.count}</span>
              </li>
            ))}
            {!artistas.length && <li className="esc-res-art-vacio">{stats ? 'Sin datos todavía.' : '…'}</li>}
          </ol>
        </section>
      </div>
    </div>
  );
}
