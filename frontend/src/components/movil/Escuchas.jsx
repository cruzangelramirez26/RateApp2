import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../utils/api';
import { preloadCache } from '../../utils/preloadCache';
import { useEscuchas } from '../../hooks/useEscuchas';
import QueuePlaylistLink from '../QueuePlaylistLink';
import { usePortadaDeFondo } from '../escritorio/FondoPortada';
import { useSonando } from '../escritorio/sonando';
import { NotaMv, HojaNota } from './Notas';
import { IcoPlay } from './Iconos';

/**
 * Escuchas, versión móvil (fase 3 del rediseño móvil, 2026-09-25). Sale de la
 * pantalla Escuchas del lienzo: la #1 grande con el "01" en serifa, el top 10
 * del periodo y los totales de siempre abajo. La lógica es la de siempre
 * (hooks/useEscuchas.js).
 *
 *  - Tocar una fila (o la portada de la #1) arma la playlist del periodo desde
 *    ahí, como en el escritorio.
 *  - Tocar la nota abre la hoja con las siete.
 *
 * LA REGLA QUE NO SE MUEVE: aquí se califica en SOFT y con la primera escucha
 * real (lo hace el hook). Esta pantalla cataloga, no distribuye.
 */

const VENTANAS = [
  { dias: 30, label: '30 días', per: 'este mes' },
  { dias: 90, label: '90 días', per: 'en 90 días' },
  { dias: 365, label: 'Un año', per: 'este año' },
  { dias: 0, label: 'Siempre', per: 'desde siempre' },
];

const pad = (n) => String(n).padStart(2, '0');
const miles = (n) => (n == null ? '—' : Number(n).toLocaleString('es-MX'));
const norm = (s) => (s || '').toLowerCase().trim();
const anio = (s) => (s ? String(s).slice(0, 4) : '—');

export default function EscuchasMovil() {
  const [dias, setDias] = useState(30);
  const {
    data, loading, error, cargar, busy, calificar,
    armando, escuchar, linkCola, cerrarLinkCola,
  } = useEscuchas(dias);
  const { sonando } = useSonando();
  const [eligiendo, setEligiendo] = useState(null);   // track_id con la hoja abierta
  const [resumen, setResumen] = useState(null);

  const items = data?.items || [];
  const top = items.slice(0, 10);
  const uno = top[0] || null;
  const ventana = VENTANAS.find((v) => v.dias === dias);

  usePortadaDeFondo(uno?.image_grande || uno?.image || null);

  // Los totales de abajo son de toda la vida (el agregado), no de la ventana.
  useEffect(() => {
    preloadCache.load('listeningSummary', api.getListeningSummary).then(setResumen).catch(() => {});
  }, []);
  useEffect(() => { setEligiendo(null); }, [dias]);

  // El aviso de "sin nota" del celular abre /window?calificar=<track_id>: se
  // abre la hoja de esa cancion en cuanto llegan los 30 dias. Busca en las
  // 100 de la ventana, no solo en el top 10 que se pinta.
  const [params, setParams] = useSearchParams();
  const pedida = params.get('calificar');
  useEffect(() => {
    if (!pedida || dias !== 30 || !items.length) return;
    if (items.some((x) => x.track_id === pedida)) setEligiendo(pedida);
    setParams({}, { replace: true });
  }, [pedida, dias, items, setParams]);

  const abierta = eligiendo ? items.find((x) => x.track_id === eligiendo) || null : null;
  async function elegir(r) {
    if (!abierta || busy) return;
    if (await calificar(abierta, r)) setEligiendo(null);
  }

  // Spotify da ids distintos a la misma canción: también por nombre y artista.
  const pista = sonando?.is_playing ? sonando.track : null;
  const suena = (t) => !!pista && (pista.id === t.track_id
    || (norm(pista.name) === norm(t.name) && norm((pista.artist || '').split(', ')[0]) === norm(t.artist)));

  let cuerpo;
  if (loading && !data) {
    cuerpo = (
      <div className="mv-heroe">
        <div className="mv-heroe-img mv-hueco" />
        <p className="mv-vacio">Juntando tus reproducciones…</p>
      </div>
    );
  } else if (error) {
    cuerpo = (
      <div className="mv-vacio">
        <p>{error}</p>
        <button type="button" className="mv-vidrio chico" onClick={() => cargar(true)}>Reintentar</button>
      </div>
    );
  } else if (!uno) {
    cuerpo = <p className="mv-vacio">No hay reproducciones guardadas en este periodo.</p>;
  } else {
    cuerpo = (
      <div className={loading ? 'mv-recargando' : ''}>
        <section className="mv-heroe" key={`${dias}-${uno.track_id}`}>
          <button type="button" className="mv-heroe-img" disabled={armando}
                  onClick={() => escuchar(items, 0)} aria-label={`Escuchar desde ${uno.name}`}>
            {(uno.image_grande || uno.image) ? <img src={uno.image_grande || uno.image} alt="" /> : <span className="mv-sin" />}
            <span className="mv-heroe-play"><IcoPlay /></span>
          </button>
          <span className="mv-heroe-uno" aria-hidden="true">01</span>
          <div className="mv-heroe-n">{uno.name || '(sin nombre)'}</div>
          <div className="mv-heroe-a">
            {suena(uno) && <span className="mv-eq"><i /><i /><i /></span>}
            <span>{uno.artist}</span>
            <button type="button" className="mv-fila-nota" onClick={() => setEligiendo(uno.track_id)}
                    aria-label={uno.rating ? `Cambiar la nota (${uno.rating})` : 'Calificar'}>
              <NotaMv rating={uno.rating} />
            </button>
          </div>
          <div className="mv-heroe-m">
            <div><b>{uno.plays}</b>escuchas {ventana.per}</div>
            <div><b>{uno.ms_total != null ? `${(uno.ms_total / 3.6e6).toFixed(1)} h` : '—'}</b>de reproducción</div>
            <div><b>{anio(uno.primera_escucha || uno.suggested_added_at)}</b>primera vez</div>
          </div>
        </section>

        <div className="mv-lista-cab">
          <span className="mv-eyebrow">Top 10</span>
          <button type="button" className="mv-pill mv-pill-btn" disabled={armando} onClick={() => escuchar(items, 0)}>
            <IcoPlay /> {armando ? 'Armando…' : `Escuchar las ${Math.min(50, items.length)}`}
          </button>
        </div>
        <QueuePlaylistLink info={linkCola} onClose={cerrarLinkCola} />

        {top.slice(1).map((t, i) => (
          <div key={t.match_key || t.track_id} className={`mv-fila${suena(t) ? ' suena' : ''}`}
               style={{ animationDelay: `${i * 30}ms` }}>
            <button type="button" className="mv-fila-play" disabled={armando}
                    onClick={() => escuchar(items, i + 1)} aria-label={`Escuchar desde ${t.name}`}>
              <span className="mv-num">{suena(t) ? <span className="mv-eq"><i /><i /><i /></span> : pad(t.rank || i + 2)}</span>
              {t.image ? <img src={t.image} alt="" loading="lazy" /> : <span className="mv-sin" />}
              <span className="mv-fila-tx">
                <span className="mv-fila-n">{t.name || '(sin nombre)'}</span>
                <span className="mv-fila-a">{t.artist}</span>
              </span>
              <span className="mv-plays">{t.plays}<small>{miles(t.plays_total)} total</small></span>
            </button>
            <button type="button" className="mv-fila-nota" onClick={() => setEligiendo(t.track_id)}
                    aria-label={t.rating ? `Cambiar la nota de ${t.name} (${t.rating})` : `Calificar ${t.name}`}>
              <NotaMv rating={t.rating} />
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mv-pag">
      <header className="mv-cab">
        <div>
          <div className="mv-eyebrow">Escuchas</div>
          <h1 className="mv-tit">Lo que más suena</h1>
        </div>
      </header>

      <div className="mv-chips" role="group" aria-label="Periodo">
        {VENTANAS.map((v) => (
          <button key={v.dias} type="button" aria-pressed={dias === v.dias}
                  className={`mv-chip${dias === v.dias ? ' on' : ''}`} onClick={() => setDias(v.dias)}>
            {v.label}
          </button>
        ))}
      </div>

      {cuerpo}

      <div className="mv-totales">
        <div><b>{miles(resumen?.plays)}</b>escuchas desde {anio(resumen?.first_played)}</div>
        <div><b>{resumen?.hours != null ? `${miles(Math.round(resumen.hours))} h` : '—'}</b>de música</div>
      </div>

      <HojaNota abierta={!!abierta} onCerrar={() => setEligiendo(null)} track={abierta}
        actual={abierta?.rating || null} onNota={elegir} ocupado={!!busy}
        aviso="Solo se cataloga, con tu primera escucha real. No toca ninguna playlist." />
    </div>
  );
}
