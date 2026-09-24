import { useEffect, useState } from 'react';

/**
 * ¿Toca el diseño de escritorio? Pantallas de 1024 px o más, en el navegador y
 * en la app de Tauri por igual.
 *
 * Es la única frontera entre los dos diseños (decisión de Angel, 2026-09-24):
 * el de escritorio vive aparte (components/escritorio/) para que el móvil no le
 * estorbe, y debajo de este ancho se ve exactamente la app de siempre. La app
 * de Android carga la misma página, así que en un teléfono esto da false y no
 * le cambia nada.
 */
const MQ = '(min-width: 1024px)';

export function useEscritorio() {
  const [es, setEs] = useState(() => typeof window !== 'undefined' && window.matchMedia(MQ).matches);

  useEffect(() => {
    const mq = window.matchMedia(MQ);
    const alCambiar = () => setEs(mq.matches);
    alCambiar();
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);

  return es;
}
