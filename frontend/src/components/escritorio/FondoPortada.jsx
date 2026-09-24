import { createContext, useContext, useEffect, useRef, useState } from 'react';

/**
 * El fondo del escritorio: una portada difuminada que se mueve despacio y se
 * funde cuando cambia. Es lo que más le gustó a Angel del diseño.
 *
 * Por defecto es la portada de lo que suena (el Shell se la pasa). Una pantalla
 * puede pedir otra con `usePortadaDeFondo(url)` —Calificar la de la canción en
 * turno, Escuchas la de la #1— y al salir de la pantalla vuelve la de antes.
 */
const FondoCtx = createContext(() => {});

export function usePortadaDeFondo(url) {
  const pedir = useContext(FondoCtx);
  useEffect(() => {
    if (!url) return undefined;
    pedir(url);
    return () => pedir(null);
  }, [url, pedir]);
}

export function FondoProvider({ porDefecto, children }) {
  const [pedida, setPedida] = useState(null);
  return (
    <FondoCtx.Provider value={setPedida}>
      <FondoPortada src={pedida || porDefecto} />
      {children}
    </FondoCtx.Provider>
  );
}

const FUNDIDO_MS = 1200;

function FondoPortada({ src }) {
  // Se guardan las capas vivas: la nueva entra encima con fade y la vieja se
  // quita cuando la nueva ya la tapó. Así nunca se ve el fondo negro en medio.
  const [capas, setCapas] = useState(() => (src ? [{ src, id: 0 }] : []));
  const sig = useRef(1);

  useEffect(() => {
    if (!src) return undefined;
    setCapas((c) => (c.length && c[c.length - 1].src === src ? c : [...c, { src, id: sig.current++ }]));
    const t = setTimeout(() => setCapas((c) => c.slice(-1)), FUNDIDO_MS + 100);
    return () => clearTimeout(t);
  }, [src]);

  return (
    <div className="esc-fondo" aria-hidden="true">
      {capas.map((c) => (
        <img key={c.id} src={c.src} alt="" className="esc-fondo-img" />
      ))}
      <div className="esc-fondo-velo" />
    </div>
  );
}
