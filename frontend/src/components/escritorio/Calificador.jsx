import { useEffect, useRef } from 'react';
import { RATINGS_ORDEN, ratingDeTecla, esEscritura } from '../../utils/ratings';
import Nota from './Nota';

/**
 * La nota de una canción en las listas de escritorio (Escuchas, Biblioteca):
 * la cajita —o "Calificar" si no tiene— y, abierta, las 7 notas en su lugar.
 * Cerrada, picarla la abre; abierta, elegir una califica.
 *
 * Solo pinta. Quién está abierta y qué pasa al elegir lo decide la pantalla,
 * con `useTeclasNota` para el teclado.
 */
export default function Calificador({ t, abierto, ocupado, onAbrir, onElegir, grande = false, className = '' }) {
  if (abierto) {
    return (
      <div className={`esc-esc-teclas ${className}`} role="group" aria-label={`Calificar ${t.name}`}>
        {RATINGS_ORDEN.map((r, i) => (
          <button key={r} type="button" disabled={ocupado}
            className={`esc-mini${t.rating === r ? ' activa' : ''}`}
            title={`${r} (tecla ${i + 1})`} onClick={() => onElegir(r)}>{r}</button>
        ))}
      </div>
    );
  }
  if (t.rating) {
    return (
      <button type="button" className="esc-esc-nota-btn" onClick={onAbrir}
        title="Cambiar la nota" aria-label={`Nota ${t.rating}. Cambiarla`}>
        <Nota rating={t.rating} grande={grande} />
      </button>
    );
  }
  return (
    <button type="button" className="esc-esc-calificar" onClick={onAbrir}>Calificar</button>
  );
}

/**
 * Con unas notas abiertas: 1-7 califica, Esc cierra y un clic fuera de las
 * notas cierra. `abierta` es la canción con las notas abiertas (o null).
 */
export function useTeclasNota(abierta, cerrar, elegir) {
  const ref = useRef({ cerrar, elegir });
  ref.current = { cerrar, elegir };
  useEffect(() => {
    if (!abierta) return undefined;
    const onKey = (e) => {
      if (esEscritura(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') { ref.current.cerrar(); return; }
      const r = ratingDeTecla(e.key);
      if (r) { e.preventDefault(); ref.current.elegir(abierta, r); }
    };
    const onClic = (e) => {
      if (!e.target.closest?.('.esc-esc-teclas')) ref.current.cerrar();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClic);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClic);
    };
  }, [abierta]);
}
