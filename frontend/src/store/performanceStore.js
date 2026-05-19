import { create } from 'zustand';
import {
  fetchPerformanceFilters,
  fetchPerformanceOverview,
  fetchPerformanceRows,
  fetchUploadHistory,
} from '../services/api';

const today = new Date();
const currentYear = today.getFullYear();
const currentMonth = today.getMonth() + 1;
const currentQuarter = Math.ceil(currentMonth / 3);
const DEFAULT_REPORT_TYPES = ['xerox', 'it', 'postventas'];
const REPORT_SCOPE_TYPES = {
  dashboard: ['xerox', 'it'],
  postventas: ['postventas'],
};

function hasUploadRole(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [];
  return roles.some((role) => ['admin', 'super_admin'].includes(String(role).toLowerCase()));
}

function resolveCanUploadReports(user, accessContext) {
  const basePermission = Boolean(
    user?.can_upload_reports ||
    user?.canUploadReports ||
    hasUploadRole(user)
  );

  if (accessContext?.navigation && typeof accessContext.navigation.can_upload_reports === 'boolean') {
    return basePermission && accessContext.navigation.can_upload_reports;
  }

  return basePermission;
}

export function buildDateParams(state) {
  const params = {
    period: state.period,
    year: state.year,
  };

  if (state.period === 'mensual') {
    params.month = state.month;
  }

  if (state.period === 'trimestral') {
    params.quarter = state.quarter;
  }

  if (state.period === 'personalizado') {
    params.startDate = state.startDate;
    params.endDate = state.endDate;
  }

  return params;
}

function buildBaseParams(state) {
  return {
    ...buildDateParams(state),
    ...buildScopeParams(state),
    ...state.filters,
  };
}

function buildScopeParams(state) {
  return state.reportScope
    ? { scope: state.reportScope }
    : {};
}

function normalizeReportScope(scope) {
  const normalized = String(scope || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(REPORT_SCOPE_TYPES, normalized) ? normalized : '';
}

function resolveReportTypesForScope(scope) {
  return REPORT_SCOPE_TYPES[normalizeReportScope(scope)] || DEFAULT_REPORT_TYPES;
}

function normalizeFiltersForScope(filters, scope) {
  const allowedReportTypes = resolveReportTypesForScope(scope);
  if (!filters.reportType || allowedReportTypes.includes(filters.reportType)) {
    return filters;
  }

  return {
    ...filters,
    reportType: '',
  };
}

function createRowsState() {
  return {
    data: [],
    total: 0,
    page: 1,
    limit: 25,
    totalPages: 1,
    loading: false,
    error: null,
    search: '',
    sortBy: 'sale_date',
    sortDir: 'desc',
  };
}

function createUploadsState() {
  return {
    data: [],
    total: 0,
    page: 1,
    limit: 12,
    totalPages: 1,
    loading: false,
    error: null,
  };
}

const usePerformanceStore = create((set, get) => ({
  authUser: null,
  accessContext: null,
  canUploadReports: false,
  reportScope: 'dashboard',

  year: currentYear,
  period: 'anual',
  month: currentMonth,
  quarter: currentQuarter,
  startDate: `${currentYear}-01-01`,
  endDate: `${currentYear}-12-31`,

  filters: {
    reportType: '',
    client: '',
    owner: '',
    business: '',
  },

  overview: null,
  overviewLoading: false,
  overviewError: null,

  rows: createRowsState(),
  uploads: createUploadsState(),

  filterOptions: {
    clients: [],
    owners: [],
    businesses: [],
    reportTypes: resolveReportTypesForScope('dashboard'),
  },
  availableYears: [],

  requestId: 0,

  setAuthUser: (user) => {
    const normalizedUser = user && typeof user === 'object' ? user : null;
    set({
      authUser: normalizedUser,
      canUploadReports: resolveCanUploadReports(normalizedUser, get().accessContext),
    });
  },

  setAccessContext: (accessContext) => {
    const normalizedAccessContext = accessContext && typeof accessContext === 'object' ? accessContext : null;
    set({
      accessContext: normalizedAccessContext,
      canUploadReports: resolveCanUploadReports(get().authUser, normalizedAccessContext),
    });
  },

  setReportScope: (scope) => {
    const normalizedScope = normalizeReportScope(scope);

    set((state) => {
      const nextFilters = normalizeFiltersForScope(state.filters, normalizedScope);

      return {
        reportScope: normalizedScope,
        filters: nextFilters,
        overview: null,
        overviewError: null,
        rows: {
          ...state.rows,
          data: [],
          total: 0,
          page: 1,
          totalPages: 1,
          error: null,
        },
        uploads: {
          ...state.uploads,
          data: [],
          total: 0,
          page: 1,
          totalPages: 1,
          error: null,
        },
        filterOptions: {
          clients: [],
          owners: [],
          businesses: [],
          reportTypes: resolveReportTypesForScope(normalizedScope),
        },
      };
    });
  },

  setYear: (year) => {
    set(state => ({
      year: parseInt(year, 10),
      rows: { ...state.rows, page: 1 },
      uploads: { ...state.uploads, page: 1 },
    }));
    get().loadAll();
  },

  setPeriod: (period) => {
    set(state => ({
      period,
      rows: { ...state.rows, page: 1 },
      uploads: { ...state.uploads, page: 1 },
    }));
    get().loadAll();
  },

  setMonth: (month) => {
    const parsedMonth = parseInt(month, 10);
    set(state => ({
      month: parsedMonth,
      quarter: Math.ceil(parsedMonth / 3),
      rows: { ...state.rows, page: 1 },
      uploads: { ...state.uploads, page: 1 },
    }));
    get().loadAll();
  },

  setQuarter: (quarter) => {
    set(state => ({
      quarter: parseInt(quarter, 10),
      rows: { ...state.rows, page: 1 },
      uploads: { ...state.uploads, page: 1 },
    }));
    get().loadAll();
  },

  setCustomRange: (patch) => {
    set(state => ({
      period: 'personalizado',
      ...patch,
      rows: { ...state.rows, page: 1 },
      uploads: { ...state.uploads, page: 1 },
    }));
    get().loadAll();
  },

  setFilters: (patch) => {
    set(state => ({
      filters: { ...state.filters, ...patch },
      rows: { ...state.rows, page: 1 },
      uploads: { ...state.uploads, page: 1 },
    }));
    get().loadAll();
  },

  clearFilters: () => {
    set(state => ({
      filters: {
        reportType: '',
        client: '',
        owner: '',
        business: '',
      },
      rows: { ...state.rows, page: 1, search: '' },
      uploads: { ...state.uploads, page: 1 },
    }));
    get().loadAll();
  },

  setRowsPage: (page) => {
    set(state => ({ rows: { ...state.rows, page } }));
    get().loadRows();
  },

  setRowsSearch: (search) => {
    set(state => ({ rows: { ...state.rows, search, page: 1 } }));
    get().loadRows();
  },

  setRowsSort: (sortBy) => {
    const current = get().rows;
    const sortDir = sortBy === current.sortBy && current.sortDir === 'asc' ? 'desc' : 'asc';
    set(state => ({
      rows: {
        ...state.rows,
        sortBy,
        sortDir,
        page: 1,
      },
    }));
    get().loadRows();
  },

  setUploadsPage: (page) => {
    set(state => ({ uploads: { ...state.uploads, page } }));
    get().loadUploads();
  },

  loadAll: () => {
    const nextRequestId = get().requestId + 1;
    set({ requestId: nextRequestId });
    get().loadOverview(nextRequestId);
    get().loadRows(nextRequestId);
    get().loadUploads(nextRequestId);
    get().loadFilterOptions(nextRequestId);
  },

  loadDashboard: () => {
    const nextRequestId = get().requestId + 1;
    set({ requestId: nextRequestId });
    get().loadOverview(nextRequestId);
    get().loadUploads(nextRequestId);
    get().loadFilterOptions(nextRequestId);
  },

  refreshAll: () => {
    get().loadAll();
  },

  loadOverview: async (requestId = get().requestId) => {
    set({ overviewLoading: true, overviewError: null });
    try {
      const overview = await fetchPerformanceOverview(buildBaseParams(get()));
      if (requestId !== get().requestId) return;
      set({ overview, overviewLoading: false, overviewError: null });
    } catch (error) {
      if (requestId !== get().requestId) return;
      set({ overviewLoading: false, overviewError: error.message || 'No se pudo cargar el panel.' });
    }
  },

  loadRows: async (requestId = get().requestId) => {
    set(state => ({ rows: { ...state.rows, loading: true, error: null } }));
    try {
      const rowsState = get().rows;
      const response = await fetchPerformanceRows({
        ...buildBaseParams(get()),
        search: rowsState.search,
        page: rowsState.page,
        limit: rowsState.limit,
        sortBy: rowsState.sortBy,
        sortDir: rowsState.sortDir,
      });
      if (requestId !== get().requestId) return;
      set(state => ({
        rows: {
          ...state.rows,
          ...response,
          loading: false,
          error: null,
        },
      }));
    } catch (error) {
      if (requestId !== get().requestId) return;
      set(state => ({
        rows: {
          ...state.rows,
          loading: false,
          error: error.message || 'No se pudo cargar el detalle.',
        },
      }));
    }
  },

  loadUploads: async (requestId = get().requestId) => {
    set(state => ({ uploads: { ...state.uploads, loading: true, error: null } }));
    try {
      const uploadsState = get().uploads;
      const response = await fetchUploadHistory({
        ...buildDateParams(get()),
        ...buildScopeParams(get()),
        reportType: get().filters.reportType,
        page: uploadsState.page,
        limit: uploadsState.limit,
      });
      if (requestId !== get().requestId) return;
      set(state => ({
        uploads: {
          ...state.uploads,
          ...response,
          loading: false,
          error: null,
        },
      }));
    } catch (error) {
      if (requestId !== get().requestId) return;
      set(state => ({
        uploads: {
          ...state.uploads,
          loading: false,
          error: error.message || 'No se pudo cargar el historial.',
        },
      }));
    }
  },

  loadFilterOptions: async (requestId = get().requestId) => {
    try {
      const response = await fetchPerformanceFilters({
        ...buildDateParams(get()),
        ...buildScopeParams(get()),
        reportType: get().filters.reportType,
      });
      if (requestId !== get().requestId) return;
      set({
        filterOptions: {
          clients: response.clients || [],
          owners: response.owners || [],
          businesses: response.businesses || [],
          reportTypes: response.reportTypes || DEFAULT_REPORT_TYPES,
        },
        availableYears: response.years || [],
      });
    } catch (_error) {
      if (requestId !== get().requestId) return;
    }
  },
}));

export default usePerformanceStore;