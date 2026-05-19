const { resolveNavigationAccess } = require('../services/efficiencyAccessService');

async function resolveRequestNavigationAccess(req) {
  if (req.navigationAccess) {
    return req.navigationAccess;
  }

  const navigationAccess = await resolveNavigationAccess(req.user);
  req.navigationAccess = navigationAccess;
  return navigationAccess;
}

async function requireAdministrativeModuleAccess(req, res, next) {
  try {
    const navigationAccess = await resolveRequestNavigationAccess(req);

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

async function requireSettingsModuleAccess(req, res, next) {
  try {
    const navigationAccess = await resolveRequestNavigationAccess(req);

    if (!navigationAccess.can_access_settings) {
      return res.status(403).json({
        error: 'No tienes permisos para acceder a ajustes en Performance Sales.',
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

async function requireUploadModuleAccess(req, res, next) {
  try {
    const navigationAccess = await resolveRequestNavigationAccess(req);

    if (!navigationAccess.can_upload_reports) {
      return res.status(403).json({
        error: 'No tienes permisos para subir reportes.',
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  requireAdministrativeModuleAccess,
  requireSettingsModuleAccess,
  requireUploadModuleAccess,
};