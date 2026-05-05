import { create } from 'zustand';
import {
  fetchKPIs,
  fetchCharts,
  fetchContracts,
  fetchExpiry,
  fetchFilterOptions,
  fetchOwnerUpcoming,
  fetchOwnerClosed,
} from '../services/api';

const today = new Date();
const currentYear = today.getFullYear();
const currentMonth = today.getMonth() + 1;
const currentQuarter = Math.ceil(currentMonth / 3);

const TABLE_KEYS = ['upcoming', 'vigentes', 'vencidos'];

function normalizeAvailableYears(years) {
  if (!Array.isArray(years)) return [];

  const uniq = new Set(
    years
      .map((year) => Number.parseInt(year, 10))
      .filter((year) => Number.isFinite(year) && year > 0)
  );

  return Array.from(uniq).sort((a, b) => b - a);
}

function createTableState(overrides = {}) {
  return {
    data: [],
    total: 0,
    page: 1,
    limit: 8,
    totalPages: 1,
    loading: false,
    error: null,
    search: '',
    sortBy: 'end_date',
    sortDir: 'asc',
    ...overrides,
  };
}

function resetTablePages(tables) {
  return Object.fromEntries(
    Object.entries(tables).map(([key, table]) => [key, { ...table, page: 1 }])
  );
}

function buildDateParams(state) {
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
    ...state.filters,
  };
}

const useContractStore = create((set, get) => ({
  year: currentYear,
  period: 'anual',
  month: currentMonth,
  quarter: currentQuarter,
  startDate: `${currentYear}-01-01`,
  endDate: `${currentYear}-12-31`,
  filters: {
    client: '',
    type: '',
    owner: '',
    status: '',
    business: '',
  },
  chartFilter: '',

  kpis: null,
  kpisLoading: false,
  kpisError: null,

  charts: null,
  chartsLoading: false,
  chartsError: null,

  expiry: [],
  expiryLoading: false,
  expiryError: null,

  tables: {
    upcoming: createTableState({ limit: 6, sortBy: 'end_date', sortDir: 'asc' }),
    vigentes: createTableState({ limit: 8, sortBy: 'end_date', sortDir: 'asc' }),
    vencidos: createTableState({ limit: 8, sortBy: 'end_date', sortDir: 'desc' }),
  },

  filterOptions: { clients: [], types: [], owners: [], statuses: [], businesses: [] },
  availableYears: [],

  ownerUpcoming: [],
  ownerUpcomingLoading: false,
  ownerUpcomingError: null,

  ownerClosed: [],
  ownerClosedLoading: false,
  ownerClosedError: null,

  refreshVersion: 0,
  queryRequestId: 0,
  tableRequestIds: {
    upcoming: 0,
    vigentes: 0,
    vencidos: 0,
  },


  setYear: (year) => {
    set(state => ({
      year: parseInt(year, 10),
      chartFilter: '',
      tables: resetTablePages(state.tables),
    }));
    get().loadAll();
  },

  setPeriod: (period) => {
    set(state => ({
      period,
      chartFilter: '',
      tables: resetTablePages(state.tables),
    }));
    get().loadAll();
  },

  setMonth: (month) => {
    set(state => ({
      month: parseInt(month, 10),
      quarter: Math.ceil(parseInt(month, 10) / 3),
      chartFilter: '',
      tables: resetTablePages(state.tables),
    }));
    get().loadAll();
  },

  setQuarter: (quarter) => {
    set(state => ({
      quarter: parseInt(quarter, 10),
      chartFilter: '',
      tables: resetTablePages(state.tables),
    }));
    get().loadAll();
  },

  setCustomRange: (patch) => {
    set(state => ({
      period: 'personalizado',
      ...patch,
      chartFilter: '',
      tables: resetTablePages(state.tables),
    }));
    get().loadAll();
  },

  setFilters: (patch) => {
    set(state => ({
      filters: { ...state.filters, ...patch },
      chartFilter: '',
      tables: resetTablePages(state.tables),
    }));
    get().loadAll();
  },

  setChartFilter: (status) => {
    const current = get().chartFilter;
    set(state => ({
      chartFilter: current === status ? '' : status,
      tables: resetTablePages(state.tables),
    }));
    get().loadTables();
  },

  setTableConfig: (tableKey, patch) => {
    set(state => {
      const current = state.tables[tableKey];
      if (!current) return state;

      return {
        tables: {
          ...state.tables,
          [tableKey]: {
            ...current,
            ...patch,
            page: patch.page ?? (patch.limit != null && patch.limit !== current.limit ? 1 : current.page),
          },
        },
      };
    });
  },

  setTablePage: (tableKey, page) => {
    set(state => ({
      tables: {
        ...state.tables,
        [tableKey]: { ...state.tables[tableKey], page },
      },
    }));
    get().loadTable(tableKey);
  },

  setTableSearch: (tableKey, search) => {
    set(state => ({
      tables: {
        ...state.tables,
        [tableKey]: { ...state.tables[tableKey], search, page: 1 },
      },
    }));
    get().loadTable(tableKey);
  },

  setTableSort: (tableKey, sortBy) => {
    const current = get().tables[tableKey];
    const sortDir = sortBy === current.sortBy && current.sortDir === 'asc' ? 'desc' : 'asc';
    set(state => ({
      tables: {
        ...state.tables,
        [tableKey]: {
          ...state.tables[tableKey],
          sortBy,
          sortDir,
          page: 1,
        },
      },
    }));
    get().loadTable(tableKey);
  },

  loadAll: () => {
    const nextQueryRequestId = get().queryRequestId + 1;
    set({ queryRequestId: nextQueryRequestId });

    const { loadKPIs, loadCharts, loadExpiry, loadTables, loadFilterOptions, loadOwnerUpcoming, loadOwnerClosed } = get();
    loadKPIs(nextQueryRequestId);
    loadCharts(nextQueryRequestId);
    loadExpiry(nextQueryRequestId);
    loadTables(nextQueryRequestId);
    loadFilterOptions(nextQueryRequestId);
    loadOwnerUpcoming(nextQueryRequestId);
    loadOwnerClosed(nextQueryRequestId);
  },

  loadTables: (queryRequestId = get().queryRequestId) => {
    TABLE_KEYS.forEach(tableKey => get().loadTable(tableKey, queryRequestId));
  },

  loadKPIs: async (queryRequestId = get().queryRequestId) => {
    set({ kpisLoading: true, kpisError: null });
    try {
      const data = await fetchKPIs(buildBaseParams(get()));
      if (queryRequestId !== get().queryRequestId) return;
      set({ kpis: data, kpisLoading: false });
    } catch (e) {
      if (queryRequestId !== get().queryRequestId) return;
      set({ kpisError: e.message, kpisLoading: false });
    }
  },

  loadCharts: async (queryRequestId = get().queryRequestId) => {
    set({ chartsLoading: true, chartsError: null });
    try {
      const data = await fetchCharts(buildBaseParams(get()));
      if (queryRequestId !== get().queryRequestId) return;
      set({ charts: data, chartsLoading: false });
    } catch (e) {
      if (queryRequestId !== get().queryRequestId) return;
      set({ chartsError: e.message, chartsLoading: false });
    }
  },

  loadExpiry: async (queryRequestId = get().queryRequestId) => {
    set({ expiryLoading: true, expiryError: null });
    try {
      const data = await fetchExpiry(buildBaseParams(get()));
      if (queryRequestId !== get().queryRequestId) return;
      set({ expiry: data, expiryLoading: false });
    } catch (e) {
      if (queryRequestId !== get().queryRequestId) return;
      set({ expiryError: e.message, expiryLoading: false });
    }
  },

  loadTable: async (tableKey, queryRequestId = get().queryRequestId) => {
    const table = get().tables[tableKey];
    if (!table) return;

    const currentTableRequestId = (get().tableRequestIds[tableKey] || 0) + 1;

    set(state => ({
      tableRequestIds: {
        ...state.tableRequestIds,
        [tableKey]: currentTableRequestId,
      },
      tables: {
        ...state.tables,
        [tableKey]: { ...state.tables[tableKey], loading: true, error: null },
      },
    }));

    const tableState = get().tables[tableKey];

    try {
      const data = await fetchContracts({
        ...buildBaseParams(get()),
        chartFilter: get().chartFilter,
        table: tableKey,
        search: tableState.search,
        page: tableState.page,
        limit: tableState.limit,
        sortBy: tableState.sortBy,
        sortDir: tableState.sortDir,
      });

      if (queryRequestId !== get().queryRequestId) return;
      if (currentTableRequestId !== get().tableRequestIds[tableKey]) return;

      set(state => ({
        tables: {
          ...state.tables,
          [tableKey]: {
            ...state.tables[tableKey],
            data: data.data,
            total: data.total,
            page: data.page,
            totalPages: data.totalPages,
            loading: false,
            error: null,
          },
        },
      }));
    } catch (e) {
      if (queryRequestId !== get().queryRequestId) return;
      if (currentTableRequestId !== get().tableRequestIds[tableKey]) return;

      set(state => ({
        tables: {
          ...state.tables,
          [tableKey]: { ...state.tables[tableKey], loading: false, error: e.message },
        },
      }));
    }
  },

  loadFilterOptions: async (queryRequestId = get().queryRequestId) => {
    try {
      const data = await fetchFilterOptions(buildBaseParams(get()));
      if (queryRequestId !== get().queryRequestId) return;

      const { years, ...rest } = data;
      const normalizedYears = normalizeAvailableYears(years);

      set({
        filterOptions: rest,
        availableYears: normalizedYears,
      });

      if (!normalizedYears.length) return;

      const currentState = get();
      const hasCurrentYear = normalizedYears.includes(currentState.year);

      if (currentState.period !== 'personalizado' && !hasCurrentYear) {
        get().setYear(normalizedYears[0]);
      }
    } catch (_) {}
  },

  loadOwnerUpcoming: async (queryRequestId = get().queryRequestId) => {
    set({ ownerUpcomingLoading: true, ownerUpcomingError: null });
    try {
      const data = await fetchOwnerUpcoming(buildBaseParams(get()));
      if (queryRequestId !== get().queryRequestId) return;
      set({ ownerUpcoming: data, ownerUpcomingLoading: false });
    } catch (e) {
      if (queryRequestId !== get().queryRequestId) return;
      set({ ownerUpcomingError: e.message, ownerUpcomingLoading: false });
    }
  },

  loadOwnerClosed: async (queryRequestId = get().queryRequestId) => {
    set({ ownerClosedLoading: true, ownerClosedError: null });
    try {
      const data = await fetchOwnerClosed(buildBaseParams(get()));
      if (queryRequestId !== get().queryRequestId) return;
      set({ ownerClosed: data, ownerClosedLoading: false });
    } catch (e) {
      if (queryRequestId !== get().queryRequestId) return;
      set({ ownerClosedError: e.message, ownerClosedLoading: false });
    }
  },

  refreshAll: () => {
    set(state => ({ refreshVersion: state.refreshVersion + 1 }));
    get().loadAll();
  },
}));

export default useContractStore;
