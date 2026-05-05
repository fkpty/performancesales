import { useEffect, useState } from 'react';
import StatusBadge from '../ui/StatusBadge';
import Spinner from '../ui/Spinner';

const NEW_COLUMNS = [
  { key: 'client', label: 'Cliente' },
  { key: 'contract_name', label: 'Contrato' },
  { key: 'contract_type', label: 'Tipo' },
  { key: 'business_div_name', label: 'Negocio' },
  { key: 'start_date', label: 'Fecha inicio' },
  { key: 'end_date', label: 'Fecha final' },
  { key: 'display_status', label: 'Estado' },
];

const CLOSED_COLUMNS = [
  { key: 'client', label: 'Cliente' },
  { key: 'contract_name', label: 'Contrato' },
  { key: 'contract_type', label: 'Tipo' },
  { key: 'business_div_name', label: 'Negocio' },
  { key: 'event_date', label: 'Fecha cierre' },
  { key: 'cancellation_date', label: 'Fecha canc.' },
  { key: 'display_status', label: 'Estado' },
];

function fmtDate(value) {
  if (!value) return '—';

  const normalized = typeof value === 'string'
    ? value.slice(0, 10)
    : new Date(value).toISOString().slice(0, 10);
  const date = new Date(`${normalized}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function renderCell(row, column) {
  switch (column.key) {
    case 'start_date':
    case 'end_date':
    case 'event_date':
    case 'cancellation_date':
      return fmtDate(row[column.key]);
    case 'display_status':
      return <StatusBadge status={row.display_status || row.canonical_status || row.status} />;
    default:
      return row[column.key] || '—';
  }
}

function DetailTable({ columns, rows, emptyLabel }) {
  return (
    <div className="overflow-auto rounded-xl border border-outline-variant bg-white max-h-[26rem]">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-surface-container text-on-surface-variant font-label-caps text-label-caps border-b border-outline-variant">
            {columns.map(column => (
              <th
                key={column.key}
                className="p-sm font-semibold uppercase tracking-wider whitespace-nowrap sticky top-0 z-[1] bg-surface-container"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-table-data text-table-data text-on-surface divide-y divide-outline-variant">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-xl text-center text-on-surface-variant">
                {emptyLabel}
              </td>
            </tr>
          ) : rows.map(row => (
            <tr key={row.id} className="hover:bg-surface-container-low transition-colors">
              {columns.map(column => (
                <td key={column.key} className={`p-sm ${column.key === 'client' ? 'max-w-[220px]' : ''}`}>
                  {renderCell(row, column)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LifecycleContractsModal({
  open,
  monthLabel,
  detail,
  loading,
  error,
  defaultTab = 'new',
  onClose,
}) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab, open, monthLabel]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const sections = [
    {
      key: 'new',
      label: 'Contratos nuevos',
      description: 'Contratos cuya fecha de inicio cae dentro del mes seleccionado.',
      count: detail?.newContracts?.length || 0,
      columns: NEW_COLUMNS,
      rows: detail?.newContracts || [],
      emptyLabel: 'No hay contratos nuevos en este mes para los filtros actuales.',
    },
    {
      key: 'cancelled',
      label: 'Cancelados',
      description: 'Contratos cuya fecha de cancelación cae dentro del mes seleccionado.',
      count: detail?.cancelledContracts?.length || 0,
      columns: CLOSED_COLUMNS,
      rows: detail?.cancelledContracts || [],
      emptyLabel: 'No hay contratos cancelados en este mes para los filtros actuales.',
    },
    {
      key: 'expired',
      label: 'Vencidos',
      description: 'Contratos cuya fecha de vencimiento cae dentro del mes seleccionado.',
      count: detail?.expiredContracts?.length || 0,
      columns: CLOSED_COLUMNS,
      rows: detail?.expiredContracts || [],
      emptyLabel: 'No hay contratos vencidos en este mes para los filtros actuales.',
    },
  ];

  const activeSection = sections.find(section => section.key === activeTab) || sections[0];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="min-h-full flex items-start md:items-center justify-center">
        <div
          className="bg-white rounded-2xl shadow-xl w-full max-w-6xl my-4 overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col"
          onClick={event => event.stopPropagation()}
        >
          <div className="flex items-center justify-between px-lg py-md border-b border-outline-variant">
            <div>
              <h2 className="font-h3 text-h3 text-on-surface">Detalle mensual de contratos</h2>
              <p className="text-[12px] text-on-surface-variant mt-0.5">
                {monthLabel || detail?.month || 'Mes seleccionado'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-outline hover:text-on-surface material-symbols-outlined text-[22px] transition-colors"
            >
              close
            </button>
          </div>

          <div className="px-lg pt-md border-b border-outline-variant flex flex-wrap gap-sm">
            {sections.map(section => (
              <button
                key={section.key}
                onClick={() => setActiveTab(section.key)}
                className={`px-md py-xs rounded-t-xl border border-b-0 transition-colors ${
                  activeTab === section.key
                    ? 'bg-surface-container text-on-surface border-outline-variant'
                    : 'bg-surface-container-low/40 text-on-surface-variant border-transparent hover:text-on-surface'
                }`}
              >
                <span className="font-semibold">{section.label}</span>
                <span className="ml-xs text-[12px] text-on-surface-variant">{section.count}</span>
              </button>
            ))}
          </div>

          <div className="p-lg overflow-y-auto">
            {loading ? (
              <div className="h-72 flex items-center justify-center"><Spinner /></div>
            ) : error ? (
              <div className="bg-error-container border border-red-200 rounded-xl p-md text-on-error-container">
                {error}
              </div>
            ) : (
              <div className="space-y-md">
                <div className="flex items-start justify-between gap-md flex-wrap">
                  <div>
                    <h3 className="font-h3 text-h3 text-on-surface">{activeSection.label}</h3>
                    <p className="text-[12px] text-on-surface-variant mt-1">{activeSection.description}</p>
                  </div>
                  <div className="px-sm py-xs rounded-lg bg-surface-container text-on-surface text-[13px] font-semibold">
                    {activeSection.count.toLocaleString('es-ES')} contrato{activeSection.count !== 1 ? 's' : ''}
                  </div>
                </div>
                <DetailTable
                  columns={activeSection.columns}
                  rows={activeSection.rows}
                  emptyLabel={activeSection.emptyLabel}
                />
              </div>
            )}
          </div>

          <div className="px-lg py-md border-t border-outline-variant flex justify-end">
            <button
              onClick={onClose}
              className="px-md py-xs border border-outline-variant rounded-lg text-on-surface font-body-sm hover:bg-surface-container transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}