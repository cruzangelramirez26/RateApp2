import { useEffect, useState } from 'react';
import { Play, RefreshCw } from 'lucide-react';
import { api } from '../../utils/api';
import { preloadCache } from '../../utils/preloadCache';
import { useEscuchas } from '../../hooks/useEscuchas';
import QueuePlaylistLink from '../QueuePlaylistLink';
import { usePortadaDeFondo } from './FondoPortada';
import { useSonando } from './sonando';
import Calificador, { useTeclasNota } from './Calificador';

/**
 * Escuchas, versión de escritorio (fase 3 del rediseño, 2026-09-24). Sale de
 * la pantalla "Escuchas" del lienzo Design, la favorita de Angel; la lógica es
 * la de siempre, en hooks/useEscuchas.js.
 *
 * Lo que decidió Angel al pasarla a React:
 *  - SOLO EL TOP 10, como el lienzo: la #1 en grande con el "01" en serifa y
 *    las otras nueve a la derecha. La lista de 100 con filtros se queda en la
 *    vista de siempre (móvil y ventanas angostas).
 *  - Calificar con un botón que abre las 7 notas en la misma fila; picar una
 *    nota ya puesta deja cambiarla. Con las notas abiertas, 1-7 y Esc.
 *  - Picar una fila la REPRODUCE: arma la playlist del periodo desde ahí,
 *    con las 50 siguientes de las 100 (no solo las del top 10).
 *
 * Califica SIEMPRE en soft y con la primera escucha real (ver el hook): esta
 * pantalla cataloga, no distribuye.
 */

const VENTANAS = [
  { dias: 30, label: '30 días', rotulo: 'últimos 30 días', pie: 'del mes' },
  { dias: 90, label: '90 días', rotulo: 'últimos 90 días', pie: 'de los últimos 90 días' },
  { dias: 365, label: '1 año', rotulo: 'último año', pie: 'del último año' },
  { dias: 0, label: 'Histórico', rotulo: 'histórico', pie: 'de siempre' },
];

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function fechaLarga(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime())
    ? `el ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}` : null;
}

const pad = (n) => String(n).padStart(2, '0');
const miles = (n) => (n == null ? '—' : Number(n).toLocaleString('es-MX'));
const norm = (s) => (s || '').toLowerCase().trim();

function Eq() {
  return <span className="esc-eq" aria-label="Sonando"><span /><span /><span /></span>;
}

export default function EscuchasEscritorio() {
  const [dias, setDias] = useState(30);
  const {
    data, loading, error, cargar, busy, calificar,
    armando, escuchar, linkCola, cerrarLinkCola,
  } = useEscuchas(dias);
  const { sonando } = useSonando();
  const [eligiendo, setEligiendo] = useState(null);   // track_id con las notas abiertas
  const [resumen, setResumen] = useState(null);

  const items = data?.items || [];
  const top = items.slice(0, 10);
  const uno = top[0] || null;
  const ventana = VENTANAS.find((v) => v.dias === dias);
  const maxPlays = uno?.plays || 1;

  usePortadaDeFondo(uno?.image_grande || uno?.image || null);

  // Los totales de abajo son de toda la vida (el agregado), no de la ventana.
  useEffect(() => {
    preloadCache.load('listeningSummary', api.getListeningSummary)
      .then(setResumen).catch(() => {});
  }, []);

  useEffect(() => { setEligiendo(null); }, [dias]);

  // Con las notas abiertas: 1-7 califica, Esc cierra, un clic fuera cierra.
  const abierta = eligiendo ? items.find((x) => x.track_id === eligiendo) || null : null;
  useTeclasNota(abierta, () => setEligiendo(null), (t, r) => elegir(t, r));

  async function elegir(t, r) {
    if (busy) return;
    const ok = await calificar(t, r);
    if (ok) setEligiendo(null);
  }

  // La que suena, por id o —porque Spotify da ids distintos a la misma
  // canción— por nombre y artista.
  const pista = sonando?.is_playing ? sonando.track : null;
  const suena = (t) => !!pista && (pista.id === t.track_id
    || (norm(pista.name) === norm(t.name) && norm(pista.artist) === norm(t.artist)));

  const calificadorDe = (t, grande) => (
    <Calificador t={t} grande={grande}
      abierto={eligiendo === t.track_id}
      ocupado={busy === t.track_id}
      onAbrir={() => setEligiendo(t.track_id)}
      onElegir={(r) => elegir(t, r)} />
  );

  let cuerpo;
  if (loading && !data) {
    cuerpo = (
      <div className="esc-esc-centro">
        <div className="esc-esc-uno"><div className="esc-esc-portada esc-esc-cargando" /></div>
        <div className="esc-esc-lista">
          <p className="esc-esc-aviso">Agrupando tus reproducciones de {ventana.rotulo}…</p>
        </div>
      </div>
    );
  } else if (error) {
    cuerpo = (
      <div className="esc-esc-vacio">
        <p>{error}</p>
        <button type="button" className="esc-fantasma" onClick={() => cargar(true)}>Reintentar</button>
      </div>
    );
  } else if (!uno) {
    cuerpo = (
      <div className="esc-esc-vacio">
        <p>No hay reproducciones guardadas en {ventana.dias ? 'este periodo' : 'tu historial'}.</p>
      </div>
    );
  } else {
    const desde = fechaLarga(uno.primera_escucha || uno.first_played);
    cuerpo = (
      <div className={`esc-esc-centro${loading ? ' recargando' : ''}`}>
        <section className="esc-esc-uno" key={`${dias}-${uno.track_id}`}>
          <div className="esc-esc-marco">
            <button type="button" className="esc-esc-portada" disabled={armando}
              onClick={() => escuchar(items, 0)} aria-label={`Escuchar desde ${uno.name}`}>
              {(uno.image_grande || uno.image)
                ? <img src={uno.image_grande || uno.image} alt="" />
                : <span className="esc-sin-portada" />}
              <span className="esc-esc-play"><Play size={30} fill="currentColor" /></span>
            </button>
            <span className="esc-esc-numeral" aria-hidden="true">01</span>
          </div>
          <div className="esc-esc-uno-pie">
            <div className="esc-esc-uno-texto">
              <div className="esc-esc-uno-nombre">{uno.name || '(sin nombre)'}</div>
              <div className="esc-esc-uno-artista">
                {suena(uno) && <Eq />}
                {[uno.artist, uno.album].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className="esc-esc-uno-plays">
              <div>{uno.plays}</div>
              <div className="esc-rotulo">reproducciones</div>
            </div>
          </div>
          <div className="esc-esc-uno-linea">
            <span>
              {desde ? `La escuchas desde ${desde}` : 'Sin fecha de primera escucha'}
              {uno.plays_total > uno.plays && ` · ${miles(uno.plays_total)} veces en total`}
            </span>
            {calificadorDe(uno, true)}
          </div>
        </section>

        <section className="esc-esc-lista">
          <div className="esc-esc-lista-cab">
            <span className="esc-rotulo">Top 10 · {ventana.rotulo}</span>
            <div className="esc-esc-lista-acciones">
              <button type="button" className="esc-icono" title="Recargar"
                onClick={() => cargar(true)} disabled={loading}>
                <RefreshCw size={14} className={loading ? 'esc-girando' : ''} />
              </button>
              <button type="button" className="esc-fantasma esc-fantasma-chico"
                disabled={armando} onClick={() => escuchar(items, 0)}>
                <Play size={11} fill="currentColor" />
                {armando ? 'Armando…' : `Escuchar las ${Math.min(50, items.length)}`}
              </button>
            </div>
          </div>
          <QueuePlaylistLink info={linkCola} onClose={cerrarLinkCola} />
          <ol className="esc-esc-filas">
            {top.slice(1).map((t, i) => {
              const idx = i + 1;
              return (
                <li key={t.match_key || t.track_id}
                  className={`esc-esc-fila${eligiendo === t.track_id ? ' eligiendo' : ''}${suena(t) ? ' suena' : ''}`}
                  style={{ animationDelay: `${150 + i * 60}ms` }}>
                  <button type="button" className="esc-esc-fila-play" disabled={armando}
                    onClick={() => escuchar(items, idx)} title="Escuchar desde aquí">
                    <span className="esc-esc-rank">
                      {suena(t) ? <Eq /> : <span className="esc-esc-rank-num">{pad(t.rank)}</span>}
                      <Play size={13} fill="currentColor" className="esc-esc-rank-play" />
                    </span>
                    {t.image
                      ? <img src={t.image} alt="" className="esc-esc-fila-img" />
                      : <span className="esc-esc-fila-img esc-sin-portada" />}
                    <span className="esc-esc-fila-texto">
                      <span className="esc-esc-fila-nombre">{t.name || '(sin nombre)'}</span>
                      <span className="esc-esc-fila-artista">{t.artist}</span>
                    </span>
                    <span className="esc-esc-barra" aria-hidden="true">
                      <span style={{ width: `${Math.max(3, (t.plays / maxPlays) * 100)}%`, animationDelay: `${150 + i * 60}ms` }} />
                    </span>
                    <span className="esc-esc-plays" aria-label={`${t.plays} reproducciones`}>{t.plays}</span>
                  </button>
                  <div className="esc-esc-fila-nota">{calificadorDe(t, false)}</div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    );
  }

  return (
    <div className="esc-esc">
      <header className="esc-esc-cab">
        <div>
          <div className="esc-rotulo">Escuchas reales · desde tu historial</div>
          <h1 className="esc-esc-titulo">Lo que más suena</h1>
        </div>
        <div className="esc-segmento" role="group" aria-label="Periodo">
          {VENTANAS.map((v) => (
            <button key={v.dias} type="button" aria-pressed={dias === v.dias}
              className={dias === v.dias ? 'activo' : ''} onClick={() => setDias(v.dias)}>
              {v.label}
            </button>
          ))}
        </div>
      </header>

      {cuerpo}

      <footer className="esc-esc-pie">
        <div><b>{miles(resumen?.plays)}</b><span>reproducciones</span></div>
        <div><b>{miles(resumen?.hours != null ? Math.round(resumen.hours) : null)}</b><span>horas</span></div>
        <div><b>{resumen?.first_played ? String(resumen.first_played).slice(0, 4) : '—'}</b><span>tu primera escucha registrada</span></div>
        {data && (
          <div className="esc-esc-pie-der">
            <b>{data.sin_calificar ?? 0}</b>
            <span>de tus {data.total ?? items.length} más escuchadas {ventana.pie} sin calificar</span>
          </div>
        )}
      </footer>
    </div>
  );
}
