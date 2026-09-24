import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';
import { tieneBarraPropia, minimizar, alternarMaximizar, cerrar, estaMaximizada } from '../../utils/ventana';
import Buscador from './Buscador';

/**
 * La barra de arriba del diseño de escritorio: marca, buscador y —solo dentro
 * de la app de Tauri— los botones de la ventana.
 *
 * En Tauri REEMPLAZA a BarraVentana (App.jsx no pinta las dos). Hace lo mismo
 * que ella: `data-tauri-drag-region` en todo lo que no es botón, para que
 * arrastrar mueva la ventana y el doble clic la maximice. Va en cada elemento
 * porque el script de Tauri solo mira el elemento exacto donde cayó el clic.
 * En el navegador esos atributos no hacen nada.
 */
export default function BarraSuperior() {
  const ventanaPropia = tieneBarraPropia();
  const [maximizada, setMaximizada] = useState(false);

  useEffect(() => {
    if (!ventanaPropia) return undefined;
    const releer = () => estaMaximizada().then((m) => setMaximizada(!!m));
    releer();
    window.addEventListener('resize', releer);
    return () => window.removeEventListener('resize', releer);
  }, [ventanaPropia]);

  return (
    <header className="esc-barra" data-tauri-drag-region>
      <div className="esc-marca" data-tauri-drag-region>
        <span className="esc-marca-badge" data-tauri-drag-region>A+</span>
        <span data-tauri-drag-region>RateApp</span>
      </div>
      <div className="esc-barra-centro" data-tauri-drag-region>
        <Buscador />
      </div>
      <div className="esc-barra-der" data-tauri-drag-region>
        {ventanaPropia && (
          <>
            <button className="esc-winbtn" onClick={minimizar} title="Minimizar" aria-label="Minimizar">
              <Minus size={15} strokeWidth={1.5} />
            </button>
            <button
              className="esc-winbtn"
              onClick={alternarMaximizar}
              title={maximizada ? 'Restaurar' : 'Maximizar'}
              aria-label={maximizada ? 'Restaurar' : 'Maximizar'}
            >
              {maximizada
                ? <Copy size={12} strokeWidth={1.5} style={{ transform: 'scaleX(-1)' }} />
                : <Square size={12} strokeWidth={1.5} />}
            </button>
            <button className="esc-winbtn esc-winbtn-cerrar" onClick={cerrar} title="Cerrar (sigue en la bandeja)" aria-label="Cerrar">
              <X size={16} strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
