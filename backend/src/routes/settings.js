const express = require('express');
const router  = express.Router();
const {
  getAllSettings,
  updateSettings,
} = require('../services/analyticsService');
const { listHubUsers } = require('../services/hubUserDirectoryService');
const { hasAdministrativeEfficiencyAccess } = require('../services/efficiencyAccessService');

/** GET /api/settings */
router.get('/', async (req, res, next) => {
  try {
    res.json(await getAllSettings());
  } catch (err) {
    next(err);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    if (!hasAdministrativeEfficiencyAccess(req.user)) {
      return res.status(403).json({ error: 'No tienes permisos para consultar usuarios administrables.' });
    }

    res.json({ users: await listHubUsers() });
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
    if (!hasAdministrativeEfficiencyAccess(req.user)) {
      return res.status(403).json({ error: 'No tienes permisos para actualizar ajustes de Performance Sales.' });
    }

    const allowed = ['at_risk_months', 'full_view_access_users'];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] === undefined) {
        continue;
      }

      if (k === 'full_view_access_users') {
        updates[k] = normalizeFullViewAccessUsers(req.body[k]);
        continue;
      }

      updates[k] = req.body[k];
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

function normalizeFullViewAccessUsers(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();

  return value.reduce((users, entry) => {
    const normalizedUser = normalizeAccessUser(entry);
    if (!normalizedUser) {
      return users;
    }

    const uniqueKey = `${normalizedUser.id || ''}:${normalizedUser.email || ''}`;
    if (seen.has(uniqueKey)) {
      return users;
    }

    seen.add(uniqueKey);
    users.push(normalizedUser);
    return users;
  }, []);
}

function normalizeAccessUser(entry) {
  const parsedId = parseInt(entry?.id, 10);
  const userId = Number.isFinite(parsedId) ? parsedId : null;
  const email = String(entry?.email || '').trim().toLowerCase() || null;
  const fullName = String(entry?.full_name || entry?.name || '').trim();

  if (userId == null && !email) {
    return null;
  }

  return {
    id: userId,
    full_name: fullName || email || `Usuario ${userId || ''}`.trim(),
    email,
  };
}

module.exports = router;
