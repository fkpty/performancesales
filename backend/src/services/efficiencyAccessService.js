const pool = require('../db/connection');
const { getSettingValue } = require('./analyticsService');

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'rrhh']);
const MANAGER_ROLES = new Set(['gerente']);
const SELLER_ROLES = new Set(['vendedor']);
const EFFICIENCY_ONLY_ROLES = new Set([...MANAGER_ROLES, ...SELLER_ROLES]);

const ADMIN_ALLOWED_ROUTES = [
  '/',
  '/postventas',
  '/contracts',
  '/series',
  '/reports',
  '/uploads',
  '/settings',
  '/efficiency',
  '/efficiency-config',
];

const DEFAULT_ALLOWED_ROUTES = [
  '/',
  '/postventas',
  '/contracts',
  '/series',
  '/reports',
  '/uploads',
  '/settings',
  '/efficiency',
];

const FULL_VIEW_ALLOWED_ROUTES = [
  '/',
  '/postventas',
  '/contracts',
  '/series',
  '/reports',
  '/uploads',
  '/efficiency',
];

const EFFICIENCY_ONLY_ALLOWED_ROUTES = ['/efficiency'];

function normalizeRoles(roles) {
  return Array.isArray(roles)
    ? roles.map((role) => String(role || '').trim().toLowerCase()).filter(Boolean)
    : [];
}

function hasAdministrativeEfficiencyAccess(user) {
  return normalizeRoles(user?.roles).some((role) => ADMIN_ROLES.has(role));
}

async function resolveNavigationAccess(user) {
  if (hasAdministrativeEfficiencyAccess(user)) {
    return {
      mode: 'administrative',
      allowed_routes: ADMIN_ALLOWED_ROUTES,
      can_manage_efficiency_config: true,
      can_access_settings: true,
      can_upload_reports: resolveUploadAccess(user),
      is_efficiency_only: false,
      has_full_view_access: false,
      has_manager_assignment: false,
      has_seller_assignment: false,
    };
  }

  const fullViewAccessUsers = await getSettingValue('full_view_access_users', []);
  if (matchesFullViewAccessUser(user, fullViewAccessUsers)) {
    return {
      mode: 'full_view_access',
      allowed_routes: FULL_VIEW_ALLOWED_ROUTES,
      can_manage_efficiency_config: false,
      can_access_settings: false,
      can_upload_reports: false,
      is_efficiency_only: false,
      has_full_view_access: true,
      has_manager_assignment: false,
      has_seller_assignment: false,
    };
  }

  const roles = normalizeRoles(user?.roles);
  const userId = toNullableInt(user?.id);
  const hasScopedRole = roles.some((role) => EFFICIENCY_ONLY_ROLES.has(role));
  let hasManagerAssignment = false;
  let hasSellerAssignment = false;

  if (userId != null) {
    const [[assignmentRow]] = await pool.query(
      `SELECT
          EXISTS(
            SELECT 1
              FROM performance_efficiency_groups
             WHERE manager_user_id = ?
             LIMIT 1
          ) AS has_manager_assignment,
          EXISTS(
            SELECT 1
              FROM performance_efficiency_members
             WHERE seller_user_id = ?
             LIMIT 1
          ) AS has_seller_assignment`,
      [userId, userId]
    );

    hasManagerAssignment = Boolean(Number(assignmentRow?.has_manager_assignment || 0));
    hasSellerAssignment = Boolean(Number(assignmentRow?.has_seller_assignment || 0));
  }

  if (hasScopedRole || hasManagerAssignment || hasSellerAssignment) {
    return {
      mode: 'efficiency_only',
      allowed_routes: EFFICIENCY_ONLY_ALLOWED_ROUTES,
      can_manage_efficiency_config: false,
      can_access_settings: false,
      can_upload_reports: false,
      is_efficiency_only: true,
      has_full_view_access: false,
      has_manager_assignment: hasManagerAssignment,
      has_seller_assignment: hasSellerAssignment,
    };
  }

  return {
    mode: 'default',
    allowed_routes: DEFAULT_ALLOWED_ROUTES,
    can_manage_efficiency_config: false,
    can_access_settings: true,
    can_upload_reports: resolveUploadAccess(user),
    is_efficiency_only: false,
    has_full_view_access: false,
    has_manager_assignment: false,
    has_seller_assignment: false,
  };
}

function resolveEfficiencyScope(user, config) {
  if (hasAdministrativeEfficiencyAccess(user)) {
    return {
      status: 'full_access',
      reason: 'administrative_role',
      matched_groups: [],
      matched_members: [],
      allowed_group_keys: [],
      allowed_member_keys: [],
    };
  }

  const userId = toNullableInt(user?.id);
  if (userId == null) {
    return buildNoAccessScope('missing_user_id');
  }

  const matchedGroups = [];
  const matchedMembers = [];
  const allowedGroupKeys = new Set();
  const allowedMemberKeys = new Set();

  Object.entries(config?.sheets || {}).forEach(([sheetType, sheet]) => {
    (sheet?.groups || []).forEach((group) => {
      const groupKey = buildGroupScopeKey(sheetType, group);
      if (toNullableInt(group?.manager_user_id) === userId) {
        allowedGroupKeys.add(groupKey);
        matchedGroups.push({
          sheet_type: sheetType,
          group_key: groupKey,
          group_name: String(group?.group_name || ''),
          manager_name: String(group?.manager_name || ''),
        });
      }

      (group?.members || []).forEach((member) => {
        if (toNullableInt(member?.seller_user_id) !== userId) {
          return;
        }

        const memberKey = buildMemberScopeKey(sheetType, group, member);
        allowedMemberKeys.add(memberKey);
        matchedMembers.push({
          sheet_type: sheetType,
          group_key: groupKey,
          member_key: memberKey,
          group_name: String(group?.group_name || ''),
          manager_name: String(group?.manager_name || ''),
          seller_name: String(member?.seller_name || ''),
        });
      });
    });
  });

  if (matchedGroups.length) {
    return {
      status: 'manager_scoped',
      reason: 'manager_assignment',
      matched_groups: matchedGroups,
      matched_members: [],
      allowed_group_keys: Array.from(allowedGroupKeys),
      allowed_member_keys: [],
    };
  }

  if (matchedMembers.length) {
    return {
      status: 'seller_scoped',
      reason: 'seller_assignment',
      matched_groups: [],
      matched_members: matchedMembers,
      allowed_group_keys: [],
      allowed_member_keys: Array.from(allowedMemberKeys),
    };
  }

  const roles = normalizeRoles(user?.roles);
  const hasScopedRole = roles.some((role) => EFFICIENCY_ONLY_ROLES.has(role));
  return buildNoAccessScope(hasScopedRole ? 'missing_assignment' : 'not_assigned');
}

function filterEfficiencyConfigByScope(config, access) {
  if (!config?.sheets || access?.status === 'full_access') {
    return config;
  }

  const allowedGroupKeys = new Set(access?.allowed_group_keys || []);
  const allowedMemberKeys = new Set(access?.allowed_member_keys || []);

  return {
    ...config,
    sheets: Object.fromEntries(
      Object.entries(config.sheets).map(([sheetType, sheet]) => {
        const groups = (sheet?.groups || []).reduce((visibleGroups, group) => {
          const groupKey = buildGroupScopeKey(sheetType, group);

          if (access?.status === 'manager_scoped') {
            if (allowedGroupKeys.has(groupKey)) {
              visibleGroups.push(group);
            }
            return visibleGroups;
          }

          if (access?.status === 'seller_scoped') {
            const visibleMembers = (group?.members || []).filter((member) =>
              allowedMemberKeys.has(buildMemberScopeKey(sheetType, group, member))
            );

            if (visibleMembers.length) {
              visibleGroups.push({
                ...group,
                members: visibleMembers,
              });
            }
          }

          return visibleGroups;
        }, []);

        return [sheetType, {
          ...sheet,
          groups,
        }];
      })
    ),
  };
}

function buildEfficiencyAccessPayload(access) {
  return {
    status: access?.status || 'no_access',
    can_view: access?.status && access.status !== 'no_access',
    can_manage_config: access?.status === 'full_access' && access?.reason !== 'full_view_access_setting',
    denied_reason: access?.status === 'no_access' ? access?.reason || 'not_assigned' : null,
    matched_groups: (access?.matched_groups || []).map((group) => ({
      sheet_type: group.sheet_type,
      group_name: group.group_name,
      manager_name: group.manager_name,
    })),
    matched_members: (access?.matched_members || []).map((member) => ({
      sheet_type: member.sheet_type,
      group_name: member.group_name,
      manager_name: member.manager_name,
      seller_name: member.seller_name,
    })),
  };
}

function createEfficiencyForbiddenError(message) {
  const error = new Error(message);
  error.status = 403;
  return error;
}

function buildNoAccessScope(reason) {
  return {
    status: 'no_access',
    reason,
    matched_groups: [],
    matched_members: [],
    allowed_group_keys: [],
    allowed_member_keys: [],
  };
}

function buildGroupScopeKey(sheetType, group) {
  return `${sheetType}:${normalizeLookupKey(group?.group_name || group?.manager_name)}`;
}

function buildMemberScopeKey(sheetType, group, member) {
  return `${buildGroupScopeKey(sheetType, group)}:${buildMemberLookupKey(member)}`;
}

function buildMemberLookupKey(member) {
  const employeeId = String(member?.employee_id || '').trim().toLowerCase();
  if (employeeId) {
    return `employee:${employeeId}`;
  }

  const sellerKey = normalizeLookupKey(member?.seller_name);
  if (sellerKey) {
    return `seller:${sellerKey}`;
  }

  return 'member:unknown';
}

function normalizeLookupKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

function matchesFullViewAccessUser(user, accessUsers) {
  const userId = toNullableInt(user?.id);
  const userEmail = normalizeEmail(user?.email);

  return Array.isArray(accessUsers) && accessUsers.some((entry) => {
    const entryId = toNullableInt(entry?.id);
    if (userId != null && entryId != null && userId === entryId) {
      return true;
    }

    return Boolean(userEmail) && userEmail === normalizeEmail(entry?.email);
  });
}

function resolveUploadAccess(user) {
  return Boolean(user?.canUploadReports || user?.can_upload_reports || normalizeRoles(user?.roles).some((role) => ['admin', 'super_admin'].includes(role)));
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function toNullableInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

module.exports = {
  buildEfficiencyAccessPayload,
  createEfficiencyForbiddenError,
  filterEfficiencyConfigByScope,
  hasAdministrativeEfficiencyAccess,
  resolveEfficiencyScope,
  resolveNavigationAccess,
};