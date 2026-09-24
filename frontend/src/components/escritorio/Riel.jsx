import { NavLink } from 'react-router-dom';
import { Star, Clock, Library, AudioLines, LayoutGrid, SlidersHorizontal, PictureInPicture2 } from 'lucide-react';

/**
 * La navegación de la izquierda del diseño de escritorio: ícono con su nombre
 * abajo. Recientes se quedó por decisión de Angel (2026-09-24), aunque el
 * lienzo no la traía.
 *
 * El botón del reproductor es el mismo interruptor de siempre
 * (utils/reproductor.js); aquí solo cambia de lugar.
 */
const LINKS = [
  { to: '/',          end: true,  icon: Star,              label: 'Calificar' },
  { to: '/recent',    end: false, icon: Clock,             label: 'Recientes' },
  { to: '/library',   end: false, icon: Library,           label: 'Biblioteca' },
  { to: '/window',    end: false, icon: AudioLines,        label: 'Escuchas' },
  { to: '/dashboard', end: false, icon: LayoutGrid,        label: 'Resumen' },
  { to: '/tools',     end: false, icon: SlidersHorizontal, label: 'Herramientas' },
];

export default function Riel({ pendientes, reproductorAbierto, onReproductor, iniciales }) {
  return (
    <nav className="esc-riel" aria-label="Principal">
      {LINKS.map(({ to, end, icon: Icon, label }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `esc-riel-item${isActive ? ' activo' : ''}`}>
          <Icon size={21} strokeWidth={1.6} />
          <span>{label}</span>
          {to === '/' && pendientes > 0 && <span className="esc-riel-badge">{pendientes}</span>}
        </NavLink>
      ))}

      <button
        className={`esc-riel-item esc-riel-reproductor${reproductorAbierto ? ' activo' : ''}`}
        onClick={onReproductor}
        aria-label="Abrir el reproductor flotante"
        title="Reproductor flotante"
      >
        <PictureInPicture2 size={21} strokeWidth={1.6} />
        <span>Reproductor</span>
      </button>
      {iniciales && <div className="esc-riel-avatar" title="Tu cuenta de Spotify">{iniciales}</div>}
    </nav>
  );
}
