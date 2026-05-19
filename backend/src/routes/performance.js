const express = require('express');
const fs = require('fs/promises');
const upload = require('../middleware/upload');
const { parsePerformanceWorkbook, normalizeReportType } = require('../services/performanceSalesParser');
const {
  clearPerformanceDataByReportType,
  getPerformanceFilterOptions,
  getPerformanceOverview,
  importPerformanceBatch,
  listPerformanceRows,
  listUploadBatches,
} = require('../services/performanceSalesService');
const { resolveNavigationAccess } = require('../services/efficiencyAccessService');
const { formatMonthLabel } = require('../utils/dateUtils');

const router = express.Router();

async function requireUploadAccess(req, res) {
  const navigationAccess = req.navigationAccess || await resolveNavigationAccess(req.user);
  req.navigationAccess = navigationAccess;

  if (navigationAccess.can_upload_reports) {
    return true;
  }

  res.status(403).json({ error: 'No tienes permisos para subir reportes.' });
  return false;
}

router.get('/overview', async (req, res, next) => {
  try {
    const overview = await getPerformanceOverview(req.query);
    res.json(overview);
  } catch (error) {
    next(error);
  }
});

router.get('/rows', async (req, res, next) => {
  try {
    const rows = await listPerformanceRows(req.query);
    res.json(rows);
  } catch (error) {
    next(error);
  }
});

router.get('/filters', async (req, res, next) => {
  try {
    const filters = await getPerformanceFilterOptions(req.query);
    res.json(filters);
  } catch (error) {
    next(error);
  }
});

router.get('/uploads', async (req, res, next) => {
  try {
    const uploads = await listUploadBatches(req.query);
    res.json(uploads);
  } catch (error) {
    next(error);
  }
});

router.post('/uploads/:reportType/clear', async (req, res, next) => {
  const reportType = normalizeReportType(req.params.reportType);

  if (!(await requireUploadAccess(req, res))) {
    return;
  }

  if (!reportType) {
    return res.status(400).json({ error: 'Tipo de reporte no soportado. Usa Xerox, IT o Post Ventas.' });
  }

  try {
    const result = await clearPerformanceDataByReportType(reportType);

    return res.json({
      ok: true,
      report_type: reportType,
      deleted_rows: result.deletedRows,
      deleted_batches: result.deletedBatches,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/uploads/:reportType', upload.single('file'), async (req, res, next) => {
  const reportType = normalizeReportType(req.params.reportType);
  const uploadedFile = req.file;

  if (!(await requireUploadAccess(req, res))) {
    if (uploadedFile?.path) {
      await fs.unlink(uploadedFile.path).catch(() => {});
    }
    return;
  }

  if (!reportType) {
    if (uploadedFile?.path) {
      await fs.unlink(uploadedFile.path).catch(() => {});
    }
    return res.status(400).json({ error: 'Tipo de reporte no soportado. Usa Xerox, IT o Post Ventas.' });
  }

  if (!uploadedFile) {
    return res.status(400).json({ error: 'Debes adjuntar un archivo .xlsx o .csv.' });
  }

  try {
    const parsed = await parsePerformanceWorkbook(uploadedFile.path, uploadedFile.originalname, reportType);
    if (!parsed.reportMonth || !parsed.records.length) {
      return res.status(400).json({
        error: 'No se pudo procesar el archivo.',
        errors: parsed.errors,
      });
    }

    const result = await importPerformanceBatch({
      reportType,
      reportMonth: parsed.reportMonth,
      filename: uploadedFile.originalname,
      sheetName: parsed.sheetName,
      records: parsed.records,
      errors: parsed.errors,
      uploadedBy: req.user?.id || null,
    });

    return res.json({
      ok: true,
      batch_id: result.batchId,
      report_type: reportType,
      report_month: parsed.reportMonth,
      report_month_label: formatMonthLabel(parsed.reportMonth),
      records_imported: parsed.records.length,
      errors_count: parsed.errors.length,
      errors: parsed.errors,
      replaced_active_snapshot: result.replacedActiveSnapshot,
    });
  } catch (error) {
    return next(error);
  } finally {
    if (uploadedFile?.path) {
      await fs.unlink(uploadedFile.path).catch(() => {});
    }
  }
});

module.exports = router;