const MONTH_LABELS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function normalizePeriod(raw) {
  switch (String(raw || 'anual').toLowerCase()) {
    case 'mensual':
    case 'month':
      return 'mensual';
    case 'trimestral':
    case 'quarter':
      return 'trimestral';
    case 'personalizado':
    case 'custom':
      return 'personalizado';
    case 'anual':
    case 'year':
    default:
      return 'anual';
  }
}

function resolveDateRange(params = {}) {
  const today = new Date();
  const currentYear = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth() + 1;
  const fallbackQuarter = Math.ceil(currentMonth / 3);
  const period = normalizePeriod(params.window || params.period);
  const year = normalizePositiveInt(params.year, currentYear);

  if (period === 'mensual') {
    const month = normalizeMonth(params.month, currentMonth);
    return {
      period,
      year,
      month,
      quarter: Math.ceil(month / 3),
      startDate: isoDate(year, month, 1),
      endDate: isoDate(year, month, daysInMonth(year, month)),
    };
  }

  if (period === 'trimestral') {
    const quarter = normalizeQuarter(params.quarter, fallbackQuarter);
    const startMonth = ((quarter - 1) * 3) + 1;
    const endMonth = startMonth + 2;

    return {
      period,
      year,
      month: startMonth,
      quarter,
      startDate: isoDate(year, startMonth, 1),
      endDate: isoDate(year, endMonth, daysInMonth(year, endMonth)),
    };
  }

  if (period === 'personalizado') {
    const startDate = normalizeIsoDate(params.startDate);
    const endDate = normalizeIsoDate(params.endDate);

    if (startDate && endDate) {
      const ordered = startDate <= endDate
        ? { startDate, endDate }
        : { startDate: endDate, endDate: startDate };

      const start = new Date(`${ordered.startDate}T00:00:00Z`);

      return {
        period,
        year: start.getUTCFullYear(),
        month: start.getUTCMonth() + 1,
        quarter: Math.ceil((start.getUTCMonth() + 1) / 3),
        startDate: ordered.startDate,
        endDate: ordered.endDate,
      };
    }
  }

  return {
    period: 'anual',
    year,
    month: 1,
    quarter: 1,
    startDate: isoDate(year, 1, 1),
    endDate: isoDate(year, 12, 31),
  };
}

function shiftRangeByYears(range, years) {
  return {
    ...range,
    year: range.year + years,
    startDate: shiftIsoDate(range.startDate, years),
    endDate: shiftIsoDate(range.endDate, years),
  };
}

function buildScopedContractsQuery(params = {}) {
  const range = resolveDateRange(params);
  const filters = [];
  const filterParams = [];

  applyLikeFilter(filters, filterParams, 'c.client', params.client);
  applyLikeFilter(filters, filterParams, 'c.contract_type', params.type);
  applyLikeFilter(filters, filterParams, 'c.commercial_owner', params.owner);
  applyLikeFilter(filters, filterParams, 'c.business_div_name', params.business);

  const statusFilter = String(params.chartFilter || params.status || '').trim();
  if (statusFilter) {
    filters.push('c.canonical_status = ?');
    filterParams.push(statusFilter);
  }

  const search = String(params.search || '').trim();
  if (search) {
    const q = `%${search}%`;
    filters.push(`(
      c.client_code LIKE ? OR
      c.client LIKE ? OR
      c.contract_name LIKE ? OR
      c.contract_type LIKE ? OR
      CAST(c.duration_months AS CHAR) LIKE ? OR
      c.business_div_name LIKE ? OR
      c.source_status LIKE ? OR
      c.commercial_owner LIKE ?
    )`);
    filterParams.push(q, q, q, q, q, q, q, q);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  return {
    range,
    params: [
      range.endDate,
      range.startDate,
      range.startDate,
      range.endDate,
      range.startDate,
      range.endDate,
      ...filterParams,
    ],
    cte: `
      WITH scoped_contracts AS (
        SELECT
          c.*,
          COALESCE(c.cancellation_date, c.end_date, c.start_date) AS event_date,
          CASE
            WHEN c.source_type = 'vigente'
             AND (c.start_date IS NULL OR c.start_date <= ?)
             AND (c.end_date IS NULL OR c.end_date >= ?)
            THEN 1 ELSE 0
          END AS is_active_in_range,
          CASE
            WHEN c.source_type = 'vigente'
             AND c.end_date IS NOT NULL
             AND c.end_date BETWEEN ? AND ?
            THEN 1 ELSE 0
          END AS is_upcoming_in_range,
          CASE
            WHEN c.source_type = 'vencido'
             AND COALESCE(c.cancellation_date, c.end_date) IS NOT NULL
             AND COALESCE(c.cancellation_date, c.end_date) BETWEEN ? AND ?
            THEN 1 ELSE 0
          END AS is_expired_in_range
        FROM contracts c
        ${whereClause}
      )`,
  };
}

function getTableScopeCondition(table) {
  switch (String(table || 'vigentes').toLowerCase()) {
    case 'upcoming':
    case 'proximos':
      return 'is_upcoming_in_range = 1';
    case 'vencidos':
    case 'expired':
      return 'is_expired_in_range = 1';
    case 'vigentes':
    case 'active':
    default:
      return 'is_active_in_range = 1';
  }
}

function buildMonthBuckets(range) {
  const buckets = [];
  const cursor = new Date(`${range.startDate}T00:00:00Z`);
  const end = new Date(`${range.endDate}T00:00:00Z`);

  cursor.setUTCDate(1);
  end.setUTCDate(1);

  while (cursor <= end) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    buckets.push({
      key: `${year}-${String(month).padStart(2, '0')}`,
      label: `${MONTH_LABELS_ES[month - 1]} ${year}`,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return buckets;
}

function applyLikeFilter(filters, params, field, value) {
  const normalized = String(value || '').trim();
  if (!normalized) return;
  filters.push(`${field} LIKE ?`);
  params.push(`%${normalized}%`);
}

function normalizePositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeMonth(value, fallback) {
  const parsed = normalizePositiveInt(value, fallback);
  return Math.min(12, Math.max(1, parsed));
}

function normalizeQuarter(value, fallback) {
  const parsed = normalizePositiveInt(value, fallback);
  return Math.min(4, Math.max(1, parsed));
}

function normalizeIsoDate(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : raw;
}

function shiftIsoDate(iso, years) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

module.exports = {
  buildMonthBuckets,
  buildScopedContractsQuery,
  getTableScopeCondition,
  normalizePeriod,
  resolveDateRange,
  shiftRangeByYears,
};