import { useEffect, useRef, useState } from 'react';
import { fetchContracts } from '../../services/api';
import useContractStore from '../../store/contractStore';
import { formatUsdCurrency } from '../../utils/currency';
import Spinner from '../ui/Spinner';
import StatusBadge from '../ui/StatusBadge';

const RISK_CONFIG = {
  RIESGO:         { row: 'bg-red-50 border-l-4 border-red-500',          badge: 'bg-red-100 text-red-800',             dot: 'bg-red-500',      label: 'Critico'    },
  HASTA_6_MESES:  { row: 'bg-amber-50 border-l-4 border-amber-400',      badge: 'bg-amber-100 text-amber-800',         dot: 'bg-amber-400',    label: 'Precaucion' },
  MAS_DE_6_MESES: { row: 'bg-emerald-50 border-l-4 border-emerald-400',  badge: 'bg-emerald-100 text-emerald-800',     dot: 'bg-emerald-500',  label: 'Estable'     },
};

const MONTH_DETAIL_COLUMNS = [
  { key: 'client_code', label: 'CLIENTE' },
  { key: 'client', label: 'RAZON SOCIAL', widthClass: 'w-[22rem] min-w-[22rem] max-w-[22rem]' },
  { key: 'contract_name', label: 'CONTRATO' },
  { key: 'contract_type', label: 'TIPO' },
  { key: 'duration_months', label: 'DURACION', align: 'right' },
  { key: 'start_date', label: 'FECHA INICIO' },
  { key: 'end_date', label: 'FECHA FINAL' },
  { key: 'time_remaining', label: 'TIEMPO RESTANTE' },
  { key: 'status', label: 'ESTADO', align: 'center' },
  { key: 'charge_fixed', label: 'CARGO FIJO', align: 'right' },
  { key: 'box_fee', label: 'CUOTA BOX', align: 'right' },
  { key: 'service_fee', label: 'CUOTA SERV', align: 'right' },
];

function fmtDate(value) {
  if (!value) return '—';

  const normalized = typeof value === 'string'
    ? value.slice(0, 10)
    : new Date(value).toISOString().slice(0, 10);
  const d = new Date(`${normalized}T00:00:00Z`);

  if (Number.isNaN(d.getTime())) return '—';

  return d.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
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

function getUpcomingRiskStatus(endDate) {
  const daysUntil = getDaysUntil(endDate);

  if (daysUntil == null) return null;
  if (daysUntil <= 90) return 'RIESGO';
  if (daysUntil <= 180) return 'HASTA_6_MESES';
  return 'MAS_DE_6_MESES';
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

function buildMonthRange(bucket) {
  if (!/^\d{4}-\d{2}$/.test(String(bucket || ''))) return null;

  const [yearRaw, monthRaw] = bucket.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    startDate: `${yearRaw}-${monthRaw}-01`,
    endDate: `${yearRaw}-${monthRaw}-${String(lastDay).padStart(2, '0')}`,
  };
}

function renderMonthDetailCell(contract, columnKey) {
  switch (columnKey) {
    case 'start_date':
    case 'end_date':
      return fmtDate(contract[columnKey]);
    case 'time_remaining':
      return formatRemainingTime(contract.end_date);
    case 'charge_fixed':
    case 'box_fee':
    case 'service_fee':
      return formatUsdCurrency(contract[columnKey]);
    case 'duration_months':
      return contract[columnKey] ?? '—';
    case 'status': {
      const status = getUpcomingRiskStatus(contract.end_date) || contract.display_status || contract.canonical_status || contract.status;
      return <StatusBadge status={status} />;
    }
    default:
      return contract[columnKey] || '—';
  }
}

function getMonthDetailCellClass(column) {
  const alignmentClass = column.align === 'right'
    ? 'text-right'
    : column.align === 'center'
      ? 'text-center'
      : '';

  const widthClass = column.widthClass || '';

  if (column.key === 'client') {
    return `p-sm ${alignmentClass} ${widthClass}`.trim();
  }

  return `p-sm whitespace-nowrap ${alignmentClass} ${widthClass}`.trim();
}

export default function ExpirySection() {
  const expiry        = useContractStore(s => s.expiry);
  const loading       = useContractStore(s => s.expiryLoading);
  const [riskFilter, setRiskFilter] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [monthContracts, setMonthContracts] = useState([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [detailScrollMetrics, setDetailScrollMetrics] = useState({ scrollWidth: 0, clientWidth: 0 });
  const detailTableScrollRef = useRef(null);
  const detailBottomScrollbarRef = useRef(null);

  const orderedExpiry = [...expiry].sort((left, right) => {
    const leftBucket = String(left.bucket || '');
    const rightBucket = String(right.bucket || '');
    return leftBucket.localeCompare(rightBucket);
  });

  const filteredExpiry = riskFilter
    ? orderedExpiry.filter(row => row.risk_level === riskFilter)
    : orderedExpiry;

  const riskCounts = orderedExpiry.reduce((acc, row) => {
    const key = row.risk_level;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const openMonthDetails = async (row) => {
    const range = buildMonthRange(row.bucket);
    if (!range) {
      setDetailsError('No se pudo determinar el rango del mes seleccionado.');
      setSelectedMonth(row);
      setMonthContracts([]);
      return;
    }

    setSelectedMonth(row);
    setMonthContracts([]);
    setDetailsError('');
    setDetailsLoading(true);

    try {
      const state = useContractStore.getState();
      const data = await fetchContracts({
        ...state.filters,
        period: 'personalizado',
        startDate: range.startDate,
        endDate: range.endDate,
        table: 'upcoming',
        page: 1,
        limit: 10000,
        sortBy: 'end_date',
        sortDir: 'asc',
      });

      setMonthContracts(data.data || []);
    } catch (error) {
      setDetailsError(error.response?.data?.error || error.message || 'No se pudieron cargar los contratos del mes.');
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeMonthDetails = () => {
    setSelectedMonth(null);
    setMonthContracts([]);
    setDetailsError('');
    setDetailsLoading(false);
  };

  useEffect(() => {
    const syncMetrics = () => {
      const container = detailTableScrollRef.current;
      if (!container) {
        setDetailScrollMetrics({ scrollWidth: 0, clientWidth: 0 });
        return;
      }

      setDetailScrollMetrics({
        scrollWidth: container.scrollWidth,
        clientWidth: container.clientWidth,
      });
    };

    syncMetrics();

    const container = detailTableScrollRef.current;
    if (!container) return undefined;

    const table = container.querySelector('table');
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(syncMetrics) : null;

    observer?.observe(container);
    if (table) observer?.observe(table);

    window.addEventListener('resize', syncMetrics);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', syncMetrics);
    };
  }, [selectedMonth, monthContracts.length, detailsLoading, detailsError]);

  useEffect(() => {
    if (!selectedMonth) return;

    if (detailTableScrollRef.current) {
      detailTableScrollRef.current.scrollLeft = 0;
    }

    if (detailBottomScrollbarRef.current) {
      detailBottomScrollbarRef.current.scrollLeft = 0;
    }
  }, [selectedMonth]);

  const syncDetailHorizontalScroll = (source) => {
    const tableScroller = detailTableScrollRef.current;
    const bottomScroller = detailBottomScrollbarRef.current;

    if (!tableScroller || !bottomScroller) return;

    if (source === 'table' && bottomScroller.scrollLeft !== tableScroller.scrollLeft) {
      bottomScroller.scrollLeft = tableScroller.scrollLeft;
    }

    if (source === 'bottom' && tableScroller.scrollLeft !== bottomScroller.scrollLeft) {
      tableScroller.scrollLeft = bottomScroller.scrollLeft;
    }
  };

  return (
    <>
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm overflow-hidden">
        {/* Header */}
        <div className="p-md border-b border-outline-variant bg-surface-container-low/50">
          <div className="flex items-start justify-between gap-md">
            <div>
              <h3 className="font-h3 text-h3 text-on-surface">Vencimientos próximos</h3>
              <p className="text-[12px] text-on-surface-variant mt-0.5">
                Contratos que vencen por mes · ordenados cronológicamente
              </p>
              <p className="text-[12px] text-on-surface-variant mt-xs">
                Usa los mismos criterios de riesgo que "Próximos a vencer": crítico hasta 90 días, precaución hasta 180 días y estable después de 180 días.
              </p>
            </div>
            <div className="hidden lg:flex items-center gap-sm text-[12px] text-on-surface-variant shrink-0">
              <span>Niveles:</span>
              {Object.entries(RISK_CONFIG).map(([key, value]) => (
                <span key={key} className="flex items-center gap-1.5">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${value.dot}`} />
                  {value.label}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-sm flex flex-wrap items-center gap-2">
            <button
              onClick={() => setRiskFilter(null)}
              className={`px-3 py-1.5 rounded-lg border text-[12px] font-semibold transition-colors ${
                riskFilter == null
                  ? 'bg-primary-container text-on-primary border-primary-container'
                  : 'bg-white text-on-surface border-outline-variant hover:bg-primary/5 hover:border-primary/20'
              }`}
            >
              Todos ({orderedExpiry.length})
            </button>
            {Object.entries(RISK_CONFIG).map(([key, value]) => (
              <button
                key={key}
                onClick={() => setRiskFilter(prev => prev === key ? null : key)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[12px] font-semibold transition-colors ${
                  riskFilter === key
                    ? 'bg-primary-container text-on-primary border-primary-container'
                    : 'bg-white text-on-surface border-outline-variant hover:bg-primary/5 hover:border-primary/20'
                }`}
              >
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${value.dot}`} />
                {value.label} ({riskCounts[key] || 0})
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-xl flex items-center justify-center"><Spinner /></div>
        ) : filteredExpiry.length === 0 ? (
          <div className="p-xl text-center text-on-surface-variant font-body-sm">
            {riskFilter ? 'No hay meses con ese nivel de riesgo para el periodo seleccionado.' : 'No hay vencimientos próximos para el periodo seleccionado.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container text-on-surface-variant font-label-caps text-label-caps border-b border-outline-variant">
                  <th className="p-sm font-semibold uppercase tracking-wider">Mes</th>
                  <th className="p-sm font-semibold uppercase tracking-wider text-right"># Contratos</th>
                  <th className="p-sm font-semibold uppercase tracking-wider text-right">Ingresos en riesgo</th>
                  <th className="p-sm font-semibold uppercase tracking-wider text-center">Nivel de riesgo</th>
                </tr>
              </thead>
              <tbody className="font-table-data text-table-data text-on-surface divide-y divide-outline-variant">
                {filteredExpiry.map((row) => {
                  const cfg = RISK_CONFIG[row.risk_level] || RISK_CONFIG.MAS_DE_6_MESES;
                  return (
                    <tr
                      key={row.month}
                      role="button"
                      tabIndex={0}
                      onClick={() => openMonthDetails(row)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openMonthDetails(row);
                        }
                      }}
                      className={`${cfg.row} transition-colors cursor-pointer hover:brightness-[0.98] focus:outline-none focus:ring-2 focus:ring-primary-container/40`}
                    >
                      <td className="p-sm font-medium">{row.month}</td>
                      <td className="p-sm text-right">
                        <span className="font-semibold">{row.count}</span>
                      </td>
                      <td className="p-sm text-right">
                        {formatUsdCurrency(row.revenue_at_risk)}
                      </td>
                      <td className="p-sm text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide ${cfg.badge}`}>
                          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                          {cfg.label.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedMonth && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm px-3 py-4 sm:p-6" onClick={closeMonthDetails}>
            <div className="min-h-full flex items-center justify-center">
            <div
                className="bg-white rounded-2xl shadow-xl border border-outline-variant w-[min(98vw,88rem)] max-h-[88vh] overflow-hidden flex flex-col"
              onClick={(event) => event.stopPropagation()}
            >
                <div className="px-md sm:px-lg py-md border-b border-outline-variant flex items-start justify-between gap-md bg-surface-container-low/50 shrink-0">
                  <div className="min-w-0">
                    <h2 className="font-h3 text-h3 text-on-surface break-words">Detalle de vencimientos: {selectedMonth.month}</h2>
                  <p className="text-[12px] text-on-surface-variant mt-0.5">
                    {selectedMonth.count} contrato{selectedMonth.count !== 1 ? 's' : ''} en este mes y {formatUsdCurrency(selectedMonth.revenue_at_risk)} en ingresos en riesgo.
                  </p>
                </div>
                <button
                  onClick={closeMonthDetails}
                    className="text-outline hover:text-on-surface material-symbols-outlined text-[22px] transition-colors shrink-0"
                >
                  close
                </button>
              </div>

                <div className="p-md sm:p-lg flex-1 min-h-0 overflow-hidden">
                {detailsLoading ? (
                    <div className="h-full min-h-[16rem] flex items-center justify-center"><Spinner /></div>
                ) : detailsError ? (
                    <div className="bg-error-container border border-red-200 rounded-xl p-md text-on-error-container text-[13px]">
                    {detailsError}
                  </div>
                ) : monthContracts.length === 0 ? (
                    <div className="h-full min-h-[16rem] flex items-center justify-center text-center text-on-surface-variant font-body-sm">
                    No se encontraron contratos para ese mes con los filtros actuales.
                  </div>
                ) : (
                    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden flex flex-col">
                      <div className="max-h-[60vh] overflow-y-auto">
                        <div
                          ref={detailTableScrollRef}
                          onScroll={() => syncDetailHorizontalScroll('table')}
                          className="overflow-x-auto hide-scrollbar"
                        >
                          <table className="text-left border-collapse min-w-[1500px] w-max">
                            <thead>
                              <tr className="bg-surface-container text-on-surface-variant font-label-caps text-label-caps border-b border-outline-variant">
                                {MONTH_DETAIL_COLUMNS.map((column) => (
                                  <th
                                    key={column.key}
                                    className={`sticky top-0 z-[2] bg-surface-container p-sm font-semibold uppercase tracking-wider whitespace-nowrap ${getMonthDetailCellClass(column)}`}
                                  >
                                    {column.label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="font-table-data text-table-data text-on-surface divide-y divide-outline-variant">
                              {monthContracts.map((contract) => {
                                return (
                                  <tr key={contract.id} className="hover:bg-surface-container-low transition-colors">
                                    {MONTH_DETAIL_COLUMNS.map((column) => (
                                      <td
                                        key={column.key}
                                        className={`${getMonthDetailCellClass(column)} ${column.key === 'client' ? 'font-medium align-top' : ''}`}
                                        title={column.key === 'client' ? contract.client || '—' : undefined}
                                      >
                                        {column.key === 'client' ? (
                                          <div className="whitespace-normal break-words leading-snug">
                                            {renderMonthDetailCell(contract, column.key)}
                                          </div>
                                        ) : (
                                          renderMonthDetailCell(contract, column.key)
                                        )}
                                      </td>
                                    ))}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      {detailScrollMetrics.scrollWidth > detailScrollMetrics.clientWidth ? (
                        <div className="shrink-0 border-t border-outline-variant bg-surface-container-low px-sm py-2">
                          <div
                            ref={detailBottomScrollbarRef}
                            onScroll={() => syncDetailHorizontalScroll('bottom')}
                            className="h-4 overflow-x-auto overflow-y-hidden"
                          >
                            <div style={{ width: `${detailScrollMetrics.scrollWidth}px`, height: '1px' }} />
                          </div>
                        </div>
                      ) : null}
                    </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
