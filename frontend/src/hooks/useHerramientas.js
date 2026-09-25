import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api';
import { nombreCuatri } from '../utils/cuatrimestres';
import { useToast } from './useToast';

/**
 * La lógica de Herramientas (Modo virtual, Reordenador, A+ instantáneos,
 * Migración y Orden de playlists), sin nada de pantalla.
 *
 * La usan las dos vistas: la de siempre (ToolsPage, el móvil y las ventanas
 * angostas) y la de escritorio (components/escritorio/Herramientas.jsx). Salió
 * de ToolsPage en la fase 6 del rediseño (2026-09-25) tal cual estaba: mismas
 * llamadas y mismos mensajes.
 *
 * Cada acción pasa por `doAction`, que marca `actionLoading` con su clave (así
 * no se disparan dos a la vez) y enseña el resultado en un toast.
 */
export const RATING_ORDER_MAP = { D: 0, C: 1, 'C+': 2, B: 3, 'B+': 4, A: 5, 'A+': 6 };
export const REORDER_RATINGS = ['A+', 'A', 'B+', 'B', 'C+', 'C'];

function alternar(set, id) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

export function useHerramientas() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [virtualStatus, setVirtualStatus] = useState(null);
  const [aplusStatus, setAplusStatus] = useState(null);

  // Modo virtual — fronteras y cambios detectados
  const [virtualBoundaries, setVirtualBoundaries] = useState([]);
  const [simulateChanges, setSimulateChanges] = useState([]);

  // Reordenador: { cuatri, blocks: {rating: [track]} }
  const [reorderData, setReorderData] = useState(null);
  const [reorderLoading, setReorderLoading] = useState(false);
  const [reorderApplying, setReorderApplying] = useState(false);

  // A+ instantáneos
  const [aplusCandidates, setAplusCandidates] = useState([]);
  const [selectedAplusIds, setSelectedAplusIds] = useState(new Set());

  // Migración
  const [migData, setMigData] = useState(null);
  const [migSort, setMigSort] = useState('playlist');
  const [migSelectedIds, setMigSelectedIds] = useState(new Set());
  const [migSearch, setMigSearch] = useState('');

  useEffect(() => {
    Promise.all([api.virtualStatus(), api.aplusStatus()])
      .then(([v, ap]) => { setVirtualStatus(v); setAplusStatus(ap); })
      .catch(err => toast(err.message, 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  const doAction = useCallback(async (key, fn) => {
    setActionLoading(key);
    try {
      const result = await fn();
      toast(typeof result === 'string' ? result : JSON.stringify(result), 'success', 4000);
      return true;
    } catch (err) {
      toast(err.message, 'error');
      return false;
    } finally {
      setActionLoading('');
    }
  }, [toast]);

  // ─── Modo virtual ─────────────────────────────────────────────────────────

  const virtualIniciar = () => doAction('vstart', async () => {
    const r = await api.virtualStart();
    setVirtualStatus(await api.virtualStatus());
    setVirtualBoundaries(r.boundaries || []);
    setSimulateChanges([]);
    return `Modo Virtual iniciado en ${r.cuatri?.toUpperCase()} — ${r.track_count} canciones.`;
  });

  const virtualSimular = () => doAction('vsim', async () => {
    const r = await api.virtualSimulate();
    setVirtualBoundaries(r.boundaries || []);
    setSimulateChanges(r.changes || []);
    return r.summary ?? 'Simulación completada.';
  });

  const virtualAplicar = () => doAction('vapply', async () => {
    const r = await api.virtualApply(false);
    setVirtualStatus(await api.virtualStatus());
    setSimulateChanges([]);
    return r.message ?? r.summary ?? `${r.changes_applied ?? 0} cambios aplicados.`;
  });

  const virtualFinalizar = () => doAction('vend', async () => {
    await api.virtualEnd();
    setVirtualStatus(await api.virtualStatus());
    setVirtualBoundaries([]);
    setSimulateChanges([]);
    return 'Modo Virtual finalizado.';
  });

  // ─── Reordenador ──────────────────────────────────────────────────────────

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

  /** Mueve una canción de {rating, index} a {rating, index}. */
  const moverEnReorder = (desde, hasta) => {
    const { rating: fromRating, index: fromIndex } = desde;
    const { rating: toRating, index: toIndex } = hasta;
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

  const applyReorder = async () => {
    if (!reorderData) return false;
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
      return true;
    } catch (err) {
      toast(err.message, 'error');
      return false;
    } finally {
      setReorderApplying(false);
    }
  };

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

  // ─── A+ instantáneos ──────────────────────────────────────────────────────

  const aplusEscanear = () => doAction('aplus-scan', async () => {
    const res = await api.aplusScan();
    if (res.candidates?.length > 0) {
      setAplusCandidates(res.candidates);
      setSelectedAplusIds(new Set(res.candidates.map(c => c.id)));
    }
    setAplusStatus(await api.aplusStatus());
    return res.message;
  });

  const aplusAplicar = () => doAction('aplus-apply', async () => {
    const res = await api.aplusApply(Array.from(selectedAplusIds));
    setAplusCandidates([]);
    setSelectedAplusIds(new Set());
    setAplusStatus(await api.aplusStatus());
    return res.message;
  });

  const aplusAlternar = (id) => setSelectedAplusIds(prev => alternar(prev, id));

  const aplusAlternarTodo = () => {
    if (selectedAplusIds.size === aplusCandidates.length) setSelectedAplusIds(new Set());
    else setSelectedAplusIds(new Set(aplusCandidates.map(c => c.id)));
  };

  // ─── Migración ────────────────────────────────────────────────────────────

  const sortedMigCandidates = useMemo(() => {
    if (!migData?.candidates?.length) return [];
    // 'playlist' = el orden que ya trae el backend, que son las posiciones
    // reales en Spotify. Ordenar aqui por rating+fecha era el criterio de mayo
    // y dejo de replicar la playlist el 2026-08-21, cuando el orden real gano
    // el bloque de novedades.
    if (migSort === 'playlist') return migData.candidates;
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

  // Las ya migradas se ensenan pero no se tocan.
  const migMigrables = useMemo(
    () => filteredMigCandidates.filter(c => !c.migrated),
    [filteredMigCandidates],
  );

  const migTodasVisibles = migMigrables.length > 0 && migMigrables.every(c => migSelectedIds.has(c.track_id));

  const toggleMigAll = () => {
    const visibleIds = migMigrables.map(c => c.track_id);
    setMigSelectedIds(prev => {
      const next = new Set(prev);
      if (migTodasVisibles) visibleIds.forEach(id => next.delete(id));
      else visibleIds.forEach(id => next.add(id));
      return next;
    });
  };

  const migAlternar = (c) => {
    if (c.migrated) return;
    setMigSelectedIds(prev => alternar(prev, c.track_id));
  };

  const migBuscar = () => doAction('mig-scan', async () => {
    const data = await api.getMigrationCandidates();
    if (!data.from_cuatri) {
      return 'No hay migración disponible para este cuatrimestre.';
    }
    setMigData(data);
    setMigSelectedIds(new Set());
    const migrables = data.migrables ?? data.candidates.length;
    const ya = data.ya_migradas ?? 0;
    if (data.candidates.length === 0) {
      return `No hay canciones en ${nombreCuatri(data.from_cuatri)} para migrar.`;
    }
    return `${migrables} por migrar de ${nombreCuatri(data.from_cuatri)}` +
      (ya > 0 ? ` · ${ya} ya en ${nombreCuatri(data.to_cuatri)}.` : '.');
  });

  const migCancelar = () => { setMigData(null); setMigSelectedIds(new Set()); setMigSearch(''); };

  const migMover = () => doAction('migrate', async () => {
    const res = await api.migrateTracks(Array.from(migSelectedIds), migData.to_cuatri);
    migCancelar();
    return res.message;
  });

  // ─── Orden de playlists ───────────────────────────────────────────────────

  const ordenar = (c) => doAction(`order-${c}`, async () => {
    const dist = await api.getDistribution();
    await api.orderPlaylist(dist[c], 1);
    return `${nombreCuatri(c)} ordenada`;
  });

  const ordenarAnual = () => doAction('order-anual', async () => {
    const dist = await api.getDistribution();
    await api.orderPlaylist(dist.anual, 4);
    return 'Galería Anual ordenada';
  });

  const reconstruir = (c) => doAction(`rebuild-${c}`, async () => {
    const res = await api.rebuildPlaylist(c);
    return res.message;
  });

  const reconstruirAnual = () => doAction('rebuild-anual', async () => {
    const res = await api.rebuildAnual();
    return res.message;
  });

  return {
    loading, actionLoading,
    virtualStatus, virtualBoundaries, simulateChanges,
    virtualIniciar, virtualSimular, virtualAplicar, virtualFinalizar,
    reorderData, setReorderData, reorderLoading, reorderApplying, reorderPendingChanges,
    loadReorder, moverEnReorder, applyReorder,
    aplusStatus, aplusCandidates, selectedAplusIds,
    aplusEscanear, aplusAplicar, aplusAlternar, aplusAlternarTodo,
    migData, migSort, setMigSort, migSearch, setMigSearch, migSelectedIds,
    filteredMigCandidates, migMigrables, migTodasVisibles,
    toggleMigAll, migAlternar, migBuscar, migMover, migCancelar,
    ordenar, ordenarAnual, reconstruir, reconstruirAnual,
  };
}
