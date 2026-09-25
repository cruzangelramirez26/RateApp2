import { useEffect, useRef, useState } from 'react';

/**
 * Hoja que sube desde abajo (el patrón de todo el móvil: "Más", las notas de
 * una lista, ...). Se cierra tocando afuera o jalándola hacia abajo.
 *
 * El contenido se conserva mientras baja: si se desmontara al instante, la
 * hoja se vaciaría a media animación.
 */
const CIERRE_MS = 450;

export default function Hoja({ abierta, onCerrar, children, etiqueta }) {
  const [contenido, setContenido] = useState(children);
  const hojaRef = useRef(null);
  const arrastre = useRef(null);

  useEffect(() => {
    if (abierta) { setContenido(children); return undefined; }
    const t = setTimeout(() => setContenido(null), CIERRE_MS);
    return () => clearTimeout(t);
  }, [abierta, children]);

  useEffect(() => {
    if (!abierta) return undefined;
    const h = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [abierta, onCerrar]);

  // Jalar hacia abajo desde el agarre (o la parte de arriba de la hoja).
  const onDown = (e) => {
    if (e.target.closest('button, a, input')) return;
    arrastre.current = { y0: e.clientY, dy: 0 };
    hojaRef.current.classList.add('arrastre');
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    const a = arrastre.current;
    if (!a) return;
    a.dy = Math.max(0, e.clientY - a.y0);
    hojaRef.current.style.transform = `translate(-50%, ${a.dy}px)`;
  };
  const onUp = () => {
    const a = arrastre.current;
    if (!a) return;
    arrastre.current = null;
    hojaRef.current.classList.remove('arrastre');
    hojaRef.current.style.transform = '';
    if (a.dy > 90) onCerrar();
  };

  return (
    <div className={`mv-hoja-capa${abierta ? ' on' : ''}`}
         onClick={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
         aria-hidden={!abierta}>
      <div className="mv-hoja" ref={hojaRef} role="dialog" aria-label={etiqueta}
           onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="mv-agarre" />
        {abierta ? children : contenido}
      </div>
    </div>
  );
}
