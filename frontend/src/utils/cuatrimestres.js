/**
 * Como se LLAMA cada cuatrimestre, del lado del cliente.
 *
 * La fuente de verdad es `config.CUATRI_NOMBRES` en el backend, que viaja en
 * `GET /playlists/distribution` (App.jsx la primea al arrancar). Aqui solo se
 * guarda lo que llego y se responden preguntas.
 *
 * `perla` / `miel` / `latte` son IDENTIFICADORES internos, no nombres: viven
 * en el codigo, en el SQL y dentro de la columna `cuatrimestre_override` de
 * MySQL. El nombre visible cambia cada anio (2025 fueron Savia/Lirio/Marea) y
 * NO se edita aqui: se edita en el backend, en un solo lugar.
 *
 * El fallback de abajo existe para que una pantalla que se pinte antes de que
 * llegue `distribution` no salga en blanco, y para que un anio sin bautizar
 * caiga al identificador capitalizado en vez de romperse. NO es la lista buena:
 * si alguien la edita aqui y no en el backend, el backend gana en cuanto
 * responda.
 */

const FALLBACK = {
  2025: {
    perla: { nombre: 'Savia', color: '#cfd8be' },
    miel:  { nombre: 'Lirio', color: '#efdffc' },
    latte: { nombre: 'Marea', color: '#bde8f3' },
  },
  2026: {
    perla: { nombre: '2026 PT.-1', color: '#5ba8d4' },
    miel:  { nombre: '2026 PT.-2', color: '#f5c542' },
    latte: { nombre: '2026 PT.-3', color: '#d04e54' },
  },
};

let MAPA = FALLBACK;
let ACTUAL = null;   // {year, cuatri} segun el backend

/** Alimenta el mapa con lo que trajo /playlists/distribution. */
export function setCuatriMap(dist) {
  if (dist?.cuatrimestres && Object.keys(dist.cuatrimestres).length) {
    MAPA = dist.cuatrimestres;
  }
  if (dist?.actual) ACTUAL = dist.actual;
}

export function anioActual() {
  return ACTUAL?.year ?? new Date().getFullYear();
}

export function cuatriActual() {
  return ACTUAL?.cuatri ?? null;
}

export function cuatriInfo(cuatri, year = anioActual()) {
  const info = MAPA?.[String(year)]?.[cuatri] ?? MAPA?.[year]?.[cuatri];
  const nombre = info?.nombre
    ?? (cuatri ? cuatri.charAt(0).toUpperCase() + cuatri.slice(1) : '');
  return {
    cuatri,
    year,
    nombre,
    color: info?.color ?? null,
    // OJO CON EL `in`, no es un `??`: la portada de verdad viene de Spotify y
    // un `img: null` explicito significa "este cuatrimestre no tiene respaldo
    // local". Con `??` se caeria al path derivado, que ademas ya no existe para
    // nombres como "2026 PT.-1".
    img: (info && 'img' in info) ? info.img : `/portadas/${year}/${nombre}.jpg`,
  };
}

/** Solo el nombre visible. Es el reemplazo de los viejos CUATRI_DISPLAY. */
export function nombreCuatri(cuatri, year = anioActual()) {
  return cuatriInfo(cuatri, year).nombre;
}

/** Los tres del anio, en el orden del calendario. */
export const SLOTS = ['perla', 'miel', 'latte'];
