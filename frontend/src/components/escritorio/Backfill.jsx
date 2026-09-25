import { useState } from 'react';
import { Play, RefreshCw, ArrowUp, X } from 'lucide-react';
import { portadaMedia } from '../../utils/portadas';
import { useBackfill, LOTE } from '../../hooks/useBackfill';
import QueuePlaylistLink from '../QueuePlaylistLink';
import { useSonando } from './sonando';
import { usePortadaDeFondo } from './FondoPortada';
import Calificador, { useTeclasNota } from './Calificador';

/**
 * Catalogar (la cola de /backfill), versión de escritorio (2026-09-26). La
 * lógica es la de siempre (hooks/useBackfill.js); el aspecto, el de Recientes.
 *
 *  - Clic en la fila: arma la playlist de la cola desde ahí y la reproduce.
 *  - "Calificar" abre las 7 (1-7 y Esc) y CATALOGA: soft + primera escucha.
 *  - "↑ Rotación" ofrece A+ / A / B+ con el flujo completo, como canción nueva.
 *  - Lo que suena, si es de la cola, sale arriba con su nota: calificarlo desde
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

export default function BackfillEscritorio() {
  const {
    data, loading, error, cargar, lista, soloActivas, setSoloActivas,
    busy, hechas, catalogar, subir, armando, escuchar, linkCola, cerrarLinkCola,
  } = useBackfill();
  const { sonando } = useSonando();
  const [visibles, setVisibles] = useState(60);
  const [eligiendo, setEligiendo] = useState(null);   // track_id con las 7 abiertas
  const [rotacion, setRotacion] = useState(null);     // track_id con A+/A/B+ abiertas

  const tracks = data?.tracks || [];
  const idSonando = sonando?.track?.id || null;
  const enCola = idSonando ? tracks.find((x) => x.track_id === idSonando) : null;

  usePortadaDeFondo(enCola ? (sonando.track.image || enCola.image) : lista[0]?.image || null);

  const abierta = eligiendo ? tracks.find((t) => t.track_id === eligiendo) || null : null;
  async function elegir(t, r) {
    if (busy) return;
    if (await catalogar(t, r)) setEligiendo(null);
  }
  useTeclasNota(abierta, () => setEligiendo(null), elegir);

  const cambiar = (v) => { setSoloActivas(v); setVisibles(60); setEligiendo(null); setRotacion(null); };

  const fila = (t, i, destacada = false) => {
    const id = t.track_id;
    const abierto = eligiendo === id;
    const enRotacion = rotacion === id;
    return (
      <li key={id} className={`esc-rec-fila esc-cola-fila${abierto || enRotacion ? ' eligiendo' : ''}${id === idSonando ? ' suena' : ''}${busy === id ? ' ocupada' : ''}`}
        style={{ animationDelay: `${Math.min(i, 18) * 28}ms` }}>
        <button type="button" className="esc-rec-play" disabled={armando || destacada}
          onClick={() => escuchar(i)} title={destacada ? undefined : `Escuchar ${LOTE} desde aquí`}>
          <span className="esc-rec-portada">
            {t.image ? <img src={portadaMedia(t.image)} alt="" loading="lazy" /> : <span className="esc-sin-portada" />}
            {!destacada && <span className="esc-rec-portada-velo"><Play size={15} fill="currentColor" /></span>}
          </span>
          <span className="esc-rec-texto">
            {destacada && <span className="esc-rotulo esc-cola-sonando">Sonando ahora</span>}
            <span className="esc-bib-nombre">{t.name}</span>
            <span className="esc-bib-artista">{t.artist}</span>
          </span>
        </button>
        <span className={`esc-cola-plays${t.activa ? '' : ' apagada'}`}>
          <b>{t.plays}</b>
          <span>desde {anio(t.first_played)} · {hace(t.last_played) || 'sin datos'}</span>
        </span>
        {enRotacion ? (
          <div className="esc-esc-teclas esc-cola-rotacion" role="group" aria-label={`A tu rotación: ${t.name}`}>
            <span className="esc-rotulo">A tu rotación</span>
            {TOP_SET.map((r) => (
              <button key={r} type="button" className="esc-mini" disabled={!!busy}
                onClick={async () => { if (await subir(t, r)) setRotacion(null); }}>{r}</button>
            ))}
            <button type="button" className="esc-icono" onClick={() => setRotacion(null)} aria-label="Cancelar"><X size={14} /></button>
          </div>
        ) : (
          <>
            {!abierto && (
              <button type="button" className="esc-fantasma esc-fantasma-chico esc-cola-subir"
                onClick={() => { setEligiendo(null); setRotacion(id); }}
                title="Calificar y traer a tu rotación de este cuatrimestre (flujo completo)">
                <ArrowUp size={13} /> Rotación
              </button>
            )}
            <div className="esc-rec-nota">
              <Calificador t={{ ...t, rating: null }} abierto={abierto} ocupado={busy === id}
                onAbrir={() => { setRotacion(null); setEligiendo(id); }} onElegir={(r) => elegir(t, r)} />
            </div>
          </>
        )}
      </li>
    );
  };

  let cuerpo;
  if (loading) {
    cuerpo = (
      <>
        <p className="esc-cola-aviso">Leyendo tus Me Gusta y cruzándolos con tu historial… la primera vez tarda, son más de 2,000 canciones.</p>
        <div className="esc-rec-huecos">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="esc-rec-hueco" style={{ animationDelay: `${i * 70}ms` }} />)}
        </div>
      </>
    );
  } else if (error) {
    cuerpo = (
      <div className="esc-bib-vacio">
        {error} <button type="button" className="esc-fantasma esc-fantasma-chico" onClick={() => cargar(true)}>Reintentar</button>
      </div>
    );
  } else if (!lista.length) {
    cuerpo = <div className="esc-bib-vacio">{soloActivas ? 'Ya calificaste todo lo que sigues escuchando.' : 'No queda nada por calificar.'}</div>;
  } else {
    cuerpo = (
      <>
        <ol className="esc-rec-filas">{lista.slice(0, visibles).map((t, i) => fila(t, i))}</ol>
        {lista.length > visibles && (
          <div className="esc-bib-mas-cargar">
            <button type="button" className="esc-fantasma" onClick={() => setVisibles((v) => v + 60)}>
              Ver 60 más · quedan {miles(lista.length - visibles)}
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
          <div className="esc-rotulo">
            {data ? `${miles(data.total_pending)} Me Gusta sin calificar · ${miles(data.activas)} los sigues oyendo${hechas ? ` · ${hechas} listas` : ''}` : 'Catalogar'}
          </div>
          <h1 className="esc-esc-titulo">Lo que sí escuchas</h1>
        </div>
        <div className="esc-rec-controles">
          {data && (
            <div className="esc-segmento" role="group" aria-label="Cuáles">
              <button type="button" className={soloActivas ? 'activo' : ''} aria-pressed={soloActivas} onClick={() => cambiar(true)}>
                Las que sí escucho
              </button>
              <button type="button" className={!soloActivas ? 'activo' : ''} aria-pressed={!soloActivas} onClick={() => cambiar(false)}>
                Todas
              </button>
            </div>
          )}
          <button type="button" className="esc-fantasma" disabled={armando || !lista.length} onClick={() => escuchar(0)}>
            <Play size={14} /> {armando ? 'Armando…' : `Escuchar ${LOTE}`}
          </button>
          <button type="button" className="esc-icono" onClick={() => cargar(true)} disabled={loading} title="Recargar de Spotify">
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      <p className="esc-cola-aviso">
        Calificar aquí <b>solo cataloga</b>: se guarda con la fecha en que descubriste la canción y no entra a
        ninguna playlist. Para oírla en tu rotación de hoy, usa <b>↑ Rotación</b>. El número grande son tus
        escuchas de 2018 a hoy.
      </p>
      <QueuePlaylistLink info={linkCola} onClose={cerrarLinkCola} />

      {enCola && <ol className="esc-rec-filas esc-cola-destacada">{fila(enCola, 0, true)}</ol>}

      <div className="esc-rec-lista">{cuerpo}</div>
    </div>
  );
}
