/**
 * StatsPage — Rating distribution + playlist tools.
 */
import { useState, useEffect } from 'react';
import { BarChart3, Settings2, Play, Pause, Zap, RefreshCw } from 'lucide-react';
import { api } from '../utils/api';
import { useToast } from '../hooks/useToast';

const RATING_COLORS = {
  'A+': '#f5c542',
  'A': '#e8a83e',
  'B+': '#6ecf8a',
  'B': '#4aab6a',
  'C+': '#5ba8d4',
  'C': '#4488aa',
  'D': '#88555c',
};

const RATING_ORDER = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D'];

export default function StatsPage() {
  const [stats, setStats] = useState(null);
  const [virtualStatus, setVirtualStatus] = useState(null);
  const [aplusStatus, setAplusStatus] = useState(null);
  const [aplusCandidates, setAplusCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const toast = useToast();

  useEffect(() => {
    (async () => {
      try {
        const [s, v, ap] = await Promise.all([api.getStats(), api.virtualStatus(), api.aplusStatus()]);
        setStats(s);
        setVirtualStatus(v);
        setAplusStatus(ap);
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const doAction = async (key, fn) => {
    setActionLoading(key);
    try {
      const result = await fn();
      toast(typeof result === 'string' ? result : JSON.stringify(result), 'success', 4000);
      // Refresh statuses
      const [s, v] = await Promise.all([api.getStats(), api.virtualStatus()]);
      setStats(s);
      setVirtualStatus(v);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setActionLoading('');
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <div className="page-title">Dashboard</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: 80, borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      </div>
    );
  }

  const maxCount = stats ? Math.max(...Object.values(stats.by_rating || {}), 1) : 1;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Dashboard</div>
        <div className="page-subtitle">{stats?.total || 0} canciones calificadas</div>
      </div>

      {/* Rating distribution chart */}
      <div className="card fade-in" style={{ padding: '20px', marginBottom: '16px' }}>
        <div style={{
          fontSize: '0.78rem',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 600,
          marginBottom: '16px',
          fontFamily: 'var(--font-mono)',
        }}>
          Distribución
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {RATING_ORDER.map(r => {
            const count = stats?.by_rating?.[r] || 0;
            const pct = (count / maxCount) * 100;
            return (
              <div key={r} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: RATING_COLORS[r],
                  width: '28px',
                  textAlign: 'right',
                }}>
                  {r}
                </span>
                <div style={{
                  flex: 1,
                  height: '24px',
                  background: 'var(--bg-surface)',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  position: 'relative',
                }}>
                  <div style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: RATING_COLORS[r],
                    opacity: 0.25,
                    borderRadius: '6px',
                    transition: 'width 0.6s var(--ease-out)',
                  }} />
                  <span style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-secondary)',
                  }}>
                    {count}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Virtual mode section */}
      <div className="card fade-in" style={{ padding: '20px', marginBottom: '16px' }}>
        <div style={{
          fontSize: '0.78rem',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 600,
          marginBottom: '12px',
          fontFamily: 'var(--font-mono)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <Settings2 size={14} />
          Modo Virtual
          {virtualStatus?.active && (
            <span style={{
              background: 'rgba(110, 207, 138, 0.15)',
              color: 'var(--rating-b-plus)',
              padding: '2px 8px',
              borderRadius: '20px',
              fontSize: '0.7rem',
              fontFamily: 'var(--font-mono)',
            }}>
              ACTIVO — {virtualStatus.cuatri?.toUpperCase()}
            </span>
          )}
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.6 }}>
          Congela las fronteras de rating en la playlist del cuatrimestre. 
          Mueve canciones en Spotify, luego simula y aplica los cambios.
        </p>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {!virtualStatus?.active ? (
            <button
              className="btn btn-accent btn-sm"
              onClick={() => doAction('start', api.virtualStart)}
              disabled={!!actionLoading}
            >
              <Play size={14} /> Iniciar
            </button>
          ) : (
            <>
              <button
                className="btn btn-sm"
                onClick={() => doAction('sim', api.virtualSimulate)}
                disabled={!!actionLoading}
              >
                <Zap size={14} /> Simular
              </button>
              <button
                className="btn btn-accent btn-sm"
                onClick={() => doAction('apply', () => api.virtualApply(false))}
                disabled={!!actionLoading}
              >
                Aplicar cambios
              </button>
              <button
                className="btn btn-sm"
                onClick={() => doAction('end', api.virtualEnd)}
                disabled={!!actionLoading}
                style={{ color: 'var(--rating-d)' }}
              >
                <Pause size={14} /> Finalizar
              </button>
            </>
          )}
        </div>
      </div>

      {/* A+ Instant Detection */}
      <div className="card fade-in" style={{ padding: '20px', marginBottom: '16px' }}>
        <div style={{
          fontSize: '0.78rem',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 600,
          marginBottom: '12px',
          fontFamily: 'var(--font-mono)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <span style={{ color: 'var(--rating-a-plus)', fontSize: '14px' }}>★</span>
          A+ Instantáneos
          {aplusStatus?.active && (
            <span style={{
              background: 'rgba(245, 197, 66, 0.15)',
              color: 'var(--rating-a-plus)',
              padding: '2px 8px',
              borderRadius: '20px',
              fontSize: '0.7rem',
              fontFamily: 'var(--font-mono)',
            }}>
              ACTIVO
            </span>
          )}
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.6 }}>
          Detecta canciones nuevas en tus "Me gusta" de Spotify y las marca como A+ automáticamente.
        </p>

        {aplusCandidates.length > 0 && (
          <div style={{
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-sm)',
            padding: '10px',
            marginBottom: '12px',
            maxHeight: '180px',
            overflowY: 'auto',
          }}>
            <div style={{
              fontSize: '0.75rem',
              color: 'var(--rating-a-plus)',
              fontWeight: 600,
              marginBottom: '6px',
              fontFamily: 'var(--font-mono)',
            }}>
              {aplusCandidates.length} candidatos detectados:
            </div>
            {aplusCandidates.map((c, i) => (
              <div key={c.id || i} style={{
                fontSize: '0.82rem',
                color: 'var(--text-primary)',
                padding: '3px 0',
                borderBottom: i < aplusCandidates.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              }}>
                {c.name} <span style={{ color: 'var(--text-muted)' }}>— {c.artist}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-sm"
            style={{ borderColor: 'var(--rating-a-plus)', color: 'var(--rating-a-plus)' }}
            onClick={() => doAction('aplus-scan', async () => {
              const res = await api.aplusScan();
              if (res.candidates && res.candidates.length > 0) {
                setAplusCandidates(res.candidates);
              }
              const st = await api.aplusStatus();
              setAplusStatus(st);
              return res.message;
            })}
            disabled={!!actionLoading}
          >
            {aplusStatus?.active ? 'Escanear nuevos likes' : 'Escanear nuevos likes'}
          </button>

          {aplusCandidates.length > 0 && (
            <button
              className="btn btn-sm"
              style={{ background: 'rgba(245, 197, 66, 0.12)', borderColor: 'var(--rating-a-plus)', color: 'var(--rating-a-plus)' }}
              onClick={() => doAction('aplus-apply', async () => {
                const res = await api.aplusApply();
                setAplusCandidates([]);
                const [s, st] = await Promise.all([api.getStats(), api.aplusStatus()]);
                setStats(s);
                setAplusStatus(st);
                return res.message;
              })}
              disabled={!!actionLoading}
            >
              Aplicar {aplusCandidates.length} como A+
            </button>
          )}
        </div>
      </div>

      {/* Playlist tools */}
      <div className="card fade-in" style={{ padding: '20px' }}>
        <div style={{
          fontSize: '0.78rem',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          fontWeight: 600,
          marginBottom: '12px',
          fontFamily: 'var(--font-mono)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <RefreshCw size={14} /> Herramientas
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-sm btn-spotify"
            onClick={() => doAction('order', async () => {
              const dist = await api.getDistribution();
              // Order current cuatri
              const cuatriMap = { perla: dist.perla, miel: dist.miel, latte: dist.latte };
              const month = new Date().getMonth() + 1;
              const cuatri = month <= 4 ? 'perla' : month <= 8 ? 'miel' : 'latte';
              await api.orderPlaylist(cuatriMap[cuatri], 1);
              return `${cuatri.toUpperCase()} ordenada`;
            })}
            disabled={!!actionLoading}
          >
            Ordenar cuatrimestre
          </button>
          <button
            className="btn btn-sm btn-spotify"
            onClick={() => doAction('order-anual', async () => {
              const dist = await api.getDistribution();
              await api.orderPlaylist(dist.anual, 4); // B+ = 4
              return 'Galería Anual ordenada';
            })}
            disabled={!!actionLoading}
          >
            Ordenar Galería Anual
          </button>
        </div>
      </div>
    </div>
  );
}
