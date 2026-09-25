import { useState } from 'react';
import { useLimpieza, ORDENES, LOTE, TOPE } from '../../hooks/useLimpieza';
import QueuePlaylistLink from '../QueuePlaylistLink';
import { usePortadaDeFondo } from '../escritorio/FondoPortada';
import { useSonando } from '../escritorio/sonando';
import Hoja from './Hoja';
import { NotaMv, HojaNota } from './Notas';
import { IcoPlay, IcoRecargar } from './Iconos';

/**
 * Limpiar Me Gusta, versión móvil (2026-09-26). La lógica es la de siempre
 * (hooks/useLimpieza.js).
 *
 *  - La casilla de la izquierda marca; tocar la canción la pone a sonar desde
 *    ahí; tocar la nota abre la hoja (catalogar: soft + primera escucha).
 *  - Con algo marcado aparece una barra abajo, "Quitar N de Me Gusta", que
 *    abre una hoja de confirmación. Es la única acción destructiva de la app:
 *    nunca sale de un solo toque.
 */

const miles = (n) => Number(n || 0).toLocaleString('es-MX');

export default function LimpiezaMovil() {
  const h = useLimpieza();
  const { sonando } = useSonando();
  const [visibles, setVisibles] = useState(60);
  const [eligiendo, setEligiendo] = useState(null);
  const [confirmando, setConfirmando] = useState(false);

  const idSonando = sonando?.is_playing ? sonando.track?.id : null;
  const mostradas = h.lista.slice(0, visibles);
  const abierta = eligiendo ? (h.data?.tracks || []).find((t) => t.track_id === eligiendo) || null : null;
  const todasVisibles = mostradas.length > 0 && mostradas.every((t) => h.sel.has(t.track_id));

  usePortadaDeFondo(h.lista[0]?.image || null);

  const reiniciar = (fn) => (v) => { fn(v); setVisibles(60); };
  const elegir = async (r) => { if (abierta && !h.busy && await h.calificar(abierta, r)) setEligiendo(null); };
  const confirmar = async () => { if (await h.quitar()) setConfirmando(false); };

  let cuerpo;
  if (h.loading) {
    cuerpo = (
      <>
        <p className="mv-her-p">Cruzando tus Me Gusta con 8 años de historial… la primera vez tarda.</p>
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="mv-fila mv-fila-hueco" style={{ animationDelay: `${i * 60}ms` }} />)}
      </>
    );
  } else if (h.error) {
    cuerpo = (
      <div className="mv-vacio">
        <p>{h.error}</p>
        <button type="button" className="mv-vidrio chico" onClick={() => h.cargar(true)}>Reintentar</button>
      </div>
    );
  } else if (!h.lista.length) {
    cuerpo = <p className="mv-vacio">Nada con estos filtros.</p>;
  } else {
    cuerpo = (
      <>
        {mostradas.map((t, i) => {
          const marcada = h.sel.has(t.track_id);
          return (
            <div key={t.track_id} className={`mv-fila mv-fila-limpia${marcada ? ' marcada' : ''}${t.track_id === idSonando ? ' suena' : ''}`}
                 style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
              <button type="button" className="mv-casilla-btn" onClick={() => h.alternar(t.track_id)}
                      aria-pressed={marcada} aria-label={`${marcada ? 'Desmarcar' : 'Marcar'} ${t.name}`}>
                <span className={`mv-casilla${marcada ? ' on' : ''}`} aria-hidden="true">{marcada ? '✓' : ''}</span>
              </button>
              <button type="button" className="mv-fila-play" disabled={h.armando} onClick={() => h.escuchar(i)}
                      aria-label={`Escuchar desde ${t.name}`}>
                {t.image ? <img src={t.image} alt="" loading="lazy" /> : <span className="mv-sin" />}
                <span className="mv-fila-tx">
                  <span className="mv-fila-n">{t.name}</span>
                  <span className="mv-fila-a">{t.artist}</span>
                </span>
                <span className={`mv-plays${!t.sin_datos && t.plays <= 5 ? ' poco' : ''}`}>
                  {t.sin_datos ? '?' : t.plays}
                  <small>{t.sin_datos ? 'sin dato' : t.meses_sin_oir == null ? '—' : t.meses_sin_oir === 0 ? 'este mes' : `${t.meses_sin_oir} m sin oír`}</small>
                </span>
              </button>
              <button type="button" className="mv-fila-nota" onClick={() => setEligiendo(t.track_id)}
                      aria-label={t.rating ? `Cambiar la nota de ${t.name} (${t.rating})` : `Calificar ${t.name}`}>
                <NotaMv rating={t.rating} />
              </button>
            </div>
          );
        })}
        {h.lista.length > visibles && (
          <div className="mv-bib-mas">
            <button type="button" className="mv-vidrio chico" onClick={() => setVisibles((v) => v + 60)}>
              Ver 60 más · quedan {miles(h.lista.length - visibles)}
            </button>
          </div>
        )}
      </>
    );
  }

  const n = Math.min(h.sel.size, TOPE);

  return (
    <div className={`mv-pag${h.sel.size ? ' con-barra' : ''}`}>
      <header className="mv-cab">
        <div>
          <div className="mv-eyebrow">{h.data ? `${miles(h.lista.length)} de ${miles(h.data.total)} Me Gusta` : 'Me Gusta'}</div>
          <h1 className="mv-tit">Limpiar</h1>
        </div>
        <button type="button" className="mv-ic" onClick={() => h.cargar(true)} disabled={h.loading} aria-label="Recargar de Spotify">
          <IcoRecargar />
        </button>
      </header>

      <div className="mv-seg" role="group" aria-label="Orden">
        {ORDENES.map((o) => (
          <button key={o.key} type="button" className={h.orden === o.key ? 'on' : ''} aria-pressed={h.orden === o.key}
                  onClick={() => reiniciar(h.setOrden)(o.key)}>{o.label.replace(' escuchadas', '')}</button>
        ))}
      </div>

      <input className="mv-buscar" type="search" value={h.q} onChange={(e) => reiniciar(h.setQ)(e.target.value)}
             placeholder="Buscar canción o artista" aria-label="Buscar canción o artista" />

      <div className="mv-limpia-filtros">
        <label className="mv-tope">
          Hasta
          <input type="number" inputMode="numeric" min="0" value={h.maxPlays} placeholder="∞"
                 onChange={(e) => reiniciar(h.setMaxPlays)(e.target.value)} aria-label="Máximo de escuchas" />
          escuchas
        </label>
        <button type="button" className={`mv-chip${h.soloSinCalificar ? ' on' : ''}`} aria-pressed={h.soloSinCalificar}
                onClick={() => reiniciar(h.setSoloSinCalificar)(!h.soloSinCalificar)}>Sin nota</button>
      </div>

      <p className="mv-her-p">
        La mediana de tus Me Gusta son 20 escuchas: 5 ya es casi nunca. Calificar aquí solo cataloga.
        {h.sinDatos > 0 && ` ${h.sinDatos} salen con ? (sin historial, no sin escuchas) y van al final.`}
      </p>

      {h.lista.length > 0 && !h.loading && (
        <div className="mv-lista-cab">
          <button type="button" className="mv-pill mv-pill-btn" onClick={() => h.alternarVarias(mostradas.map((t) => t.track_id))}>
            {todasVisibles ? 'Desmarcar' : 'Marcar'} visibles
          </button>
          <button type="button" className="mv-pill mv-pill-btn" disabled={h.armando} onClick={() => h.escuchar(0)}>
            <IcoPlay /> {h.armando ? 'Armando…' : `Escuchar ${Math.min(LOTE, h.lista.length)}`}
          </button>
        </div>
      )}
      <QueuePlaylistLink info={h.linkCola} onClose={h.cerrarLinkCola} />

      {cuerpo}

      {h.sel.size > 0 && (
        <div className="mv-barra-quitar">
          <button type="button" className="mv-pill mv-pill-btn" onClick={h.limpiarSeleccion}>Cancelar</button>
          <button type="button" className="mv-boton pri" onClick={() => setConfirmando(true)}>
            Quitar {h.sel.size} de Me Gusta
          </button>
        </div>
      )}

      <HojaNota abierta={!!abierta} onCerrar={() => setEligiendo(null)} track={abierta}
        actual={abierta?.rating || null} onNota={elegir} ocupado={!!h.busy}
        aviso="Solo se cataloga, con tu primera escucha real. No toca ninguna playlist." />

      <Hoja abierta={confirmando} onCerrar={() => !h.quitando && setConfirmando(false)} etiqueta="Confirmar">
        <div className="mv-confirma">
          <b>¿Quitar {n} {n === 1 ? 'canción' : 'canciones'} de tus Me Gusta?</b>
          <p>
            Se quita el ♥ en Spotify. Se puede volver a dar, pero pierdes la fecha original.
            No se escribe ninguna nota.{h.sel.size > TOPE && ` Se procesan las primeras ${TOPE}.`}
          </p>
          <div className="mv-her-acc">
            <button type="button" className="mv-boton" disabled={h.quitando} onClick={() => setConfirmando(false)}>Cancelar</button>
            <button type="button" className="mv-boton pri" disabled={h.quitando} onClick={confirmar}>
              {h.quitando ? 'Quitando…' : 'Sí, quitarlas'}
            </button>
          </div>
        </div>
      </Hoja>
    </div>
  );
}
