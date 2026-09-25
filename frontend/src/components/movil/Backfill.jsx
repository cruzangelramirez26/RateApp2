import { useState } from 'react';
import { useBackfill, LOTE } from '../../hooks/useBackfill';
import QueuePlaylistLink from '../QueuePlaylistLink';
import { usePortadaDeFondo } from '../escritorio/FondoPortada';
import { useSonando } from '../escritorio/sonando';
import { NotaMv, HojaNota, claseNota } from './Notas';
import { IcoPlay, IcoRecargar } from './Iconos';

/**
 * Catalogar (la cola de /backfill), versión móvil (2026-09-26). La lógica es
 * la de siempre (hooks/useBackfill.js).
 *
 *  - Tocar una fila la pone a sonar: arma la playlist de la cola desde ahí.
 *  - Tocar la nota abre la hoja: las 7 notas CATALOGAN (soft + primera
 *    escucha, no toca playlists); abajo, "A mi rotación" con A+ / A / B+ usa
 *    el flujo completo. El default es el seguro.
 *  - Si lo que suena es de la cola, sale arriba con sus notas: el widget de
 *    Calificar usaría el flujo completo y sin fecha.
 */

const TOP_SET = ['A+', 'A', 'B+'];
const miles = (n) => Number(n || 0).toLocaleString('es-MX');
const anio = (iso) => (iso ? String(iso).slice(0, 4) : '—');

function hace(iso) {
  if (!iso) return null;
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias < 1) return 'hoy';
  if (dias < 30) return `hace ${dias} d`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `hace ${meses} m`;
  return `hace ${Math.floor(dias / 365)} a`;
}

export default function BackfillMovil() {
  const {
    data, loading, error, cargar, lista, soloActivas, setSoloActivas,
    busy, hechas, catalogar, subir, armando, escuchar, linkCola, cerrarLinkCola,
  } = useBackfill();
  const { sonando } = useSonando();
  const [visibles, setVisibles] = useState(60);
  const [eligiendo, setEligiendo] = useState(null);   // track_id con la hoja abierta

  const tracks = data?.tracks || [];
  const idSonando = sonando?.track?.id || null;
  const enCola = idSonando ? tracks.find((x) => x.track_id === idSonando) : null;
  const abierta = eligiendo ? tracks.find((x) => x.track_id === eligiendo) || null : null;

  usePortadaDeFondo(enCola ? (sonando.track.image || enCola.image) : lista[0]?.image || null);

  const elegir = async (r) => { if (abierta && !busy && await catalogar(abierta, r)) setEligiendo(null); };
  const aRotacion = async (r) => { if (abierta && !busy && await subir(abierta, r)) setEligiendo(null); };
  const cambiar = (v) => { setSoloActivas(v); setVisibles(60); };

  let cuerpo;
  if (loading) {
    cuerpo = (
      <>
        <p className="mv-her-p">Leyendo tus Me Gusta y cruzándolos con tu historial… la primera vez tarda.</p>
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="mv-fila mv-fila-hueco" style={{ animationDelay: `${i * 60}ms` }} />)}
      </>
    );
  } else if (error) {
    cuerpo = (
      <div className="mv-vacio">
        <p>{error}</p>
        <button type="button" className="mv-vidrio chico" onClick={() => cargar(true)}>Reintentar</button>
      </div>
    );
  } else if (!lista.length) {
    cuerpo = <p className="mv-vacio">{soloActivas ? 'Ya calificaste todo lo que sigues escuchando.' : 'No queda nada por calificar.'}</p>;
  } else {
    cuerpo = (
      <>
        {lista.slice(0, visibles).map((t, i) => (
          <div key={t.track_id} className={`mv-fila${t.track_id === idSonando ? ' suena' : ''}${busy === t.track_id ? ' mv-recargando' : ''}`}
               style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
            <button type="button" className="mv-fila-play" disabled={armando} onClick={() => escuchar(i)}
                    aria-label={`Escuchar desde ${t.name}`}>
              {t.image ? <img src={t.image} alt="" loading="lazy" /> : <span className="mv-sin" />}
              <span className="mv-fila-tx">
                <span className="mv-fila-n">{t.name}</span>
                <span className="mv-fila-a">{t.artist}</span>
              </span>
              <span className={`mv-plays${t.activa ? '' : ' apagada'}`}>
                {t.plays}<small>desde {anio(t.first_played)}</small><small>{hace(t.last_played) || 'sin datos'}</small>
              </span>
            </button>
            <button type="button" className="mv-fila-nota" onClick={() => setEligiendo(t.track_id)} aria-label={`Calificar ${t.name}`}>
              <NotaMv rating={null} />
            </button>
          </div>
        ))}
        {lista.length > visibles && (
          <div className="mv-bib-mas">
            <button type="button" className="mv-vidrio chico" onClick={() => setVisibles((v) => v + 60)}>
              Ver 60 más · quedan {miles(lista.length - visibles)}
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="mv-pag">
      <header className="mv-cab">
        <div>
          <div className="mv-eyebrow">Catalogar{hechas ? ` · ${hechas} listas` : ''}</div>
          <h1 className="mv-tit">Lo que sí escuchas</h1>
        </div>
        <button type="button" className="mv-ic" onClick={() => cargar(true)} disabled={loading} aria-label="Recargar de Spotify">
          <IcoRecargar />
        </button>
      </header>

      {data && (
        <div className="mv-chips" role="group" aria-label="Cuáles">
          <button type="button" className={`mv-chip${soloActivas ? ' on' : ''}`} aria-pressed={soloActivas} onClick={() => cambiar(true)}>
            Las que sí escucho · {miles(data.activas)}
          </button>
          <button type="button" className={`mv-chip${!soloActivas ? ' on' : ''}`} aria-pressed={!soloActivas} onClick={() => cambiar(false)}>
            Todas · {miles(data.total_pending)}
          </button>
        </div>
      )}

      {enCola && (
        <button type="button" className="mv-sonando-cola" onClick={() => setEligiendo(enCola.track_id)}>
          {(sonando.track.image || enCola.image) ? <img src={sonando.track.image || enCola.image} alt="" /> : <span className="mv-sin" />}
          <span className="mv-fila-tx">
            <span className="mv-eyebrow"><span className="mv-eq"><i /><i /><i /></span> Sonando · {enCola.plays} escuchas</span>
            <span className="mv-fila-n">{enCola.name}</span>
            <span className="mv-fila-a">{enCola.artist}</span>
          </span>
          <span className="mv-sonando-ir">Calificarla</span>
        </button>
      )}

      {data && lista.length > 0 && (
        <div className="mv-lista-cab">
          <span className="mv-eyebrow">Calificar aquí solo cataloga</span>
          <button type="button" className="mv-pill mv-pill-btn" disabled={armando} onClick={() => escuchar(0)}>
            <IcoPlay /> {armando ? 'Armando…' : `Escuchar ${Math.min(LOTE, lista.length)}`}
          </button>
        </div>
      )}
      <QueuePlaylistLink info={linkCola} onClose={cerrarLinkCola} />

      {cuerpo}

      <HojaNota abierta={!!abierta} onCerrar={() => setEligiendo(null)} track={abierta} actual={null}
        onNota={elegir} ocupado={!!busy}
        aviso={abierta ? `Solo se cataloga, fechada en ${anio(abierta.suggested_added_at || abierta.first_played)}. No toca ninguna playlist.` : ''}>
        {abierta && (
          <div className="mv-rotacion">
            <div className="mv-eyebrow">O a tu rotación de hoy</div>
            <div className="mv-rotacion-bn">
              {TOP_SET.map((r) => (
                <button key={r} type="button" className={`mv-bn ${claseNota(r)}`} disabled={!!busy}
                        onClick={() => aRotacion(r)} aria-label={`A mi rotación como ${r}`}>↑ {r}</button>
              ))}
            </div>
            <div className="mv-hoja-aviso">Entra a tu cuatrimestre, a la Galería y a Mis Me Gusta.</div>
          </div>
        )}
      </HojaNota>
    </div>
  );
}
