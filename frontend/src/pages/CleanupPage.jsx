import { useState, useEffect, useCallback, useMemo } from 'react';
import { HeartOff, Play, RefreshCw, AlertTriangle, Search } from 'lucide-react';
import { api } from '../utils/api';
import { preloadCache } from '../utils/preloadCache';
import { ratingColor, ratingDim } from '../utils/theme';
import { useToast } from '../hooks/useToast';

/**
 * Limpiar Me Gusta.
 *
 * Angel pidió "las que casi ni escuché" y en su momento se le contestó que no
 * existían. ESO ESTABA MAL MEDIDO: se miró el umbral 0–2 reproducciones (34
 * canciones) y de ahí salió el "no existen". Pero con la mediana de sus Me
 * Gusta en 20 escuchas, 5 escuchas SÍ es casi nada — hay 115 así, y 405 con 10
 * o menos (17%).
 *
 * Por eso esta página NO decide el umbral. Trae todo con sus números, lo ordena
 * de menos escuchada a más, y el corte lo pone él. Su idea textual: "maybe
 * armar mis me gusta por escucha, y de ahí calificar y así".
 *
 * UNA SOLA LLAMADA, cacheada en sesión: la petición recorre los ~2,300 Me Gusta
 * de Spotify y tarda. Cambiar de orden o de umbral es local e instantáneo, y
 * salir y volver a entrar ya no vuelve a esperar.
 */

const CACHE_KEY = 'cleanupQueue';
const RATINGS = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D'];
const LOTE = 50;   // lo que cabe en una tanda de escucha

const ORDENES = [
  { key: 'menos', label: 'Menos escuchadas' },
  { key: 'abandonadas', label: 'Abandonadas' },
  { key: 'mas', label: 'Más escuchadas' },
];

export default function CleanupPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [orden, setOrden] = useState('menos');
  const [maxPlays, setMaxPlays] = useState('');
  const [q, setQ] = useState('');
  const [soloSinCalificar, setSoloSinCalificar] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [quitando, setQuitando] = useState(false);
  const [sonando, setSonando] = useState(false);
  const [busy, setBusy] = useState(null);
  const [visibles, setVisibles] = useState(60);
  const toast = useToast();

  const cargar = useCallback((forzar = false) => {
    setLoading(true);
    setError(null);
    if (forzar) preloadCache.invalidate(CACHE_KEY);
    preloadCache.load(CACHE_KEY, api.getCleanupQueue)
      .then(d => setData(d))
      .catch(() => setError('No se pudo cargar tus Me Gusta.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Mantener el cache al día evita que salir y volver muestre datos viejos.
  function aplicarLocal(fn) {
    setData(prev => {
      if (!prev) return prev;
      const next = fn(prev);
      preloadCache.set(CACHE_KEY, next);
      return next;
    });
  }

  const lista = useMemo(() => {
    let l = data?.tracks || [];
    const tope = parseInt(maxPlays, 10);
    if (!isNaN(tope)) l = l.filter(t => t.plays <= tope);
    if (soloSinCalificar) l = l.filter(t => !t.rating);
    if (q.trim()) {
      const s = q.toLowerCase();
      l = l.filter(t => (t.name || '').toLowerCase().includes(s)
                     || (t.artist || '').toLowerCase().includes(s));
    }
    const copia = [...l];
    // Las que no tienen dato van AL FINAL en "menos escuchadas". Antes
    // encabezaban la lista como si tuvieran 0 escuchas, o sea aparecían como
    // las primeras candidatas a borrar — y Angel detectó que varias sí las
    // escucha, solo que Spotify las guarda bajo otro track_id.
    if (orden === 'menos') copia.sort((a, b) =>
      (a.sin_datos ? 1 : 0) - (b.sin_datos ? 1 : 0) || a.plays - b.plays);
    else if (orden === 'mas') copia.sort((a, b) => b.plays - a.plays);
    else copia.sort((a, b) => (b.meses_sin_oir || 0) - (a.meses_sin_oir || 0)
                           || b.plays - a.plays);
    return copia;
  }, [data, orden, maxPlays, q, soloSinCalificar]);

  const mostradas = lista.slice(0, visibles);
  const sinDatos = (data?.tracks || []).filter(x => x.sin_datos).length;

  function toggle(id) {
    setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
    setConfirmando(false);
  }

  function toggleVisibles() {
    const ids = mostradas.map(t => t.track_id);
    const todas = ids.every(i => sel.has(i));
    setSel(p => { const n = new Set(p); ids.forEach(i => todas ? n.delete(i) : n.add(i)); return n; });
    setConfirmando(false);
  }

  async function quitar() {
    const ids = [...sel].slice(0, 200);
    setQuitando(true);
    try {
      await api.unlikeTracks(ids);
      const fuera = new Set(ids);
      aplicarLocal(d => ({ ...d, total: d.total - ids.length,
                           tracks: d.tracks.filter(t => !fuera.has(t.track_id)) }));
      setSel(new Set());
      setConfirmando(false);
      toast(`${ids.length} fuera de tus Me Gusta`, 'success', 4000);
    } catch (e) {
      toast(e.message || 'No se pudo quitar el like', 'error');
    } finally { setQuitando(false); }
  }

  // Calificar aquí SIEMPRE cataloga: soft + fecha de la primera escucha, para
  // que una canción de 2021 no se cuele al cuatrimestre actual.
  async function calificar(t, rating) {
    setBusy(t.track_id);
    try {
      await api.rateTrackSoft({
        track_id: t.track_id, name: t.name, artist: t.artist,
        album: t.album || '', rating,
        added_at: t.suggested_added_at || undefined,
      });
      aplicarLocal(d => ({ ...d,
        tracks: d.tracks.map(x => x.track_id === t.track_id ? { ...x, rating } : x) }));
    } catch {
      toast('No se pudo guardar la calificación', 'error');
    } finally { setBusy(null); }
  }

  // "Desde aquí": manda el tramo exacto que se está viendo. Es la respuesta a
  // "¿y si quiero escuchar de la 60 a la 100? ¿a fuerza tengo que calificar las
  // 50 primeras?" — no, se manda ese pedazo y ya.
  async function escuchar(desde = 0) {
    setSonando(true);
    try {
      const ids = lista.slice(desde, desde + LOTE).map(t => t.track_id);
      const r = await api.buildQueuePlaylist('cleanup', LOTE, true, ids);
      toast(
        r.playing
          ? `Sonando ${r.count} canciones desde la #${desde + 1}`
          : (r.error || 'Playlist lista, pero no se pudo reproducir'),
        r.playing ? 'success' : 'error', 5000,
      );
    } catch (e) {
      toast(e.message || 'No se pudo armar la playlist', 'error');
    } finally { setSonando(false); }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="page-header"><div className="page-title">Limpiar Me Gusta</div></div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Cruzando tus Me Gusta con 8 años de historial… la primera vez tarda,
          después queda en memoria.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <div className="page-header"><div className="page-title">Limpiar Me Gusta</div></div>
        <p style={{ color: 'var(--text-muted)' }}>{error}</p>
        <button className="btn" onClick={() => cargar(true)}>Reintentar</button>
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
            {lista.length.toLocaleString()} de {data.total.toLocaleString()} Me Gusta
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => escuchar(0)} disabled={sonando || !lista.length}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Play size={14} /> {sonando ? 'Armando…' : `Escuchar ${LOTE}`}
          </button>
          <button className="btn" onClick={() => cargar(true)} title="Recargar de Spotify">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {ORDENES.map(o => (
          <button key={o.key} className="btn"
            onClick={() => { setOrden(o.key); setVisibles(60); }}
            style={{
              background: orden === o.key ? 'var(--accent)' : 'transparent',
              color: orden === o.key ? 'var(--on-accent)' : 'var(--text-secondary)',
            }}>{o.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 150 }}>
          <Search size={14} style={{
            position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', pointerEvents: 'none',
          }} />
          <input
            value={q}
            onChange={e => { setQ(e.target.value); setVisibles(60); }}
            placeholder="Buscar canción o artista"
            style={{
              width: '100%', padding: '7px 10px 7px 28px', fontSize: '0.83rem',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-medium)',
              background: 'var(--bg-card)', color: 'var(--text-primary)',
            }}
          />
        </div>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: '0.8rem', color: 'var(--text-secondary)',
        }}>
          hasta
          <input
            type="number" min="0" value={maxPlays}
            onChange={e => { setMaxPlays(e.target.value); setVisibles(60); }}
            placeholder="∞"
            style={{
              width: 62, padding: '6px 8px', fontSize: '0.83rem',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-medium)',
              background: 'var(--bg-card)', color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
            }}
          />
          escuchas
        </label>
        <label style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer',
        }}>
          <input type="checkbox" checked={soloSinCalificar}
            onChange={e => { setSoloSinCalificar(e.target.checked); setVisibles(60); }} />
          solo sin calificar
        </label>
      </div>

      <div style={{
        padding: '8px 11px', background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-sm)', fontSize: '0.76rem',
        color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12,
      }}>
        La mediana de tus Me Gusta son <b>20 escuchas</b>, así que 5 ya es "casi
        nunca". Calificar aquí <b>solo cataloga</b>: se guarda con la fecha en
        que descubriste la canción y no entra a ninguna playlist.
        {sinDatos > 0 && (
          <> <b>{sinDatos}</b> canciones salen con <b>?</b>: no tengo su
          historial, no que no las hayas escuchado. Van al final de la lista.</>
        )}
      </div>

      {lista.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '32px 0' }}>
          Nada con estos filtros.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <button className="btn" onClick={toggleVisibles} style={{ fontSize: '0.8rem' }}>
              {mostradas.every(t => sel.has(t.track_id)) ? 'Desmarcar' : 'Marcar'} visibles
            </button>
            {sel.size > 0 && (
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {sel.size} marcada{sel.size === 1 ? '' : 's'}
              </span>
            )}
            {sel.size > 0 && !confirmando && (
              <button onClick={() => setConfirmando(true)}
                style={{
                  marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 14px', borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${ratingColor('D')}`, background: ratingDim('D'),
                  color: ratingColor('D'), cursor: 'pointer',
                  fontSize: '0.82rem', fontWeight: 600,
                }}>
                <HeartOff size={14} /> Quitar {sel.size} de Me Gusta
              </button>
            )}
          </div>

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
                Gusta en Spotify. Se puede volver a dar like, pero pierdes la fecha original.
                {sel.size > 200 && <> Se procesan las primeras 200.</>}
              </span>
              <button className="btn" onClick={() => setConfirmando(false)} disabled={quitando}>
                Cancelar
              </button>
              <button onClick={quitar} disabled={quitando}
                style={{
                  padding: '7px 14px', borderRadius: 'var(--radius-sm)', border: 'none',
                  background: ratingColor('D'), color: 'var(--on-accent)',
                  cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700,
                }}>
                {quitando ? 'Quitando…' : 'Sí, quitarlas'}
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {mostradas.map((t, i) => {
              const marcada = sel.has(t.track_id);
              return (
                <div key={t.track_id} style={{
                  background: marcada ? ratingDim('D') : 'var(--bg-card)',
                  border: `1px solid ${marcada ? ratingColor('D') : 'var(--border-subtle)'}`,
                  borderRadius: 'var(--radius-md)', padding: '9px 12px',
                  opacity: busy === t.track_id ? 0.5 : 1,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="checkbox" checked={marcada} onChange={() => toggle(t.track_id)}
                      style={{ width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }} />
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: '0.68rem',
                      color: 'var(--text-muted)', minWidth: 26, flexShrink: 0,
                    }}>#{i + 1}</span>
                    {t.image && (
                      <img src={t.image} alt="" style={{
                        width: 38, height: 38, borderRadius: 'var(--radius-sm)',
                        objectFit: 'cover', flexShrink: 0,
                      }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontWeight: 600, fontSize: '0.87rem', color: 'var(--text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{t.name}</div>
                      <div style={{
                        fontSize: '0.76rem', color: 'var(--text-muted)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{t.artist}</div>
                    </div>
                    <button
                      onClick={() => escuchar(i)}
                      disabled={sonando}
                      title={`Escuchar ${LOTE} desde aquí`}
                      style={{
                        background: 'none', border: '1px solid var(--border-subtle)',
                        borderRadius: 6, cursor: 'pointer', color: 'var(--text-muted)',
                        padding: '4px 7px', display: 'flex', flexShrink: 0,
                      }}
                    ><Play size={12} /></button>
                    <div style={{
                      textAlign: 'right', flexShrink: 0, fontSize: '0.7rem',
                      color: 'var(--text-muted)', lineHeight: 1.3, minWidth: 60,
                    }}>
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: '0.95rem', fontWeight: 700,
                        color: t.sin_datos ? 'var(--text-muted)'
                             : (t.plays <= 5 ? ratingColor('D') : 'var(--text-secondary)'),
                      }}>{t.sin_datos ? '?' : t.plays}</div>
                      <div>{t.sin_datos
                        ? 'sin dato'
                        : (t.meses_sin_oir != null ? `${t.meses_sin_oir}m` : '—')}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
                    {RATINGS.map(r => {
                      const activa = t.rating === r;
                      return (
                        <button key={r} disabled={busy === t.track_id}
                          onClick={() => calificar(t, r)}
                          style={{
                            padding: '3px 9px', borderRadius: 7, cursor: 'pointer',
                            border: `1.5px solid ${activa ? ratingColor(r) : 'var(--border-medium)'}`,
                            background: activa ? ratingDim(r) : 'transparent',
                            color: activa ? ratingColor(r) : 'var(--text-muted)',
                            fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700,
                          }}>{r}</button>
                      );
                    })}
                  </div>
                </div>
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
