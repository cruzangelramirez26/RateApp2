import { NavLink } from 'react-router-dom';
import { ListMusic, Clock, BarChart3 } from 'lucide-react';

export default function NavBar() {
  return (
    <nav className="tab-bar">
      <NavLink to="/" className={({ isActive }) => isActive ? 'active' : ''} end>
        <ListMusic />
        <span>Calificar</span>
      </NavLink>
      <NavLink to="/recent" className={({ isActive }) => isActive ? 'active' : ''}>
        <Clock />
        <span>Recientes</span>
      </NavLink>
      <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''}>
        <BarChart3 />
        <span>Dashboard</span>
      </NavLink>
    </nav>
  );
}
