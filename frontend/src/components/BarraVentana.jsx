import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';
import { tieneBarraPropia, minimizar, alternarMaximizar, cerrar, estaMaximizada } from '../utils/ventana';

/**
 * La barra de título de la app de escritorio. Fuera del escritorio no pinta
 * nada. Ver utils/ventana.js.
 *
 * `data-tauri-drag-region` lo atiende un script que Tauri inyecta: arrastrar
 * mueve la ventana (con el acomodo de Windows al llevarla a un borde) y doble
 * clic la maximiza. Va en cada elemento que no es botón, porque el script solo
 * mira el elemento exacto donde cayó el clic.
 *
 * variante="principal": fija arriba, y le avisa al CSS (clase en <html>) para
 *   que el contenido empiece debajo. Min / maximizar / cerrar.
 * variante="reproductor": una tira delgada dentro del reproductor, sobre su
 *   fondo difuminado. Solo cerrar: la flotante no sale en la barra de tareas,
 *   así que minimizada no habría forma de encontrarla.
 */
export default function BarraVentana({ variante = 'principal' }) {
  const activa = tieneBarraPropia();
  const principal = variante === 'principal';
  const [maximizada, setMaximizada] = useState(false);

  useEffect(() => {
    if (!activa || !principal) return;
    const raiz = document.documentElement;
    raiz.classList.add('con-barra');
    // Maximizar cambia el tamaño, así que el `resize` del DOM alcanza para
    // saber cuándo cambiar el ícono, sin pedir permisos de eventos de Tauri.
    const releer = () => estaMaximizada().then((m) => setMaximizada(!!m));
    releer();
    window.addEventListener('resize', releer);
    return () => {
      raiz.classList.remove('con-barra');
      window.removeEventListener('resize', releer);
    };
  }, [activa, principal]);

  if (!activa) return null;

  return (
    <div className={`barra-ventana barra-ventana-${variante}`} data-tauri-drag-region>
      {principal && (
        <div className="barra-ventana-titulo" data-tauri-drag-region>
          <span className="barra-ventana-badge" data-tauri-drag-region>A+</span>
          <span data-tauri-drag-region>RateApp</span>
        </div>
      )}
      <div className="barra-ventana-hueco" data-tauri-drag-region />
      {principal && (
        <>
          <button className="barra-ventana-btn" onClick={minimizar} title="Minimizar" aria-label="Minimizar">
            <Minus size={15} strokeWidth={1.5} />
          </button>
          <button
            className="barra-ventana-btn"
            onClick={alternarMaximizar}
            title={maximizada ? 'Restaurar' : 'Maximizar'}
            aria-label={maximizada ? 'Restaurar' : 'Maximizar'}
          >
            {maximizada
              ? <Copy size={12} strokeWidth={1.5} style={{ transform: 'scaleX(-1)' }} />
              : <Square size={12} strokeWidth={1.5} />}
          </button>
        </>
      )}
      <button
        className="barra-ventana-btn barra-ventana-cerrar"
        onClick={cerrar}
        title={principal ? 'Cerrar (sigue en la bandeja)' : 'Cerrar'}
        aria-label="Cerrar"
      >
        <X size={principal ? 16 : 14} strokeWidth={1.5} />
      </button>
    </div>
  );
}
