import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings2, Play, Pause, Zap, RefreshCw, ArrowRightLeft, GripVertical, SunMoon, Headphones, HeartOff } from 'lucide-react';
import { api } from '../utils/api';
import ThemeToggle from '../components/ThemeToggle';
import { ratingColor, ratingDim, ratingSoft } from '../utils/theme';
import { useToast } from '../hooks/useToast';

const RATING_ORDER_MAP = { D: 0, C: 1, 'C+': 2, B: 3, 'B+': 4, A: 5, 'A+': 6 };
const CUATRI_DISPLAY = { perla: 'Perla', miel: 'Miel', latte: 'Latte' };
const REORDER_RATINGS = ['A+', 'A', 'B+', 'B', 'C+', 'C'];

export default function ToolsPage() {
  const navigate = useNavigate();
  const [virtualStatus, setVirtualStatus] = useState(null);
  const [aplusStatus, setAplusStatus] = useState(null);
  const [aplusCandidates, setAplusCandidates] = useState([]);
  const [selectedAplusIds, setSelectedAplusIds] = useState(new Set());
  const [migData, setMigData] = useState(null);
  const [migSort, setMigSort] = useState('rating');
  const [migSelectedIds, setMigSelectedIds] = useState(new Set());
  const [migSearch, setMigSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const toast = useToast();

  // Modo Virtual — fronteras y cambios detectados
  const [virtualBoundaries, setVirtualBoundaries] = useState([]);
  const [simulateChanges, setSimulateChanges] = useState([]);

  // Reordenador
  const [reorderData, setReorderData] = useState(null);   // { cuatri, blocks: {rating: [track]} }
  const [reorderLoading, setReorderLoading] = useState(false);
  const [reorderApplying, setReorderApplying] = useState(false);
  const dragSrc = useRef(null);
  const [dragOver, setDragOver] = useState(null);   // { rating, index }
  const [draggingItem, setDraggingItem] = useState(null); // { rating, index }

  useEffect(() => {
    Promise.all([api.virtualStatus(), api.aplusStatus()])
      .then(([v, ap]) => { setVirtualStatus(v); setAplusStatus(ap); })
      .catch(err => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  const doAction = async (key, fn) => {
    setActionLoading(key);
    try {
      const result = await fn();
      toast(typeof result === 'string' ? result : JSON.stringify(result), 'success', 4000);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setActionLoading('');
    }
  };

  // ─── Reordenador handlers ───────────────────────────────────────────────────

  const loadReorder = async () => {
    setReorderLoading(true);
    try {
      const data = await api.getVirtualPlaylist();
      const blocks = {};
      for (const r of REORDER_RATINGS) blocks[r] = [];
      for (const t of data.tracks) {
        const r = REORDER_RATINGS.includes(t.rating) ? t.rating : 'C';
        blocks[r].push(t);
      }
      setReorderData({ cuatri: data.cuatri, blocks });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setReorderLoading(false);
    }
  };

  const handleDragStart = (e, rating, index) => {
    dragSrc.current = { rating, index };
    setDraggingItem({ rating, index });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, rating, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver({ rating, index });
  };

  const handleDrop = (e, toRating, toIndex) => {
    e.preventDefault();
    setDragOver(null);
    setDraggingItem(null);
    if (!dragSrc.current) return;
    const { rating: fromRating, index: fromIndex } = dragSrc.current;
    dragSrc.current = null;
    if (fromRating === toRating && fromIndex === toIndex) return;

    setReorderData(prev => {
      if (!prev) return prev;
      const blocks = {};
      for (const r of REORDER_RATINGS) blocks[r] = [...prev.blocks[r]];

      const [item] = blocks[fromRating].splice(fromIndex, 1);
      let insertAt = toIndex;
      if (fromRating === toRating && fromIndex < toIndex) insertAt = Math.max(0, toIndex - 1);
      blocks[toRating].splice(insertAt, 0, item);

      return { ...prev, blocks };
    });
  };

  const handleDragEnd = () => {
    dragSrc.current = null;
    setDraggingItem(null);
    setDragOver(null);
  };

  const applyReorder = async () => {
    if (!reorderData) return;
    setReorderApplying(true);
    try {
      const items = [];
      for (const r of REORDER_RATINGS) {
        for (const t of reorderData.blocks[r]) {
          items.push({ tid: t.tid, rating: r, name: t.name, artist: t.artist, album: t.album || '' });
        }
      }
      const res = await api.reorderPlaylist(items);
      toast(
        res.changes_applied > 0
          ? `Playlist actualizada — ${res.changes_applied} calificación(es) cambiada(s)`
          : 'Playlist reordenada (sin cambios de calificación)',
        'success',
        4000,
      );
      setReorderData(null);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setReorderApplying(false);
    }
  };

  // ─── Memos (migración) ──────────────────────────────────────────────────────

  const sortedMigCandidates = useMemo(() => {
    if (!migData?.candidates?.length) return [];
    return [...migData.candidates].sort((a, b) => {
      if (migSort === 'recent') return new Date(b.added_at) - new Date(a.added_at);
      const rd = (RATING_ORDER_MAP[b.rating] ?? -1) - (RATING_ORDER_MAP[a.rating] ?? -1);
      if (rd !== 0) return rd;
      return new Date(b.added_at) - new Date(a.added_at);
    });
  }, [migData, migSort]);

  const filteredMigCandidates = useMemo(() => {
    if (!migSearch.trim()) return sortedMigCandidates;
    const q = migSearch.toLowerCase();
    return sortedMigCandidates.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.artist?.toLowerCase().includes(q) ||
      c.album?.toLowerCase().includes(q)
    );
  }, [sortedMigCandidates, migSearch]);

  const toggleMigAll = () => {
    const visibleIds = filteredMigCandidates.map(c => c.track_id);
    const allVisible = visibleIds.every(id => migSelectedIds.has(id));
    setMigSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisible) {
        visibleIds.forEach(id => next.delete(id));
      } else {
        visibleIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  // ─── Reorder: pending rating changes count ──────────────────────────────────
  const reorderPendingChanges = useMemo(() => {
    if (!reorderData) return 0;
    let count = 0;
    for (const r of REORDER_RATINGS) {
      for (const t of reorderData.blocks[r]) {
        if (t.rating !== r) count++;
      }
    }
    return count;
  }, [reorderData]);

  if (loading) {
    return (
      <div className="page">
        <div className="page-header"><div className="page-title">Herramientas</div></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: 80, borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">Herramientas</div>
      </div>

      {/* -- Califica lo que si escuchas -------------------------------------- */}
      <div className="card fade-in" style={{ padding: '20px', marginBottom: '16px' }}>
        <div style={{
          fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.06em', fontWeight: 600, marginBottom: '12px',
          fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <Headphones size={14} />
          Califica lo que sí escuchas
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.6 }}>
          Dos tercios de tus Me Gusta nunca pasaron por RateApp. Aquí salen
          ordenados por las veces que de verdad los has puesto, según tu historial
          de escuchas. Calificar ahí <strong>solo cataloga</strong>: no mete nada
          a ninguna playlist.
        </p>
        <button className="btn" onClick={() => navigate('/backfill')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <Headphones size={14} /> Abrir la cola
        </button>
      </div>

      {/* -- Limpiar Me Gusta -------------------------------------------------- */}
      <div className="card fade-in" style={{ padding: '20px', marginBottom: '16px' }}>
        <div style={{
          fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.06em', fontWeight: 600, marginBottom: '12px',
          fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <HeartOff size={14} />
          Limpiar Me Gusta
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.6 }}>
          Tus Me Gusta ordenados por lo que de verdad los escuchaste, de menos a
          más. La mediana son 20 escuchas, así que 5 ya es "casi nunca". Tú pones
          el corte; nada se quita sin que lo marques.
        </p>
        <button className="btn" onClick={() => navigate('/abandoned')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <HeartOff size={14} /> Ordenar por escuchas
        </button>
      </div>

      {/* -- Apariencia ------------------------------------------------------ */}
      <div className="card fade-in" style={{ padding: '20px', marginBottom: '16px' }}>
        <div style={{
          fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.06em', fontWeight: 600, marginBottom: '12px',
          fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <SunMoon size={14} />
          Apariencia
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.6 }}>
          "Sistema" sigue la preferencia de tu teléfono o compu y cambia solo.
        </p>
        <ThemeToggle variant="segmented" />
      </div>

      {/* ── Modo Virtual ────────────────────────────────────────────────────── */}
      <div className="card fade-in" style={{ padding: '20px', marginBottom: '16px' }}>
        <div style={{
          fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.06em', fontWeight: 600, marginBottom: '12px',
          fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <Settings2 size={14} />
          Modo Virtual
          {virtualStatus?.active && (
            <span style={{
              background: 'var(--rating-b-plus-dim)', color: 'var(--rating-b-plus)',
              padding: '2px 8px', borderRadius: '20px', fontSize: '0.7rem', fontFamily: 'var(--font-mono)',
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
            <button className="btn btn-accent btn-sm"
              onClick={() => doAction('vstart', async () => {
                const r = await api.virtualStart();
                setVirtualStatus(await api.virtualStatus());
                setVirtualBoundaries(r.boundaries || []);
                setSimulateChanges([]);
                return `Modo Virtual iniciado en ${r.cuatri?.toUpperCase()} — ${r.track_count} canciones.`;
              })}
              disabled={!!actionLoading}>
              <Play size={14} /> Iniciar
            </button>
          ) : (
            <>
              <button className="btn btn-sm"
                onClick={() => doAction('vsim', async () => {
                  const r = await api.virtualSimulate();
                  setVirtualBoundaries(r.boundaries || []);
                  setSimulateChanges(r.changes || []);
                  return r.summary ?? 'Simulación completada.';
                })}
                disabled={!!actionLoading}>
                <Zap size={14} /> Simular
              </button>
              <button className="btn btn-accent btn-sm"
                onClick={() => doAction('vapply', async () => {
                  const r = await api.virtualApply(false);
                  setVirtualStatus(await api.virtualStatus());
                  setSimulateChanges([]);
                  return r.message ?? r.summary ?? `${r.changes_applied ?? 0} cambios aplicados.`;
                })}
                disabled={!!actionLoading}>
                Aplicar cambios
              </button>
              <button className="btn btn-sm"
                onClick={() => doAction('vend', async () => {
                  await api.virtualEnd();
                  setVirtualStatus(await api.virtualStatus());
                  setVirtualBoundaries([]);
                  setSimulateChanges([]);
                  return 'Modo Virtual finalizado.';
                })}
                disabled={!!actionLoading}
                style={{ color: 'var(--rating-d)' }}>
                <Pause size={14} /> Finalizar
              </button>
            </>
          )}
        </div>

        {/* Fronteras */}
        {virtualBoundaries.length > 0 && (
          <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '8px', letterSpacing: '0.05em' }}>
              FRONTERAS
            </div>
            {virtualBoundaries.map((b, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '64px 1fr 1fr', gap: '8px',
                padding: '5px 0',
                borderBottom: i < virtualBoundaries.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                fontSize: '0.78rem',
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-muted)' }}>
                  {b.pair}
                </span>
                <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.upper}
                </span>
                <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.lower}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Cambios detectados */}
        {simulateChanges.length > 0 && (
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '8px', letterSpacing: '0.05em' }}>
              {simulateChanges.length} CAMBIO(S) DETECTADO(S)
            </div>
            {simulateChanges.map((ch, i) => (
              <div key={ch.tid} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '4px 0',
                borderBottom: i < simulateChanges.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                fontSize: '0.8rem',
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: ratingColor(ch.old) ?? 'var(--text-muted)', minWidth: '26px' }}>
                  {ch.old}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>→</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: ratingColor(ch.new) ?? 'var(--text-muted)', minWidth: '26px' }}>
                  {ch.new}
                </span>
                <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ch.name}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', flexShrink: 0 }}>
                  {ch.artist}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Reordenador in-app ───────────────────────────────────────────────── */}
      <div className="card fade-in" style={{ padding: '20px', marginBottom: '16px' }}>
        <div style={{
          fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.06em', fontWeight: 600, marginBottom: '12px',
          fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <GripVertical size={14} />
          Reordenador
        </div>

        {reorderData === null ? (
          <>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.6 }}>
              Arrastra canciones dentro de la app para reordenar la playlist actual.
              Cruzar la frontera entre bloques cambia la calificación automáticamente.
            </p>
            <button
              className="btn btn-sm"
              onClick={loadReorder}
              disabled={reorderLoading || !!actionLoading}>
              {reorderLoading ? 'Cargando…' : 'Cargar playlist actual'}
            </button>
          </>
        ) : (
          <>
            <div style={{
              fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
              marginBottom: '12px',
            }}>
              {CUATRI_DISPLAY[reorderData.cuatri] ?? reorderData.cuatri?.toUpperCase()}
              {reorderPendingChanges > 0 && (
                <span style={{
                  marginLeft: '10px', background: 'var(--rating-b-plus-dim)',
                  color: 'var(--rating-b-plus)', padding: '2px 8px', borderRadius: '12px',
                }}>
                  {reorderPendingChanges} calificación(es) por cambiar
                </span>
              )}
            </div>

            {/* Bloques de rating */}
            <div style={{ maxHeight: '520px', overflowY: 'auto', marginBottom: '12px' }}>
              {REORDER_RATINGS.map(rating => {
                const block = reorderData.blocks[rating] ?? [];
                return (
                  <div key={rating} style={{ marginBottom: '6px' }}>
                    {/* Block header — también es drop zone para el bloque vacío */}
                    <div
                      onDragOver={(e) => handleDragOver(e, rating, 0)}
                      onDrop={(e) => handleDrop(e, rating, 0)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '4px 8px',
                        background: ratingDim(rating),
                        borderRadius: '6px 6px 0 0',
                        borderLeft: `3px solid ${ratingColor(rating)}`,
                        borderTop: dragOver?.rating === rating && dragOver?.index === 0 && block.length === 0
                          ? `2px solid var(--accent)` : '2px solid transparent',
                      }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.75rem',
                        color: ratingColor(rating), minWidth: '28px',
                      }}>
                        {rating}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        {block.length} {block.length === 1 ? 'canción' : 'canciones'}
                      </span>
                    </div>

                    {/* Track list */}
                    <div style={{
                      background: 'var(--bg-surface)',
                      borderRadius: '0 0 6px 6px',
                      borderLeft: `3px solid ${ratingSoft(rating)}`,
                    }}>
                      {block.length === 0 ? (
                        <div
                          onDragOver={(e) => handleDragOver(e, rating, 0)}
                          onDrop={(e) => handleDrop(e, rating, 0)}
                          style={{
                            padding: '8px 10px',
                            fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic',
                            textAlign: 'center',
                            borderTop: dragOver?.rating === rating ? '2px solid var(--accent)' : '2px solid transparent',
                          }}>
                          Arrastra aquí para {rating}
                        </div>
                      ) : (
                        block.map((t, index) => {
                          const isDragTarget = dragOver?.rating === rating && dragOver?.index === index;
                          const isBeingDragged = draggingItem?.rating === rating && draggingItem?.index === index;
                          return (
                            <div
                              key={t.tid}
                              draggable
                              onDragStart={(e) => handleDragStart(e, rating, index)}
                              onDragOver={(e) => handleDragOver(e, rating, index)}
                              onDrop={(e) => handleDrop(e, rating, index)}
                              onDragEnd={handleDragEnd}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                padding: '6px 10px',
                                cursor: 'grab',
                                opacity: isBeingDragged ? 0.35 : 1,
                                borderTop: isDragTarget ? '2px solid var(--accent)' : '2px solid transparent',
                                transition: 'opacity 0.1s',
                                borderBottom: index < block.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                                userSelect: 'none',
                              }}>
                              <GripVertical size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                              {/* Muestra si la calificación cambió */}
                              {t.rating !== rating && (
                                <span style={{
                                  fontFamily: 'var(--font-mono)', fontSize: '0.65rem',
                                  color: ratingColor(t.rating) ?? 'var(--text-muted)',
                                  textDecoration: 'line-through', flexShrink: 0,
                                }}>
                                  {t.rating}
                                </span>
                              )}
                              {t.image ? (
                                <img src={t.image} alt="" style={{ width: '28px', height: '28px', borderRadius: '3px', flexShrink: 0, objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '28px', height: '28px', borderRadius: '3px', background: 'var(--bg-deep)', flexShrink: 0 }} />
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {t.name}
                                </div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {t.artist}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                      {/* Drop zone al final del bloque */}
                      {block.length > 0 && (
                        <div
                          onDragOver={(e) => handleDragOver(e, rating, block.length)}
                          onDrop={(e) => handleDrop(e, rating, block.length)}
                          style={{
                            height: '10px',
                            borderTop: dragOver?.rating === rating && dragOver?.index === block.length
                              ? '2px solid var(--accent)' : '2px solid transparent',
                          }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Acciones */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className="btn btn-accent btn-sm"
                onClick={applyReorder}
                disabled={reorderApplying}>
                {reorderApplying ? 'Aplicando…' : reorderPendingChanges > 0
                  ? `Aplicar (${reorderPendingChanges} cambio(s))`
                  : 'Aplicar orden'}
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setReorderData(null)}
                disabled={reorderApplying}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── A+ Instantáneos ─────────────────────────────────────────────────── */}
      <div className="card fade-in" style={{ padding: '20px', marginBottom: '16px' }}>
        <div style={{
          fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.06em', fontWeight: 600, marginBottom: '12px',
          fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <span style={{ color: 'var(--rating-a-plus)', fontSize: '14px' }}>★</span>
          A+ Instantáneos
          {aplusStatus?.active && (
            <span style={{
              background: 'var(--rating-a-plus-dim)', color: 'var(--rating-a-plus)',
              padding: '2px 8px', borderRadius: '20px', fontSize: '0.7rem', fontFamily: 'var(--font-mono)',
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
            background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
            padding: '10px', marginBottom: '12px', maxHeight: '220px', overflowY: 'auto',
          }}>
            <div style={{
              fontSize: '0.75rem', color: 'var(--rating-a-plus)', fontWeight: 600,
              marginBottom: '6px', fontFamily: 'var(--font-mono)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>{aplusCandidates.length} candidatos detectados</span>
              <button
                style={{ background: 'none', border: 'none', fontSize: '0.7rem', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-mono)' }}
                onClick={() => {
                  if (selectedAplusIds.size === aplusCandidates.length) {
                    setSelectedAplusIds(new Set());
                  } else {
                    setSelectedAplusIds(new Set(aplusCandidates.map(c => c.id)));
                  }
                }}>
                {selectedAplusIds.size === aplusCandidates.length ? 'Desmarcar todo' : 'Marcar todo'}
              </button>
            </div>
            {aplusCandidates.map((c, i) => (
              <label key={c.id || i} style={{
                display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem',
                color: selectedAplusIds.has(c.id) ? 'var(--text-primary)' : 'var(--text-muted)',
                padding: '5px 0',
                borderBottom: i < aplusCandidates.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                cursor: 'pointer', userSelect: 'none',
              }}>
                <input type="checkbox"
                  checked={selectedAplusIds.has(c.id)}
                  onChange={() => {
                    setSelectedAplusIds(prev => {
                      const next = new Set(prev);
                      if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                      return next;
                    });
                  }}
                  style={{ accentColor: 'var(--rating-a-plus)', width: '14px', height: '14px' }}
                />
                {c.name} <span style={{ color: 'var(--text-muted)' }}>— {c.artist}</span>
              </label>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-sm"
            style={{ borderColor: 'var(--rating-a-plus)', color: 'var(--rating-a-plus)' }}
            onClick={() => doAction('aplus-scan', async () => {
              const res = await api.aplusScan();
              if (res.candidates?.length > 0) {
                setAplusCandidates(res.candidates);
                setSelectedAplusIds(new Set(res.candidates.map(c => c.id)));
              }
              setAplusStatus(await api.aplusStatus());
              return res.message;
            })}
            disabled={!!actionLoading}>
            Escanear nuevos likes
          </button>
          {aplusCandidates.length > 0 && (
            <button
              className="btn btn-sm"
              style={{ background: 'var(--rating-a-plus-dim)', borderColor: 'var(--rating-a-plus)', color: 'var(--rating-a-plus)' }}
              onClick={() => doAction('aplus-apply', async () => {
                const res = await api.aplusApply(Array.from(selectedAplusIds));
                setAplusCandidates([]);
                setSelectedAplusIds(new Set());
                setAplusStatus(await api.aplusStatus());
                return res.message;
              })}
              disabled={!!actionLoading || selectedAplusIds.size === 0}>
              Aplicar {selectedAplusIds.size} como A+
            </button>
          )}
        </div>
      </div>

      {/* ── Migración ────────────────────────────────────────────────────────── */}
      <div className="card fade-in" style={{ padding: '20px', marginBottom: '16px' }}>
        <div style={{
          fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.06em', fontWeight: 600, marginBottom: '12px',
          fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <ArrowRightLeft size={14} />
          Migración
        </div>

        {migData === null ? (
          <>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.6 }}>
              Mueve canciones del cuatrimestre anterior al actual conservando su fecha y calificación original.
            </p>
            <button
              className="btn btn-sm"
              onClick={() => doAction('mig-scan', async () => {
                const data = await api.getMigrationCandidates();
                if (!data.from_cuatri) {
                  return 'No hay migración disponible para este cuatrimestre.';
                }
                setMigData(data);
                setMigSelectedIds(new Set());
                return data.candidates.length > 0
                  ? `${data.candidates.length} canciones de ${CUATRI_DISPLAY[data.from_cuatri]} disponibles.`
                  : `No hay canciones en ${CUATRI_DISPLAY[data.from_cuatri]} para migrar.`;
              })}
              disabled={!!actionLoading}>
              Buscar candidatos
            </button>
          </>
        ) : migData.candidates.length === 0 ? (
          <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              No hay canciones en {CUATRI_DISPLAY[migData.from_cuatri] ?? migData.from_cuatri} para migrar.
            </p>
            <button className="btn btn-sm" onClick={() => setMigData(null)}>Volver</button>
          </div>
        ) : (
          <>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '10px', flexWrap: 'wrap', gap: '8px',
            }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {CUATRI_DISPLAY[migData.from_cuatri]} → {CUATRI_DISPLAY[migData.to_cuatri]}
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {['rating', 'recent'].map(s => (
                  <button key={s}
                    style={{
                      padding: '3px 10px', borderRadius: '12px', border: '1px solid',
                      fontSize: '0.72rem', fontFamily: 'var(--font-mono)', cursor: 'pointer',
                      background: 'transparent',
                      borderColor: migSort === s ? 'var(--accent)' : 'var(--border-subtle)',
                      color: migSort === s ? 'var(--accent)' : 'var(--text-muted)',
                    }}
                    onClick={() => setMigSort(s)}>
                    {s === 'rating' ? 'Calificación' : 'Recientes'}
                  </button>
                ))}
              </div>
            </div>

            <input
              type="text"
              placeholder="Buscar por canción, artista o álbum…"
              value={migSearch}
              onChange={e => setMigSearch(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '7px 12px', marginBottom: '8px',
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
                fontSize: '0.83rem', outline: 'none',
              }}
            />

            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '8px',
            }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {migSelectedIds.size} / {migData.candidates.length} seleccionadas
                {migSearch.trim() && ` · mostrando ${filteredMigCandidates.length}`}
              </span>
              <button className="btn btn-sm" style={{ fontSize: '0.72rem', padding: '3px 12px' }}
                onClick={toggleMigAll}>
                {filteredMigCandidates.every(c => migSelectedIds.has(c.track_id)) ? 'Desmarcar visibles' : 'Marcar visibles'}
              </button>
            </div>

            <div style={{
              background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)',
              padding: '6px 10px', marginBottom: '12px', maxHeight: '320px', overflowY: 'auto',
            }}>
              {filteredMigCandidates.map((c, i) => (
                <label key={c.track_id} style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '6px 0',
                  borderBottom: i < filteredMigCandidates.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  cursor: 'pointer', userSelect: 'none',
                  opacity: migSelectedIds.has(c.track_id) ? 1 : 0.45,
                  transition: 'opacity 0.15s',
                }}>
                  <input type="checkbox"
                    checked={migSelectedIds.has(c.track_id)}
                    onChange={() => {
                      setMigSelectedIds(prev => {
                        const next = new Set(prev);
                        if (next.has(c.track_id)) next.delete(c.track_id); else next.add(c.track_id);
                        return next;
                      });
                    }}
                    style={{ width: '14px', height: '14px', flexShrink: 0 }}
                  />
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700,
                    color: ratingColor(c.rating) ?? 'var(--text-muted)',
                    minWidth: '26px', flexShrink: 0,
                  }}>
                    {c.rating}
                  </span>
                  {c.image ? (
                    <img src={c.image} alt="" style={{ width: '34px', height: '34px', borderRadius: '4px', flexShrink: 0, objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '34px', height: '34px', borderRadius: '4px', background: 'var(--bg-deep)', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.album}
                    </div>
                  </div>
                  <span style={{
                    fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0,
                    maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap', textAlign: 'right',
                  }}>
                    {c.artist}
                  </span>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className="btn btn-accent btn-sm"
                disabled={!!actionLoading || migSelectedIds.size === 0}
                onClick={() => doAction('migrate', async () => {
                  const res = await api.migrateTracks(
                    Array.from(migSelectedIds),
                    migData.to_cuatri
                  );
                  setMigData(null);
                  setMigSelectedIds(new Set());
                  setMigSearch('');
                  return res.message;
                })}>
                Mover {migSelectedIds.size > 0 ? migSelectedIds.size : ''} a {CUATRI_DISPLAY[migData.to_cuatri]}
              </button>
              <button
                className="btn btn-sm"
                onClick={() => { setMigData(null); setMigSelectedIds(new Set()); setMigSearch(''); }}
                disabled={!!actionLoading}>
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Orden de playlists ───────────────────────────────────────────────── */}
      <div className="card fade-in" style={{ padding: '20px' }}>
        <div style={{
          fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.06em', fontWeight: 600, marginBottom: '12px',
          fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <RefreshCw size={14} /> Orden de playlists
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['perla', 'miel', 'latte'].map(c => (
            <button key={c}
              className="btn btn-sm btn-spotify"
              onClick={() => doAction(`order-${c}`, async () => {
                const dist = await api.getDistribution();
                await api.orderPlaylist(dist[c], 1);
                return `${CUATRI_DISPLAY[c]} ordenada`;
              })}
              disabled={!!actionLoading}>
              Ordenar {CUATRI_DISPLAY[c]}
            </button>
          ))}
          <button
            className="btn btn-sm btn-spotify"
            onClick={() => doAction('order-anual', async () => {
              const dist = await api.getDistribution();
              await api.orderPlaylist(dist.anual, 4);
              return 'Galería Anual ordenada';
            })}
            disabled={!!actionLoading}>
            Ordenar Galería Anual
          </button>
        </div>

        <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: '8px' }}>
            RECONSTRUIR DESDE DB — recupera tracks faltantes usando solo el año actual del periodo
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {['perla', 'miel', 'latte'].map(c => (
              <button key={c}
                className="btn btn-sm"
                style={{ color: 'var(--rating-a)' }}
                onClick={() => doAction(`rebuild-${c}`, async () => {
                  const res = await api.rebuildPlaylist(c);
                  return res.message;
                })}
                disabled={!!actionLoading}>
                Reconstruir {CUATRI_DISPLAY[c]}
              </button>
            ))}
            <button
              className="btn btn-sm"
              style={{ color: 'var(--rating-a-plus)' }}
              onClick={() => doAction('rebuild-anual', async () => {
                const res = await api.rebuildAnual();
                return res.message;
              })}
              disabled={!!actionLoading}>
              Reconstruir Galería
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
