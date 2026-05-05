import { NavLink } from 'react-router-dom';

const NAV_ITEMS = [
  { label: 'Panel',     icon: 'dashboard',    to: '/' },
  { label: 'Por Serie', icon: 'view_list',    to: '/series' },
  { label: 'Contratos', icon: 'description',  to: '/contracts' },
  { label: 'Reportes',  icon: 'analytics',    to: '/reports' },
  { label: 'Ajustes',   icon: 'settings',     to: '/settings' },
];

export default function Sidebar() {
  return (
    <nav className="bg-surface text-primary text-[13px] font-medium h-screen w-56 border-r fixed left-0 top-0 z-40 border-outline-variant flex flex-col p-4 space-y-1">
      {/* New Analysis button */}
      <NavLink
        to="/contracts"
        className="w-full bg-primary-container text-on-primary flex items-center justify-center gap-xs py-sm px-md rounded-lg font-body-sm mb-lg shadow-sm hover:opacity-90 transition-opacity"
      >
        <span className="material-symbols-outlined text-[18px]">add</span>
        Nuevo análisis
      </NavLink>

      {/* Nav links */}
      <div className="flex-1 space-y-xs">
        {NAV_ITEMS.map(({ label, icon, to }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              isActive
                ? 'bg-primary/10 text-primary shadow-sm border border-primary/15 rounded-lg py-2 px-3 flex items-center gap-3'
                : 'text-on-surface-variant py-2 px-3 flex items-center gap-3 hover:bg-primary/8 hover:text-primary transition-all cursor-pointer rounded-lg'
            }
          >
            <span className="material-symbols-outlined text-[20px]">{icon}</span>
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
