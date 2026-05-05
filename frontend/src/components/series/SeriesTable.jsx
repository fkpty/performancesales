import { useEffect, useState } from 'react';
import { exportContractSeries, fetchContractSeries } from '../../services/api';
import useContractStore from '../../store/contractStore';
import { formatUsdCurrency } from '../../utils/currency';
import Pagination from '../ui/Pagination';
import Spinner from '../ui/Spinner';
import StatusBadge from '../ui/StatusBadge';

const TABLE_META = {
  upcoming: {
    title: 'Proximos a vencer por serie',
    subtitle: 'Detalle por serie y escala de contratos vigentes cuya fecha final cae dentro del periodo filtrado.',
    emptyLabel: 'No hay series proximas a vencer para los filtros actuales.',
  },
  vigentes: {
    title: 'Contratos vigentes por serie',
    subtitle: 'Detalle completo por serie del query SQL sincronizado, incluyendo responsable.',
    emptyLabel: 'No hay series vigentes para los filtros actuales.',
  },
};

const BASE_COLUMNS = [
  { key: 'segment', label: 'SEGMENTO', sortable: true },
  { key: 'billing_zone', label: 'Z/COBROS', sortable: true },
  { key: 'price_mode', label: 'PRECIOS', sortable: true },
  { key: 'client_code', label: 'CLIENTE', sortable: true },
  { key: 'client', label: 'RAZON SOCIAL', sortable: true },
  { key: 'contract_name', label: 'CONTRATO', sortable: true },
  { key: 'contract_type', label: 'T/CONTRATO', sortable: true },
  { key: 'frequency', label: 'FREC', sortable: true },
  { key: 'duration_months', label: 'DURAC', sortable: true, align: 'right' },
  { key: 'start_date', label: 'F/INICIAL', sortable: true },
  { key: 'end_date', label: 'F/FINAL', sortable: true },
  { key: 'commercial_owner', label: 'RESPONSABLE', sortable: true },
  { key: 'equipment_series', label: 'SERIE', sortable: true },
  { key: 'model', label: 'MODELO', sortable: true },
  { key: 'product', label: 'PRODUCTO', sortable: true },
  { key: 'accessory', label: 'ACCESORIO', sortable: true },
  { key: 'min_copies', label: 'COP MINIMO', sortable: true, align: 'right' },
  { key: 'min_color_copies', label: 'COP MIN COLOR', sortable: true, align: 'right' },
  { key: 'charge_fixed', label: 'CARGO FIJO', sortable: true, align: 'right' },
  { key: 'box_fee', label: 'CUOTA BOX', sortable: true, align: 'right' },
  { key: 'service_fee', label: 'CUOTA SERV', sortable: true, align: 'right' },
  { key: 'average_copies', label: 'COP PROMED', sortable: true, align: 'right' },
  { key: 'scale_type', label: 'TIPO ESCALA', sortable: true },
  { key: 'scale_number', label: 'NUM ESCALA', sortable: true, align: 'right' },
  { key: 'scale_from', label: 'COPIADO DESDE', sortable: true, align: 'right' },
  { key: 'scale_to', label: 'COPIADO HASTA', sortable: true, align: 'right' },
  { key: 'scale_price_per_copy', label: 'PRECIO POR COPIA', sortable: true, align: 'right' },
  { key: 'invoice_literal', label: 'LITERAL FACTURAS', sortable: true },
  { key: 'installation_address', label: 'DIRECCION', sortable: true },
  { key: 'phone1', label: 'TELEFONO 1', sortable: true },
  { key: 'phone2', label: 'TELEFONO 2', sortable: true },
];

const UPCOMING_COLUMNS = [
  ...BASE_COLUMNS.slice(0, 11),
  { key: 'time_remaining', label: 'TIEMPO RESTANTE' },
  { key: 'status', label: 'ESTADO' },
  ...BASE_COLUMNS.slice(11),
];

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

function fmtDate(value) {
  if (!value) return '—';

  const normalized = typeof value === 'string'
    ? value.slice(0, 10)
    : new Date(value).toISOString().slice(0, 10);
  const date = new Date(`${normalized}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function fmtNumber(value, decimals = 2) {
  if (value == null || value === '') return '—';
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return '—';
  return numericValue.toLocaleString('es-ES', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
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
    today.getUTCDate(),
  ));

  if (targetDate < currentDate) {
    return { years: 0, months: 0, days: 0, expired: true };
  }

  let years = targetDate.getUTCFullYear() - currentDate.getUTCFullYear();
  let months = targetDate.getUTCMonth() - currentDate.getUTCMonth();
  let days = targetDate.getUTCDate() - currentDate.getUTCDate();

  if (days < 0) {
    months -= 1;
    const previousMonthDate = new Date(Date.UTC(targetDate.getUTCFullYear(), targetDate.getUTCMonth(), 0));
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
    <span className="material-symbols-outlined text-[14px] ml-1 text-primary-container">
      {sortDir === 'asc' ? 'keyboard_arrow_up' : 'keyboard_arrow_down'}
    </span>
  );
}

function renderCell(row, column, tableKey) {
  switch (column.key) {
    case 'start_date':
    case 'end_date':
      return fmtDate(row[column.key]);
    case 'time_remaining':
      return formatRemainingTime(row.end_date);
    case 'status':
      return <StatusBadge status={getUpcomingRiskStatus(row.end_date)} />;
    case 'charge_fixed':
    case 'box_fee':
    case 'service_fee':
    case 'scale_price_per_copy':
      return formatUsdCurrency(row[column.key]);
    case 'duration_months':
    case 'scale_number':
      return row[column.key] ?? '—';
    case 'min_copies':
    case 'min_color_copies':
    case 'average_copies':
    case 'scale_from':
    case 'scale_to':
      return fmtNumber(row[column.key]);
    default:
      return row[column.key] || '—';
  }
}

export default function SeriesTable({ tableKey = 'vigentes' }) {
  const period = useContractStore(s => s.period);
  const year = useContractStore(s => s.year);
  const month = useContractStore(s => s.month);
  const quarter = useContractStore(s => s.quarter);
  const startDate = useContractStore(s => s.startDate);
  const endDate = useContractStore(s => s.endDate);
  const filters = useContractStore(s => s.filters);
  const refreshVersion = useContractStore(s => s.refreshVersion);

  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('end_date');
  const [sortDir, setSortDir] = useState('asc');
  const meta = TABLE_META[tableKey] || TABLE_META.vigentes;
  const columns = tableKey === 'upcoming' ? UPCOMING_COLUMNS : BASE_COLUMNS;

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 350);

    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [tableKey, period, year, month, quarter, startDate, endDate, filters.client, filters.type, filters.owner, filters.status, filters.business, refreshVersion]);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    fetchContractSeries({
      ...buildDateParams({ period, year, month, quarter, startDate, endDate }),
      ...filters,
      table: tableKey,
      search,
      page,
      limit,
      sortBy,
      sortDir,
    })
      .then((result) => {
        if (cancelled) return;
        setData(Array.isArray(result.data) ? result.data : []);
        setTotal(Number(result.total || 0));
        setTotalPages(Number(result.totalPages || 1));
      })
      .catch((requestError) => {
        if (cancelled) return;
        setError(requestError.response?.data?.error || requestError.message || 'No se pudieron cargar las series.');
        setData([]);
        setTotal(0);
        setTotalPages(1);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tableKey, period, year, month, quarter, startDate, endDate, filters, refreshVersion, search, page, limit, sortBy, sortDir]);

  const handleSort = (column) => {
    if (!column.sortable) return;
    if (column.key === sortBy) {
      setSortDir(current => current === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column.key);
      setSortDir('asc');
    }
    setPage(1);
  };

  const handleExport = () => {
    exportContractSeries({
      ...buildDateParams({ period, year, month, quarter, startDate, endDate }),
      ...filters,
      table: tableKey,
      search,
      sortBy,
      sortDir,
    });
  };

  return (
    <section className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm flex flex-col overflow-hidden">
      <div className="p-md border-b border-outline-variant flex items-center justify-between bg-surface-container-low/50 flex-wrap gap-sm">
        <div>
          <h3 className="font-h3 text-h3 text-on-surface">{meta.title}</h3>
          <p className="text-[12px] text-on-surface-variant mt-0.5">{meta.subtitle}</p>
        </div>

        <div className="flex gap-sm items-center">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-xs top-1/2 -translate-y-1/2 text-outline text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Buscar series..."
              className="pl-xl pr-sm py-xs border border-outline-variant rounded-md bg-surface-container-lowest text-body-sm font-body-sm focus:border-primary-container focus:ring-1 focus:ring-primary-container outline-none w-64"
            />
          </div>

          <button
            onClick={handleExport}
            className="border border-outline-variant text-on-surface px-sm py-xs rounded-md font-table-data text-table-data hover:bg-surface-container transition-colors flex items-center gap-xs"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            Exportar
          </button>
        </div>
      </div>

      <div className="overflow-auto relative max-h-[36rem]">
        {loading && (
          <div className="absolute inset-0 bg-white/60 z-10 flex items-center justify-center">
            <Spinner />
          </div>
        )}

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container text-on-surface-variant font-label-caps text-label-caps border-b border-outline-variant">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`p-sm font-semibold uppercase tracking-wider whitespace-nowrap select-none sticky top-0 z-[1] bg-surface-container ${column.sortable ? 'cursor-pointer hover:bg-surface-container-high' : ''} ${column.align === 'right' ? 'text-right' : ''}`}
                  onClick={() => handleSort(column)}
                >
                  <span className="inline-flex items-center gap-0.5">
                    {column.label}
                    {column.sortable && <SortIcon column={column.key} sortBy={sortBy} sortDir={sortDir} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="font-table-data text-table-data text-on-surface divide-y divide-outline-variant">
            {!loading && data.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="p-xl text-center text-on-surface-variant">
                  {error || meta.emptyLabel}
                </td>
              </tr>
            )}

            {data.map((row) => (
              <tr key={row.id} className="hover:bg-surface-container-low transition-colors">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`p-sm whitespace-nowrap ${column.align === 'right' ? 'text-right' : ''} ${column.key === 'client' || column.key === 'installation_address' ? 'max-w-[240px] truncate' : ''}`}
                    title={typeof row[column.key] === 'string' ? row[column.key] : undefined}
                  >
                    {renderCell(row, column, tableKey)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-md border-t border-outline-variant flex items-center justify-between gap-sm text-[13px] text-on-surface-variant bg-surface-container-low/30 flex-wrap">
        <span>{total.toLocaleString('es-ES')} registro{total !== 1 ? 's' : ''}</span>
        <Pagination page={page} totalPages={totalPages} onPage={setPage} />
      </div>
    </section>
  );
}