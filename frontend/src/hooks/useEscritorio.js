import { useEffect, useState } from 'react';

/**
 * ¿Toca el diseño de escritorio o el móvil? Se decide por TIPO DE DISPOSITIVO,
 * no por ancho (decisión de Angel, 2026-09-25: "no me gusta que no sepa si
 * está en la app escritorio o en un móvil").
 *
 *  - Escritorio: la app de Tauri (Rust inyecta `__RATEAPP_ESCRITORIO__`) o un
 *    navegador con mouse. Siempre el diseño de escritorio, aunque la ventana
 *    sea angosta.
 *  - Móvil: la app de Android (Capacitor), un teléfono o una tablet (puntero
 *    táctil). Siempre el diseño móvil; en pantallas anchas va centrado.
 *
 * Hasta el 2026-09-25 la frontera era `min-width: 1024px` y debajo se veía la
 * app vieja. Ver REDISENO_MOVIL.md.
 */
const MQ = '(hover: hover) and (pointer: fine)';

function calcular() {
  if (typeof window === 'undefined') return true;
  if (window.__RATEAPP_ESCRITORIO__ === true) return true;
  if (window.Capacitor?.isNativePlatform?.()) return false;
  return window.matchMedia(MQ).matches;
}

export function useEscritorio() {
  const [es, setEs] = useState(calcular);

  useEffect(() => {
    // Casi nunca cambia en vivo, pero un navegador puede pasar a modo táctil
    // (o las herramientas de desarrollo emular un teléfono).
    const mq = window.matchMedia(MQ);
    const alCambiar = () => setEs(calcular());
    alCambiar();
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);

  return es;
}
