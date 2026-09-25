import { useMemo, useState } from 'react';
import { Play, Search, X } from 'lucide-react';
import { api } from '../../utils/api';
import { portadaMedia } from '../../utils/portadas';
import { useRecientes, idDe, TABS } from '../../hooks/useRecientes';
import { useToast } from '../../hooks/useToast';
import { useSonando } from './sonando';
import { usePortadaDeFondo } from './FondoPortada';
import Calificador, { useTeclasNota } from './Calificador';

/**
 * Recientes, versión de escritorio (fase 6 del rediseño, 2026-09-25). No
 * tenía pantalla en el lienzo; lo que eligió Angel:
 *  - Una columna con el segmento Escuchadas | Calificadas, como la de
 *    siempre, con tarjetas horizontales (portada, nombre, artista, nota).
 *  - Agrupada por día. En Escuchadas cada fila lleva su hora; en Calificadas,
 *    el día es el de la PRIMERA nota (así ordena la base: re-calificar no
 *    sube una canción).
 *  - La nota abre las 7 (1-7 y Esc). Aquí se califica con el FLUJO COMPLETO,
 *    como en la pantalla de siempre. Clic en la fila la reproduce.
 */

const norm = (s) => (s || '').toLowerCase().trim();

// La base guarda UTC sin zona; Spotify manda la "Z". Las dos se leen como UTC.
function fecha(s) {
  if (!s) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function nombreDia(d) {
  const hoy = new Date();
  const dia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((dia(hoy) - dia(d)) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  const txt = d.toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long',
    ...(d.getFullYear() !== hoy.getFullYear() ? { year: 'numeric' } : {}),
  });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

const hora = (d) => d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });

function detalle(err) {
  const msg = String(err?.message || err || '').replace(/^\d+:\s*/, '');
  try { return JSON.parse(msg).detail || msg; } catch { return msg; }
}

function Eq() {
  return <span className="esc-eq" aria-label="Sonando"><span /><span /><span /></span>;
}

export default function RecientesEscritorio() {
  const toast = useToast();
  const { sonando, refrescar } = useSonando();
  const { tab, setTab, tracks, loading, ocupado, calificar } = useRecientes();
  const [filtro, setFiltro] = useState('');
  const [eligiendo, setEligiendo] = useState(null);

  const escuchadas = tab === 'played';

  const visibles = useMemo(() => {
    const q = norm(filtro);
    return q ? tracks.filter((t) => norm(`${t.name} ${t.artist} ${t.album || ''}`).includes(q)) : tracks;
  }, [tracks, filtro]);

  const grupos = useMemo(() => {
    const out = [];
    visibles.forEach((t) => {
      const d = fecha(escuchadas ? t.played_at : t.added_at);
      const dia = d ? nombreDia(d) : 'Sin fecha';
      if (!out.length || out[out.length - 1].dia !== dia) out.push({ dia, filas: [] });
      out[out.length - 1].filas.push({ t, d });
    });
    return out;
  }, [visibles, escuchadas]);

  const sinNota = escuchadas ? tracks.filter((t) => !t.rating).length : 0;

  usePortadaDeFondo(tracks[0]?.image || null);

  const abierta = eligiendo ? visibles.find((t) => idDe(t) === eligiendo) || null : null;
  async function elegir(t, r) {
    if (ocupado) return;
    if (await calificar(t, r)) setEligiendo(null);
  }
  useTeclasNota(abierta, () => setEligiendo(null), elegir);

  async function reproducir(t) {
    try {
      await api.playTrack(idDe(t));
      setTimeout(refrescar, 700);
      setTimeout(refrescar, 2200);
    } catch (e) {
      toast(detalle(e) || 'No se pudo reproducir', 'error');
    }
  }

  const pista = sonando?.is_playing ? sonando.track : null;
  const suena = (t) => !!pista && (pista.id === idDe(t)
    || (norm(pista.name) === norm(t.name) && norm((pista.artist || '').split(', ')[0]) === norm(t.artist)));

  const cambiar = (id) => { setTab(id); setFiltro(''); setEligiendo(null); };

  let cuerpo;
  if (loading) {
    cuerpo = (
      <div className="esc-rec-huecos">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="esc-rec-hueco" style={{ animationDelay: `${i * 70}ms` }} />)}
      </div>
    );
  } else if (!visibles.length) {
    cuerpo = <div className="esc-bib-vacio">{tracks.length ? 'Nada coincide con el filtro.' : 'No hay canciones.'}</div>;
  } else {
    let n = 0;
    cuerpo = grupos.map((g) => (
      <section key={g.dia} className="esc-rec-dia">
        <h2 className="esc-rotulo">{g.dia}<span>{g.filas.length}</span></h2>
        <ol className="esc-rec-filas">
          {g.filas.map(({ t, d }) => {
            const id = idDe(t);
            const abierto = eligiendo === id;
            const i = n++;
            return (
              <li key={id} className={`esc-rec-fila${abierto ? ' eligiendo' : ''}${suena(t) ? ' suena' : ''}${!t.rating ? ' sin-nota' : ''}`}
                style={{ animationDelay: `${Math.min(i, 18) * 28}ms` }}>
                <button type="button" className="esc-rec-play" onClick={() => reproducir(t)} title="Reproducir">
                  <span className="esc-rec-portada">
                    {t.image
                      ? <img src={portadaMedia(t.image)} alt="" loading="lazy" />
                      : <span className="esc-sin-portada" />}
                    <span className="esc-rec-portada-velo">{suena(t) ? <Eq /> : <Play size={15} fill="currentColor" />}</span>
                  </span>
                  <span className="esc-rec-texto">
                    <span className="esc-bib-nombre">{t.name || '(sin nombre)'}</span>
                    <span className="esc-bib-artista">{t.artist}</span>
                  </span>
                </button>
                <span className="esc-rec-album">{t.album}</span>
                {escuchadas && d && <span className="esc-rec-hora">{hora(d)}</span>}
                <div className="esc-rec-nota">
                  <Calificador t={t} abierto={abierto} ocupado={ocupado === id}
                    onAbrir={() => setEligiendo(id)} onElegir={(r) => elegir(t, r)} />
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    ));
  }

  return (
    <div className="esc-rec">
      <header className="esc-esc-cab">
        <div>
          <div className="esc-rotulo">
            {escuchadas
              ? `Lo último que sonó${!loading && sinNota ? ` · ${sinNota} sin nota` : ''}`
              : 'Lo último que calificaste'}
          </div>
          <h1 className="esc-esc-titulo">Recientes</h1>
        </div>
        <div className="esc-rec-controles">
          <label className="esc-bib-filtro">
            <Search size={13} />
            <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar" aria-label="Filtrar por nombre, artista o álbum" />
            {filtro && <button type="button" onClick={() => setFiltro('')} aria-label="Borrar filtro"><X size={12} /></button>}
          </label>
          <div className="esc-segmento" role="group" aria-label="Lista">
            {TABS.map((t) => (
              <button key={t.id} type="button" aria-pressed={tab === t.id}
                className={tab === t.id ? 'activo' : ''} onClick={() => cambiar(t.id)}>{t.label}</button>
            ))}
          </div>
        </div>
      </header>
      <div key={tab} className="esc-rec-lista">{cuerpo}</div>
    </div>
  );
}
