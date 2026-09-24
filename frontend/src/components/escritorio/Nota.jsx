/**
 * La calificación como cajita (diseño de escritorio, 2026-09-24).
 *
 * Sin colores a propósito: Angel no quiso "burbujas de color con la letra".
 * La jerarquía sale de la forma:
 *   - B+, A, A+ — rellenas, más sólidas mientras más alta. Son las que entran a
 *     las playlists (TOP_SET), así que se distinguen de un vistazo.
 *   - B, C+, C — solo contorno, cada vez más tenue.
 *   - D        — contorno punteado.
 * Los estilos viven en styles/escritorio.css (.nota-*).
 */
const CLASE = { 'A+': 'ap', A: 'a', 'B+': 'bp', B: 'b', 'C+': 'cp', C: 'c', D: 'd' };

export default function Nota({ rating, grande = false }) {
  if (!rating || !CLASE[rating]) return null;
  return (
    <span className={`nota nota-${CLASE[rating]}${grande ? ' nota-grande' : ''}`} aria-label={`Calificación ${rating}`}>
      {rating}
    </span>
  );
}
