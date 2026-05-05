const fs = require('fs/promises');
const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { clearContractsBySource, importBatch, logUpload } = require('../services/contractService');
const { clearContractSeries, replaceContractSeries } = require('../services/contractSeriesService');
const { attachCommercialOwnerNames } = require('../services/employeeDirectoryService');
const { parseExcel } = require('../services/excelParser');
const { fetchVigentesFromSqlServer } = require('../services/vigentesSyncService');
const { fetchContractSeriesFromSqlServer } = require('../services/seriesSyncService');

router.post('/', (_req, res) => {
  res.status(400).json({
    error: 'Usa /api/upload/vigentes o /api/upload/series para sincronizar desde SQL Server, o /api/upload/vencidos para cargar un archivo.',
  });
});

router.post('/vigentes', createSqlSyncHandler({
  sourceType: 'vigente',
  filename: 'vigente:sqlserver-sync',
  fetchRecords: fetchVigentesFromSqlServer,
  fetchSeriesRecords: fetchContractSeriesFromSqlServer,
}));
router.post('/series', createSqlSyncHandler({
  sourceType: 'serie',
  filename: 'serie:sqlserver-sync',
  fetchRecords: async () => ({ records: [], errors: [], meta: null }),
  fetchSeriesRecords: fetchContractSeriesFromSqlServer,
}));
router.post('/vencidos', upload.single('file'), createFileUploadHandler({
  sourceType: 'vencido',
}));
router.post('/vigentes/clear', createClearHandler({
  sourceType: 'vigente',
}));
router.post('/series/clear', createClearHandler({
  sourceType: 'serie',
}));
router.post('/vencidos/clear', createClearHandler({
  sourceType: 'vencido',
}));

function createSqlSyncHandler({ sourceType, filename, fetchRecords, fetchSeriesRecords }) {
  return async (req, res, next) => {
    try {
      const [contractsResult, seriesResult] = await Promise.all([
        fetchRecords(),
        typeof fetchSeriesRecords === 'function'
          ? fetchSeriesRecords()
          : Promise.resolve({ records: [], errors: [], meta: null }),
      ]);
      const { records, errors, meta } = contractsResult;
      const {
        records: seriesRecords,
        errors: seriesErrors,
        meta: seriesMeta,
      } = seriesResult;
      const combinedErrors = [...errors, ...seriesErrors];

      let uploadBatchId = null;
      if (records.length || seriesRecords.length) {
        uploadBatchId = await logUpload({
          filename,
          recordsImported: records.length + seriesRecords.length,
          errorsCount: combinedErrors.length,
          errorDetails: [{ contractsMeta: meta, seriesMeta }, ...combinedErrors],
          uploadedBy: req.user?.id || null,
        });
        if (records.length) {
          await importBatch(records, uploadBatchId, sourceType);
        }

        if (sourceType === 'vigente' || sourceType === 'serie') {
          await replaceContractSeries(seriesRecords, uploadBatchId);
        }
      }

      res.json({
        success: true,
        source_type: sourceType,
        source: 'sqlserver',
        records_imported: records.length,
        series_records_imported: seriesRecords.length,
        errors_count: combinedErrors.length,
        errors: combinedErrors.slice(0, 50),
        batch_id: uploadBatchId,
      });
    } catch (error) {
      next(error);
    }
  };
}

function createFileUploadHandler({ sourceType }) {
  return async (req, res, next) => {
    const uploadedFile = req.file;

    if (!uploadedFile) {
      return res.status(400).json({
        error: 'Debes adjuntar un archivo .xlsx, .xls o .csv.',
      });
    }

    try {
      const { records, errors } = await parseExcel(uploadedFile.path, uploadedFile.originalname, sourceType);
      let recordsToImport = records;

      if (records.length) {
        try {
          recordsToImport = await attachCommercialOwnerNames(records);
        } catch (lookupError) {
          errors.push(`No se pudo resolver el responsable desde SQL Server usando Pl_Cem_Empleado: ${lookupError.message}`);
        }
      }

      let uploadBatchId = null;
      if (recordsToImport.length) {
        uploadBatchId = await logUpload({
          filename: uploadedFile.originalname,
          recordsImported: recordsToImport.length,
          errorsCount: errors.length,
          errorDetails: errors,
          uploadedBy: req.user?.id || null,
        });
        await importBatch(recordsToImport, uploadBatchId, sourceType);
      }

      res.json({
        success: true,
        source_type: sourceType,
        source: 'file',
        records_imported: recordsToImport.length,
        errors_count: errors.length,
        errors: errors.slice(0, 50),
        batch_id: uploadBatchId,
      });
    } catch (error) {
      next(error);
    } finally {
      if (uploadedFile?.path) {
        await fs.unlink(uploadedFile.path).catch(() => {});
      }
    }
  };
}

function createClearHandler({ sourceType }) {
  return async (req, res, next) => {
    try {
      const [deletedCount, seriesDeletedCount] = await Promise.all([
        clearContractsBySource(sourceType),
        (sourceType === 'vigente' || sourceType === 'serie') ? clearContractSeries() : Promise.resolve(0),
      ]);

      res.json({
        success: true,
        source_type: sourceType,
        deleted_count: deletedCount,
        series_deleted_count: seriesDeletedCount,
      });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = router;
