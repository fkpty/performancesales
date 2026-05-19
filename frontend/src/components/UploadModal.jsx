import { useState } from 'react';
import { clearPerformanceUploadData, uploadPerformanceReport } from '../services/api';
import usePerformanceStore from '../store/performanceStore';
import { formatMonthLabel, formatReportType } from '../utils/formatters';

const REPORT_CONFIG = {
  xerox: {
    title: 'Equipos Xerox',
    description: 'Carga el reporte mensual de margen para equipos Xerox.',
    helper: 'Si subes el mismo mes otra vez, se reemplaza el snapshot activo y el historial se conserva.',
  },
  it: {
    title: 'Equipo IT',
    description: 'Carga el reporte mensual de margen para el portafolio IT.',
    helper: 'Las cargas anteriores del mismo mes quedan archivadas y la mas reciente pasa a ser la activa.',
  },
  postventas: {
    title: 'Post Ventas',
    description: 'Carga el reporte mensual del equipo de Mirna Castillos para Post Ventas.',
    helper: 'El archivo se relaciona con el grupo 4 por Employee Code y calcula YTD Rev / YTD Profit desde Total Corp Price y Total Corp Cost.',
  },
};

function createUploadState() {
  return {
    file: null,
    status: 'idle',
    progress: 0,
    result: null,
    deleteStatus: 'idle',
    deleteResult: null,
  };
}

function createUploadsState() {
  return Object.fromEntries(
    Object.keys(REPORT_CONFIG).map((reportType) => [reportType, createUploadState()])
  );
}

export default function UploadModal({ onClose }) {
  const refreshAll = usePerformanceStore(s => s.refreshAll);
  const [uploads, setUploads] = useState(createUploadsState);

  const handleFileChange = (reportType, file) => {
    setUploads(current => ({
      ...current,
      [reportType]: {
        ...current[reportType],
        file: file || null,
        status: 'idle',
        progress: 0,
        result: null,
      },
    }));
  };

  const handleDelete = async (reportType) => {
    const reportTypeLabel = formatReportType(reportType);

    setUploads(current => ({
      ...current,
      [reportType]: {
        ...current[reportType],
        deleteStatus: 'deleting',
        deleteResult: null,
      },
    }));

    try {
      const result = await clearPerformanceUploadData(reportType);
      setUploads(current => ({
        ...current,
        [reportType]: {
          ...current[reportType],
          deleteStatus: 'success',
          deleteResult: {
            deletedRows: Number(result?.deleted_rows || 0),
            deletedBatches: Number(result?.deleted_batches || 0),
          },
        },
      }));
      refreshAll();
    } catch (error) {
      setUploads(current => ({
        ...current,
        [reportType]: {
          ...current[reportType],
          deleteStatus: 'error',
          deleteResult: {
            error: error?.message || `No se pudo eliminar la informacion cargada de ${reportTypeLabel}.`,
          },
        },
      }));
    }
  };

  const handleSubmit = async (reportType) => {
    const selectedFile = uploads[reportType].file;

    if (!selectedFile) {
      setUploads(current => ({
        ...current,
        [reportType]: {
          ...current[reportType],
          status: 'error',
          progress: 0,
          result: { error: 'Selecciona un archivo .xlsx o .csv.' },
        },
      }));
      return;
    }

    setUploads(current => ({
      ...current,
      [reportType]: {
        ...current[reportType],
        status: 'uploading',
        progress: 0,
        result: null,
      },
    }));

    try {
      const data = await uploadPerformanceReport(reportType, selectedFile, (progress) => {
        setUploads(current => ({
          ...current,
          [reportType]: {
            ...current[reportType],
            progress,
          },
        }));
      });

      setUploads(current => ({
        ...current,
        [reportType]: {
          ...current[reportType],
          status: 'success',
          progress: 100,
          result: data,
        },
      }));
      refreshAll();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'La operación falló';
      const errors = err.response?.data?.errors || [];
      setUploads(current => ({
        ...current,
        [reportType]: {
          ...current[reportType],
          status: 'error',
          progress: 0,
          result: { error: msg, errors },
        },
      }));
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-sm p-4">
      <div className="min-h-full flex items-start md:items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl my-4 overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col">
          <div className="flex items-center justify-between px-lg py-md border-b border-outline-variant">
            <div>
              <h2 className="font-h3 text-h3 text-on-surface">Cargar reportes mensuales</h2>
              <p className="text-[12px] text-on-surface-variant mt-0.5">
                Cada archivo crea un lote nuevo y la herramienta conserva el historial aun cuando reemplaza el snapshot activo del mes.
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-outline hover:text-on-surface material-symbols-outlined text-[22px] transition-colors"
            >
              close
            </button>
          </div>

          <div className="p-lg grid grid-cols-1 md:grid-cols-2 gap-md overflow-y-auto">
            {Object.entries(REPORT_CONFIG).map(([reportType, config]) => {
              const uploadState = uploads[reportType];
              const isProcessing = uploadState.status === 'uploading';
              const isDeleting = uploadState.deleteStatus === 'deleting';

              return (
                <div key={reportType} className="border border-outline-variant rounded-2xl p-md space-y-md bg-surface-container-low/30">
                  <div>
                    <h3 className="font-h3 text-h3 text-on-surface">{config.title}</h3>
                    <p className="text-[12px] text-on-surface-variant mt-1">{config.description}</p>
                  </div>

                  <div className="w-full border border-outline-variant rounded-xl py-lg px-md bg-white/70 space-y-sm">
                    <div className="flex items-start gap-sm">
                      <span className="material-symbols-outlined text-[28px] text-outline">upload_file</span>
                      <div>
                        <p className="font-medium text-on-surface">Archivo Excel mensual</p>
                        <p className="text-[12px] text-on-surface-variant">
                          Sube el reporte de margen correspondiente a {formatReportType(reportType).toLowerCase()}.
                        </p>
                        <p className="text-[12px] text-on-surface-variant mt-xs">{config.helper}</p>
                      </div>
                    </div>

                    <label className="flex items-center justify-between gap-sm rounded-lg border border-dashed border-outline-variant px-md py-sm cursor-pointer hover:bg-surface-container transition-colors">
                      <span className="text-[13px] text-on-surface truncate">
                        {uploadState.file?.name || 'Seleccionar archivo (.xlsx, .xls o .csv)'}
                      </span>
                      <span className="text-[12px] font-medium text-primary">Examinar</span>
                      <input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={(event) => handleFileChange(reportType, event.target.files?.[0] || null)}
                      />
                    </label>
                  </div>

                  {isProcessing && (
                    <div>
                      <div className="flex justify-between text-[12px] text-on-surface-variant mb-xs">
                        <span>Cargando y procesando…</span>
                        <span>{`${uploadState.progress}%`}</span>
                      </div>
                      <div className="w-full bg-surface-container-high rounded-full h-1.5">
                        <div
                          className="bg-primary-container h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${uploadState.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {uploadState.status === 'success' && uploadState.result && (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-md space-y-xs">
                      <div className="flex items-center gap-xs text-green-800 font-semibold">
                        <span className="material-symbols-outlined text-[20px]">check_circle</span>
                        Importación completada
                      </div>
                      <p className="text-[13px] text-green-700">
                        Se importaron {uploadState.result.records_imported} registro{uploadState.result.records_imported !== 1 ? 's' : ''} para {formatMonthLabel(uploadState.result.report_month)}.
                      </p>
                      <p className="text-[13px] text-green-700">
                        {uploadState.result.replaced_active_snapshot
                          ? 'La carga anterior de ese mes quedó archivada y el snapshot activo fue reemplazado.'
                          : 'El reporte quedó activo y disponible para el panel.'}
                      </p>
                      {uploadState.result.errors?.length > 0 && (
                        <details className="text-[12px] text-green-700 mt-xs">
                          <summary className="cursor-pointer font-medium">Ver observaciones</summary>
                          <ul className="mt-xs ml-md list-disc space-y-0.5">
                            {uploadState.result.errors.map((error, index) => <li key={index}>{error}</li>)}
                          </ul>
                        </details>
                      )}
                    </div>
                  )}

                  {uploadState.status === 'error' && uploadState.result?.error && (
                    <div className="bg-error-container border border-red-200 rounded-xl p-md space-y-xs">
                      <div className="flex items-center gap-xs text-on-error-container font-semibold">
                        <span className="material-symbols-outlined text-[20px] text-error">error</span>
                        No se pudo importar el archivo
                      </div>
                      <p className="text-[13px] text-on-error-container">{uploadState.result.error}</p>
                      {uploadState.result.errors?.length > 0 && (
                        <ul className="ml-md list-disc text-[12px] text-on-error-container space-y-0.5">
                          {uploadState.result.errors.map((error, index) => <li key={index}>{error}</li>)}
                        </ul>
                      )}
                    </div>
                  )}

                  <button
                    onClick={() => handleSubmit(reportType)}
                    disabled={isProcessing || isDeleting || !uploadState.file}
                    className="w-full px-md py-xs bg-primary-container text-on-primary rounded-lg font-body-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-xs"
                  >
                    {uploadState.status === 'uploading' ? (
                      <>
                        <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Procesando…
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[18px]">upload</span>
                        Importar archivo
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleDelete(reportType)}
                    disabled={isProcessing || isDeleting}
                    className="w-full px-md py-xs border border-red-300 bg-red-50 text-red-700 rounded-lg font-body-sm hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-xs"
                  >
                    {isDeleting ? (
                      <>
                        <span className="h-4 w-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                        Eliminando informacion...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[18px]">delete_forever</span>
                        Eliminar info cargada
                      </>
                    )}
                  </button>

                  {uploadState.deleteStatus === 'success' && uploadState.deleteResult && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-md space-y-xs">
                      <div className="flex items-center gap-xs text-emerald-800 font-semibold">
                        <span className="material-symbols-outlined text-[20px]">delete_sweep</span>
                        Eliminacion completada
                      </div>
                      <p className="text-[13px] text-emerald-700">
                        {uploadState.deleteResult.deletedRows || uploadState.deleteResult.deletedBatches
                          ? `Se eliminaron ${uploadState.deleteResult.deletedRows} registros y ${uploadState.deleteResult.deletedBatches} lotes de ${formatReportType(reportType)}.`
                          : `No habia informacion cargada para ${formatReportType(reportType)}.`}
                      </p>
                    </div>
                  )}

                  {uploadState.deleteStatus === 'error' && uploadState.deleteResult?.error && (
                    <div className="bg-error-container border border-red-200 rounded-xl p-md space-y-xs">
                      <div className="flex items-center gap-xs text-on-error-container font-semibold">
                        <span className="material-symbols-outlined text-[20px] text-error">error</span>
                        No se pudo eliminar la informacion
                      </div>
                      <p className="text-[13px] text-on-error-container">{uploadState.deleteResult.error}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="px-lg py-md border-t border-outline-variant flex gap-sm justify-end">
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
