const express = require('express');
const router  = express.Router();
const {
  getKPIs,
  getCharts,
  getExpiryHeatmap,
  getContractLifecycleDetails,
  getCanonicalOverview,
  listCanonicalContracts,
  getCanonicalFilterOptions,
  getOwnerUpcomingStats,
  getOwnerClosedStats,
} = require('../services/analyticsService');

router.get('/kpis', async (req, res, next) => {
  try {
    res.json(await getKPIs(req.query));
  } catch (err) {
    next(err);
  }
});

router.get('/charts', async (req, res, next) => {
  try {
    res.json(await getCharts(req.query));
  } catch (err) {
    next(err);
  }
});

router.get('/charts/lifecycle-details', async (req, res, next) => {
  try {
    res.json(await getContractLifecycleDetails(req.query));
  } catch (err) {
    next(err);
  }
});

router.get('/charts/owner-upcoming', async (req, res, next) => {
  try {
    res.json(await getOwnerUpcomingStats(req.query));
  } catch (err) {
    next(err);
  }
});

router.get('/charts/owner-closed', async (req, res, next) => {
  try {
    res.json(await getOwnerClosedStats(req.query));
  } catch (err) {
    next(err);
  }
});

router.get('/expiry', async (req, res, next) => {
  try {
    res.json(await getExpiryHeatmap(req.query));
  } catch (err) {
    next(err);
  }
});

router.get('/canonical/overview', async (req, res, next) => {
  try {
    res.json(await getCanonicalOverview(req.query));
  } catch (err) {
    next(err);
  }
});

router.get('/canonical/contracts', async (req, res, next) => {
  try {
    res.json(await listCanonicalContracts(req.query));
  } catch (err) {
    next(err);
  }
});

router.get('/canonical/filters', async (req, res, next) => {
  try {
    res.json(await getCanonicalFilterOptions(req.query));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
