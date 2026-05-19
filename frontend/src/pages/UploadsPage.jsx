import { useState } from 'react';
import Pagination from '../components/ui/Pagination';
import UploadModal from '../components/UploadModal';
import usePerformancePageScope from '../hooks/usePerformancePageScope';
import { clearPerformanceUploadData } from '../services/api';
import usePerformanceStore from '../store/performanceStore';
import {
  formatCount,
  formatCurrency,
  formatDateTime,
  formatMonthLabel,
  formatReportType,
} from '../utils/formatters';

const CLEAR_ACTIONS = [
  {
    reportType: 'xerox',
    title: 'Eliminar Equipos Xerox',
    description: 'Borra todos los lotes y registros importados para la carga de Equipos Xerox.',
  },
  {
    reportType: 'it',
    title: 'Eliminar Equipo IT',
    description: 'Borra todos los lotes y registros importados para la carga del portafolio IT.',
  },
  {
    reportType: 'postventas',
    title: 'Eliminar Post Ventas',
    description: 'Borra todos los lotes y registros importados para la carga de Post Ventas.',
  },
];

export default function UploadsPage() {
  const uploads = usePerformanceStore(s => s.uploads);
  const setUploadsPage = usePerformanceStore(s => s.setUploadsPage);
  const canUploadReports = usePerformanceStore(s => s.canUploadReports);
  const refreshAll = usePerformanceStore(s => s.refreshAll);
  const [showUpload, setShowUpload] = useState(false);
  const [deletingReportType, setDeletingReportType] = useState('');
  const [actionFeedback, setActionFeedback] = useState(null);

  usePerformancePageScope('', 'uploads');

  const handleClearData = async (reportType) => {
    const reportTypeLabel = formatReportType(reportType);
    const confirmed = window.confirm(
      `Vas a eliminar toda la informacion cargada de ${reportTypeLabel}. Esta accion borra lotes e importaciones de ese tipo y solo se ejecuta si confirmas. ¿Deseas continuar?`
    );

    if (!confirmed) {
      return;
    }

    setDeletingReportType(reportType);
    setActionFeedback(null);

    try {
      const result = await clearPerformanceUploadData(reportType);
      const deletedRows = Number(result?.deleted_rows || 0);
      const deletedBatches = Number(result?.deleted_batches || 0);

      setActionFeedback({
        type: 'success',
        message: deletedRows || deletedBatches
          ? `Se elimino la informacion cargada de ${reportTypeLabel}: ${formatCount(deletedRows)} registro${deletedRows === 1 ? '' : 's'} y ${formatCount(deletedBatches)} lote${deletedBatches === 1 ? '' : 's'}.`
          : `No habia informacion cargada para ${reportTypeLabel}.`,
      });
      refreshAll();
    } catch (error) {
      setActionFeedback({
        type: 'error',
        message: error?.message || `No se pudo eliminar la informacion cargada de ${reportTypeLabel}.`,
      });
    } finally {
      setDeletingReportType('');
    }
  };

  return (
    <div className="space-y-lg">
      <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
        <div className="p-lg flex flex-col lg:flex-row lg:items-center lg:justify-between gap-md border-b border-outline-variant bg-surface-container-low/40">
          <div>
            <h2 className="font-h2 text-h2 text-on-surface">Cargas mensuales</h2>
            <p className="text-body-sm text-on-surface-variant mt-xs max-w-3xl">
              Cada carga genera un lote nuevo. Si vuelves a subir el mismo tipo y mes, la herramienta reemplaza el snapshot activo,
              pero conserva el historial de cargas anteriores para auditoria.
            </p>
          </div>

          {canUploadReports && (
            <button
              onClick={() => setShowUpload(true)}
              className="bg-primary-container text-on-primary font-body-sm px-md py-sm rounded-lg flex items-center gap-xs hover:opacity-90 transition-opacity"
            >
              <span className="material-symbols-outlined text-[18px]">upload_file</span>
              Subir reportes
            </button>
          )}
        </div>

        {canUploadReports && (
          <div className="p-lg border-b border-outline-variant bg-red-50/70 space-y-md">
            <div>
              <h3 className="font-h3 text-h3 text-on-surface">Eliminar informacion cargada</h3>
              <p className="text-body-sm text-on-surface-variant mt-xs max-w-3xl">
                Usa estos botones solo si realmente quieres borrar la data importada de un tipo de reporte. No se elimina nada hasta que confirmas la accion.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
              {CLEAR_ACTIONS.map((action) => {
                const isDeleting = deletingReportType === action.reportType;

                return (
                  <div key={action.reportType} className="rounded-2xl border border-red-200 bg-white p-md space-y-sm">
                    <div className="flex items-start gap-sm">
                      <span className="material-symbols-outlined text-[24px] text-red-500">delete</span>
                      <div>
                        <h4 className="font-medium text-on-surface">{action.title}</h4>
                        <p className="text-[12px] text-on-surface-variant mt-xs">{action.description}</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleClearData(action.reportType)}
                      disabled={Boolean(deletingReportType)}
                      className="w-full px-md py-xs rounded-lg border border-red-300 bg-red-50 text-red-700 font-body-sm hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-xs"
                    >
                      {isDeleting ? (
                        <>
                          <span className="h-4 w-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                          Eliminando...
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                          Eliminar info cargada
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            {actionFeedback && (
              <div className={`rounded-xl px-md py-sm text-[13px] border ${actionFeedback.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-error-container border-red-200 text-on-error-container'}`}>
                {actionFeedback.message}
              </div>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-container-low/30 text-on-surface-variant">
              <tr>
                <Th>Mes</Th>
                <Th>Tipo</Th>
                <Th>Archivo</Th>
                <Th className="text-right">Registros</Th>
                <Th className="text-right">Revenue</Th>
                <Th className="text-right">Gross Profit</Th>
                <Th>Estado</Th>
                <Th>Subido</Th>
              </tr>
            </thead>
            <tbody>
              {uploads.loading && (
                <tr>
                  <td colSpan={8} className="px-lg py-xl text-center text-on-surface-variant">Cargando historial...</td>
                </tr>
              )}
              {!uploads.loading && uploads.data.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-lg py-xl text-center text-on-surface-variant">
                    No hay cargas registradas para el periodo seleccionado.
                  </td>
                </tr>
              )}
              {!uploads.loading && uploads.data.map((upload) => (
                <tr key={upload.id} className="border-t border-outline-variant/70 hover:bg-surface-container-low/20">
                  <Td>{formatMonthLabel(upload.report_month)}</Td>
                  <Td>{formatReportType(upload.report_type)}</Td>
                  <Td className="max-w-[24rem] truncate">{upload.filename}</Td>
                  <Td className="text-right">{formatCount(upload.records_imported)}</Td>
                  <Td className="text-right">{formatCurrency(upload.total_revenue)}</Td>
                  <Td className="text-right">{formatCurrency(upload.total_gross_profit)}</Td>
                  <Td>
                    <span className={`inline-flex items-center px-sm py-[3px] rounded-full text-[12px] font-semibold ${upload.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-surface-container-high text-on-surface-variant'}`}>
                      {upload.is_active ? 'Activo' : 'Historico'}
                    </span>
                  </Td>
                  <Td>{formatDateTime(upload.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-lg py-md border-t border-outline-variant flex items-center justify-between gap-md bg-surface-container-low/20">
          <p className="text-[13px] text-on-surface-variant">
            {formatCount(uploads.total)} lote{uploads.total === 1 ? '' : 's'} en historial.
          </p>
          <Pagination page={uploads.page} totalPages={uploads.totalPages} onPage={setUploadsPage} />
        </div>
      </section>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </div>
  );
}

function Th({ children, className = '' }) {
  return <th className={`px-lg py-sm text-left font-medium text-[12px] uppercase tracking-wide ${className}`}>{children}</th>;
}

function Td({ children, className = '' }) {
  return <td className={`px-lg py-sm text-on-surface ${className}`}>{children}</td>;
}