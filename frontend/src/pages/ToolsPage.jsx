import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings2, Play, Pause, Zap, RefreshCw, ArrowRightLeft, GripVertical, SunMoon, Headphones, HeartOff, TrendingUp } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import { ratingColor, ratingDim, ratingSoft } from '../utils/theme';
import { nombreCuatri } from '../utils/cuatrimestres';
import { useHerramientas, REORDER_RATINGS } from '../hooks/useHerramientas';

// El nombre visible ya no se arma capitalizando el identificador (eso decia
// "Perla" aunque el cuatrimestre se llamara Savia): sale de nombreCuatri, que
// lee lo que mando el backend.
//
// La logica vive en hooks/useHerramientas.js desde la fase 6 del rediseño
// (2026-09-25); esta vista es la del movil y la de ventanas angostas.

export default function ToolsPage() {
  const navigate = useNavigate();
  const {
    loading, actionLoading,
    virtualStatus, virtualBoundaries, simulateChanges,
    virtualIniciar, virtualSimular, virtualAplicar, virtualFinalizar,
    reorderData, setReorderData, reorderLoading, reorderApplying, reorderPendingChanges,
    loadReorder, moverEnReorder, applyReorder,
    aplusStatus, aplusCandidates, selectedAplusIds,
    aplusEscanear, aplusAplicar, aplusAlternar, aplusAlternarTodo,
    migData, migSort, setMigSort, migSearch, setMigSearch, migSelectedIds,
    filteredMigCandidates, migTodasVisibles,
    toggleMigAll, migAlternar, migBuscar, migMover, migCancelar,
    ordenar, ordenarAnual, reconstruir, reconstruirAnual,
  } = useHerramientas();

  // Arrastre del Reordenador (solo pantalla)
  const dragSrc = useRef(null);
  const [dragOver, setDragOver] = useState(null);   // { rating, index }
  const [draggingItem, setDraggingItem] = useState(null); // { rating, index }

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
    const desde = dragSrc.current;
    dragSrc.current = null;
    moverEnReorder(desde, { rating: toRating, index: toIndex });
  };

  const handleDragEnd = () => {
    dragSrc.current = null;
    setDraggingItem(null);
    setDragOver(null);
  };

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

      {/* -- Mis mas escuchadas por ventana ----------------------------------- */}
      <div className="card fade-in" style={{ padding: '20px', marginBottom: '16px' }}>
        <div style={{
          fontSize: '0.78rem', color: 'var(--text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.06em', fontWeight: 600, marginBottom: '12px',
          fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <TrendingUp size={14} />
          Mis más escuchadas
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.6 }}>
          Lo que de verdad traes sonando, por periodo: últimos 30 días, 90 días,
          un año o todo tu historial. Sale de tus 118 mil reproducciones reales,
          no del total de siempre — una canción que amabas en 2021 y pusiste una
          vez ayer ya no se cuela como novedad. Puedes armar la playlist de ese
          periodo y calificar desde ahí; calificar <strong>solo cataloga</strong>.
        </p>
        <button className="btn" onClick={() => navigate('/window')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <TrendingUp size={14} /> Ver por periodo
        </button>
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
              onClick={virtualIniciar}
              disabled={!!actionLoading}>
              <Play size={14} /> Iniciar
            </button>
          ) : (
            <>
              <button className="btn btn-sm"
                onClick={virtualSimular}
                disabled={!!actionLoading}>
                <Zap size={14} /> Simular
              </button>
              <button className="btn btn-accent btn-sm"
                onClick={virtualAplicar}
                disabled={!!actionLoading}>
                Aplicar cambios
              </button>
              <button className="btn btn-sm"
                onClick={virtualFinalizar}
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
              {nombreCuatri(reorderData.cuatri) ?? reorderData.cuatri?.toUpperCase()}
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
                onClick={aplusAlternarTodo}>
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
                  onChange={() => aplusAlternar(c.id)}
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
            onClick={aplusEscanear}
            disabled={!!actionLoading}>
            Escanear nuevos likes
          </button>
          {aplusCandidates.length > 0 && (
            <button
              className="btn btn-sm"
              style={{ background: 'var(--rating-a-plus-dim)', borderColor: 'var(--rating-a-plus)', color: 'var(--rating-a-plus)' }}
              onClick={aplusAplicar}
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
              onClick={migBuscar}
              disabled={!!actionLoading}>
              Buscar candidatos
            </button>
          </>
        ) : migData.candidates.length === 0 ? (
          <div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              No hay canciones en {nombreCuatri(migData.from_cuatri) ?? migData.from_cuatri} para migrar.
            </p>
            <button className="btn btn-sm" onClick={migCancelar}>Volver</button>
          </div>
        ) : (
          <>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '10px', flexWrap: 'wrap', gap: '8px',
            }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {nombreCuatri(migData.from_cuatri)} → {nombreCuatri(migData.to_cuatri)}
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {['playlist', 'rating', 'recent'].map(s => (
                  <button key={s}
                    style={{
                      padding: '3px 10px', borderRadius: '12px', border: '1px solid',
                      fontSize: '0.72rem', fontFamily: 'var(--font-mono)', cursor: 'pointer',
                      background: 'transparent',
                      borderColor: migSort === s ? 'var(--accent)' : 'var(--border-subtle)',
                      color: migSort === s ? 'var(--accent)' : 'var(--text-muted)',
                    }}
                    onClick={() => setMigSort(s)}>
                    {s === 'playlist' ? 'Playlist' : s === 'rating' ? 'Calificación' : 'Recientes'}
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
                {migSelectedIds.size} / {migData.migrables ?? migData.candidates.length} seleccionadas
                {(migData.ya_migradas > 0) && ` · ${migData.ya_migradas} ya en ${nombreCuatri(migData.to_cuatri)}`}
                {migSearch.trim() && ` · mostrando ${filteredMigCandidates.length}`}
              </span>
              <button className="btn btn-sm" style={{ fontSize: '0.72rem', padding: '3px 12px' }}
                onClick={toggleMigAll}>
                {migTodasVisibles ? 'Desmarcar visibles' : 'Marcar visibles'}
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
                  cursor: c.migrated ? 'default' : 'pointer', userSelect: 'none',
                  opacity: c.migrated ? 0.5 : (migSelectedIds.has(c.track_id) ? 1 : 0.45),
                  transition: 'opacity 0.15s',
                }}>
                  <input type="checkbox"
                    checked={c.migrated || migSelectedIds.has(c.track_id)}
                    disabled={!!c.migrated}
                    onChange={() => migAlternar(c)}
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
                      {c.migrated && (
                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', marginRight: '6px' }}>
                          ya en {nombreCuatri(migData.to_cuatri)}
                        </span>
                      )}
                      {c.en_playlist === false && (
                        <span style={{ fontFamily: 'var(--font-mono)', marginRight: '6px' }}>
                          fuera de la playlist
                        </span>
                      )}
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
                onClick={migMover}>
                Mover {migSelectedIds.size > 0 ? migSelectedIds.size : ''} a {nombreCuatri(migData.to_cuatri)}
              </button>
              <button
                className="btn btn-sm"
                onClick={migCancelar}
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
              onClick={() => ordenar(c)}
              disabled={!!actionLoading}>
              Ordenar {nombreCuatri(c)}
            </button>
          ))}
          <button
            className="btn btn-sm btn-spotify"
            onClick={ordenarAnual}
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
                onClick={() => reconstruir(c)}
                disabled={!!actionLoading}>
                Reconstruir {nombreCuatri(c)}
              </button>
            ))}
            <button
              className="btn btn-sm"
              style={{ color: 'var(--rating-a-plus)' }}
              onClick={reconstruirAnual}
              disabled={!!actionLoading}>
              Reconstruir Galería
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
