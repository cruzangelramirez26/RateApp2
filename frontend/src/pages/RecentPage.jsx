/**
 * RecentPage — Toggle between recently rated and recently played on Spotify.
 */
import { useState } from 'react';
import { Clock } from 'lucide-react';
import TrackCard from '../components/TrackCard';
import SearchBar from '../components/SearchBar';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { useRecientes } from '../hooks/useRecientes';

// La logica vive en hooks/useRecientes.js desde la fase 6 del rediseño
// (2026-09-25); esta vista es la del movil y la de ventanas angostas.

const TABS = [
  { id: 'played', label: 'Escuchados' },
  { id: 'rated', label: 'Calificados' },
];

export default function RecentPage() {
  const { tab, setTab, tracks, loading, calificar } = useRecientes();
  const [search, setSearch] = useState('');

  const filtered = search
    ? tracks.filter(t =>
        `${t.name} ${t.artist}`.toLowerCase().includes(search.toLowerCase())
      )
    : tracks;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Recientes</div>
        <div className="stats-filter-tabs" style={{ marginTop: '12px', marginBottom: '4px' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              className={`stats-filter-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => { setTab(t.id); setSearch(''); }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="page-subtitle">
          {loading ? '…' : `${filtered.length} canciones`}
        </div>
        <div style={{ marginTop: '12px' }}>
          <SearchBar value={search} onChange={setSearch} placeholder="Buscar..." />
        </div>
      </div>

      {loading ? (
        <LoadingSkeleton count={8} />
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Clock />
          <div>{search ? 'Sin resultados' : 'No hay canciones'}</div>
        </div>
      ) : (
        <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filtered.map((t, i) => (
            <TrackCard
              key={t.track_id || t.id}
              track={{ ...t, id: t.track_id || t.id }}
              onRate={calificar}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}
