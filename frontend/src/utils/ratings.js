/**
 * El orden de las notas y su tecla. FUENTE ÚNICA.
 *
 * Existe porque el orden ya estuvo al revés entre dos partes de la app:
 * Pendientes numeraba 1 = D … 7 = A+ (desde mayo) y los atajos globales del
 * escritorio 1 = A+ … 7 = D. Con eso, apretar el 7 pensando en A+ le ponía una
 * D a una canción. Angel eligió 1 = A+ … 7 = D (2026-09-23) para TODA la app,
 * incluidos los atajos Ctrl+Alt+Shift+1..7 de `desktop/src-tauri/src/lib.rs`
 * (su arreglo `RATINGS` tiene que ir en este mismo orden).
 *
 * Los botones se pintan en este orden, de izquierda a derecha, para que la
 * posición en pantalla coincida con la tecla.
 */
export const RATINGS_ORDEN = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D'];

/** La nota que corresponde a una tecla '1'..'7', o null. */
export function ratingDeTecla(tecla) {
  const n = Number(tecla);
  return Number.isInteger(n) && n >= 1 && n <= 7 ? RATINGS_ORDEN[n - 1] : null;
}

/** La tecla ('1'..'7') de una nota, para mostrarla como pista. */
export function teclaDeRating(rating) {
  const i = RATINGS_ORDEN.indexOf(rating);
  return i >= 0 ? String(i + 1) : '';
}

/**
 * ¿El evento de teclado viene de un campo de texto? Entonces no es un atajo:
 * es alguien escribiendo.
 */
export function esEscritura(e) {
  const t = e.target;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}
