import axios from 'axios';

const BASE = window.location.pathname.startsWith('/performance-sales')
  ? '/performance-sales/api'
  : '/api';

const api = axios.create({
  baseURL:     BASE,
  withCredentials: true,
  timeout:     30000,
});

function normalizeRoles(roles) {
  return Array.isArray(roles)
    ? roles.map(role => String(role || '').trim().toLowerCase()).filter(Boolean)
    : [];
}

function canUploadFromPayload(user, payload) {
  const payloadRoles = normalizeRoles(user?.roles || payload?.roles);
  return Boolean(
    user?.can_upload_reports ||
    user?.canUploadReports ||
    payload?.can_upload_reports ||
    payload?.canUploadReports ||
    payloadRoles.includes('admin') ||
    payloadRoles.includes('super_admin') ||
    user?.name === 'Local Performance Sales Admin' ||
    user === 'Local Performance Sales Admin'
  );
}

function normalizeAuthResponse(payload) {
  const rawUser = payload?.user;

  if (rawUser && typeof rawUser === 'object') {
    const roles = normalizeRoles(rawUser.roles || payload?.roles);
    return {
      ...payload,
      user: {
        ...rawUser,
        roles,
        can_upload_reports: canUploadFromPayload(rawUser, payload),
      },
    };
  }

  if (typeof rawUser === 'string' && rawUser.trim() !== '') {
    const roles = normalizeRoles(payload?.roles);
    return {
      ...payload,
      user: {
        name: rawUser.trim(),
        roles,
        can_upload_reports: canUploadFromPayload({ name: rawUser.trim(), roles }, payload),
      },
    };
  }

  return payload;
}

export async function initAuthSession(force = false) {
  if (!window.location.pathname.startsWith('/performance-sales')) {
    return { ok: true, local: true };
  }

  const response = await api.get('/auth/whoami', {
    params: force ? { force: '1' } : undefined,
  });

  return normalizeAuthResponse(response.data);
}

function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== '' && value != null)
  );
}

export const fetchPerformanceOverview = (params) =>
  api.get('/performance/overview', { params: cleanParams(params) }).then(r => r.data);

export const fetchPerformanceRows = (params) =>
  api.get('/performance/rows', { params: cleanParams(params) }).then(r => r.data);

export const fetchPerformanceFilters = (params) =>
  api.get('/performance/filters', { params: cleanParams(params) }).then(r => r.data);

export const fetchUploadHistory = (params) =>
  api.get('/performance/uploads', { params: cleanParams(params) }).then(r => r.data);

export const uploadPerformanceReport = (reportType, file, onProgress) => {
  const form = new FormData();
  form.append('file', file);
  return api.post(`/performance/uploads/${reportType}`, form, {
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    },
  }).then(r => r.data);
};

export const fetchEfficiencyOverview = (params) =>
  api.get('/efficiency/overview', { params: cleanParams(params) }).then(r => r.data);

export const fetchEfficiencyConfig = (params) =>
  api.get('/efficiency/config', { params: cleanParams(params) }).then(r => r.data);

export const saveEfficiencyConfig = (params, data) =>
  api.put('/efficiency/config', data, { params: cleanParams(params) }).then(r => r.data);

// ─── Settings ──────────────────────────────────────────────────
export const fetchSettings = () =>
  api.get('/settings').then(r => r.data);

export const saveSettings = (data) =>
  api.put('/settings', data).then(r => r.data);

export default api;
