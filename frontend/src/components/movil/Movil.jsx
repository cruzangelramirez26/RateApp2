import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../utils/api';
import { escucharCalificadas, escucharAgregadas } from '../../utils/reproductor';
import { FondoProvider } from '../escritorio/FondoPortada';
import { SonandoCtx } from '../escritorio/sonando';
import Hoja from './Hoja';
import { useA3333 } from '../../hooks/useA3333';
import { useToast } from '../../hooks/useToast';
import {
  IcoCalificar, IcoRecientes, IcoEscuchas, IcoMas, IcoBiblioteca, IcoResumen, IcoHerramientas,
} from './Iconos';
import '../../styles/movil.css';

/**
 * El marco del diseño móvil (fase 1 del rediseño móvil, 2026-09-25; plan en
 * REDISENO_MOVIL.md). Reemplaza a NavBar en teléfonos, tablets y la app de
 * Android; en el escritorio no se monta nunca (ver useEscritorio).
 *
 *  - Fondo: la portada de lo que suena, difuminada. Una pantalla puede pedir
 *    otra con usePortadaDeFondo (el mismo FondoProvider del escritorio, con
 *    las clases .mv-*).
 *  - Lo que suena se comparte por SonandoCtx, así Calificar no abre un segundo
 *    sondeo de now-playing (misma idea que el Shell del escritorio).
 *  - Barra flotante de 4: Calificar, Recientes, Escuchas y Más. "Más" abre una
 *    hoja con Biblioteca, Resumen y Herramientas (decisión de Angel).
 *
 * Mientras vive pone la clase `movil` en <html>: de ahí cuelgan los tokens
 * oscuros de styles/movil.css, que visten también a las pantallas viejas.
 */
const POLL_MS = 5000;
const EN_MAS = ['/library', '/dashboard', '/tools', '/backfill', '/abandoned'];

export default function Movil({ children }) {
  const { pathname } = useLocation();
  const navegar = useNavigate();
  const [sonando, setSonando] = useState(null);
  const [sinCalificar, setSinCalificar] = useState(() => new Set());
  const [mas, setMas] = useState(false);

  useEffect(() => {
    const raiz = document.documentElement;
    raiz.classList.add('movil');
    // El navegador del teléfono pinta sus barras con este color.
    const meta = document.querySelector('meta[name="theme-color"]');
    const antes = meta?.getAttribute('content');
    meta?.setAttribute('content', '#0d0c0b');
    return () => {
      raiz.classList.remove('movil');
      if (meta && antes) meta.setAttribute('content', antes);
    };
  }, []);

  // Si Spotify deja de reportar se queda la última canción, en pausa (la
  // misma regla del widget de siempre y del escritorio).
  const refrescar = useCallback(() => api.getNowPlaying()
    .then((d) => {
      if (d?.track) setSonando({ ...d, leidoEn: Date.now() });
      else setSonando((prev) => (prev ? { ...prev, is_playing: false } : prev));
    })
    .catch(() => setSonando((prev) => (prev ? { ...prev, is_playing: false } : prev))), []);

  useEffect(() => {
    refrescar();
    const t = setInterval(() => { if (!document.hidden) refrescar(); }, POLL_MS);
    const alVolver = () => { if (!document.hidden) refrescar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', alVolver); };
  }, [refrescar]);

  const ctxSonando = useMemo(() => ({ sonando, refrescar }), [sonando, refrescar]);

  // El número de Calificar: las de <3333> SIN nota.
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
  // Lo que se manda a <3333> desde el botón de lo que suena suma al número.
  useEffect(() => escucharAgregadas((t, nueva) => {
    if (!nueva || !t?.id || t.rating) return;
    setSinCalificar((s) => (s.has(t.id) ? s : new Set(s).add(t.id)));
  }), []);

  const cerrarMas = useCallback(() => setMas(false), []);
  const ir = (ruta) => { setMas(false); if (ruta !== pathname) navegar(ruta); };
  const activo = (clave) => {
    if (clave === 'mas') return mas || EN_MAS.includes(pathname);
    return !mas && pathname === clave;
  };

  return (
    <SonandoCtx.Provider value={ctxSonando}>
      <FondoProvider porDefecto={sonando?.track?.image || null} prefijo="mv">
        <div className="mv">
          <main className="mv-main">{children}</main>

          <nav className={`mv-nav${sonando?.track ? ' con-a3333' : ''}`} aria-label="Navegación">
            <button type="button" className={activo('/') ? 'on' : ''} onClick={() => ir('/')}>
              <span className="mv-nav-ico">
                <IcoCalificar />
                {sinCalificar.size > 0 && <span className="mv-badge">{sinCalificar.size}</span>}
              </span>
              Calificar
            </button>
            <button type="button" className={activo('/recent') ? 'on' : ''} onClick={() => ir('/recent')}>
              <span className="mv-nav-ico"><IcoRecientes /></span>Recientes
            </button>
            <button type="button" className={activo('/window') ? 'on' : ''} onClick={() => ir('/window')}>
              <span className="mv-nav-ico"><IcoEscuchas /></span>Escuchas
            </button>
            <button type="button" className={activo('mas') ? 'on' : ''} onClick={() => setMas((v) => !v)}
                    aria-expanded={mas}>
              <span className="mv-nav-ico"><IcoMas /></span>Más
            </button>
            {sonando?.track && <A3333 track={sonando.track} />}
          </nav>

          <Hoja abierta={mas} onCerrar={cerrarMas} etiqueta="Más">
            <div className="mv-mas">
              <button type="button" onClick={() => ir('/library')}>
                <IcoBiblioteca /><div><b>Biblioteca</b><span>Me Gusta, &lt;3333&gt; y tus cuatrimestres</span></div>
              </button>
              <button type="button" onClick={() => ir('/dashboard')}>
                <IcoResumen /><div><b>Resumen</b><span>Tu año, en tres partes</span></div>
              </button>
              <button type="button" onClick={() => ir('/tools')}>
                <IcoHerramientas /><div><b>Herramientas</b><span>Reordenar, migrar, catalogar, limpiar</span></div>
              </button>
            </div>
          </Hoja>
        </div>
      </FondoProvider>
    </SonandoCtx.Provider>
  );
}

/**
 * Al final de la barra de abajo: la portada de lo que suena, y tocarla la
 * manda a <3333> (al final) para calificarla después. Va en la barra y no
 * flotando para que se vea desde cualquier pantalla sin tapar nada (en
 * Calificar las notas quedan a 20 px de la barra). Ya dentro, se bloquea.
 */
function A3333({ track }) {
  const { estado, agregar } = useA3333(track);
  const toast = useToast();
  const dentro = estado === 'dentro';
  const titulo = dentro ? `${track.name} ya está en <3333>` : `Mandar ${track.name} a <3333>`;
  const onClick = async () => {
    try {
      const r = await agregar();
      if (r) toast(r.ya_estaba ? 'Ya estaba en <3333>' : `${track.name} → <3333>`, 'success');
    } catch (err) {
      toast(`No se pudo mandar a <3333>: ${err?.message || err}`, 'error');
    }
  };
  return (
    <button type="button" className={`mv-a3333${dentro ? ' dentro' : ''}`} onClick={onClick}
            disabled={estado !== 'libre'} aria-label={titulo} title={titulo}>
      <span className="mv-a3333-portada" style={track.image ? { backgroundImage: `url("${track.image}")` } : undefined} />
      <span className="mv-a3333-signo" aria-hidden="true">{dentro ? '✓' : '+'}</span>
      &lt;3333&gt;
    </button>
  );
}
