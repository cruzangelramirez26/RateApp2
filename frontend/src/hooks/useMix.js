import { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/api';
import { useToast } from './useToast';

/**
 * El mix entre dos personas (Mejoras.txt §7), sin nada de pantalla. Lo usan
 * las dos tarjetas de Herramientas (escritorio y móvil) a través de MixPanel.
 */

// "502: {"detail":"..."}" -> "..."
function limpio(err) {
  const m = /^\d+: (.*)$/s.exec(err?.message || '');
  if (!m) return err?.message || 'Algo falló';
  try { return JSON.parse(m[1]).detail || m[1]; } catch { return m[1]; }
}

export function useMix() {
  const toast = useToast();
  const [estado, setEstado] = useState(null);
  const [ocupado, setOcupado] = useState('');

  const cargar = useCallback(() => api.mixEstado().then(setEstado).catch((e) => toast(limpio(e), 'error')), [toast]);
  useEffect(() => { cargar(); }, [cargar]);

  const hacer = async (clave, fn) => {
    setOcupado(clave);
    try { return await fn(); } catch (e) { toast(limpio(e), 'error'); return null; } finally { setOcupado(''); }
  };

  const invitar = () => hacer('invitar', async () => {
    await api.mixInvitacion();
    await cargar();
  });

  const compartir = async (url) => {
    // En el celular, la hoja de compartir del sistema (WhatsApp, etc.); si no
    // hay, al portapapeles.
    if (navigator.share) {
      try { await navigator.share({ title: 'Mix en RateApp', text: 'Conéctate con tu Spotify para armar nuestro mix:', url }); return; }
      catch (e) { if (e?.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); toast('Link copiado', 'success'); }
    catch { toast('No se pudo copiar: selecciónalo a mano', 'error'); }
  };

  const rehacer = (pid) => hacer(`rehacer-${pid}`, async () => {
    const r = await api.mixRehacer(pid);
    const res = r.resultados?.[0];
    if (res && !res.ok) throw new Error(res.error);
    toast(`Mix listo: ${res?.mix?.total ?? 0} canciones`, 'success');
    await cargar();
  });

  const reproducir = (pid) => hacer(`play-${pid}`, async () => {
    const r = await api.mixReproducir(pid);
    if (!r.playing) toast(r.error || 'No se pudo reproducir', 'error', 5000);
    return r;
  });

  const desconectar = (pid, nombre) => {
    if (!window.confirm(`¿Desconectar a ${nombre}? Se borra su conexión; la playlist se queda en tu Spotify.`)) return null;
    return hacer(`fuera-${pid}`, async () => { await api.mixDesconectar(pid); await cargar(); });
  };

  return { estado, ocupado, cargar, invitar, compartir, rehacer, reproducir, desconectar };
}
