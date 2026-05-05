import { useEffect } from 'react';
import usePerformanceStore from '../store/performanceStore';
import { formatReportType } from '../utils/formatters';

export default function GlobalFiltersPanel({ onClose }) {
  const filters = usePerformanceStore(s => s.filters);
  const filterOptions = usePerformanceStore(s => s.filterOptions);
  const setFilters = usePerformanceStore(s => s.setFilters);
  const clearFilters = usePerformanceStore(s => s.clearFilters);
  const loadFilter = usePerformanceStore(s => s.loadFilterOptions);

  useEffect(() => { loadFilter(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handle = (key, val) => setFilters({ [key]: val });

  const hasActive = Object.values(filters).some(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <aside className="w-80 bg-white shadow-2xl flex flex-col h-full overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-lg py-md border-b border-outline-variant sticky top-0 bg-white z-10">
          <div className="flex items-center gap-xs">
            <span className="material-symbols-outlined text-[20px] text-on-surface-variant">filter_list</span>
            <h3 className="font-h3 text-h3 text-on-surface">Filtros globales</h3>
          </div>
          <button onClick={onClose} className="material-symbols-outlined text-[22px] text-outline hover:text-on-surface">
            close
          </button>
        </div>

        <div className="p-lg space-y-lg flex-1">
          <FilterGroup label="Tipo de reporte">
            <div className="flex flex-wrap gap-xs">
              {(filterOptions.reportTypes || []).map(reportType => (
                <button
                  key={reportType}
                  onClick={() => handle('reportType', filters.reportType === reportType ? '' : reportType)}
                  className={`px-sm py-xs rounded-full text-[12px] font-semibold border transition-all
                    ${filters.reportType === reportType
                      ? 'bg-primary-container text-on-primary border-primary-container'
                      : 'border-outline-variant text-on-surface-variant hover:border-primary-container/50'}`}
                >
                  {formatReportType(reportType)}
                </button>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup label="Negocio">
            <select
              value={filters.business}
              onChange={e => handle('business', e.target.value)}
              className="w-full border border-outline-variant rounded-lg px-sm py-xs text-body-sm bg-white focus:border-primary-container outline-none"
            >
              <option value="">Todos los negocios</option>
              {(filterOptions.businesses || []).map(item => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </FilterGroup>

          {/* Client */}
          <FilterGroup label="Cliente">
            <select
              value={filters.client}
              onChange={e => handle('client', e.target.value)}
              className="w-full border border-outline-variant rounded-lg px-sm py-xs text-body-sm bg-white focus:border-primary-container outline-none"
            >
              <option value="">Todos los clientes</option>
              {filterOptions.clients.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </FilterGroup>

          <FilterGroup label="Ejecutivo">
            <select
              value={filters.owner}
              onChange={e => handle('owner', e.target.value)}
              className="w-full border border-outline-variant rounded-lg px-sm py-xs text-body-sm bg-white focus:border-primary-container outline-none"
            >
              <option value="">Todos los ejecutivos</option>
              {(filterOptions.owners || []).map(owner => (
                <option key={owner} value={owner}>{owner}</option>
              ))}
            </select>
          </FilterGroup>
        </div>

        {/* Footer */}
        <div className="px-lg py-md border-t border-outline-variant sticky bottom-0 bg-white flex gap-sm">
          {hasActive && (
            <button
              onClick={clearFilters}
              className="flex-1 py-xs border border-outline-variant rounded-lg text-on-surface-variant font-body-sm hover:bg-surface-container transition-colors"
            >
              Limpiar filtros
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-xs bg-primary-container text-on-primary rounded-lg font-body-sm hover:opacity-90 transition-opacity"
          >
            Aplicar
          </button>
        </div>
      </aside>
    </div>
  );
}

function FilterGroup({ label, children }) {
  return (
    <div className="space-y-xs">
      <label className="font-label-caps text-label-caps text-on-surface-variant uppercase block">
        {label}
      </label>
      {children}
    </div>
  );
}
