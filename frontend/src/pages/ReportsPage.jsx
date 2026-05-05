import { useEffect, useState } from 'react';
import Pagination from '../components/ui/Pagination';
import usePerformanceStore from '../store/performanceStore';
import {
  formatCount,
  formatCurrency,
  formatDate,
  formatMonthLabel,
  formatPercent,
  formatReportType,
} from '../utils/formatters';

const SORTABLE_COLUMNS = {
  Mes: 'report_month',
  Fecha: 'sale_date',
  Cliente: 'client_name',
  Ejecutivo: 'sales_person_name',
  Revenue: 'revenue',
  'Gross Profit': 'gross_profit',
  Margen: 'margin',
};

export default function ReportsPage() {
  const rows = usePerformanceStore(s => s.rows);
  const loadRows = usePerformanceStore(s => s.loadRows);
  const setRowsPage = usePerformanceStore(s => s.setRowsPage);
  const setRowsSearch = usePerformanceStore(s => s.setRowsSearch);
  const setRowsSort = usePerformanceStore(s => s.setRowsSort);
  const [search, setSearch] = useState(rows.search);

  useEffect(() => {
    loadRows();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSearch(rows.search);
  }, [rows.search]);

  return (
    <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="p-lg border-b border-outline-variant bg-surface-container-low/30 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-md">
        <div>
          <h2 className="font-h2 text-h2 text-on-surface">Detalle de ventas</h2>
          <p className="text-body-sm text-on-surface-variant mt-xs">
            Consulta el snapshot activo por mes con filtros globales, busqueda y ordenamiento.
          </p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            setRowsSearch(search.trim());
          }}
          className="flex items-center gap-sm w-full lg:w-auto"
        >
          <div className="relative flex-1 lg:w-80">
            <span className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-outline">search</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar cliente, ejecutivo, factura o serie"
              className="w-full border border-outline-variant rounded-lg pl-10 pr-md py-sm bg-white outline-none focus:border-primary-container"
            />
          </div>
          <button className="px-md py-sm bg-primary-container text-on-primary rounded-lg font-medium hover:opacity-90 transition-opacity">
            Buscar
          </button>
        </form>
      </div>

      <div className="px-lg py-md border-b border-outline-variant flex items-center justify-between gap-md text-[13px] text-on-surface-variant">
        <span>{formatCount(rows.total)} fila{rows.total === 1 ? '' : 's'} en el periodo seleccionado.</span>
        {rows.error && <span className="text-red-700">{rows.error}</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-container-low/30 text-on-surface-variant">
            <tr>
              {Object.entries(SORTABLE_COLUMNS).map(([label, sortKey]) => (
                <th key={sortKey} className="px-md py-sm text-left font-medium text-[12px] uppercase tracking-wide">
                  <button
                    type="button"
                    onClick={() => setRowsSort(sortKey)}
                    className="inline-flex items-center gap-[2px] hover:text-primary"
                  >
                    {label}
                    {rows.sortBy === sortKey && (
                      <span className="material-symbols-outlined text-[15px]">{rows.sortDir === 'asc' ? 'north' : 'south'}</span>
                    )}
                  </button>
                </th>
              ))}
              <th className="px-md py-sm text-left font-medium text-[12px] uppercase tracking-wide">Tipo</th>
              <th className="px-md py-sm text-left font-medium text-[12px] uppercase tracking-wide">Configuración</th>
              <th className="px-md py-sm text-left font-medium text-[12px] uppercase tracking-wide">Factura</th>
              <th className="px-md py-sm text-left font-medium text-[12px] uppercase tracking-wide">Serie</th>
            </tr>
          </thead>
          <tbody>
            {rows.loading && (
              <tr>
                <td colSpan={11} className="px-lg py-xl text-center text-on-surface-variant">Cargando detalle...</td>
              </tr>
            )}
            {!rows.loading && rows.data.length === 0 && (
              <tr>
                <td colSpan={11} className="px-lg py-xl text-center text-on-surface-variant">
                  No hay filas disponibles para los filtros activos.
                </td>
              </tr>
            )}
            {!rows.loading && rows.data.map((row) => (
              <tr key={row.id} className="border-t border-outline-variant/70 hover:bg-surface-container-low/20 align-top">
                <Td>{formatMonthLabel(row.report_month)}</Td>
                <Td>{formatDate(row.sale_date)}</Td>
                <Td>{row.client_name || '—'}</Td>
                <Td>{row.sales_person_name || '—'}</Td>
                <Td>{formatCurrency(row.revenue)}</Td>
                <Td>{formatCurrency(row.gross_profit)}</Td>
                <Td>{formatPercent(row.margin)}</Td>
                <Td>
                  <span className={`inline-flex items-center px-sm py-[3px] rounded-full text-[12px] font-semibold ${row.report_type === 'xerox' ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}`}>
                    {formatReportType(row.report_type)}
                  </span>
                </Td>
                <Td className="max-w-[18rem] truncate">{[row.item_model, row.configuration].filter(Boolean).join(' / ') || '—'}</Td>
                <Td>{row.invoice_number || '—'}</Td>
                <Td>{row.serial_number || '—'}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-lg py-md border-t border-outline-variant flex items-center justify-between gap-md bg-surface-container-low/20">
        <p className="text-[13px] text-on-surface-variant">
          Página {rows.page} de {rows.totalPages}
        </p>
        <Pagination page={rows.page} totalPages={rows.totalPages} onPage={setRowsPage} />
      </div>
    </section>
  );
}

function Td({ children }) {
  return <td className="px-md py-sm text-on-surface">{children}</td>;
}
