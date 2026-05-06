const express = require('express');
const {
  getEfficiencyConfig,
  getEfficiencyOverview,
  saveEfficiencyConfig,
} = require('../services/efficiencyService');

const router = express.Router();

router.get('/overview', async (req, res, next) => {
  try {
    res.json(await getEfficiencyOverview(req.query));
  } catch (error) {
    next(error);
  }
});

router.get('/config', async (req, res, next) => {
  try {
    if (!hasEfficiencyConfigAccess(req.user)) {
      return res.status(403).json({ error: 'No tienes permisos para administrar la configuracion de eficiencia.' });
    }

    res.json(await getEfficiencyConfig(req.query));
  } catch (error) {
    next(error);
  }
});

router.put('/config', async (req, res, next) => {
  try {
    if (!hasEfficiencyConfigAccess(req.user)) {
      return res.status(403).json({ error: 'No tienes permisos para administrar la configuracion de eficiencia.' });
    }

    res.json(await saveEfficiencyConfig(req.query, req.body, req.user));
  } catch (error) {
    next(error);
  }
});

function hasEfficiencyConfigAccess(user) {
  const roles = Array.isArray(user?.roles) ? user.roles.map((role) => String(role || '').trim().toLowerCase()) : [];
  return roles.includes('admin') || roles.includes('super_admin') || roles.includes('rrhh');
}

module.exports = router;