import { useEffect, useState } from 'react';
import { X, Headphones } from 'lucide-react';
import { api } from '../utils/api';

/**
 * Escuchas reales de una canción.
 *
 * El dato NO viene de la API de Spotify: no existe endpoint de play counts.
 * Sale del export de "Historial de reproducción extendido" (187,577
 * reproducciones desde 2018) que vive agregado en MySQL, y se mantiene al día
 * con la captura periódica de recently-played.
 */

function hace(iso) {
  if (!iso) return null;
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias < 0) return 'hoy';
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
  const años = Math.floor(dias / 365);
  return `hace ${años} ${años === 1 ? 'año' : 'años'}`;
}

function fecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function Dato({ valor, etiqueta, acento }) {
  return (
    <div style={{ textAlign: 'center', flex: 1, minWidth: 88 }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: '1.7rem', fontWeight: 700,
        color: acento ? 'var(--accent)' : 'var(--text-primary)', lineHeight: 1.1,
      }}>{valor}</div>
      <div style={{
        fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 3,
        textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>{etiqueta}</div>
    </div>
  );
}

export default function ListeningModal({ track, onClose }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  const trackId = track?.track_id || track?.id;

  useEffect(() => {
    if (!trackId) return;
    let vivo = true;
    setStats(null);
    setError(null);
    api.getListening(trackId)
      .then(d => { if (vivo) setStats(d); })
      .catch(() => { if (vivo) setError('No se pudo cargar el historial.'); });
    return () => { vivo = false; };
  }, [trackId]);

  // Escape para cerrar: el modal tapa la tabla y sin esto hay que apuntarle a la X.
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!track) return null;

  const nunca = stats && !stats.found;
  const dormida = stats?.last_played
    && (Date.now() - new Date(stats.last_played).getTime()) > 365 * 86400000;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)', borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border-subtle)',
          width: '100%', maxWidth: 400, overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '16px 16px 12px', borderBottom: '1px solid var(--border-subtle)',
        }}>
          {track.image && (
            <img src={track.image} alt="" style={{
              width: 52, height: 52, borderRadius: 'var(--radius-sm)',
              objectFit: 'cover', flexShrink: 0,
            }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{track.name}</div>
            <div style={{
              fontSize: '0.8rem', color: 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{track.artist}</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', padding: 2, display: 'flex', flexShrink: 0,
            }}
          >
            <X size={17} />
          </button>
        </div>

        <div style={{ padding: '18px 16px' }}>
          {error && (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
              {error}
            </div>
          )}

          {!error && !stats && (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
              Cargando…
            </div>
          )}

          {nunca && (
            <div style={{
              textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            }}>
              <Headphones size={26} style={{ opacity: 0.4 }} />
              <div>Sin registro de escuchas.</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>
                El historial arranca en 2018.
              </div>
            </div>
          )}

          {stats?.found && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                <Dato valor={stats.plays} etiqueta="reproducciones" acento />
                <Dato valor={stats.hours < 1 ? `${Math.round(stats.hours * 60)}m`
                                             : `${Math.round(stats.hours)}h`}
                      etiqueta="escuchadas" />
                {stats.skips > 0 && <Dato valor={stats.skips} etiqueta="saltos" />}
              </div>

              <div style={{
                display: 'flex', flexDirection: 'column', gap: 7,
                fontSize: '0.82rem', color: 'var(--text-secondary)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Primera vez</span>
                  <span>{fecha(stats.first_played)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Última vez</span>
                  <span style={{ color: dormida ? 'var(--rating-c)' : 'var(--text-secondary)' }}>
                    {fecha(stats.last_played)} · {hace(stats.last_played)}
                  </span>
                </div>
              </div>

              {/* La señal que de verdad importa para limpiar Me Gusta: no es
                  "nunca la escuché" sino "ya no la escucho". */}
              {dormida && (
                <div style={{
                  marginTop: 14, padding: '9px 11px',
                  background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
                  fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.45,
                }}>
                  La escuchaste {stats.plays} veces y llevas más de un año sin ponerla.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
