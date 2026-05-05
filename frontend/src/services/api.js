import axios from 'axios';

const BASE = window.location.pathname.startsWith('/performance-sales')
  ? '/performance-sales/api'
  : '/api';

const api = axios.create({
  baseURL:     BASE,
  withCredentials: true,
  timeout:     30000,
});

export async function initAuthSession(force = false) {
  if (!window.location.pathname.startsWith('/performance-sales')) {
    return { ok: true, local: true };
  }

  const response = await api.get('/auth/whoami', {
    params: force ? { force: '1' } : undefined,
  });

  return response.data;
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

// ─── Settings ──────────────────────────────────────────────────
export const fetchSettings = () =>
  api.get('/settings').then(r => r.data);

export const saveSettings = (data) =>
  api.put('/settings', data).then(r => r.data);

export default api;
