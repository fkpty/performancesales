const express = require('express');
const router  = express.Router();
const {
  getAllSettings,
  updateSettings,
} = require('../services/analyticsService');

/** GET /api/settings */
router.get('/', async (req, res, next) => {
  try {
    res.json(await getAllSettings());
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/settings
 * Body: { at_risk_months: "6" }
 */
router.put('/', async (req, res, next) => {
  try {
    const allowed = ['at_risk_months'];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    if (!Object.keys(updates).length) {
      return res.status(400).json({ error: 'No se proporcionaron ajustes validos.' });
    }
    await updateSettings(updates);
    res.json({ success: true, updated: updates });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
