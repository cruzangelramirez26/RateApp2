import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../utils/api';
import { useToast } from '../../hooks/useToast';
import { alternarReproductor, suscribirReproductor, modoParaRuta, escucharCalificadas } from '../../utils/reproductor';
import { FondoProvider } from './FondoPortada';
import BarraSuperior from './BarraSuperior';
import Riel from './Riel';
import '../../styles/escritorio.css';

/**
 * El armazón del diseño de escritorio (fase 1 del rediseño, 2026-09-24):
 * fondo de portada difuminada, barra de arriba con buscador, riel a la
 * izquierda y el contenido en medio. Reemplaza a NavBar + .app-layout cuando
 * useEscritorio() dice que sí; en el móvil no se monta nunca.
 *
 * Mientras vive, pone la clase `escritorio` en <html>. De ahí cuelgan los
 * tokens oscuros de styles/escritorio.css, que también visten a las pantallas
 * viejas hasta que cada una tenga su versión de escritorio. El escritorio es
 * solo oscuro (decisión de Angel): esos tokens le ganan al tema claro.
 */
const POLL_MS = 5000;

function iniciales(nombre) {
  return (nombre || '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export default function Shell({ usuario, children }) {
  const { pathname } = useLocation();
  const toast = useToast();
  const [portada, setPortada] = useState(null);
  const [sinCalificar, setSinCalificar] = useState(() => new Set());
  const [reproductorAbierto, setReproductorAbierto] = useState(false);

  useEffect(() => {
    const raiz = document.documentElement;
    raiz.classList.add('escritorio');
    return () => raiz.classList.remove('escritorio');
  }, []);

  // El fondo por defecto es la portada de lo que suena. Si Spotify deja de
  // reportar se queda la última (misma regla que el widget de siempre).
  useEffect(() => {
    let vivo = true;
    const leer = () => api.getNowPlaying()
      .then((d) => { if (vivo && d?.track?.image) setPortada(d.track.image); })
      .catch(() => {});
    leer();
    const t = setInterval(leer, POLL_MS);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  // El número del riel son las de <3333> SIN nota (getPending trae también las
  // ya calificadas que siguen en la playlist).
  useEffect(() => {
    api.getPending()
      .then((d) => setSinCalificar(new Set((d || []).filter((t) => !t.rating).map((t) => t.id))))
      .catch(() => {});
  }, []);

  useEffect(() => escucharCalificadas((id) => {
    setSinCalificar((s) => {
      if (!s.has(id)) return s;
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }), []);

  useEffect(() => suscribirReproductor(setReproductorAbierto), []);

  const onReproductor = useCallback(async () => {
    try {
      const hay = await alternarReproductor(modoParaRuta(pathname));
      if (!hay) toast('El reproductor flotante solo funciona en Chrome o en la app de escritorio', 'error');
    } catch (err) {
      toast(`No se pudo abrir el reproductor: ${err?.message || err}`, 'error');
    }
  }, [pathname, toast]);

  return (
    <FondoProvider porDefecto={portada}>
      <div className="esc">
        <BarraSuperior />
        <div className="esc-cuerpo">
          <Riel
            pendientes={sinCalificar.size}
            reproductorAbierto={reproductorAbierto}
            onReproductor={onReproductor}
            iniciales={iniciales(usuario)}
          />
          <main className="esc-main">{children}</main>
        </div>
      </div>
    </FondoProvider>
  );
}
