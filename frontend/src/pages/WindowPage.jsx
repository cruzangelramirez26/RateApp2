import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Play, RefreshCw, Search } from 'lucide-react';
import { ratingColor, ratingDim } from '../utils/theme';
import { useEscuchas } from '../hooks/useEscuchas';
import QueuePlaylistLink from '../components/QueuePlaylistLink';

/**
 * Mis más escuchadas, por ventana de tiempo.
 *
 * ES LO QUE EL AGREGADO NO PODÍA CONTESTAR. `listening_stats` guarda totales,
 * así que una canción con 200 plays en 2021 y UNA sola vez ayer se ve igual de
 * reciente que una que suena 50 veces este mes. Esta pantalla lee
 * `listening_events` — una fila por reproducción, 118 mil — y agrupa por
 * ventana. Angel lo pidió así el 2026-09-06: "que sea de las canciones
 * favoritas de los últimos 30 días, el último año o histórico".
 *
 * LA TRAMPA DE LA FECHA, que es la razón por la que calificar aquí es seguro:
 * el `first_played` de la ventana es la primera escucha DENTRO de la ventana,
 * o sea a lo más 30 días atrás. Fechar con eso una canción de 2019 la volvería
 * "nueva" y la metería al cuatrimestre actual + Galería + Me Gusta. El backend
 * manda `suggested_added_at` con la primera escucha DE VERDAD (del agregado) y
 * es la que se usa aquí, igual que en /backfill.
 *
 * Por eso calificar es SIEMPRE soft: esta pantalla cataloga, no distribuye.
 */

const RATINGS = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D'];

const VENTANAS = [
  { dias: 30, label: '30 días' },
  { dias: 90, label: '90 días' },
  { dias: 365, label: '1 año' },
  { dias: 0, label: 'Histórico' },
];

function anio(iso) {
  return iso ? String(iso).slice(0, 4) : '—';
}

function horas(ms) {
  const h = (ms || 0) / 3600000;
  return h >= 1 ? `${h.toFixed(1)} h` : `${Math.round((ms || 0) / 60000)} min`;
}

export default function WindowPage() {
  const [dias, setDias] = useState(30);
  const [q, setQ] = useState('');
  const [soloSinCalificar, setSoloSinCalificar] = useState(false);
  const [visibles, setVisibles] = useState(50);
  // La lógica vive en el hook desde la fase 3 del rediseño: la comparte con la
  // vista de escritorio. Esta pantalla no cambió.
  const {
    data, loading, error, cargar, busy, calificar,
    armando: sonando, escuchar: escucharLista, linkCola, cerrarLinkCola,
  } = useEscuchas(dias);

  useEffect(() => { setVisibles(50); }, [dias]);

  const lista = useMemo(() => {
    let xs = data?.items || [];
    if (soloSinCalificar) xs = xs.filter(t => !t.rating);
    const term = q.trim().toLowerCase();
    if (term) {
      xs = xs.filter(t => `${t.name} ${t.artist} ${t.album || ''}`
        .toLowerCase().includes(term));
    }
    return xs;
  }, [data, soloSinCalificar, q]);

  // Se manda el tramo exacto que se está viendo (con filtros aplicados).
  const escuchar = (desde = 0) => escucharLista(lista, desde);

  const ventana = VENTANAS.find(v => v.dias === dias);

  return (
    <div className="page">
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>
            Mis más escuchadas
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
            {loading ? 'Leyendo tu historial…' : (
              data ? <>
                {lista.length.toLocaleString()} canciones
                {' · '}{ventana?.label.toLowerCase()}
                {data.sin_calificar > 0 && <>
                  {' · '}<b style={{ color: 'var(--accent)' }}>
                    {data.sin_calificar} sin calificar
                  </b>
                </>}
              </> : '—'
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => escuchar(0)}
            disabled={sonando || !lista.length}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Play size={14} /> {sonando ? 'Armando…' : 'Escuchar 50'}
          </button>
          <button className="btn" onClick={() => cargar(true)} title="Recargar">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <QueuePlaylistLink info={linkCola} onClose={cerrarLinkCola} />

      {/* La ventana. Es la pantalla entera: cambiarla cambia la pregunta. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '14px 0 10px' }}>
        {VENTANAS.map(v => (
          <button key={v.dias} className="btn" onClick={() => setDias(v.dias)}
            style={{
              padding: '6px 14px', fontSize: '0.8rem',
              background: dias === v.dias ? 'var(--accent)' : 'var(--bg-card)',
              color: dias === v.dias ? 'var(--on-accent)' : 'var(--text-muted)',
            }}>{v.label}</button>
        ))}
      </div>

      <div style={{
        display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 150 }}>
          <Search size={14} style={{
            position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', pointerEvents: 'none',
          }} />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Filtrar…"
            style={{
              width: '100%', padding: '8px 10px 8px 28px',
              borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)',
              background: 'var(--bg-card)', color: 'var(--text-primary)',
              fontSize: '0.85rem', fontFamily: 'var(--font-body)',
            }}
          />
        </div>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer',
        }}>
          <input type="checkbox" checked={soloSinCalificar}
            onChange={e => setSoloSinCalificar(e.target.checked)} />
          Solo sin calificar
        </label>
      </div>

      {loading && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Agrupando tus reproducciones de {ventana?.label.toLowerCase()}…
        </p>
      )}

      {error && !loading && (
        <>
          <p style={{ color: 'var(--text-muted)' }}>{error}</p>
          <button className="btn" onClick={() => cargar(true)}>Reintentar</button>
        </>
      )}

      {!loading && !error && !lista.length && (
        <div className="empty-state">
          <TrendingUp size={28} style={{ color: 'var(--text-muted)' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No hay reproducciones guardadas en esta ventana.
          </p>
        </div>
      )}

      {!loading && !error && lista.slice(0, visibles).map((t, i) => (
        <div key={t.match_key || t.track_id} className="card" style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '9px 11px', marginBottom: 6, flexWrap: 'wrap',
        }}>
          <div style={{
            width: 24, textAlign: 'right', flexShrink: 0,
            fontFamily: 'var(--font-mono)', fontSize: '0.8rem',
            color: 'var(--text-muted)',
          }}>{t.rank}</div>

          {t.image
            ? <img src={t.image} alt="" style={{
              width: 38, height: 38, borderRadius: 'var(--radius-sm)',
              objectFit: 'cover', flexShrink: 0,
            }} />
            : <div style={{
              width: 38, height: 38, borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-surface)', flexShrink: 0,
            }} />}

          <div style={{ flex: '1 1 160px', minWidth: 130 }}>
            <div style={{
              fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{t.name || '(sin nombre)'}</div>
            <div style={{
              fontSize: '0.76rem', color: 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{t.artist}</div>
          </div>

          <div style={{
            flexShrink: 0, textAlign: 'right', minWidth: 74,
            fontFamily: 'var(--font-mono)',
          }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {t.plays}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
              {horas(t.ms_total)}
            </div>
          </div>

          {/* De qué época es. Es el dato que explica por qué calificar aquí no
              la mete al cuatrimestre actual. */}
          <div style={{
            flexShrink: 0, minWidth: 58, textAlign: 'right',
            fontSize: '0.7rem', color: 'var(--text-muted)',
          }}>
            <div>desde {anio(t.primera_escucha || t.first_played)}</div>
            {t.plays_total > t.plays && (
              <div style={{ fontFamily: 'var(--font-mono)' }}>
                {t.plays_total} total
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0 }}>
            {RATINGS.map(r => {
              const puesta = t.rating === r;
              return (
                <button
                  key={r}
                  disabled={busy === t.track_id}
                  onClick={() => calificar(t, r)}
                  title={puesta ? `Ya está en ${r}` : `Calificar ${r}`}
                  style={{
                    padding: '4px 7px', borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${puesta ? ratingColor(r) : 'var(--border-subtle)'}`,
                    background: puesta ? ratingDim(r) : 'transparent',
                    color: puesta ? ratingColor(r) : 'var(--text-muted)',
                    fontSize: '0.7rem', fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    cursor: busy === t.track_id ? 'default' : 'pointer',
                    opacity: busy === t.track_id ? 0.5 : 1,
                  }}>{r}</button>
              );
            })}
          </div>

          <button className="btn" title="Escuchar desde aquí"
            onClick={() => escuchar(i)}
            disabled={sonando}
            style={{ padding: '6px 9px', flexShrink: 0 }}>
            <Play size={12} />
          </button>
        </div>
      ))}

      {!loading && lista.length > visibles && (
        <button className="btn" style={{ marginTop: 8 }}
          onClick={() => setVisibles(v => v + 50)}>
          Ver {Math.min(50, lista.length - visibles)} más
        </button>
      )}
    </div>
  );
}
