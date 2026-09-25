/**
 * La misma portada de álbum en 300 px en vez de 640.
 *
 * `/liked-all` y `/playlist/{id}` mandan `images[0]` (640 px, ~100 KB). Para
 * una cuadrícula de 500 portadas de ~180 px eso son decenas de MB. Las
 * portadas de álbum de Spotify comparten id entre tamaños y solo cambia el
 * prefijo (`ab67616d0000b273` = 640, `ab67616d00001e02` = 300,
 * `ab67616d00004851` = 64), así que se cambia el prefijo sin pedir nada más.
 * Si la URL no tiene ese prefijo (otro tipo de imagen), se deja como está.
 */
export function portadaMedia(url) {
  return url ? url.replace('ab67616d0000b273', 'ab67616d00001e02') : url;
}
