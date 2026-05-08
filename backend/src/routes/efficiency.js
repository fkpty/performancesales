const express = require('express');
const {
  exportEfficiencyProductivityWorkbook,
  getEfficiencyAccessSummary,
  getEfficiencyConfig,
  getEfficiencyOverview,
  saveEfficiencyConfig,
} = require('../services/efficiencyService');
const { listHubUsers } = require('../services/hubUserDirectoryService');
const { hasAdministrativeEfficiencyAccess } = require('../services/efficiencyAccessService');

const router = express.Router();

router.get('/overview', async (req, res, next) => {
  try {
    res.json(await getEfficiencyOverview(req.query, req.user));
  } catch (error) {
    next(error);
  }
});

router.get('/access', async (req, res, next) => {
  try {
    res.json(await getEfficiencyAccessSummary(req.query, req.user));
  } catch (error) {
    next(error);
  }
});

router.get('/export', async (req, res, next) => {
  try {
    const { workbook, filename } = await exportEfficiencyProductivityWorkbook(req.query, req.user);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
});

router.get('/config', async (req, res, next) => {
  try {
    if (!hasAdministrativeEfficiencyAccess(req.user)) {
      return res.status(403).json({ error: 'No tienes permisos para administrar la configuracion de eficiencia.' });
    }

    res.json(await getEfficiencyConfig(req.query));
  } catch (error) {
    next(error);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    if (!hasAdministrativeEfficiencyAccess(req.user)) {
      return res.status(403).json({ error: 'No tienes permisos para consultar usuarios de eficiencia.' });
    }

    res.json({ users: await listHubUsers() });
  } catch (error) {
    next(error);
  }
});

router.put('/config', async (req, res, next) => {
  try {
    if (!hasAdministrativeEfficiencyAccess(req.user)) {
      return res.status(403).json({ error: 'No tienes permisos para administrar la configuracion de eficiencia.' });
    }

    res.json(await saveEfficiencyConfig(req.query, req.body, req.user));
  } catch (error) {
    next(error);
  }
});

module.exports = router;