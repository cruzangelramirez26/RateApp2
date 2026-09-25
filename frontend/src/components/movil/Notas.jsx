import { RATINGS_ORDEN } from '../../utils/ratings';

/**
 * Las notas del móvil. Sin relleno (decisión de Angel, 2026-09-25): la
 * jerarquía la da el borde —claro fino para las que entran a tus playlists
 * (A+, A, B+), casi invisible para B/C+/C, punteado para D— y solo se rellena
 * la nota que ya tiene la canción. Estilos en styles/movil.css.
 */
const TOP = new Set(['A+', 'A', 'B+']);
export const claseNota = (r) => (TOP.has(r) ? 'top' : r === 'D' ? 'd' : 'mid');

/** La cajita con la nota de una canción ("—" punteado si no tiene). */
export function NotaMv({ rating }) {
  return rating
    ? <span className={`mv-nota ${claseNota(rating)}`} aria-label={`Calificación ${rating}`}>{rating}</span>
    : <span className="mv-nota vacia" aria-label="Sin calificar">—</span>;
}

/** Los siete botones en una fila (opción A del lienzo). */
export function FilaNotas({ actual, onNota, deshabilitado = false }) {
  return (
    <div className="mv-notas">
      {RATINGS_ORDEN.map((r) => (
        <button key={r} type="button" className={`mv-bn ${claseNota(r)}${actual === r ? ' actual' : ''}`}
                aria-label={`Calificar ${r}`} aria-pressed={actual === r}
                disabled={deshabilitado} onClick={() => onNota(r)}>
          {r}
        </button>
      ))}
    </div>
  );
}
