import { useCallback, useRef, useState } from 'react';
import { exportContracts } from '../../services/api';
import useContractStore from '../../store/contractStore';
import { formatUsdCurrency } from '../../utils/currency';
import StatusBadge from '../ui/StatusBadge';
import Pagination from '../ui/Pagination';
import Spinner from '../ui/Spinner';

const STATUS_LABELS = {
  'VIGENTE': 'Vigente',
  'VENCIDO': 'Vencido',
  'CANCELADO': 'Cancelado',
};

const TABLE_META = {
  upcoming: {
    title: 'Próximos a vencer',
    subtitle: 'Contratos vigentes cuya fecha final cae dentro del periodo filtrado, usando las columnas del reporte SQL.',
    emptyLabel: 'No hay contratos próximos a vencer para los filtros actuales.',
  },
  vigentes: {
    title: 'Contratos vigentes',
    subtitle: 'Contratos activos dentro del periodo seleccionado, usando las columnas del reporte SQL.',
    emptyLabel: 'No hay contratos vigentes para los filtros actuales.',
  },
  vencidos: {
    title: 'Contratos vencidos y cancelados',
    subtitle: 'Histórico de contratos vencidos o cancelados dentro del periodo.',
    emptyLabel: 'No hay contratos vencidos o cancelados para los filtros actuales.',
  },
};

const SQL_REPORT_COLUMNS = [
  { key: 'client_code', label: 'CLIENTE', sortable: true },
  { key: 'client', label: 'RAZON SOCIAL', sortable: true },
  { key: 'contract_name', label: 'CONTRATO', sortable: true },
  { key: 'contract_type', label: 'TIPO', sortable: true },
  { key: 'duration_months', label: 'DURACION', sortable: true, align: 'right' },
  { key: 'start_date', label: 'FECHA INICIO', sortable: true },
  { key: 'end_date', label: 'FECHA FINAL', sortable: true },
  { key: 'commercial_owner', label: 'RESPONSABLE', sortable: true },
  { key: 'charge_fixed', label: 'CARGO FIJO', sortable: true, align: 'right' },
  { key: 'box_fee', label: 'CUOTA BOX', sortable: true, align: 'right' },
  { key: 'service_fee', label: 'CUOTA SERV', sortable: true, align: 'right' },
];

const UPCOMING_SQL_REPORT_COLUMNS = [
  { key: 'client_code', label: 'CLIENTE', sortable: true },
  { key: 'client', label: 'RAZON SOCIAL', sortable: true },
  { key: 'contract_name', label: 'CONTRATO', sortable: true },
  { key: 'contract_type', label: 'TIPO', sortable: true },
  { key: 'duration_months', label: 'DURACION', sortable: true, align: 'right' },
  { key: 'start_date', label: 'FECHA INICIO', sortable: true },
  { key: 'end_date', label: 'FECHA FINAL', sortable: true },
  { key: 'commercial_owner', label: 'RESPONSABLE', sortable: true },
  { key: 'time_remaining', label: 'TIEMPO RESTANTE' },
  { key: 'status', label: 'ESTADO' },
  { key: 'charge_fixed', label: 'CARGO FIJO', sortable: true, align: 'right' },
  { key: 'box_fee', label: 'CUOTA BOX', sortable: true, align: 'right' },
  { key: 'service_fee', label: 'CUOTA SERV', sortable: true, align: 'right' },
];

const DEFAULT_COMPACT_COLUMNS = SQL_REPORT_COLUMNS;

const VENCIDOS_COMPACT_COLUMNS = [
  { key: 'client', label: 'Cliente', sortable: true },
  { key: 'contract_name', label: 'Contrato', sortable: true },
  { key: 'commercial_owner_code', label: 'Pl_Cem_Empleado', sortable: true },
  { key: 'commercial_owner', label: 'Responsable', sortable: true },
  { key: 'business_div_name', label: 'Negocio', sortable: true },
  { key: 'start_date', label: 'Fecha inicio', sortable: true },
  { key: 'end_date', label: 'Fecha final', sortable: true },
  { key: 'cancellation_date', label: 'FECHA_CANC', sortable: true },
  { key: 'cancellation_reason', label: 'Motivo', sortable: true },
  { key: 'status', label: 'Estado', sortable: true },
];

const DEFAULT_FULL_COLUMNS = SQL_REPORT_COLUMNS;

const VENCIDOS_FULL_COLUMNS = [
  { key: 'client', label: 'Cliente', sortable: true },
  { key: 'contract_name', label: 'Contrato', sortable: true },
  { key: 'contract_type', label: 'Tipo', sortable: true },
  { key: 'commercial_owner_code', label: 'Pl_Cem_Empleado', sortable: true },
  { key: 'commercial_owner', label: 'Responsable', sortable: true },
  { key: 'start_date', label: 'Fecha inicio', sortable: true },
  { key: 'end_date', label: 'Fecha final', sortable: true },
  { key: 'cancellation_date', label: 'FECHA_CANC', sortable: true },
  { key: 'cancellation_reason', label: 'Motivo', sortable: true },
  { key: 'status', label: 'Estado', sortable: true },
  { key: 'monthly_revenue', label: 'Total mensual', sortable: true, align: 'right' },
  { key: 'annual_total', label: 'Total anual', sortable: true, align: 'right' },
];

function getColumns(tableKey, compact) {
  if (tableKey === 'upcoming') {
    return UPCOMING_SQL_REPORT_COLUMNS;
  }

  if (compact) {
    return tableKey === 'vencidos' ? VENCIDOS_COMPACT_COLUMNS : DEFAULT_COMPACT_COLUMNS;
  }

  return tableKey === 'vencidos' ? VENCIDOS_FULL_COLUMNS : DEFAULT_FULL_COLUMNS;
}

function fmtDate(value) {
  if (!value) return '—';

  const normalized = typeof value === 'string'
    ? value.slice(0, 10)
    : new Date(value).toISOString().slice(0, 10);
  const d = new Date(`${normalized}T00:00:00Z`);

  if (Number.isNaN(d.getTime())) return '—';

  return d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function fmtPercent(value) {
  if (value == null || value === '') return '—';
  return `${Number(value).toFixed(1)}%`;
}

function getDaysUntil(value) {
  if (!value) return null;

  const normalized = typeof value === 'string'
    ? value.slice(0, 10)
    : new Date(value).toISOString().slice(0, 10);
  const targetDate = new Date(`${normalized}T00:00:00Z`);

  if (Number.isNaN(targetDate.getTime())) return null;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return Math.round((targetDate.getTime() - today.getTime()) / 86400000);
}

function getRemainingTimeParts(value) {
  if (!value) return null;

  const normalized = typeof value === 'string'
    ? value.slice(0, 10)
    : new Date(value).toISOString().slice(0, 10);
  const targetDate = new Date(`${normalized}T00:00:00Z`);

  if (Number.isNaN(targetDate.getTime())) return null;

  const today = new Date();
  const currentDate = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  ));

  if (targetDate < currentDate) {
    return { years: 0, months: 0, days: 0, expired: true };
  }

  let years = targetDate.getUTCFullYear() - currentDate.getUTCFullYear();
  let months = targetDate.getUTCMonth() - currentDate.getUTCMonth();
  let days = targetDate.getUTCDate() - currentDate.getUTCDate();

  if (days < 0) {
    months -= 1;
    const previousMonthDate = new Date(Date.UTC(
      targetDate.getUTCFullYear(),
      targetDate.getUTCMonth(),
      0
    ));
    days += previousMonthDate.getUTCDate();
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return { years, months, days, expired: false };
}

function formatRemainingTime(value) {
  const parts = getRemainingTimeParts(value);
  if (!parts) return '—';
  if (parts.expired) return 'Vencido';

  const yearLabel = parts.years === 1 ? 'año' : 'años';
  const monthLabel = parts.months === 1 ? 'mes' : 'meses';
  const dayLabel = parts.days === 1 ? 'día' : 'días';

  return `${parts.years} ${yearLabel}, ${parts.months} ${monthLabel}, ${parts.days} ${dayLabel}`;
}

function getUpcomingRiskStatus(endDate) {
  const daysUntil = getDaysUntil(endDate);

  if (daysUntil == null) return null;
  if (daysUntil <= 90) return 'RIESGO';
  if (daysUntil <= 180) return 'HASTA_6_MESES';
  return 'MAS_DE_6_MESES';
}

function SortIcon({ column, sortBy, sortDir }) {
  if (column !== sortBy) return <span className="material-symbols-outlined text-[14px] text-outline-variant ml-1">unfold_more</span>;
  return (
    <span className={`material-symbols-outlined text-[14px] ml-1 text-primary-container`}>
      {sortDir === 'asc' ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
    </span>
  );
}

function buildDateParams(state) {
  const params = { period: state.period, year: state.year };
  if (state.period === 'mensual') params.month = state.month;
  if (state.period === 'trimestral') params.quarter = state.quarter;
  if (state.period === 'personalizado') {
    params.startDate = state.startDate;
    params.endDate = state.endDate;
  }
  return params;
}

function renderCell(row, column, tableKey) {
  switch (column.key) {
    case 'start_date':
    case 'end_date':
    case 'cancellation_date':
      return fmtDate(row[column.key]);
    case 'time_remaining':
      return formatRemainingTime(row.end_date);
    case 'charge_fixed':
    case 'box_fee':
    case 'service_fee':
    case 'monthly_revenue':
    case 'annual_total':
      return formatUsdCurrency(row[column.key]);
    case 'duration_months':
      return row[column.key] ?? '—';
    case 'status':
      if (tableKey === 'upcoming') {
        const riskStatus = getUpcomingRiskStatus(row.end_date);
        if (riskStatus) {
          return <StatusBadge status={riskStatus} />;
        }
      }
      return <StatusBadge status={row.display_status || row.canonical_status || row.status} />;
    case 'profitability':
      return fmtPercent(row[column.key]);
    default:
      return row[column.key] || '—';
  }
}

export default function ContractTable({
  tableKey = 'vigentes',
  title,
  subtitle,
  compact = false,
  showSearch = false,
  showExport = false,
  showPagination = true,
  scrollBody = false,
  bodyMaxHeightClass = 'max-h-[32rem]',
}) {
  const table = useContractStore(s => s.tables[tableKey]);
  const chartFilter = useContractStore(s => s.chartFilter);
  const setTablePage = useContractStore(s => s.setTablePage);
  const setTableSearch = useContractStore(s => s.setTableSearch);
  const setTableSort = useContractStore(s => s.setTableSort);
  const meta = TABLE_META[tableKey] || TABLE_META.vigentes;
  const columns = getColumns(tableKey, compact);
  const viewportClass = scrollBody
    ? `${bodyMaxHeightClass} overflow-auto relative`
    : 'overflow-x-auto relative';

  const [riskFilter, setRiskFilter] = useState(null);
  const filteredData = tableKey === 'upcoming' && riskFilter
    ? table.data.filter(row => getUpcomingRiskStatus(row.end_date) === riskFilter)
    : table.data;

  // Risk counts (only computed for upcoming table)
  const riskCounts = tableKey === 'upcoming'
    ? table.data.reduce((acc, row) => {
        const k = getUpcomingRiskStatus(row.end_date);
        if (k) acc[k] = (acc[k] || 0) + 1;
        return acc;
      }, {})
    : {};

  const searchTimer = useRef(null);
  const handleSearch = useCallback((val) => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setTableSearch(tableKey, val), 350);
  }, [setTableSearch, tableKey]);

  const handleExport = () => {
    const state = useContractStore.getState();
    const tableState = state.tables[tableKey];
    exportContracts({
      ...buildDateParams(state),
      ...state.filters,
      chartFilter: state.chartFilter,
      upcomingRisk: tableKey === 'upcoming' ? riskFilter : '',
      table: tableKey,
      search: tableState.search,
      sortBy: tableState.sortBy,
      sortDir: tableState.sortDir,
    });
  };

  return (
    <section className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm flex flex-col overflow-hidden">
      <div className="p-md border-b border-outline-variant flex items-center justify-between bg-surface-container-low/50 flex-wrap gap-sm">
        <div>
          <h3 className="font-h3 text-h3 text-on-surface">{title || meta.title}</h3>
          <p className="text-[12px] text-on-surface-variant mt-0.5">{subtitle || meta.subtitle}</p>
          {chartFilter && (
            <div className="flex items-center gap-xs mt-xs">
              <span className="text-[12px] text-on-surface-variant">Filtrado por:</span>
              <span className="px-2 py-0.5 rounded-full bg-primary-container/10 text-primary-container text-[11px] font-bold">
                {STATUS_LABELS[chartFilter] || chartFilter}
              </span>
              <button
                onClick={() => useContractStore.getState().setChartFilter(chartFilter)}
                className="text-[12px] text-on-surface-variant hover:text-error ml-1 flex items-center"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </div>
          )}
          {tableKey === 'upcoming' && (
            <>
              <p className="text-[12px] text-on-surface-variant mt-sm max-w-3xl">
                Filtros rápidos por cercanía del vencimiento: Crítico muestra contratos que vencen en 90 días o menos, Precaución entre 91 y 180 días, y Estable más de 180 días.
              </p>
              {/* Risk count mini-cards */}
              <div className="flex items-center gap-2 mt-sm flex-wrap">
                {[
                  { key: 'RIESGO',         label: 'Crítico',    bg: 'bg-red-500',     ring: 'ring-red-400',     dot: 'bg-red-200'     },
                  { key: 'HASTA_6_MESES',  label: 'Precaución', bg: 'bg-amber-400',   ring: 'ring-amber-400',   dot: 'bg-amber-100'   },
                  { key: 'MAS_DE_6_MESES', label: 'Estable',    bg: 'bg-emerald-500', ring: 'ring-emerald-400', dot: 'bg-emerald-200' },
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => setRiskFilter(prev => prev === f.key ? null : f.key)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                      riskFilter === f.key
                        ? `${f.bg} text-white shadow-sm border-transparent`
                        : 'bg-surface-container border-outline-variant text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 ${riskFilter === f.key ? f.dot : f.bg}`} />
                    <span className="text-[12px] font-semibold">{f.label}</span>
                    <span className={`text-[13px] font-bold tabular-nums ml-0.5 ${riskFilter === f.key ? 'text-white/90' : 'text-on-surface'}`}>
                      {riskCounts[f.key] ?? 0}
                    </span>
                  </button>
                ))}
                {riskFilter && (
                  <button
                    onClick={() => setRiskFilter(null)}
                    className="text-[11px] text-on-surface-variant hover:text-error flex items-center gap-0.5 ml-1"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                    Todos
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-sm items-center">
          {showSearch && (
            <div className="relative">
              <span className="material-symbols-outlined absolute left-xs top-1/2 -translate-y-1/2 text-outline text-[18px]">
                search
              </span>
              <input
                type="text"
                defaultValue={table.search}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Buscar contratos..."
                className="pl-xl pr-sm py-xs border border-outline-variant rounded-md bg-surface-container-lowest text-body-sm font-body-sm focus:border-primary-container focus:ring-1 focus:ring-primary-container outline-none w-64"
              />
            </div>
          )}

          {showExport && (
            <button
              onClick={handleExport}
              className="border border-outline-variant text-on-surface px-sm py-xs rounded-md font-table-data text-table-data hover:bg-surface-container transition-colors flex items-center gap-xs"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
              Exportar
            </button>
          )}
        </div>
      </div>

      <div className={viewportClass}>
        {table.loading && (
          <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center">
            <Spinner />
          </div>
        )}
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container text-on-surface-variant font-label-caps text-label-caps border-b border-outline-variant">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`p-sm font-semibold uppercase tracking-wider whitespace-nowrap select-none
                    ${col.sortable ? 'cursor-pointer hover:bg-surface-container-high' : ''}
                    ${col.align === 'right' ? 'text-right' : ''}
                    ${scrollBody ? 'sticky top-0 z-[1] bg-surface-container' : ''}`}
                  onClick={() => col.sortable && setTableSort(tableKey, col.key)}
                >
                  <span className="inline-flex items-center gap-0.5">
                    {col.label}
                    {col.sortable && <SortIcon column={col.key} sortBy={table.sortBy} sortDir={table.sortDir} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-table-data text-table-data text-on-surface divide-y divide-outline-variant">
            {!table.loading && filteredData.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="p-xl text-center text-on-surface-variant">
                  {riskFilter ? 'No hay contratos con ese nivel de riesgo.' : meta.emptyLabel}
                </td>
              </tr>
            )}
            {filteredData.map(contract => (
              <tr key={contract.id} className="hover:bg-surface-container-low transition-colors">
                {columns.map(column => (
                  <td
                    key={column.key}
                    className={`p-sm ${column.align === 'right' ? 'text-right' : ''} ${column.key === 'client' ? 'font-medium max-w-[180px] truncate' : ''}`}
                  >
                    {renderCell(contract, column, tableKey)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-md border-t border-outline-variant flex items-center justify-between gap-sm text-[13px] text-on-surface-variant bg-surface-container-low/30 flex-wrap">
        <span>
          {tableKey === 'upcoming' && riskFilter
            ? <>{filteredData.length.toLocaleString('es-ES')} de {table.total.toLocaleString('es-ES')} contrato{table.total !== 1 ? 's' : ''}</>
            : <>{table.total.toLocaleString('es-ES')} contrato{table.total !== 1 ? 's' : ''}</>
          }
        </span>
        {showPagination ? (
          <Pagination page={table.page} totalPages={table.totalPages} onPage={(page) => setTablePage(tableKey, page)} />
        ) : (
          <span className="text-[12px] text-on-surface-variant">Desplaza dentro de la tabla para ver todos los registros.</span>
        )}
      </div>
    </section>
  );
}
