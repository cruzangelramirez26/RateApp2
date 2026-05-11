import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ListMusic, Clock, Library, Wrench, BarChart3 } from 'lucide-react';
import { api } from '../utils/api';

const NAV_LINKS = [
  { to: '/',          end: true,  icon: ListMusic, label: 'Pending' },
  { to: '/recent',    end: false, icon: Clock,     label: 'Recientes' },
  { to: '/library',   end: false, icon: Library,   label: 'Biblioteca' },
  { to: '/dashboard', end: false, icon: BarChart3,  label: 'Stats' },
  { to: '/tools',     end: false, icon: Wrench,    label: 'Herramientas' },
];

export default function NavBar() {
  const [pendingCount, setPendingCount] = useState(null);

  useEffect(() => {
    api.getPending()
      .then(data => setPendingCount(data.length))
      .catch(() => {});
  }, []);

  return (
    <>
      {/* ── Mobile: tab bar ── */}
      <nav className="tab-bar">
        {NAV_LINKS.map(({ to, end, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'active' : ''}>
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* ── Desktop: sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="sidebar-logo-badge">A+</span>
          <span className="sidebar-logo-title">RateApp</span>
        </div>

        <nav className="sidebar-nav">
          {NAV_LINKS.map(({ to, end, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'active' : ''}>
              <Icon size={18} />
              <span>{label}</span>
              {to === '/' && pendingCount > 0 && (
                <span className="sidebar-nav-badge">{pendingCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-status">
            <span className="sidebar-footer-dot" />
            Connected
          </div>
          <span>Spotify sincronizado</span>
        </div>
      </aside>
    </>
  );
}
