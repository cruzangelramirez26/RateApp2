import { useState } from 'react';
import { Play, RefreshCw, Search, X, Check, HeartOff, AlertTriangle } from 'lucide-react';
import { portadaMedia } from '../../utils/portadas';
import { useLimpieza, ORDENES, LOTE, TOPE } from '../../hooks/useLimpieza';
import QueuePlaylistLink from '../QueuePlaylistLink';
import { useSonando } from './sonando';
import { usePortadaDeFondo } from './FondoPortada';
import Calificador, { useTeclasNota } from './Calificador';

/**
 * Limpiar Me Gusta, versión de escritorio (2026-09-26). La lógica es la de
 * siempre (hooks/useLimpieza.js); el aspecto, el de Recientes.
 *
 *  - La casilla marca; clic en la canción la pone a sonar desde ahí; la nota
 *    abre las 7 y cataloga (soft + primera escucha).
 *  - Quitar el like SIEMPRE pasa por una barra de confirmación, con el número
 *    y el tope de 200. Es la única acción destructiva de la app.
 */

const miles = (n) => Number(n || 0).toLocaleString('es-MX');

export default function LimpiezaEscritorio() {
  const h = useLimpieza();
  const { sonando } = useSonando();
  const [visibles, setVisibles] = useState(60);
  const [eligiendo, setEligiendo] = useState(null);
  const [confirmando, setConfirmando] = useState(false);

  const idSonando = sonando?.is_playing ? sonando.track?.id : null;
  const mostradas = h.lista.slice(0, visibles);
  const todasVisibles = mostradas.length > 0 && mostradas.every((t) => h.sel.has(t.track_id));
  const abierta = eligiendo ? (h.data?.tracks || []).find((t) => t.track_id === eligiendo) || null : null;

  usePortadaDeFondo(h.lista[0]?.image || null);

  async function elegir(t, r) {
    if (h.busy) return;
    if (await h.calificar(t, r)) setEligiendo(null);
  }
  useTeclasNota(abierta, () => setEligiendo(null), elegir);

  const reiniciar = (fn) => (v) => { fn(v); setVisibles(60); setConfirmando(false); };
  const n = Math.min(h.sel.size, TOPE);

  let cuerpo;
  if (h.loading) {
    cuerpo = (
      <>
        <p className="esc-cola-aviso">Cruzando tus Me Gusta con 8 años de historial… la primera vez tarda, después queda en memoria.</p>
        <div className="esc-rec-huecos">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="esc-rec-hueco" style={{ animationDelay: `${i * 70}ms` }} />)}
        </div>
      </>
    );
  } else if (h.error) {
    cuerpo = (
      <div className="esc-bib-vacio">
        {h.error} <button type="button" className="esc-fantasma esc-fantasma-chico" onClick={() => h.cargar(true)}>Reintentar</button>
      </div>
    );
  } else if (!h.lista.length) {
    cuerpo = <div className="esc-bib-vacio">Nada con estos filtros.</div>;
  } else {
    cuerpo = (
      <>
        <ol className="esc-rec-filas">
          {mostradas.map((t, i) => {
            const id = t.track_id;
            const marcada = h.sel.has(id);
            const abierto = eligiendo === id;
            return (
              <li key={id} className={`esc-rec-fila esc-cola-fila${marcada ? ' marcada' : ''}${abierto ? ' eligiendo' : ''}${id === idSonando ? ' suena' : ''}`}
                style={{ animationDelay: `${Math.min(i, 18) * 28}ms` }}>
                <button type="button" className="esc-cola-casilla" onClick={() => { h.alternar(id); setConfirmando(false); }}
                  aria-pressed={marcada} aria-label={`${marcada ? 'Desmarcar' : 'Marcar'} ${t.name}`}>
                  <span className={`esc-her-casilla${marcada ? ' marcada' : ''}`} aria-hidden="true">{marcada && <Check size={11} strokeWidth={3} />}</span>
                </button>
                <span className="esc-cola-num">{i + 1}</span>
                <button type="button" className="esc-rec-play" disabled={h.armando} onClick={() => h.escuchar(i)} title={`Escuchar ${LOTE} desde aquí`}>
                  <span className="esc-rec-portada">
                    {t.image ? <img src={portadaMedia(t.image)} alt="" loading="lazy" /> : <span className="esc-sin-portada" />}
                    <span className="esc-rec-portada-velo"><Play size={15} fill="currentColor" /></span>
                  </span>
                  <span className="esc-rec-texto">
                    <span className="esc-bib-nombre">{t.name}</span>
                    <span className="esc-bib-artista">{t.artist}</span>
                  </span>
                </button>
                <span className={`esc-cola-plays${!t.sin_datos && t.plays <= 5 ? ' poco' : ''}`}>
                  <b>{t.sin_datos ? '?' : t.plays}</b>
                  <span>{t.sin_datos ? 'sin dato' : t.meses_sin_oir == null ? '—' : t.meses_sin_oir === 0 ? 'la oyes este mes' : `${t.meses_sin_oir} ${t.meses_sin_oir === 1 ? 'mes' : 'meses'} sin oírla`}</span>
                </span>
                <div className="esc-rec-nota">
                  <Calificador t={t} abierto={abierto} ocupado={h.busy === id}
                    onAbrir={() => setEligiendo(id)} onElegir={(r) => elegir(t, r)} />
                </div>
              </li>
            );
          })}
        </ol>
        {h.lista.length > visibles && (
          <div className="esc-bib-mas-cargar">
            <button type="button" className="esc-fantasma" onClick={() => setVisibles((v) => v + 60)}>
              Ver 60 más · quedan {miles(h.lista.length - visibles)}
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="esc-rec esc-cola">
      <header className="esc-esc-cab">
        <div>
          <div className="esc-rotulo">{h.data ? `${miles(h.lista.length)} de ${miles(h.data.total)} Me Gusta` : 'Tus Me Gusta'}</div>
          <h1 className="esc-esc-titulo">Limpiar Me Gusta</h1>
        </div>
        <div className="esc-rec-controles">
          <div className="esc-segmento" role="group" aria-label="Orden">
            {ORDENES.map((o) => (
              <button key={o.key} type="button" className={h.orden === o.key ? 'activo' : ''} aria-pressed={h.orden === o.key}
                onClick={() => reiniciar(h.setOrden)(o.key)}>{o.label}</button>
            ))}
          </div>
          <button type="button" className="esc-fantasma" disabled={h.armando || !h.lista.length} onClick={() => h.escuchar(0)}>
            <Play size={14} /> {h.armando ? 'Armando…' : `Escuchar ${LOTE}`}
          </button>
          <button type="button" className="esc-icono" onClick={() => h.cargar(true)} disabled={h.loading} title="Recargar de Spotify">
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      <div className="esc-cola-filtros">
        <label className="esc-bib-filtro">
          <Search size={13} />
          <input value={h.q} onChange={(e) => reiniciar(h.setQ)(e.target.value)} placeholder="Buscar canción o artista" aria-label="Buscar canción o artista" />
          {h.q && <button type="button" onClick={() => reiniciar(h.setQ)('')} aria-label="Borrar"><X size={12} /></button>}
        </label>
        <label className="esc-cola-tope">
          hasta
          <input type="number" min="0" value={h.maxPlays} placeholder="∞" onChange={(e) => reiniciar(h.setMaxPlays)(e.target.value)} aria-label="Máximo de escuchas" />
          escuchas
        </label>
        <div className="esc-bib-chips">
          <button type="button" className={h.soloSinCalificar ? 'activo' : ''} aria-pressed={h.soloSinCalificar}
            onClick={() => reiniciar(h.setSoloSinCalificar)(!h.soloSinCalificar)}>Sin calificar</button>
        </div>
        {h.lista.length > 0 && (
          <button type="button" className="esc-fantasma esc-fantasma-chico" onClick={() => { h.alternarVarias(mostradas.map((t) => t.track_id)); setConfirmando(false); }}>
            {todasVisibles ? 'Desmarcar' : 'Marcar'} visibles
          </button>
        )}
      </div>

      <p className="esc-cola-aviso">
        La mediana de tus Me Gusta son <b>20 escuchas</b>, así que 5 ya es casi nunca. Calificar aquí <b>solo cataloga</b>.
        {h.sinDatos > 0 && <> <b>{h.sinDatos}</b> salen con <b>?</b>: no tengo su historial, no que no las hayas escuchado. Van al final.</>}
      </p>
      <QueuePlaylistLink info={h.linkCola} onClose={h.cerrarLinkCola} />

      {h.sel.size > 0 && (
        <div className={`esc-cola-quitar${confirmando ? ' confirmando' : ''}`}>
          {confirmando ? (
            <>
              <AlertTriangle size={16} />
              <span>
                Vas a quitar <b>{n}</b> {n === 1 ? 'canción' : 'canciones'} de tus Me Gusta en Spotify. Se puede volver a dar like,
                pero pierdes la fecha original. No se escribe ninguna nota.{h.sel.size > TOPE && ` Se procesan las primeras ${TOPE}.`}
              </span>
              <button type="button" className="esc-fantasma esc-fantasma-chico" disabled={h.quitando} onClick={() => setConfirmando(false)}>Cancelar</button>
              <button type="button" className="esc-primario" disabled={h.quitando}
                onClick={async () => { if (await h.quitar()) setConfirmando(false); }}>
                {h.quitando ? 'Quitando…' : 'Sí, quitarlas'}
              </button>
            </>
          ) : (
            <>
              <span>{h.sel.size} marcada{h.sel.size === 1 ? '' : 's'}</span>
              <button type="button" className="esc-fantasma esc-fantasma-chico" onClick={h.limpiarSeleccion}>Desmarcar todo</button>
              <button type="button" className="esc-primario" onClick={() => setConfirmando(true)}>
                <HeartOff size={14} /> Quitar {h.sel.size} de Me Gusta
              </button>
            </>
          )}
        </div>
      )}

      <div className="esc-rec-lista">{cuerpo}</div>
    </div>
  );
}
