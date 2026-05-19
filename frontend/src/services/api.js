import axios from 'axios';

const BASE = window.location.pathname.startsWith('/performance-sales')
  ? '/performance-sales/api'
  : '/api';

const api = axios.create({
  baseURL:     BASE,
  withCredentials: true,
  timeout:     30000,
});

function extractPayloadMessage(data) {
  if (typeof data === 'string' && data.trim() !== '') {
    return data.trim();
  }

  if (data && typeof data === 'object') {
    if (typeof data.error === 'string' && data.error.trim() !== '') {
      return data.error.trim();
    }

    if (typeof data.message === 'string' && data.message.trim() !== '') {
      return data.message.trim();
    }
  }

  return '';
}

function buildFriendlyApiMessage(status, error) {
  if (status === 401) {
    return 'Tu sesion de PBS Hub expiro o ya no es valida. Recarga la pagina para autenticarte de nuevo.';
  }

  if (status === 403) {
    return 'No tienes permisos para realizar esta accion en Performance Sales.';
  }

  if (status >= 500) {
    return 'Performance Sales no esta disponible temporalmente. El servicio se esta iniciando o recuperando.';
  }

  if (error?.code === 'ECONNABORTED') {
    return 'Performance Sales tardo demasiado en responder. Intenta de nuevo en unos segundos.';
  }

  if (!error?.response) {
    return 'No se pudo conectar con Performance Sales. Verifica que el servicio este disponible.';
  }

  return '';
}

function normalizeApiError(error) {
  if (error?.isNormalizedApiError) {
    return error;
  }

  const status = Number(error?.response?.status || 0);
  const message = buildFriendlyApiMessage(status, error)
    || extractPayloadMessage(error?.response?.data)
    || error?.message
    || 'No se pudo completar la solicitud.';

  const normalizedError = new Error(message);

  normalizedError.name = 'ApiError';
  normalizedError.isNormalizedApiError = true;
  normalizedError.status = status;
  normalizedError.code = error?.code;
  normalizedError.response = error?.response;
  normalizedError.request = error?.request;
  normalizedError.cause = error;
  normalizedError.isAuthError = status === 401 || status === 403;
  normalizedError.isAvailabilityError = status >= 500 || error?.code === 'ECONNABORTED' || !error?.response;

  return normalizedError;
}

api.interceptors.response.use(
  response => response,
  error => Promise.reject(normalizeApiError(error))
);

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

function getDownloadFilename(contentDisposition = '') {
  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(contentDisposition);
  const rawName = match?.[1] || match?.[2] || '';
  return rawName ? decodeURIComponent(rawName) : '';
}

async function normalizeBlobRequestError(error) {
  const blob = error?.response?.data;

  if (blob instanceof Blob) {
    const text = await blob.text();
    let message = text || error.message || 'No se pudo completar la exportacion.';

    try {
      const parsed = JSON.parse(text);
      message = parsed?.error || parsed?.message || message;
    } catch {
      // Keep the raw response text when the backend did not return JSON.
    }

    throw new Error(message);
  }

  throw normalizeApiError(error);
}

async function downloadFile(url, params = {}) {
  try {
    const response = await api.get(url, {
      params: cleanParams(params),
      responseType: 'blob',
    });

    const filename = getDownloadFilename(response.headers['content-disposition']) || `export-${Date.now()}.xlsx`;
    const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
    const downloadUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = downloadUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(downloadUrl);

    return filename;
  } catch (error) {
    return normalizeBlobRequestError(error);
  }
}

export const fetchPerformanceOverview = (params) =>
  api.get('/performance/overview', { params: cleanParams(params) }).then(r => r.data);

export const fetchPerformanceRows = (params) =>
  api.get('/performance/rows', { params: cleanParams(params) }).then(r => r.data);

export const fetchPerformanceFilters = (params) =>
  api.get('/performance/filters', { params: cleanParams(params) }).then(r => r.data);

export const fetchUploadHistory = (params) =>
  api.get('/performance/uploads', { params: cleanParams(params) }).then(r => r.data);

export const clearPerformanceUploadData = (reportType) =>
  api.post(`/performance/uploads/${reportType}/clear`).then(r => r.data);

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

export const fetchEfficiencyAccess = (params) =>
  api.get('/efficiency/access', { params: cleanParams(params) }).then(r => r.data);

export const exportEfficiencyProductivity = (params) =>
  downloadFile('/efficiency/export', params);

export const fetchEfficiencyConfig = (params) =>
  api.get('/efficiency/config', { params: cleanParams(params) }).then(r => r.data);

export const fetchEfficiencyUsers = () =>
  api.get('/efficiency/users').then(r => r.data);

export const saveEfficiencyConfig = (params, data) =>
  api.put('/efficiency/config', data, { params: cleanParams(params) }).then(r => r.data);

export const exportContracts = (params) =>
  downloadFile('/contracts/export', params);

export const exportContractSeries = (params) =>
  downloadFile('/contracts/series/export', params);

// ─── Settings ──────────────────────────────────────────────────
export const fetchSettings = () =>
  api.get('/settings').then(r => r.data);

export const fetchSettingsUsers = () =>
  api.get('/settings/users').then(r => r.data);

export const saveSettings = (data) =>
  api.put('/settings', data).then(r => r.data);

export default api;
