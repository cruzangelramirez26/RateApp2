import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useToast } from '../hooks/useToast';

const RATING_COLORS = {
  'A+': '#f5c542', 'A': '#e8a83e', 'B+': '#6ecf8a',
  'B': '#4aab6a', 'C+': '#5ba8d4', 'C': '#4488aa', 'D': '#88555c',
};
const RATING_ORDER = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D'];
const CUATRI_LABEL = { perla: 'Perla', miel: 'Miel', latte: 'Latte' };
const CUATRI_COLOR = { perla: '#5ba8d4', miel: '#f5c542', latte: '#e8a83e' };

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
        <div className="page-header"><div className="page-title">Dashboard</div></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton" style={{ height: 80, borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      </div>
    );
  }

  const maxCount = stats ? Math.max(...Object.values(stats.by_rating || {}), 1) : 1;
  const byCuatri = stats?.by_cuatri || [];
  const topArtists = stats?.top_artists || [];

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Dashboard</div>
        <div className="page-subtitle">{stats?.total || 0} canciones calificadas</div>
      </div>

      {/* TOP SET highlight */}
      <div className="card fade-in" style={{ padding: '20px', marginBottom: '12px' }}>
        <div style={labelStyle}>TOP SET</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ fontSize: '2.2rem', fontWeight: 800, color: '#f5c542', fontFamily: 'var(--font-mono)' }}>
            {stats?.top_set_count || 0}
          </span>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            canciones B+ · A · A+
          </span>
          <span style={{
            marginLeft: 'auto', fontSize: '1.1rem', fontWeight: 700,
            fontFamily: 'var(--font-mono)', color: '#6ecf8a',
          }}>
            {stats?.top_set_pct || 0}%
          </span>
        </div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
          {['A+', 'A', 'B+'].map(r => (
            <div key={r} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: RATING_COLORS[r], fontFamily: 'var(--font-mono)' }}>
                {stats?.by_rating?.[r] || 0}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{r}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Distribución */}
      <div className="card fade-in" style={{ padding: '20px', marginBottom: '12px' }}>
        <div style={labelStyle}>Distribución</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {RATING_ORDER.map(r => {
            const count = stats?.by_rating?.[r] || 0;
            const pct = (count / maxCount) * 100;
            return (
              <div key={r} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.82rem', fontWeight: 700,
                  color: RATING_COLORS[r], width: '28px', textAlign: 'right',
                }}>{r}</span>
                <div style={{
                  flex: 1, height: '24px', background: 'var(--bg-surface)',
                  borderRadius: '6px', overflow: 'hidden', position: 'relative',
                }}>
                  <div style={{
                    width: `${pct}%`, height: '100%', background: RATING_COLORS[r],
                    opacity: 0.25, borderRadius: '6px', transition: 'width 0.6s var(--ease-out)',
                  }} />
                  <span style={{
                    position: 'absolute', right: '8px', top: '50%',
                    transform: 'translateY(-50%)', fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)',
                  }}>{count}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Por cuatrimestre */}
      {byCuatri.length > 0 && (
        <div className="card fade-in" style={{ padding: '20px', marginBottom: '12px' }}>
          <div style={labelStyle}>Por período</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {byCuatri.map(({ year, cuatri, count }) => (
              <div key={`${year}-${cuatri}`} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  fontSize: '0.78rem', fontWeight: 700,
                  color: CUATRI_COLOR[cuatri] || 'var(--text-muted)',
                  width: '50px', fontFamily: 'var(--font-mono)',
                }}>
                  {CUATRI_LABEL[cuatri] || cuatri}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', width: '36px', fontFamily: 'var(--font-mono)' }}>
                  {year}
                </span>
                <div style={{
                  flex: 1, height: '20px', background: 'var(--bg-surface)',
                  borderRadius: '6px', overflow: 'hidden', position: 'relative',
                }}>
                  <div style={{
                    width: `${(count / Math.max(...byCuatri.map(x => x.count), 1)) * 100}%`,
                    height: '100%', background: CUATRI_COLOR[cuatri] || 'var(--accent)',
                    opacity: 0.3, borderRadius: '6px', transition: 'width 0.6s var(--ease-out)',
                  }} />
                  <span style={{
                    position: 'absolute', right: '8px', top: '50%',
                    transform: 'translateY(-50%)', fontSize: '0.72rem',
                    fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)',
                  }}>{count}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top artistas */}
      {topArtists.length > 0 && (
        <div className="card fade-in" style={{ padding: '20px' }}>
          <div style={labelStyle}>Artistas frecuentes</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {topArtists.map(({ artist, count }, i) => (
              <div key={artist} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  fontSize: '0.72rem', color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)', width: '16px', textAlign: 'right',
                }}>
                  {i + 1}
                </span>
                <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  {artist}
                </span>
                <span style={{
                  fontSize: '0.78rem', fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)', fontWeight: 600,
                }}>
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle = {
  fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.06em', fontWeight: 600, marginBottom: '16px',
  fontFamily: 'var(--font-mono)',
};
