import { useState, useEffect, useCallback } from 'react';
import { HeartOff, Play, RefreshCw, AlertTriangle } from 'lucide-react';
import { api } from '../utils/api';
import { ratingColor, ratingDim } from '../utils/theme';
import { useToast } from '../hooks/useToast';

/**
 * Limpiar Me Gusta: las ABANDONADAS.
 *
 * Angel pidió "las menos escuchadas" y NO EXISTEN: de 2,212 Me Gusta con 6+
 * meses, solo 32 tienen 0–2 reproducciones en toda su vida, y la mediana son 22
 * escuchas completas. No tiene basura por volumen.
 *
 * Lo que sí tiene son 721 canciones (31%) que escuchó muchísimo hace años y
 * lleva 12+ meses sin poner. La métrica correcta es RECENCIA, no volumen.
 *
 * ABANDONADA NO ES BASURA: puede ser un clásico personal que no se pone seguido.
 * Por eso nada se quita solo — la selección siempre es explícita y el botón pide
 * confirmación.
 */

const PRESETS = [
  { label: 'Un año sin oírla', meses: 12, minPlays: 5 },
  { label: 'Dos años', meses: 24, minPlays: 5 },
  { label: 'Las que más amaste', meses: 12, minPlays: 40 },
];

export default function AbandonedPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [preset, setPreset] = useState(0);
  const [sel, setSel] = useState(() => new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [sonando, setSonando] = useState(false);
  const [visibles, setVisibles] = useState(60);
  const toast = useToast();

  const cargar = useCallback((p) => {
    setLoading(true);
    setError(null);
    setSel(new Set());
    setConfirmando(false);
    const { meses, minPlays } = PRESETS[p];
    api.getAbandoned(meses, minPlays)
      .then(setData)
      .catch(() => setError('No se pudo cargar la lista.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { cargar(preset); }, [preset, cargar]);

  const lista = data?.tracks || [];
  const mostradas = lista.slice(0, visibles);

  function toggle(id) {
    setSel(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
    setConfirmando(false);
  }

  function toggleVisibles() {
    const ids = mostradas.map(t => t.track_id);
    const todas = ids.every(i => sel.has(i));
    setSel(prev => {
      const n = new Set(prev);
      ids.forEach(i => todas ? n.delete(i) : n.add(i));
      return n;
    });
    setConfirmando(false);
  }

  async function quitar() {
    const ids = [...sel].slice(0, 200);
    setQuitando(true);
    try {
      await api.unlikeTracks(ids);
      setData(d => ({
        ...d,
        total: d.total - ids.length,
        tracks: d.tracks.filter(t => !sel.has(t.track_id)),
      }));
      setSel(new Set());
      setConfirmando(false);
      toast(`${ids.length} canciones fuera de tus Me Gusta`, 'success', 4000);
    } catch (e) {
      toast(e.message || 'No se pudo quitar el like', 'error');
    } finally {
      setQuitando(false);
    }
  }

  async function escuchar() {
    setSonando(true);
    try {
      const r = await api.buildQueuePlaylist('abandoned', 50, true);
      toast(
        r.playing
          ? `Sonando ${r.count} abandonadas en Spotify`
          : (r.error || 'Playlist lista, pero no se pudo reproducir'),
        r.playing ? 'success' : 'error',
        5000,
      );
    } catch (e) {
      toast(e.message || 'No se pudo armar la playlist', 'error');
    } finally {
      setSonando(false);
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="page-header"><div className="page-title">Limpiar Me Gusta</div></div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Cruzando tus Me Gusta con 8 años de historial…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="page-header"><div className="page-title">Limpiar Me Gusta</div></div>
        <p style={{ color: 'var(--text-muted)' }}>{error}</p>
        <button className="btn" onClick={() => cargar(preset)}>Reintentar</button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header" style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
      }}>
        <div>
          <div className="page-title" style={{ marginBottom: 4 }}>Limpiar Me Gusta</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
            {data.total.toLocaleString()} canciones que amabas y ya no escuchas
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={escuchar} disabled={sonando || !lista.length}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Play size={14} /> {sonando ? 'Armando…' : 'Escuchar 50'}
          </button>
          <button className="btn" onClick={() => cargar(preset)} title="Recargar">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div style={{
        padding: '9px 12px', background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-sm)', fontSize: '0.78rem',
        color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 14,
      }}>
        No son "las que nunca escuchaste" — esas casi no existen, la mediana de
        tus Me Gusta son 22 escuchas completas. Son las que <b>escuchaste
        muchísimo y llevas más de un año sin poner</b>. Ojo: abandonada no es lo
        mismo que mala, aquí puede haber clásicos tuyos. Nada se quita sin que
        lo marques.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {PRESETS.map((p, i) => (
          <button
            key={p.label}
            className="btn"
            onClick={() => { setPreset(i); setVisibles(60); }}
            style={{
              background: preset === i ? 'var(--accent)' : 'transparent',
              color: preset === i ? 'var(--on-accent)' : 'var(--text-secondary)',
            }}
          >{p.label}</button>
        ))}
      </div>

      {lista.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '32px 0' }}>
          Nada abandonado con este criterio. 🎉
        </p>
      ) : (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 10, flexWrap: 'wrap',
          }}>
            <button className="btn" onClick={toggleVisibles} style={{ fontSize: '0.8rem' }}>
              {mostradas.every(t => sel.has(t.track_id)) ? 'Desmarcar' : 'Marcar'} visibles
            </button>
            {sel.size > 0 && (
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {sel.size} marcada{sel.size === 1 ? '' : 's'}
              </span>
            )}
            {sel.size > 0 && !confirmando && (
              <button
                onClick={() => setConfirmando(true)}
                style={{
                  marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${ratingColor('D')}`, background: ratingDim('D'),
                  color: ratingColor('D'), cursor: 'pointer',
                  fontSize: '0.82rem', fontWeight: 600,
                }}
              >
                <HeartOff size={14} /> Quitar {sel.size} de Me Gusta
              </button>
            )}
          </div>

          {/* Confirmación explícita: quitar likes no se deshace solo */}
          {confirmando && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              padding: '11px 13px', marginBottom: 12,
              border: `1px solid ${ratingColor('D')}`, background: ratingDim('D'),
              borderRadius: 'var(--radius-sm)',
            }}>
              <AlertTriangle size={16} style={{ color: ratingColor('D'), flexShrink: 0 }} />
              <span style={{ fontSize: '0.83rem', color: 'var(--text-primary)', flex: 1 }}>
                Vas a quitar <b>{Math.min(sel.size, 200)}</b> canciones de tus Me
                Gusta en Spotify. Se puede volver a dar like, pero pierdes la
                fecha original.
                {sel.size > 200 && <> Se procesan las primeras 200.</>}
              </span>
              <button className="btn" onClick={() => setConfirmando(false)}
                disabled={quitando}>Cancelar</button>
              <button
                onClick={quitar}
                disabled={quitando}
                style={{
                  padding: '7px 14px', borderRadius: 'var(--radius-sm)',
                  border: 'none', background: ratingColor('D'),
                  color: 'var(--on-accent)', cursor: 'pointer',
                  fontSize: '0.82rem', fontWeight: 700,
                }}
              >{quitando ? 'Quitando…' : 'Sí, quitarlas'}</button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {mostradas.map(t => {
              const marcada = sel.has(t.track_id);
              return (
                <label
                  key={t.track_id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer',
                    background: marcada ? ratingDim('D') : 'var(--bg-card)',
                    border: `1px solid ${marcada ? ratingColor('D') : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-md)', padding: '9px 12px',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={marcada}
                    onChange={() => toggle(t.track_id)}
                    style={{ width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }}
                  />
                  {t.image && (
                    <img src={t.image} alt="" style={{
                      width: 40, height: 40, borderRadius: 'var(--radius-sm)',
                      objectFit: 'cover', flexShrink: 0,
                    }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{t.name}</div>
                    <div style={{
                      fontSize: '0.77rem', color: 'var(--text-muted)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{t.artist}</div>
                  </div>
                  {t.rating && (
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.72rem',
                      fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                      color: ratingColor(t.rating), background: ratingDim(t.rating),
                      flexShrink: 0,
                    }}>{t.rating}</span>
                  )}
                  <div style={{
                    textAlign: 'right', flexShrink: 0, fontSize: '0.71rem',
                    color: 'var(--text-muted)', lineHeight: 1.35, minWidth: 74,
                  }}>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.92rem',
                      fontWeight: 700, color: 'var(--text-secondary)',
                    }}>{t.plays}</div>
                    <div>veces</div>
                    <div style={{ color: ratingColor('D') }}>
                      {t.meses_sin_oir}m sin oír
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          {lista.length > visibles && (
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button className="btn" onClick={() => setVisibles(v => v + 60)}>
                Ver 60 más ({(lista.length - visibles).toLocaleString()} restantes)
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
