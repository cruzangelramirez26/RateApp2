import { NavLink } from 'react-router-dom';
import { ListMusic, Clock, Library, Wrench, BarChart3 } from 'lucide-react';

export default function NavBar() {
  return (
    <nav className="tab-bar">
      <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''} end>
        <ListMusic />
        <span>Calificar</span>
      </NavLink>
      <NavLink to="/library" className={({ isActive }) => isActive ? 'active' : ''}>
        <Library />
        <span>Biblioteca</span>
      </NavLink>
      <NavLink to="/recent" className={({ isActive }) => isActive ? 'active' : ''}>
        <Clock />
        <span>Recientes</span>
      </NavLink>
      <NavLink to="/tools" className={({ isActive }) => isActive ? 'active' : ''}>
        <Wrench />
        <span>Herramientas</span>
      </NavLink>
      <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''}>
        <BarChart3 />
        <span>Dashboard</span>
      </NavLink>
    </nav>
  );
}
