import { useEffect, useState } from 'react';
import Pagination from '../components/ui/Pagination';
import UploadModal from '../components/UploadModal';
import usePerformanceStore from '../store/performanceStore';
import {
  formatCount,
  formatCurrency,
  formatDateTime,
  formatMonthLabel,
  formatReportType,
} from '../utils/formatters';

export default function UploadsPage() {
  const uploads = usePerformanceStore(s => s.uploads);
  const loadUploads = usePerformanceStore(s => s.loadUploads);
  const setUploadsPage = usePerformanceStore(s => s.setUploadsPage);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    loadUploads();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

          <button
            onClick={() => setShowUpload(true)}
            className="bg-primary-container text-on-primary font-body-sm px-md py-sm rounded-lg flex items-center gap-xs hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-[18px]">upload_file</span>
            Subir reportes
          </button>
        </div>

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