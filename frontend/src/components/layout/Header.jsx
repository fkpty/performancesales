import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import usePerformanceStore from '../../store/performanceStore';
import UploadModal from '../UploadModal';
import GlobalFiltersPanel from '../GlobalFiltersPanel';

const FALLBACK_YEARS = Array.from({ length: new Date().getFullYear() - 2024 }, (_, i) => new Date().getFullYear() - i);
const PERIODS = [
  { value: 'anual', label: 'Anual' },
  { value: 'mensual', label: 'Mensual' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'personalizado', label: 'Personalizado' },
];
const MONTHS = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
];
const QUARTERS = [
  { value: 1, label: 'T1' },
  { value: 2, label: 'T2' },
  { value: 3, label: 'T3' },
  { value: 4, label: 'T4' },
];
export default function Header() {
  const location = useLocation();
  const year = usePerformanceStore(s => s.year);
  const period = usePerformanceStore(s => s.period);
  const month = usePerformanceStore(s => s.month);
  const quarter = usePerformanceStore(s => s.quarter);
  const startDate = usePerformanceStore(s => s.startDate);
  const endDate = usePerformanceStore(s => s.endDate);
  const setYear = usePerformanceStore(s => s.setYear);
  const setPeriod = usePerformanceStore(s => s.setPeriod);
  const setMonth = usePerformanceStore(s => s.setMonth);
  const setQuarter = usePerformanceStore(s => s.setQuarter);
  const setCustomRange = usePerformanceStore(s => s.setCustomRange);
  const availableYears = usePerformanceStore(s => s.availableYears);
  const canUploadReports = usePerformanceStore(s => s.canUploadReports);
  const authUser = usePerformanceStore(s => s.authUser);
  const years = availableYears.length ? availableYears : FALLBACK_YEARS;
  const [showUpload,  setShowUpload]  = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const canManageEfficiencyConfig = hasEfficiencyConfigAccess(authUser);
  const showEfficiencyMonthSelector = location.pathname === '/efficiency' || location.pathname === '/efficiency-config';
  const navItems = [
    { label: 'Panel', icon: 'dashboard', to: '/' },
    { label: 'Eficiencia', icon: 'speed', to: '/efficiency' },
    ...(canManageEfficiencyConfig
      ? [{ label: 'Configuracion eficiencia', icon: 'tune', to: '/efficiency-config' }]
      : []),
    { label: 'Detalle', icon: 'table_view', to: '/reports' },
    { label: 'Cargas', icon: 'upload_file', to: '/uploads' },
    { label: 'Ajustes', icon: 'settings', to: '/settings' },
  ];

  return (
    <>
      <header className="bg-surface-container-lowest border-b border-outline-variant sticky top-0 z-30">
        <div className="px-lg h-16 flex items-center justify-between gap-lg">
          <div>
            <h1 className="font-h2 text-h2 text-on-surface">Performance Sales</h1>
            <p className="text-[12px] text-on-surface-variant">Seguimiento mensual para Xerox e IT con historial por carga.</p>
          </div>

          <div className="flex items-center gap-md flex-wrap justify-end">
            <div className="flex items-center gap-xs text-on-surface-variant font-body-sm">
              <span className="material-symbols-outlined text-[18px]">date_range</span>
              <select
                value={period}
                onChange={e => setPeriod(e.target.value)}
                className="bg-transparent border-none focus:ring-0 cursor-pointer p-0 pr-xs font-medium text-on-surface"
              >
                {PERIODS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            {period !== 'personalizado' && (
              <>
                <div className="h-4 w-px bg-outline-variant" />
                <div className="flex items-center gap-xs text-on-surface-variant font-body-sm">
                  <span className="material-symbols-outlined text-[18px]">calendar_today</span>
                  <select
                    value={year}
                    onChange={e => setYear(e.target.value)}
                    className="bg-transparent border-none focus:ring-0 cursor-pointer p-0 pr-xs font-medium text-on-surface"
                  >
                    {years.map(optionYear => (
                      <option key={optionYear} value={optionYear}>{optionYear}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {(period === 'mensual' || showEfficiencyMonthSelector) && (
              <>
                <div className="h-4 w-px bg-outline-variant" />
                <select
                  value={month}
                  onChange={e => setMonth(e.target.value)}
                  className="bg-transparent border-none focus:ring-0 cursor-pointer p-0 pr-xs font-medium text-on-surface"
                >
                  {MONTHS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </>
            )}

            {period === 'trimestral' && (
              <>
                <div className="h-4 w-px bg-outline-variant" />
                <select
                  value={quarter}
                  onChange={e => setQuarter(e.target.value)}
                  className="bg-transparent border-none focus:ring-0 cursor-pointer p-0 pr-xs font-medium text-on-surface"
                >
                  {QUARTERS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </>
            )}

            {period === 'personalizado' && (
              <>
                <div className="h-4 w-px bg-outline-variant" />
                <div className="flex items-center gap-xs text-on-surface-variant font-body-sm">
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setCustomRange({ startDate: e.target.value, endDate })}
                    className="bg-transparent border border-outline-variant rounded-md px-xs py-[2px] text-on-surface"
                  />
                  <span className="text-outline">a</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setCustomRange({ startDate, endDate: e.target.value })}
                    className="bg-transparent border border-outline-variant rounded-md px-xs py-[2px] text-on-surface"
                  />
                </div>
              </>
            )}

            <div className="h-4 w-px bg-outline-variant" />

            {/* Global Filters */}
            <button
              onClick={() => setShowFilters(true)}
              className="flex items-center gap-xs text-on-surface-variant hover:text-on-surface font-body-sm px-xs py-base rounded hover:bg-surface-container transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">filter_list</span>
              Filtros globales
            </button>

            {canUploadReports && (
              <button
                onClick={() => setShowUpload(true)}
                className="bg-primary-container text-on-primary font-body-sm px-md py-xs rounded-lg flex items-center gap-xs hover:opacity-90 transition-opacity ml-sm"
              >
                <span className="material-symbols-outlined text-[18px]">upload_file</span>
                Subir reportes
              </button>
            )}
          </div>
        </div>

        <div className="px-lg h-14 border-t border-outline-variant flex items-center justify-between gap-lg overflow-hidden">
          <nav className="flex items-center gap-xs min-w-0 overflow-x-auto py-2">
            {navItems.map(({ label, icon, to }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  isActive
                    ? 'bg-primary/10 text-primary shadow-sm border border-primary/15 rounded-lg py-2 px-3 flex items-center gap-2 whitespace-nowrap'
                    : 'text-on-surface-variant py-2 px-3 flex items-center gap-2 hover:bg-primary/8 hover:text-primary transition-all rounded-lg whitespace-nowrap'
                }
              >
                <span className="material-symbols-outlined text-[18px]">{icon}</span>
                {label}
              </NavLink>
            ))}
          </nav>

          {canUploadReports && (
            <button
              onClick={() => setShowUpload(true)}
              className="shrink-0 bg-primary-container text-on-primary flex items-center justify-center gap-xs py-sm px-md rounded-lg font-body-sm shadow-sm hover:opacity-90 transition-opacity"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Nueva carga
            </button>
          )}
        </div>
      </header>

      {showUpload  && <UploadModal       onClose={() => setShowUpload(false)} />}
      {showFilters && <GlobalFiltersPanel onClose={() => setShowFilters(false)} />}
    </>
  );
}

function hasEfficiencyConfigAccess(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  return roles.some((role) => ['admin', 'super_admin', 'rrhh'].includes(String(role).toLowerCase()));
}
