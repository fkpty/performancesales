const DEFAULT_ALLOWED_ROUTES = ['/', '/contracts', '/series', '/reports', '/uploads', '/settings', '/efficiency'];

export function normalizeRoles(roles) {
  return Array.isArray(roles)
    ? roles.map((role) => String(role || '').trim().toLowerCase()).filter(Boolean)
    : [];
}

export function hasAdministrativeRole(user) {
  return normalizeRoles(user?.roles).some((role) => ['admin', 'super_admin', 'rrhh'].includes(role));
}

export function getAllowedRoutes(accessContext) {
  const routes = accessContext?.navigation?.allowed_routes;
  return Array.isArray(routes) && routes.length ? routes : DEFAULT_ALLOWED_ROUTES;
}

export function isEfficiencyOnlyUser(accessContext) {
  return Boolean(accessContext?.navigation?.is_efficiency_only);
}

export function canManageEfficiencyConfig(user, accessContext) {
  return Boolean(accessContext?.navigation?.can_manage_efficiency_config || hasAdministrativeRole(user));
}

export function canAccessRoute(routePath, user, accessContext) {
  if (routePath === '/efficiency-config') {
    return canManageEfficiencyConfig(user, accessContext);
  }

  return getAllowedRoutes(accessContext).includes(routePath);
}

export function getDefaultRoute(user, accessContext) {
  if (isEfficiencyOnlyUser(accessContext)) {
    return '/efficiency';
  }

  const allowedRoutes = getAllowedRoutes(accessContext);
  if (canAccessRoute('/', user, accessContext)) {
    return '/';
  }

  return allowedRoutes[0] || '/efficiency';
}