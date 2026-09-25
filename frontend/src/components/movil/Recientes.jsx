import { useMemo, useState } from 'react';
import { api } from '../../utils/api';
import { portadaMedia } from '../../utils/portadas';
import { useRecientes, idDe, TABS } from '../../hooks/useRecientes';
import { useToast } from '../../hooks/useToast';
import { usePortadaDeFondo } from '../escritorio/FondoPortada';
import { useSonando } from '../escritorio/sonando';
import { NotaMv, HojaNota } from './Notas';
import { IcoBuscar } from './Iconos';

/**
 * Recientes, versión móvil (fase 3 del rediseño móvil, 2026-09-25). Sale de
 * la pantalla Recientes del lienzo; la lógica es la de siempre
 * (hooks/useRecientes.js), la misma que usa el escritorio.
 *
 *  - Escuchadas | Calificadas, agrupadas por día. En Escuchadas cada fila
 *    lleva su hora; en Calificadas el día es el de la PRIMERA nota (así ordena
 *    la base).
 *  - Tocar la fila la reproduce; tocar la nota abre la hoja con las siete.
 *  - Califica con el FLUJO COMPLETO, como siempre en esta pantalla.
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

export default function RecientesMovil() {
  const toast = useToast();
  const { sonando, refrescar } = useSonando();
  const { tab, setTab, tracks, loading, ocupado, calificar } = useRecientes();
  const [buscando, setBuscando] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [eligiendo, setEligiendo] = useState(null);   // id con la hoja abierta

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

  usePortadaDeFondo(tracks[0]?.image || null);

  const sinNota = escuchadas ? tracks.filter((t) => !t.rating).length : 0;
  const abierta = eligiendo ? tracks.find((t) => idDe(t) === eligiendo) || null : null;

  async function elegir(r) {
    if (!abierta || ocupado) return;
    if (await calificar(abierta, r)) setEligiendo(null);
  }

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

  const cambiar = (id) => { setTab(id); setEligiendo(null); };

  let cuerpo;
  if (loading) {
    cuerpo = Array.from({ length: 7 }, (_, i) => (
      <div key={i} className="mv-fila mv-fila-hueco" style={{ animationDelay: `${i * 60}ms` }} />
    ));
  } else if (!visibles.length) {
    cuerpo = <p className="mv-vacio">{tracks.length ? 'Nada coincide con la búsqueda.' : 'No hay canciones.'}</p>;
  } else {
    let n = 0;
    cuerpo = grupos.map((g) => (
      <section key={g.dia}>
        <h2 className="mv-dia"><span>{g.dia}</span><span>{g.filas.length}</span></h2>
        {g.filas.map(({ t, d }) => {
          const id = idDe(t);
          const i = n++;
          return (
            <div key={`${id}-${i}`} className={`mv-fila${suena(t) ? ' suena' : ''}`}
                 style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
              <button type="button" className="mv-fila-play" onClick={() => reproducir(t)}
                      aria-label={`Reproducir ${t.name}`}>
                {t.image ? <img src={portadaMedia(t.image)} alt="" loading="lazy" /> : <span className="mv-sin" />}
                <span className="mv-fila-tx">
                  <span className="mv-fila-n">{t.name || '(sin nombre)'}</span>
                  <span className="mv-fila-a">
                    {suena(t) && <span className="mv-eq"><i /><i /><i /></span>}
                    {t.artist}
                  </span>
                </span>
                {escuchadas && d && <span className="mv-fila-h">{hora(d)}</span>}
              </button>
              <button type="button" className="mv-fila-nota" onClick={() => setEligiendo(id)}
                      aria-label={t.rating ? `Cambiar la nota de ${t.name} (${t.rating})` : `Calificar ${t.name}`}>
                <NotaMv rating={t.rating} />
              </button>
            </div>
          );
        })}
      </section>
    ));
  }

  return (
    <div className="mv-pag">
      <header className="mv-cab">
        <div>
          <div className="mv-eyebrow">
            {escuchadas
              ? `Recientes${!loading && sinNota ? ` · ${sinNota} sin nota` : ''}`
              : 'Recientes'}
          </div>
          <h1 className="mv-tit">{escuchadas ? 'Lo que sonó' : 'Lo que calificaste'}</h1>
        </div>
        <button type="button" className={`mv-ic${buscando ? ' on' : ''}`} aria-label="Buscar"
                aria-pressed={buscando}
                onClick={() => { setBuscando((b) => !b); setFiltro(''); }}>
          <IcoBuscar />
        </button>
      </header>

      {buscando && (
        <input className="mv-buscar" autoFocus value={filtro} onChange={(e) => setFiltro(e.target.value)}
               placeholder="Nombre, artista o álbum" aria-label="Buscar en Recientes" />
      )}

      <div className="mv-seg" role="group" aria-label="Lista">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-pressed={tab === t.id}
                  className={tab === t.id ? 'on' : ''} onClick={() => cambiar(t.id)}>{t.label}</button>
        ))}
      </div>

      <div key={tab}>{cuerpo}</div>

      <HojaNota abierta={!!abierta} onCerrar={() => setEligiendo(null)}
        track={abierta && { ...abierta, image: abierta.image && portadaMedia(abierta.image) }}
        actual={abierta?.rating || null} onNota={elegir} ocupado={!!ocupado}
        aviso="Se reparte a tus playlists como siempre." />
    </div>
  );
}
