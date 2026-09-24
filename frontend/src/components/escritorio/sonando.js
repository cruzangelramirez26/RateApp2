import { createContext, useContext } from 'react';

/**
 * Lo que suena en Spotify, para las pantallas de escritorio.
 *
 * El Shell ya sondea `now-playing` cada 5 s para el fondo; las pantallas lo
 * leen de aquí en vez de abrir un segundo sondeo. `refrescar()` pide una
 * lectura ya, para cuando la pantalla acaba de mandar a reproducir algo.
 *
 * `sonando` es la respuesta de `/tracks/now-playing` ({is_playing, progress_ms,
 * duration_ms, track}) más `leidoEn` (Date.now() de la lectura), que es la base
 * para interpolar el progreso. Si Spotify deja de reportar se conserva la
 * última canción, marcada en pausa.
 */
export const SonandoCtx = createContext({ sonando: null, refrescar: () => {} });

export function useSonando() {
  return useContext(SonandoCtx);
}
