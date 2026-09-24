import { useState, useEffect, useRef } from 'react';
import { Music, RefreshCw, List, Square, Play } from 'lucide-react';
import TrackCard from '../components/TrackCard';
import SearchBar from '../components/SearchBar';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { RATINGS_ORDEN, ratingDeTecla, esEscritura } from '../utils/ratings';
import { useCalificar } from '../hooks/useCalificar';

// 1 = A+ … 7 = D en toda la app (ver utils/ratings.js). Aqui iba al reves
// desde mayo (1 = D) y los atajos globales al derecho: se unifico el 2026-09-23.
const RATINGS = RATINGS_ORDEN;

/**
 * Calificar, la vista de siempre: el móvil y las ventanas de menos de 1024 px.
 * En escritorio se pinta components/escritorio/Calificar.jsx; la lógica de las
 * dos vive en hooks/useCalificar.js. El reproductor flotante se abre SOLO
 * desde el sidebar (en esta pantalla, en la pestaña Cola).
 */
export default function PendingPage() {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('individual'); // 'individual' | 'lista'
  const {
    tracks, filtered, unrated, rated, cola: individualUnrated,
    loading, refreshing, refresh: handleRefresh,
    calificarId, playing,
    calificar: handleRate, escuchar: handlePlayInContext, saltar,
  } = useCalificar(search);

  const handleRateRef = useRef(null);
  const handleSkipRef = useRef(null);
  const desktopUnratedRef = useRef([]);

  // Keyboard shortcuts for individual view
  useEffect(() => {
    const handler = (e) => {
      if (esEscritura(e) || e.ctrlKey || e.altKey || e.metaKey) return;
      if (viewMode !== 'individual') return;
      const current = desktopUnratedRef.current[0];
      if (!current) return;
      const rating = ratingDeTecla(e.key);
      if (rating) {
        handleRateRef.current(current, rating);
      }
      if (e.key === 's' || e.key === 'S') {
        handleSkipRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [viewMode]);

  const handleSkip = () => saltar(desktopUnratedRef.current[0]);

  handleRateRef.current = handleRate;
  handleSkipRef.current = handleSkip;

  desktopUnratedRef.current = individualUnrated;

  const currentTrack = individualUnrated[0] ?? null;

  // ── Individual view (shared between mobile/desktop) ─────────────
  const IndividualView = () => (
    !currentTrack ? (
      <div className="empty-state">
        <Music />
        <div>{search ? 'Sin resultados' : 'No hay canciones sin calificar'}</div>
      </div>
    ) : (
      <div className="pending-individual-grid">
        {/* Main column */}
        <div>
          {currentTrack.image ? (
            <img src={currentTrack.image} className="pending-album-art" alt="" />
          ) : (
            <div className="pending-album-art card" style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '4rem',
            }}>🎵</div>
          )}

          <div className="pending-track-info">
            <div className="pending-track-label">NOW RATING</div>
            <div className="pending-track-name">{currentTrack.name}</div>
            <div className="pending-track-artist">{currentTrack.artist}</div>
            {currentTrack.album && (
              <div className="pending-track-album">{currentTrack.album}</div>
            )}
            <div className="pending-track-actions">
              {/* Reproduce dentro de <3333> (shuffle off) vía API */}
              <button
                className="btn btn-sm"
                onClick={() => handlePlayInContext(currentTrack)}
                disabled={playing}
                title="Reproducir dentro de <3333, con shuffle apagado"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  color: 'var(--accent)', borderColor: 'var(--accent)',
                  fontWeight: 600, opacity: playing ? 0.5 : 1,
                }}
              >
                <Play size={13} />
                {calificarId ? 'Reproducir en <3333' : 'Reproducir'}
              </button>
            </div>
          </div>

          <div className="pending-rating-row">
            {RATINGS.map((r, i) => (
              <div key={r} className="pending-rating-col">
                <button
                  className="rating-btn pending-rating-btn-lg"
                  data-rating={r}
                  data-active={currentTrack.rating === r ? 'true' : 'false'}
                  onClick={() => handleRate(currentTrack, r)}
                >
                  {r}
                </button>
                <span className="pending-rating-shortcut">{i + 1}</span>
              </div>
            ))}
          </div>

          <div className="pending-skip-row">
            <button className="btn btn-sm" onClick={handleSkip}>
              ⏭ Skip · S
            </button>
            <span>{individualUnrated.length} sin calificar</span>
          </div>
        </div>

        {/* UP NEXT panel — hidden on narrow screens */}
        <div className="upnext-panel pending-upnext-hide-mobile">
          <div className="upnext-header">
            <span className="upnext-title">UP NEXT</span>
            <span className="upnext-subtitle">From recent additions</span>
          </div>

          {individualUnrated.slice(1, 6).length === 0 ? (
            <div style={{
              color: 'var(--text-muted)', fontSize: '0.82rem',
              textAlign: 'center', padding: '20px 0',
            }}>
              Última canción
            </div>
          ) : (
            individualUnrated.slice(1, 6).map(t => (
              <div key={t.id} className="upnext-item">
                {t.image ? (
                  <img src={t.image} className="upnext-swatch" alt="" />
                ) : (
                  <div className="upnext-swatch" style={{
                    display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: '1rem',
                  }}>🎵</div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div className="upnext-item-name">{t.name}</div>
                  <div className="upnext-item-artist">{t.artist}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    )
  );

  // ── Lista view ───────────────────────────────────────────────────
  const ListaView = () => (
    filtered.length === 0 ? (
      <div className="empty-state">
        <Music />
        <div>{search ? 'Sin resultados' : 'No hay canciones en la playlist <3333>'}</div>
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {unrated.map((t, i) => (
          <TrackCard key={t.id} track={t} onRate={handleRate} index={i} />
        ))}
        {unrated.length > 0 && rated.length > 0 && (
          <div style={{
            fontSize: '0.78rem', color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            fontWeight: 600, padding: '12px 0 4px',
            fontFamily: 'var(--font-mono)',
          }}>
            ya calificadas ({rated.length})
          </div>
        )}
        {rated.map((t, i) => (
          <TrackCard key={t.id} track={t} onRate={handleRate} index={unrated.length + i} />
        ))}
      </div>
    )
  );

  return (
    <div className="page">
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div>
          <div className="page-title">Pending</div>
          <div className="page-subtitle">
            {tracks.length} canciones · {unrated.length} sin calificar
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {viewMode === 'individual' && (
            <span className="pending-desktop-only" style={{
              fontSize: '0.75rem', color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)', marginRight: '4px',
            }}>
              1–7 · S skip
            </span>
          )}
          {/* Toggle lista / individual */}
          <button
            className="btn btn-sm"
            onClick={() => setViewMode(m => m === 'individual' ? 'lista' : 'individual')}
            title={viewMode === 'individual' ? 'Ver lista' : 'Ver individual'}
          >
            {viewMode === 'individual' ? <List size={14} /> : <Square size={14} />}
          </button>
          <button
            className="btn btn-sm"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ opacity: refreshing ? 0.5 : 1 }}
          >
            <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar canción o artista..." />
      </div>

      {loading ? (
        <LoadingSkeleton count={8} />
      ) : viewMode === 'individual' ? (
        <IndividualView />
      ) : (
        <ListaView />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
