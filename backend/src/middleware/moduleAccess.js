const { resolveNavigationAccess } = require('../services/efficiencyAccessService');

async function requireAdministrativeModuleAccess(req, res, next) {
  try {
    const navigationAccess = await resolveNavigationAccess(req.user);
    req.navigationAccess = navigationAccess;

    if (navigationAccess.is_efficiency_only) {
      return res.status(403).json({
        error: 'Tu usuario solo tiene acceso al modulo de eficiencia.',
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  requireAdministrativeModuleAccess,
};