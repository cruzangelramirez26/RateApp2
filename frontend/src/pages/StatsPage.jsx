import { useState, useEffect } from 'react';
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
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    api.getStats()
      .then(s => setStats(s))
      .catch(err => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

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

      <div className="card fade-in" style={{ padding: '20px' }}>
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
    </div>
  );
}
