import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { useToast } from '../hooks/useToast';

const RATING_COLORS = {
  'A+': '#f5c542', 'A': '#e8a83e', 'B+': '#6ecf8a',
  'B': '#4aab6a', 'C+': '#5ba8d4', 'C': '#4488aa', 'D': '#88555c',
};
const RATING_ORDER = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D'];
const CUATRI_LABEL = { perla: 'Perla', miel: 'Miel', latte: 'Latte' };
const CUATRI_DATE  = { perla: 'Ene–Abr', miel: 'May–Ago', latte: 'Sep–Dic' };

// Year-specific names, colors, and cover images per cuatrimestre
const CUATRI_META = {
  '2025-perla': { label: 'Savia', color: '#cfd8be', img: '/portadas/2025/Savia.jpg' },
  '2025-miel':  { label: 'Lirio', color: '#efdffc', img: '/portadas/2025/Lirio.jpg' },
  '2025-latte': { label: 'Marea', color: '#bde8f3', img: '/portadas/2025/Marea.jpg' },
  '2026-perla': { label: 'Perla', color: '#5ba8d4', img: '/portadas/2026/Perla.jpg' },
  '2026-miel':  { label: 'Miel',  color: '#f5c542', img: '/portadas/2026/Miel.jpg' },
  '2026-latte': { label: 'Latte', color: '#e8a83e', img: '/portadas/2026/Latte.jpg' },
};

function getCuatriMeta(year, cuatri) {
  const key = `${year}-${cuatri}`;
  return CUATRI_META[key] || {
    label: CUATRI_LABEL[cuatri] || cuatri,
    color: '#9ca3af',
    img: null,
  };
}

function getCurrentPeriod() {
  const now = new Date();
  const year = now.getFullYear();
  const m = now.getMonth() + 1;
  const cuatri = m <= 4 ? 'perla' : m <= 8 ? 'miel' : 'latte';
  return { year, cuatri };
}

const labelStyle = {
  fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.06em', fontWeight: 600, marginBottom: '16px',
  fontFamily: 'var(--font-mono)',
};

function MetricCard({ label, value, sub, color }) {
  return (
    <div className="stats-metric-card">
      <div className="stats-metric-label">{label}</div>
      <div className="stats-metric-value" style={color ? { color } : {}}>
        {value}
      </div>
      {sub && <div className="stats-metric-sub">{sub}</div>}
    </div>
  );
}

export default function StatsPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('todo');
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
        <div className="page-header"><div className="page-title">Stats</div></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton" style={{ height: 80, borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      </div>
    );
  }

  const { year: currentYear, cuatri: currentCuatri } = getCurrentPeriod();
  const byCuatri   = stats?.by_cuatri || [];
  const topArtists = stats?.top_artists || [];

  const filteredCuatri = byCuatri.filter(({ year, cuatri }) => {
    if (timeFilter === 'todo') return true;
    if (timeFilter === 'año' || timeFilter === 'mes') return year === currentYear;
    if (timeFilter === 'cuatrimestre') return year === currentYear && cuatri === currentCuatri;
    return true;
  });

  const filteredTotal = filteredCuatri.reduce((s, x) => s + x.count, 0);
  const maxCuatriCount = Math.max(...filteredCuatri.map(x => x.count), 1);
  const maxRatingCount = Math.max(...Object.values(stats?.by_rating || {}), 1);

  const aTierCount = (stats?.by_rating?.['A'] || 0) + (stats?.by_rating?.['A+'] || 0);
  const aTierPct   = stats?.total ? Math.round((aTierCount / stats.total) * 100) : 0;
  const modeRating = Object.entries(stats?.by_rating || {})
    .sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

  return (
    <div className="page">
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div className="page-title">Stats</div>
          <div className="page-subtitle">{stats?.total || 0} canciones calificadas</div>
        </div>
        <div className="stats-filter-tabs">
          {['Mes', 'Cuatrimestre', 'Año', 'Todo'].map(f => (
            <button
              key={f}
              className={`stats-filter-tab${timeFilter === f.toLowerCase() ? ' active' : ''}`}
              onClick={() => setTimeFilter(f.toLowerCase())}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* ── Metric cards ── */}
      <div className="stats-metric-row">
        <MetricCard
          label="Total Rated"
          value={timeFilter === 'todo' ? (stats?.total || 0) : filteredTotal}
          sub={timeFilter === 'todo' ? 'todas las épocas' : CUATRI_LABEL[currentCuatri]}
        />
        <MetricCard
          label="Promedio"
          value={modeRating}
          sub="rating más frecuente"
          color={RATING_COLORS[modeRating]}
        />
        <MetricCard
          label="Tier A"
          value={aTierCount}
          sub={`${aTierPct}% del total`}
          color={RATING_COLORS['A']}
        />
        <MetricCard
          label="Skip Rate"
          value="—"
          sub="no disponible"
        />
      </div>

      {/* ── Main grid: distribución + top artistas ── */}
      <div className="stats-main-grid" style={{ marginBottom: '20px' }}>
        {/* Distribution chart */}
        <div className="card fade-in" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={labelStyle}>Distribución de ratings</div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              n = {stats?.total || 0}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {RATING_ORDER.map(r => {
              const count = stats?.by_rating?.[r] || 0;
              const pct = (count / maxRatingCount) * 100;
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
                      opacity: 0.3, borderRadius: '6px', transition: 'width 0.6s var(--ease-out)',
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

        {/* Top artistas */}
        {topArtists.length > 0 && (
          <div className="card fade-in" style={{ padding: '20px' }}>
            <div style={labelStyle}>Top artistas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {topArtists.slice(0, 8).map(({ artist, count, top_rating }, i) => (
                <div key={artist} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    fontSize: '0.72rem', color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)', width: '16px', textAlign: 'right',
                    flexShrink: 0,
                  }}>
                    {i + 1}
                  </span>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--bg-surface)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)',
                  }}>
                    {artist[0]?.toUpperCase()}
                  </div>
                  <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {artist}
                  </span>
                  {top_rating && (
                    <span style={{
                      fontSize: '0.68rem', fontWeight: 700, fontFamily: 'var(--font-mono)',
                      color: RATING_COLORS[top_rating],
                      background: `${RATING_COLORS[top_rating]}18`,
                      border: `1px solid ${RATING_COLORS[top_rating]}44`,
                      padding: '1px 6px', borderRadius: '4px',
                    }}>{top_rating}</span>
                  )}
                  <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', flexShrink: 0 }}>
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Cuatrimestres ── */}
      {filteredCuatri.length > 0 && (
        <div className="card fade-in" style={{ padding: '20px' }}>
          <div style={labelStyle}>Cuatrimestres</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {filteredCuatri.map(({ year, cuatri, count, top_rating }) => {
              const meta = getCuatriMeta(year, cuatri);
              return (
                <div key={`${year}-${cuatri}`} style={{
                  flex: '1 1 160px',
                  background: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  borderLeft: `3px solid ${meta.color}`,
                  display: 'flex',
                  flexDirection: 'column',
                }}>
                  {/* Portada */}
                  {meta.img && (
                    <div style={{ position: 'relative', height: 90, overflow: 'hidden' }}>
                      <img
                        src={meta.img}
                        alt={meta.label}
                        style={{
                          width: '100%', height: '100%',
                          objectFit: 'cover', objectPosition: 'center top',
                          display: 'block',
                        }}
                        onError={e => { e.currentTarget.style.display = 'none'; }}
                      />
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: `linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.35) 100%)`,
                      }} />
                    </div>
                  )}

                  <div style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: meta.color }}>
                        {meta.label}
                      </span>
                      {top_rating && (
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 700, fontFamily: 'var(--font-mono)',
                          color: RATING_COLORS[top_rating],
                        }}>{top_rating}</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '8px' }}>
                      {CUATRI_DATE[cuatri]} {year}
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      {count}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>canciones</div>

                    {/* Mini bar */}
                    <div style={{ marginTop: '10px', height: '4px', background: 'var(--border-subtle)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${(count / maxCuatriCount) * 100}%`,
                        height: '100%',
                        background: meta.color,
                        borderRadius: '2px',
                        transition: 'width 0.6s var(--ease-out)',
                      }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
