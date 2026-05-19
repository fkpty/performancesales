const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const pool = require('../db/connection');
const {
  buildEfficiencyAccessPayload,
  createEfficiencyForbiddenError,
  filterEfficiencyConfigByScope,
  resolveEfficiencyScope,
  resolveNavigationAccess,
} = require('./efficiencyAccessService');

const WORKBOOK_PATH = path.resolve(__dirname, '..', '..', '..', 'Excel', 'app', '2026 03 Sales Productivity .xlsx');
const WORKBOOK_MONEY_MULTIPLIER = 1000;
const SHEET_DEFINITIONS = {
  sales_productivity: {
    label: 'Sales Productivity',
    workbookName: 'Sales Productivity',
    defaultGpRate: 0.2,
  },
};
const SHEET_TYPES = Object.keys(SHEET_DEFINITIONS);
const EFFICIENCY_MEMBER_INSERT_PLACEHOLDERS = new Array(27).fill('?').join(',');
const POSTSALES_REPORT_TYPE = 'postventas';
const EFFICIENCY_EXPORT_COLUMNS = [
  { key: 'group_name', header: 'Grupo', width: 26 },
  { key: 'manager_name', header: 'Gerente', width: 24 },
  { key: 'seller_name', header: 'Vendedor', width: 28 },
  { key: 'market_segment', header: 'Segmento', width: 18 },
  { key: 'months_in_role_label', header: 'Meses en ventas', width: 18 },
  { key: 'yearly_total_target', header: 'Meta anual total', width: 18, numFmt: '$#,##0.00' },
  { key: 'yearly_total_target_gp', header: 'Meta anual GP', width: 18, numFmt: '$#,##0.00' },
  { key: 'ytd_target_revenue', header: 'YTD Target Rev', width: 18, numFmt: '$#,##0.00' },
  { key: 'ytd_target_profit', header: 'YTD Target Profit', width: 18, numFmt: '$#,##0.00' },
  { key: 'ytd_revenue', header: 'YTD Rev', width: 18, numFmt: '$#,##0.00' },
  { key: 'ytd_profit', header: 'YTD Profit', width: 18, numFmt: '$#,##0.00' },
  { key: 'ytd_plan_percent_revenue', header: 'Plan % Rev', width: 14, numFmt: '0.00%' },
  { key: 'ytd_plan_percent_profit', header: 'Plan % Profit', width: 14, numFmt: '0.00%' },
  { key: 'salary_fully_loaded', header: 'Salary Fully Loaded', width: 20, numFmt: '$#,##0.00' },
  { key: 'efficiency_rate', header: 'Eficiencia', width: 14, numFmt: '0.00' },
];
const seedPromises = new Map();

async function getEfficiencyOverview(params = {}, user = null) {
  const overviewContext = await resolveEfficiencyOverviewContext(params);
  const config = await getEfficiencyConfig({
    ...params,
    configMonth: overviewContext.config_month,
  });
  const navigation = await resolveNavigationAccess(user);
  const access = navigation?.has_full_view_access
    ? createFullAccessScope('full_view_access_setting')
    : resolveEfficiencyScope(user, config);
  if (access.status === 'no_access') {
    throw createEfficiencyForbiddenError('No tienes acceso a datos de eficiencia para este periodo.');
  }

  const scopedConfig = filterEfficiencyConfigByScope(config, access);
  const sheets = {};

  for (const sheetType of SHEET_TYPES) {
    sheets[sheetType] = await buildSheetOverview(scopedConfig.sheets[sheetType], overviewContext);
  }

  return {
    config_month: overviewContext.config_month || scopedConfig.config_month,
    filter: buildEfficiencyFilterPayload(overviewContext),
    access: buildEfficiencyAccessPayload(access),
    sheets,
  };
}

async function getEfficiencyConfig(params = {}) {
  const configMonth = await resolveConfigMonth(params);
  await ensureEfficiencySeed(configMonth);
  return readEfficiencyConfig(configMonth);
}

async function saveEfficiencyConfig(params = {}, payload = {}, user = null) {
  const configMonth = await resolveConfigMonth({
    configMonth: payload.config_month || payload.configMonth || params.configMonth || params.config_month,
    year: params.year,
    month: params.month,
  });
  const normalized = normalizeConfigPayload(payload, configMonth);
  await replaceEfficiencyConfig(configMonth, normalized, user?.id || null);
  return readEfficiencyConfig(configMonth);
}

async function getEfficiencyAccessSummary(params = {}, user = null) {
  const overviewContext = await resolveEfficiencyOverviewContext(params);
  const config = await getEfficiencyConfig({
    ...params,
    configMonth: overviewContext.config_month,
  });
  const navigation = await resolveNavigationAccess(user);
  const access = navigation?.has_full_view_access
    ? createFullAccessScope('full_view_access_setting')
    : resolveEfficiencyScope(user, config);

  return {
    config_month: overviewContext.config_month || config.config_month,
    filter: buildEfficiencyFilterPayload(overviewContext),
    navigation,
    efficiency: buildEfficiencyAccessPayload(access),
  };
}

async function exportEfficiencyProductivityWorkbook(params = {}, user = null) {
  const overview = await getEfficiencyOverview(params, user);
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sales Productivity');
  const sheet = overview.sheets.sales_productivity;

  worksheet.addRow(['Performance Sales - Eficiencia']);
  worksheet.addRow(['Periodo', overview.filter?.label || overview.config_month.slice(0, 7)]);
  worksheet.addRow(['Alcance', overview.access?.status || 'no_access']);
  worksheet.addRow([]);

  worksheet.columns = EFFICIENCY_EXPORT_COLUMNS;

  EFFICIENCY_EXPORT_COLUMNS.forEach((column, index) => {
    const worksheetColumn = worksheet.getColumn(index + 1);
    worksheetColumn.width = column.width;
    if (column.numFmt) {
      worksheetColumn.numFmt = column.numFmt;
    }
  });

  (sheet?.groups || []).forEach((group, groupIndex) => {
    (group.members || []).forEach((member) => {
      worksheet.addRow(buildExportRow(group, member));
    });

    worksheet.addRow(buildExportTotalsRow(group));

    if (groupIndex < (sheet?.groups || []).length - 1) {
      worksheet.addRow({});
    }
  });

  worksheet.addRow({});
  worksheet.addRow(buildExportGrandTotalsRow(sheet));
  worksheet.views = [{ state: 'frozen', ySplit: 5 }];

  return {
    workbook,
    filename: `performance-sales-efficiency-${overview.config_month.slice(0, 7)}.xlsx`,
  };
}

async function buildSheetOverview(sheetConfig, overviewContext = null) {
  const effectiveSheetConfig = applyOverviewContextToSheet(sheetConfig, overviewContext);
  const metricAssignments = await fetchYtdMetricsBySeller(effectiveSheetConfig, overviewContext);
  const groups = effectiveSheetConfig.groups.map((group) => buildOverviewGroup(effectiveSheetConfig, group, metricAssignments));
  const grandTotals = buildGrandTotals(effectiveSheetConfig.sheet_type, groups);

  return {
    ...effectiveSheetConfig,
    groups,
    grand_totals: grandTotals,
  };
}

function buildOverviewGroup(sheetConfig, groupConfig, metricAssignments) {
  const members = groupConfig.members.map((member) => buildOverviewMember(sheetConfig, groupConfig, member, metricAssignments));

  const totals = {
    yearly_printing_target: sumRows(members, 'yearly_printing_target'),
    yearly_it_other_target: sumRows(members, 'yearly_it_other_target'),
    yearly_rental_target: sumRows(members, 'yearly_rental_target'),
    yearly_total_target: sumRows(members, 'yearly_total_target'),
    yearly_total_target_gp: sumRows(members, 'yearly_total_target_gp'),
    ytd_target_revenue: sumRows(members, 'ytd_target_revenue'),
    ytd_target_profit: sumRows(members, 'ytd_target_profit'),
    ytd_revenue: sumRows(members, 'ytd_revenue'),
    ytd_profit: sumRows(members, 'ytd_profit'),
  };

  totals.ytd_plan_percent_revenue = safeDivide(totals.ytd_revenue, totals.ytd_target_revenue);
  totals.ytd_plan_percent_profit = safeDivide(totals.ytd_profit, totals.ytd_target_profit);
  totals.salary_fully_loaded = buildGroupSalaryFullyLoaded(sheetConfig, groupConfig, members);
  totals.efficiency_rate = safeDivide(totals.ytd_profit, totals.salary_fully_loaded);

  return {
    ...groupConfig,
    members,
    totals,
  };
}

function buildOverviewMember(sheetConfig, groupConfig, memberConfig, metricAssignments) {
  const sellerMetrics = resolveSellerMetrics(sheetConfig, groupConfig, memberConfig, metricAssignments);
  const yearlyPrintingTarget = scaleWorkbookMoney(memberConfig.yearly_printing_target);
  const yearlyItOtherTarget = scaleWorkbookMoney(memberConfig.yearly_it_other_target);
  const yearlyRentalTarget = scaleWorkbookMoney(memberConfig.yearly_rental_target);
  const yearlyTotalTarget = resolveYearlyTotalTarget(sheetConfig.sheet_type, memberConfig);
  const yearlyGpRate = resolveYearlyGpRate(sheetConfig.sheet_type, memberConfig);
  const yearlyTotalTargetGp = yearlyTotalTarget * yearlyGpRate;
  const planMonths = resolvePlanMonths(sheetConfig, memberConfig);
  const salaryMonths = resolveSalaryMonths(sheetConfig, memberConfig);

  const ytdTargetRevenue = sheetConfig.sheet_type === 'sales_productivity'
    ? yearlyTotalTarget / 12 * planMonths
    : yearlyTotalTarget;
  const ytdTargetProfit = sheetConfig.sheet_type === 'sales_productivity'
    ? yearlyTotalTargetGp / 12 * planMonths
    : yearlyTotalTargetGp;
  const salaryFullyLoaded = resolveSalaryFullyLoaded(memberConfig, salaryMonths);

  return {
    ...memberConfig,
    yearly_printing_target: yearlyPrintingTarget,
    yearly_it_other_target: yearlyItOtherTarget,
    yearly_rental_target: yearlyRentalTarget,
    yearly_total_target: roundNumber(yearlyTotalTarget),
    yearly_total_target_gp: roundNumber(yearlyTotalTargetGp),
    ytd_target_revenue: roundNumber(ytdTargetRevenue),
    ytd_target_profit: roundNumber(ytdTargetProfit),
    ytd_revenue: roundNumber(sellerMetrics.total_revenue),
    ytd_profit: roundNumber(sellerMetrics.total_gross_profit),
    ytd_plan_percent_revenue: safeDivide(sellerMetrics.total_revenue, ytdTargetRevenue),
    ytd_plan_percent_profit: safeDivide(sellerMetrics.total_gross_profit, ytdTargetProfit),
    salary_fully_loaded: roundNumber(salaryFullyLoaded),
    efficiency_rate: safeDivide(sellerMetrics.total_gross_profit, salaryFullyLoaded),
  };
}

function buildGroupSalaryFullyLoaded(sheetConfig, groupConfig, members) {
  if (groupConfig.total_salary_amount != null && groupConfig.total_salary_amount !== '') {
    const months = resolveMonthsValue(
      groupConfig.total_salary_months_mode,
      groupConfig.total_salary_months_custom,
      null,
      sheetConfig.ytd_month_number
    );

    return roundNumber(
      (scaleWorkbookMoneyNumber(groupConfig.total_salary_amount) / nonZero(groupConfig.total_salary_divisor, 1))
      * nonZero(groupConfig.total_salary_multiplier, 1)
      * months
    );
  }

  return roundNumber(sumRows(members, 'salary_fully_loaded'));
}

function buildGrandTotals(sheetType, groups) {
  const totals = {
    yearly_printing_target: sumNested(groups, 'totals.yearly_printing_target'),
    yearly_it_other_target: sumNested(groups, 'totals.yearly_it_other_target'),
    yearly_rental_target: sumNested(groups, 'totals.yearly_rental_target'),
    yearly_total_target: sumNested(groups, 'totals.yearly_total_target'),
    yearly_total_target_gp: sumNested(groups, 'totals.yearly_total_target_gp'),
    ytd_target_revenue: sumNested(groups, 'totals.ytd_target_revenue'),
    ytd_target_profit: sumNested(groups, 'totals.ytd_target_profit'),
    ytd_revenue: sumNested(groups, 'totals.ytd_revenue'),
    ytd_profit: sumNested(groups, 'totals.ytd_profit'),
    salary_fully_loaded: sumNested(groups, 'totals.salary_fully_loaded'),
  };

  totals.ytd_plan_percent_revenue = safeDivide(totals.ytd_revenue, totals.ytd_target_revenue);
  totals.ytd_plan_percent_profit = safeDivide(totals.ytd_profit, totals.ytd_target_profit);
  totals.efficiency_rate = safeDivide(totals.ytd_profit, totals.salary_fully_loaded);

  return {
    sheet_type: sheetType,
    label: 'TOTAL',
    ...mapNumericObject(totals),
  };
}

async function fetchYtdMetricsBySeller(sheetConfig, overviewContext = null) {
  const periodFilter = buildEfficiencyMetricsPeriodFilter(sheetConfig, overviewContext);
  if (!periodFilter?.whereSql) {
    return createEmptyMetricAssignments();
  }

  const [rows] = await pool.query(
    `SELECT
      r.report_type,
      r.employee_id,
      r.sales_person_name,
      COALESCE(SUM(r.revenue), 0) AS total_revenue,
      COALESCE(SUM(r.gross_profit), 0) AS total_gross_profit
     FROM performance_sales_rows r
     INNER JOIN performance_sales_upload_batches b ON b.id = r.batch_id
     WHERE ${periodFilter.whereSql}
     GROUP BY r.report_type, r.employee_id, r.sales_person_name`,
    periodFilter.values
  );

  return buildSheetMetricAssignments(sheetConfig, rows);
}

function buildEfficiencyMetricsPeriodFilter(sheetConfig, overviewContext = null) {
  if (overviewContext?.metrics_where_sql) {
    return {
      whereSql: overviewContext.metrics_where_sql,
      values: overviewContext.metrics_values || [],
    };
  }

  const reportYear = Number(sheetConfig?.report_year);
  const ytdMonthNumber = Number(sheetConfig?.ytd_month_number);
  if (!Number.isFinite(reportYear) || reportYear <= 0 || !Number.isFinite(ytdMonthNumber) || ytdMonthNumber <= 0) {
    return null;
  }

  return {
    whereSql: `b.is_active = 1
       AND YEAR(r.report_month) = ?
       AND MONTH(r.report_month) <= ?`,
    values: [reportYear, ytdMonthNumber],
  };
}

function createEmptyMetricAssignments() {
  return {
    memberMetrics: new Map(),
    otherMetricsByGroup: new Map(),
  };
}

function buildSheetMetricAssignments(sheetConfig, rows) {
  const assignments = createEmptyMetricAssignments();
  const memberIndex = new Map();
  const memberEmployeeIndex = new Map();
  const looseMemberIndex = new Map();
  const mirnaMemberIndex = new Map();
  const mirnaMemberEmployeeIndex = new Map();
  const mirnaLooseMemberIndex = new Map();
  const managerIndex = new Map();
  const looseManagerIndex = new Map();
  const managerEntries = [];
  let fallbackOtherGroupKey = '';
  let mirnaOtherGroupKey = '';

  (sheetConfig?.groups || []).forEach((group) => {
    const groupKey = buildGroupAccessLookupKey(sheetConfig.sheet_type, group);
    const managerName = group?.manager_name || group?.group_name;
    const managerKey = normalizeLookupKey(managerName);
    const isMirnaGroup = isMirnaPostSalesGroup(group);

    addUniqueLookup(managerIndex, managerKey, groupKey);
    addUniqueLookup(looseManagerIndex, normalizeLooseLookupKey(managerName), groupKey);

    if (managerKey) {
      managerEntries.push({
        groupKey,
        tokens: managerKey.split(' ').filter(Boolean),
      });
    }

    if (!fallbackOtherGroupKey && (group?.members || []).some((member) => isOtherMember(member))) {
      fallbackOtherGroupKey = groupKey;
    }

    if (isMirnaGroup && !mirnaOtherGroupKey && (group?.members || []).some((member) => isOtherMember(member))) {
      mirnaOtherGroupKey = groupKey;
    }

    (group?.members || []).forEach((member) => {
      if (isOtherMember(member)) {
        return;
      }

      const memberKey = buildMemberAccessLookupKey(sheetConfig.sheet_type, group, member);
      addUniqueLookup(memberEmployeeIndex, normalizeEmployeeLookupKey(member?.employee_id), memberKey);
      addUniqueLookup(memberIndex, normalizeLookupKey(member?.seller_name), memberKey);
      addUniqueLookup(looseMemberIndex, normalizeLooseLookupKey(member?.seller_name), memberKey);

      if (isMirnaGroup) {
        addUniqueLookup(mirnaMemberEmployeeIndex, normalizeEmployeeLookupKey(member?.employee_id), memberKey);
        addUniqueLookup(mirnaMemberIndex, normalizeLookupKey(member?.seller_name), memberKey);
        addUniqueLookup(mirnaLooseMemberIndex, normalizeLooseLookupKey(member?.seller_name), memberKey);
      }
    });
  });

  rows.forEach((row) => {
    const metrics = {
      total_revenue: toNumber(row.total_revenue),
      total_gross_profit: toNumber(row.total_gross_profit),
    };

    if (!metrics.total_revenue && !metrics.total_gross_profit) {
      return;
    }

    const sellerName = String(row.sales_person_name || '').trim();
    const employeeId = normalizeEmployeeLookupKey(row.employee_id);
    const exactSellerKey = normalizeLookupKey(sellerName);
    const looseSellerKey = normalizeLooseLookupKey(sellerName);
    const reportType = normalizePerformanceReportType(row.report_type);

    if (reportType === POSTSALES_REPORT_TYPE && (mirnaOtherGroupKey || mirnaMemberEmployeeIndex.size || mirnaMemberIndex.size || mirnaLooseMemberIndex.size)) {
      const mirnaMemberKey = resolveUniqueLookup(mirnaMemberEmployeeIndex, employeeId)
        || resolveUniqueLookup(mirnaMemberIndex, exactSellerKey)
        || resolveUniqueLookup(mirnaLooseMemberIndex, looseSellerKey);

      if (mirnaMemberKey) {
        accumulateMetrics(assignments.memberMetrics, mirnaMemberKey, metrics);
        return;
      }

      if (mirnaOtherGroupKey) {
        accumulateMetrics(assignments.otherMetricsByGroup, mirnaOtherGroupKey, metrics);
        return;
      }
    }

    const memberKey = resolveUniqueLookup(memberEmployeeIndex, employeeId)
      || resolveUniqueLookup(memberIndex, exactSellerKey)
      || resolveUniqueLookup(looseMemberIndex, looseSellerKey);

    if (memberKey) {
      accumulateMetrics(assignments.memberMetrics, memberKey, metrics);
      return;
    }

    const otherGroupKey = resolveOtherGroupKeyForSeller(
      exactSellerKey,
      looseSellerKey,
      managerIndex,
      looseManagerIndex,
      managerEntries
    ) || fallbackOtherGroupKey;

    if (otherGroupKey) {
      accumulateMetrics(assignments.otherMetricsByGroup, otherGroupKey, metrics);
    }
  });

  return assignments;
}

function addUniqueLookup(index, key, value) {
  if (!key) {
    return;
  }

  if (!index.has(key)) {
    index.set(key, value);
    return;
  }

  if (index.get(key) !== value) {
    index.set(key, null);
  }
}

function resolveUniqueLookup(index, key) {
  if (!key || !index.has(key)) {
    return null;
  }

  return index.get(key) || null;
}

function accumulateMetrics(index, key, metrics) {
  if (!key) {
    return;
  }

  const current = index.get(key) || { ...EMPTY_METRICS };
  current.total_revenue += toNumber(metrics.total_revenue);
  current.total_gross_profit += toNumber(metrics.total_gross_profit);
  index.set(key, current);
}

function resolveOtherGroupKeyForSeller(sellerKey, looseSellerKey, managerIndex, looseManagerIndex, managerEntries) {
  const exactManagerGroup = resolveUniqueLookup(managerIndex, sellerKey);
  if (exactManagerGroup) {
    return exactManagerGroup;
  }

  const looseManagerGroup = resolveUniqueLookup(looseManagerIndex, looseSellerKey);
  if (looseManagerGroup) {
    return looseManagerGroup;
  }

  const sellerTokens = sellerKey ? sellerKey.split(' ').filter(Boolean) : [];
  if (!sellerTokens.length) {
    return null;
  }

  const subsetMatches = managerEntries.filter((entry) => sellerTokens.every((token) => entry.tokens.includes(token)));
  return subsetMatches.length === 1 ? subsetMatches[0].groupKey : null;
}

async function resolveConfigMonth(params = {}) {
  const explicit = normalizeConfigMonth(params.configMonth || params.config_month);
  if (explicit) {
    return explicit;
  }

  const year = parseInt(params.year, 10);
  const month = parseInt(params.month, 10);
  if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
    return `${year}-${String(month).padStart(2, '0')}-01`;
  }

  const [[configRow]] = await pool.query(
    `SELECT config_month
       FROM performance_efficiency_period_settings
      ORDER BY config_month DESC
      LIMIT 1`
  );
  if (configRow?.config_month) {
    return normalizeDateValue(configRow.config_month) || currentMonthStart();
  }

  const [[uploadRow]] = await pool.query(
    `SELECT report_month
       FROM performance_sales_upload_batches
      WHERE is_active = 1
      ORDER BY report_month DESC
      LIMIT 1`
  );
  if (uploadRow?.report_month) {
    return normalizeDateValue(uploadRow.report_month) || currentMonthStart();
  }

  return currentMonthStart();
}

async function resolveEfficiencyOverviewContext(params = {}) {
  const explicitConfigMonth = normalizeConfigMonth(params.configMonth || params.config_month);
  const metricsPeriod = buildEfficiencyPeriodContext(params, 'b.report_month');
  const configPeriod = buildEfficiencyPeriodContext(params, 'config_month');
  const activeMonths = metricsPeriod.whereSql ? await listActiveReportMonths(metricsPeriod) : [];
  const activeMonthCount = activeMonths.length;
  const fallbackConfigMonth = await resolveConfigMonth(params);
  const configMonth = explicitConfigMonth
    || await findLatestConfigMonth(configPeriod)
    || activeMonths[activeMonths.length - 1]
    || metricsPeriod.preferred_config_month
    || fallbackConfigMonth;
  const savedPeriodSettings = configMonth ? await findPeriodSettings(configMonth) : null;
  const fallbackYtdMonthNumber = parseInt(String(configMonth || '').slice(5, 7), 10);
  const savedReportYear = parseInt(String(savedPeriodSettings?.report_year || ''), 10);
  const reportYear = metricsPeriod.display_year
    || savedReportYear
    || parseInt(String(configMonth || '').slice(0, 4), 10)
    || parseInt(params.year, 10)
    || new Date().getFullYear();
  const ytdMonthNumber = clampInt(
    savedPeriodSettings?.ytd_month_number,
    fallbackYtdMonthNumber || activeMonthCount || metricsPeriod.fallback_month_count || 1,
    1,
    12
  );

  return {
    period: metricsPeriod.period,
    label: metricsPeriod.label,
    config_month: configMonth,
    metrics_where_sql: Number.isFinite(reportYear) && reportYear > 0
      ? `b.is_active = 1 AND YEAR(r.report_month) = ? AND MONTH(r.report_month) <= ?`
      : metricsPeriod.whereSql,
    metrics_values: Number.isFinite(reportYear) && reportYear > 0
      ? [reportYear, ytdMonthNumber]
      : metricsPeriod.values,
    active_month_count: activeMonthCount,
    active_months: activeMonths,
    report_year: reportYear,
    ytd_month_number: ytdMonthNumber,
  };
}

function buildEfficiencyPeriodContext(params = {}, column) {
  const period = normalizeEfficiencyPeriod(params.period);
  const year = parseInt(params.year, 10);
  const month = parseInt(params.month, 10);
  const quarter = parseInt(params.quarter, 10);
  const startDate = normalizeDateValue(params.startDate);
  const endDate = normalizeDateValue(params.endDate);

  if (period === 'mensual' && Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
    return {
      period,
      label: `${year}-${String(month).padStart(2, '0')}`,
      whereSql: `b.is_active = 1 AND YEAR(${column}) = ? AND MONTH(${column}) = ?`,
      values: [year, month],
      fallback_month_count: 1,
      display_year: year,
      preferred_config_month: `${year}-${String(month).padStart(2, '0')}-01`,
    };
  }

  if (period === 'trimestral' && Number.isFinite(year) && Number.isFinite(quarter) && quarter >= 1 && quarter <= 4) {
    const quarterStartMonth = (quarter - 1) * 3 + 1;
    const quarterEndMonth = quarterStartMonth + 2;

    return {
      period,
      label: `${year} T${quarter}`,
      whereSql: `b.is_active = 1 AND YEAR(${column}) = ? AND QUARTER(${column}) = ?`,
      values: [year, quarter],
      fallback_month_count: 3,
      display_year: year,
      preferred_config_month: `${year}-${String(quarterEndMonth).padStart(2, '0')}-01`,
    };
  }

  if (period === 'personalizado' && startDate && endDate) {
    const { startDate: normalizedStartDate, endDate: normalizedEndDate } = normalizeDateRange(startDate, endDate);
    return {
      period,
      label: `${normalizedStartDate} a ${normalizedEndDate}`,
      whereSql: `b.is_active = 1 AND ${column} BETWEEN ? AND ?`,
      values: [normalizedStartDate, normalizedEndDate],
      fallback_month_count: countMonthsInRange(normalizedStartDate, normalizedEndDate),
      display_year: parseInt(normalizedEndDate.slice(0, 4), 10) || parseInt(normalizedStartDate.slice(0, 4), 10),
      preferred_config_month: normalizeConfigMonth(normalizedEndDate),
    };
  }

  if (Number.isFinite(year) && year > 0) {
    return {
      period: 'anual',
      label: String(year),
      whereSql: `b.is_active = 1 AND YEAR(${column}) = ?`,
      values: [year],
      fallback_month_count: 12,
      display_year: year,
      preferred_config_month: `${year}-12-01`,
    };
  }

  return {
    period: 'anual',
    label: 'Periodo activo',
    whereSql: 'b.is_active = 1',
    values: [],
    fallback_month_count: 1,
    display_year: null,
    preferred_config_month: null,
  };
}

async function listActiveReportMonths(periodContext) {
  const [rows] = await pool.query(
    `SELECT DISTINCT DATE_FORMAT(b.report_month, '%Y-%m-01') AS report_month
       FROM performance_sales_upload_batches b
      WHERE ${periodContext.whereSql}
      ORDER BY report_month ASC`,
    periodContext.values
  );

  return rows
    .map((row) => normalizeConfigMonth(row.report_month))
    .filter(Boolean);
}

async function findLatestConfigMonth(periodContext) {
  const [rows] = await pool.query(
    `SELECT config_month
       FROM performance_efficiency_period_settings
      WHERE ${buildConfigPeriodWhereSql(periodContext.whereSql)}
      ORDER BY config_month DESC
      LIMIT 1`,
    periodContext.values
  );

  return normalizeConfigMonth(rows[0]?.config_month);
}

async function findPeriodSettings(configMonth) {
  const [rows] = await pool.query(
    `SELECT report_year, ytd_month_number
       FROM performance_efficiency_period_settings
      WHERE config_month = ?
      ORDER BY sheet_type ASC, id ASC
      LIMIT 1`,
    [configMonth]
  );

  return rows[0] || null;
}

function applyOverviewContextToSheet(sheetConfig, overviewContext = null) {
  if (!overviewContext) {
    return sheetConfig;
  }

  return {
    ...sheetConfig,
    config_month: overviewContext.config_month || sheetConfig.config_month,
    report_year: overviewContext.report_year || sheetConfig.report_year,
    ytd_month_number: overviewContext.ytd_month_number || sheetConfig.ytd_month_number,
    active_month_count: overviewContext.active_month_count,
    active_months: overviewContext.active_months || [],
    filter_period: overviewContext.period,
    filter_label: overviewContext.label,
  };
}

function buildEfficiencyFilterPayload(overviewContext = null) {
  if (!overviewContext) {
    return null;
  }

  return {
    period: overviewContext.period,
    label: overviewContext.label,
    active_month_count: overviewContext.active_month_count,
    ytd_month_number: overviewContext.ytd_month_number,
    config_month: overviewContext.config_month,
  };
}

function createFullAccessScope(reason = 'administrative_role') {
  return {
    status: 'full_access',
    reason,
    matched_groups: [],
    matched_members: [],
    allowed_group_keys: [],
    allowed_member_keys: [],
  };
}

function normalizeEfficiencyPeriod(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['mensual', 'trimestral', 'personalizado', 'anual'].includes(normalized)
    ? normalized
    : 'anual';
}

function buildConfigPeriodWhereSql(whereSql = '') {
  return String(whereSql)
    .replaceAll('b.is_active = 1 AND ', '')
    .replaceAll(' AND b.is_active = 1', '')
    .replaceAll('b.is_active = 1', '1 = 1')
    .replaceAll('b.', '');
}

function normalizeDateRange(startDate, endDate) {
  if (startDate <= endDate) {
    return { startDate, endDate };
  }

  return {
    startDate: endDate,
    endDate: startDate,
  };
}

function countMonthsInRange(startDate, endDate) {
  const start = new Date(`${startDate.slice(0, 7)}-01T00:00:00Z`);
  const end = new Date(`${endDate.slice(0, 7)}-01T00:00:00Z`);

  return ((end.getUTCFullYear() - start.getUTCFullYear()) * 12)
    + (end.getUTCMonth() - start.getUTCMonth())
    + 1;
}

async function ensureEfficiencySeed(configMonth) {
  if (seedPromises.has(configMonth)) {
    await seedPromises.get(configMonth);
    return;
  }

  const seedPromise = ensureEfficiencySeedOnce(configMonth);
  seedPromises.set(configMonth, seedPromise);

  try {
    await seedPromise;
  } finally {
    seedPromises.delete(configMonth);
  }
}

async function ensureEfficiencySeedOnce(configMonth) {
  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total
       FROM performance_efficiency_period_settings
      WHERE config_month = ?`,
    [configMonth]
  );

  if (Number(countRow?.total || 0) > 0) {
    return;
  }

  if (!fs.existsSync(WORKBOOK_PATH)) {
    return;
  }

  const workbookSeed = await parseWorkbookSeed(configMonth);
  await replaceEfficiencyConfig(configMonth, workbookSeed, null);
}

async function parseWorkbookSeed(configMonth) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(WORKBOOK_PATH);

  return {
    sheets: {
      sales_productivity: parseSalesProductivitySheet(workbook.getWorksheet(SHEET_DEFINITIONS.sales_productivity.workbookName), configMonth),
    },
  };
}

function parseSalesProductivitySheet(sheet, configMonth) {
  const groups = [];
  let currentGroup = null;
  let groupOrder = 0;
  let memberOrder = 0;

  for (let rowNumber = 4; rowNumber <= 24; rowNumber += 1) {
    const managerValue = getCellString(sheet, `B${rowNumber}`);
    const sellerName = getCellString(sheet, `C${rowNumber}`);
    const normalizedManager = managerValue.toLowerCase();

    if (managerValue && managerValue !== 'TOTAL' && !normalizedManager.startsWith('total ')) {
      currentGroup = {
        group_name: managerValue,
        manager_name: managerValue,
        manager_user_id: null,
        total_salary_amount: null,
        total_salary_divisor: 1,
        total_salary_multiplier: 1,
        total_salary_months_mode: 'period',
        total_salary_months_custom: null,
        sort_order: groupOrder,
        members: [],
      };
      groups.push(currentGroup);
      groupOrder += 1;
      memberOrder = 0;
    }

    if (!currentGroup) {
      continue;
    }

    if (managerValue && normalizedManager.startsWith('total ')) {
      Object.assign(currentGroup, parseSalaryFormula(getCellFormula(sheet, `Q${rowNumber}`), null, true));
      currentGroup = null;
      continue;
    }

    if (!sellerName) {
      continue;
    }

    currentGroup.members.push({
      employee_id: '',
      seller_name: sellerName,
      market_segment: getCellString(sheet, `D${rowNumber}`),
      months_in_role_label: getCellString(sheet, `E${rowNumber}`),
      months_in_role_value: parseMonthsInRole(getCellString(sheet, `E${rowNumber}`)),
      yearly_printing_target: getCellNumber(sheet, `F${rowNumber}`),
      yearly_it_other_target: getCellNumber(sheet, `G${rowNumber}`),
      yearly_rental_target: getCellNumber(sheet, `H${rowNumber}`),
      yearly_total_target: resolveSalesYearlyTotalTarget(sheet, rowNumber),
      yearly_gp_target_rate: resolveSalesGpRate(sheet, rowNumber),
      plan_months_mode: resolvePlanMonthsMode(getCellFormula(sheet, `O${rowNumber}`), getCellString(sheet, `E${rowNumber}`)).mode,
      plan_months_custom: resolvePlanMonthsMode(getCellFormula(sheet, `O${rowNumber}`), getCellString(sheet, `E${rowNumber}`)).custom,
      ...parseSalaryFormula(getCellFormula(sheet, `Q${rowNumber}`), getCellString(sheet, `E${rowNumber}`), false),
      is_other_row: sellerName.trim().toLowerCase() === 'other',
      sort_order: memberOrder,
    });
    memberOrder += 1;
  }

  return {
    sheet_type: 'sales_productivity',
    label: SHEET_DEFINITIONS.sales_productivity.label,
    config_month: configMonth,
    report_year: getCellNumber(sheet, 'B2') || parseInt(configMonth.slice(0, 4), 10),
    ytd_month_number: getCellNumber(sheet, 'D2') || 1,
    groups,
  };
}

function parsePresalesSheet(sheet, configMonth) {
  const groups = [];
  let currentGroup = null;
  let groupOrder = 0;
  let memberOrder = 0;

  for (let rowNumber = 4; rowNumber <= 11; rowNumber += 1) {
    const managerValue = getCellString(sheet, `B${rowNumber}`);
    const sellerName = getCellString(sheet, `C${rowNumber}`);

    if (managerValue && managerValue !== 'TOTAL') {
      currentGroup = {
        group_name: managerValue,
        manager_name: managerValue,
        manager_user_id: null,
        total_salary_amount: null,
        total_salary_divisor: 1,
        total_salary_multiplier: 1,
        total_salary_months_mode: 'period',
        total_salary_months_custom: null,
        sort_order: groupOrder,
        members: [],
      };
      groups.push(currentGroup);
      groupOrder += 1;
      memberOrder = 0;
    }

    if (!currentGroup || !sellerName) {
      continue;
    }

    currentGroup.members.push({
      seller_name: sellerName,
      market_segment: getCellString(sheet, `D${rowNumber}`),
      months_in_role_label: getCellString(sheet, `E${rowNumber}`),
      months_in_role_value: parseMonthsInRole(getCellString(sheet, `E${rowNumber}`)),
      yearly_printing_target: null,
      yearly_it_other_target: null,
      yearly_rental_target: null,
      yearly_total_target: getCellNumber(sheet, `F${rowNumber}`),
      yearly_gp_target_rate: resolvePresalesGpRate(sheet, rowNumber),
      plan_months_mode: 'period',
      plan_months_custom: null,
      ...parseSalaryFormula(getCellFormula(sheet, `L${rowNumber}`), getCellString(sheet, `E${rowNumber}`), false),
      is_other_row: sellerName.trim().toLowerCase() === 'other',
      sort_order: memberOrder,
    });
    memberOrder += 1;
  }

  return {
    sheet_type: 'presales',
    label: SHEET_DEFINITIONS.presales.label,
    config_month: configMonth,
    report_year: getCellNumber(sheet, 'B2') || parseInt(configMonth.slice(0, 4), 10),
    ytd_month_number: getCellNumber(sheet, 'D2') || 1,
    groups,
  };
}

async function readEfficiencyConfig(configMonth) {
  const [periodRows] = await pool.query(
    `SELECT *
       FROM performance_efficiency_period_settings
      WHERE config_month = ?
      ORDER BY sheet_type ASC`,
    [configMonth]
  );
  const [groupRows] = await pool.query(
    `SELECT *
       FROM performance_efficiency_groups
      WHERE config_month = ?
      ORDER BY sheet_type ASC, sort_order ASC, id ASC`,
    [configMonth]
  );
  const [memberRows] = await pool.query(
    `SELECT *
       FROM performance_efficiency_members
      WHERE config_month = ?
      ORDER BY sheet_type ASC, group_id ASC, sort_order ASC, id ASC`,
    [configMonth]
  );

  const sheets = Object.fromEntries(SHEET_TYPES.map((sheetType) => [sheetType, {
    sheet_type: sheetType,
    label: SHEET_DEFINITIONS[sheetType].label,
    config_month: configMonth,
    report_year: parseInt(configMonth.slice(0, 4), 10),
    ytd_month_number: parseInt(configMonth.slice(5, 7), 10),
    groups: [],
  }]));

  periodRows.forEach((row) => {
    if (!sheets[row.sheet_type]) {
      return;
    }
    sheets[row.sheet_type].id = row.id;
    sheets[row.sheet_type].report_year = Number(row.report_year || parseInt(configMonth.slice(0, 4), 10));
    sheets[row.sheet_type].ytd_month_number = Number(row.ytd_month_number || parseInt(configMonth.slice(5, 7), 10));
  });

  const groupsById = new Map();
  groupRows.forEach((row) => {
    const group = mapGroupRow(row);
    groupsById.set(group.id, group);
    sheets[row.sheet_type]?.groups.push(group);
  });

  memberRows.forEach((row) => {
    const group = groupsById.get(Number(row.group_id));
    if (!group) {
      return;
    }
    group.members.push(mapMemberRow(row));
  });

  await mergeWorkbookSeedDefaults(configMonth, sheets);
  await applyInheritedAccessAssignments(configMonth, sheets);

  return {
    config_month: configMonth,
    sheets: Object.fromEntries(
      Object.entries(sheets).map(([sheetType, sheet]) => [sheetType, normalizeSheetOutput(sheet)])
    ),
  };
}

async function replaceEfficiencyConfig(configMonth, normalizedPayload, userId) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute(
      'DELETE FROM performance_efficiency_members WHERE config_month = ?',
      [configMonth]
    );
    await connection.execute(
      'DELETE FROM performance_efficiency_groups WHERE config_month = ?',
      [configMonth]
    );
    await connection.execute(
      'DELETE FROM performance_efficiency_period_settings WHERE config_month = ?',
      [configMonth]
    );

    for (const sheetType of SHEET_TYPES) {
      const sheet = normalizedPayload.sheets[sheetType];
      if (!sheet) {
        continue;
      }

      await connection.execute(
        `INSERT INTO performance_efficiency_period_settings (
          sheet_type,
          config_month,
          report_year,
          ytd_month_number,
          created_by,
          updated_by
        ) VALUES (?,?,?,?,?,?)`,
        normalizeSqlParams([
          sheetType,
          configMonth,
          sheet.report_year,
          sheet.ytd_month_number,
          userId,
          userId,
        ])
      );

      for (const group of sheet.groups) {
        const [groupResult] = await connection.execute(
          `INSERT INTO performance_efficiency_groups (
            sheet_type,
            config_month,
            group_name,
            manager_name,
            manager_user_id,
            manager_user_email,
            total_salary_amount,
            total_salary_divisor,
            total_salary_multiplier,
            total_salary_months_mode,
            total_salary_months_custom,
            sort_order,
            created_by,
            updated_by
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          normalizeSqlParams([
            sheetType,
            configMonth,
            group.group_name,
            group.manager_name,
            group.manager_user_id,
            group.manager_user_email,
            group.total_salary_amount,
            group.total_salary_divisor,
            group.total_salary_multiplier,
            group.total_salary_months_mode,
            group.total_salary_months_custom,
            group.sort_order,
            userId,
            userId,
          ])
        );

        for (const member of group.members) {
          await connection.execute(
            `INSERT INTO performance_efficiency_members (
              group_id,
              sheet_type,
              config_month,
              employee_id,
              seller_name,
              seller_user_id,
              seller_user_name,
              seller_user_email,
              market_segment,
              months_in_role_label,
              months_in_role_value,
              yearly_printing_target,
              yearly_it_other_target,
              yearly_rental_target,
              yearly_total_target,
              yearly_gp_target_rate,
              plan_months_mode,
              plan_months_custom,
              salary_amount,
              salary_divisor,
              salary_multiplier,
              salary_months_mode,
              salary_months_custom,
              is_other_row,
              sort_order,
              created_by,
              updated_by
            ) VALUES (${EFFICIENCY_MEMBER_INSERT_PLACEHOLDERS})`,
            normalizeSqlParams([
              groupResult.insertId,
              sheetType,
              configMonth,
              member.employee_id,
              member.seller_name,
              member.seller_user_id,
              member.seller_user_name,
              member.seller_user_email,
              member.market_segment,
              member.months_in_role_label,
              member.months_in_role_value,
              member.yearly_printing_target,
              member.yearly_it_other_target,
              member.yearly_rental_target,
              member.yearly_total_target,
              member.yearly_gp_target_rate,
              member.plan_months_mode,
              member.plan_months_custom,
              member.salary_amount,
              member.salary_divisor,
              member.salary_multiplier,
              member.salary_months_mode,
              member.salary_months_custom,
              member.is_other_row ? 1 : 0,
              member.sort_order,
              userId,
              userId,
            ])
          );
        }
      }
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function normalizeConfigPayload(payload, configMonth) {
  const sourceSheets = payload?.sheets && typeof payload.sheets === 'object' ? payload.sheets : {};

  return {
    sheets: Object.fromEntries(SHEET_TYPES.map((sheetType) => {
      const sourceSheet = sourceSheets[sheetType] || {};
      const fallbackYear = parseInt(configMonth.slice(0, 4), 10);
      const fallbackMonth = parseInt(configMonth.slice(5, 7), 10);

      return [sheetType, {
        sheet_type: sheetType,
        label: SHEET_DEFINITIONS[sheetType].label,
        config_month: configMonth,
        report_year: clampInt(sourceSheet.report_year, fallbackYear, 2000, 2100),
        ytd_month_number: clampInt(sourceSheet.ytd_month_number, fallbackMonth, 1, 12),
        groups: normalizeGroups(sourceSheet.groups || []),
      }];
    })),
  };
}

function normalizeGroups(groups) {
  return Array.isArray(groups)
    ? groups.map((group, index) => normalizeGroup(group, index)).filter(Boolean)
    : [];
}

function normalizeGroup(group, index) {
  const groupName = String(group?.group_name || group?.manager_name || '').trim();
  if (!groupName) {
    return null;
  }

  const normalizedManagerName = String(group?.manager_name || groupName).trim();
  const normalizedMembers = normalizeMembers(group?.members || []);
  if (shouldDropGroup({
    group_name: groupName,
    manager_name: normalizedManagerName,
    members: normalizedMembers,
  })) {
    return null;
  }

  return {
    group_name: groupName,
    manager_name: normalizedManagerName,
    manager_user_id: toNullableInt(group?.manager_user_id),
    manager_user_email: toNullableString(group?.manager_user_email),
    total_salary_amount: toNullableNumber(group?.total_salary_amount),
    total_salary_divisor: nonZero(group?.total_salary_divisor, 1),
    total_salary_multiplier: nonZero(group?.total_salary_multiplier, 1),
    total_salary_months_mode: normalizeMonthsMode(group?.total_salary_months_mode),
    total_salary_months_custom: toNullableInt(group?.total_salary_months_custom),
    sort_order: clampInt(group?.sort_order, index, 0, 100000),
    members: normalizedMembers,
  };
}

function normalizeMembers(members) {
  const normalizedMembers = Array.isArray(members)
    ? members.map((member, index) => normalizeMember(member, index)).filter(Boolean)
    : [];

  return sortMembersWithOtherLast(deduplicateMembers(normalizedMembers));
}

function normalizeMember(member, index) {
  const sellerName = String(member?.seller_name || '').trim();
  const isOtherRow = Boolean(member?.is_other_row) || sellerName.toLowerCase() === 'other';
  if (!sellerName && !isOtherRow) {
    return null;
  }

  return {
    seller_name: sellerName || 'Other',
    employee_id: String(member?.employee_id || '').trim(),
    seller_user_id: toNullableInt(member?.seller_user_id),
    seller_user_name: toNullableString(member?.seller_user_name),
    seller_user_email: toNullableString(member?.seller_user_email),
    market_segment: String(member?.market_segment || '').trim(),
    months_in_role_label: String(member?.months_in_role_label || '').trim(),
    months_in_role_value: toNullableInt(member?.months_in_role_value),
    yearly_printing_target: toNullableNumber(member?.yearly_printing_target),
    yearly_it_other_target: toNullableNumber(member?.yearly_it_other_target),
    yearly_rental_target: toNullableNumber(member?.yearly_rental_target),
    yearly_total_target: toNullableNumber(member?.yearly_total_target),
    yearly_gp_target_rate: toNullableNumber(member?.yearly_gp_target_rate),
    plan_months_mode: normalizeMonthsMode(member?.plan_months_mode),
    plan_months_custom: toNullableInt(member?.plan_months_custom),
    salary_amount: toNullableNumber(member?.salary_amount),
    salary_divisor: nonZero(member?.salary_divisor, 1),
    salary_multiplier: nonZero(member?.salary_multiplier, 1),
    salary_months_mode: normalizeMonthsMode(member?.salary_months_mode),
    salary_months_custom: toNullableInt(member?.salary_months_custom),
    is_other_row: isOtherRow,
    sort_order: clampInt(member?.sort_order, index, 0, 100000),
  };
}

function resolveYearlyTotalTarget(sheetType, memberConfig) {
  if (sheetType === 'sales_productivity') {
    if (memberConfig.yearly_total_target != null) {
      return scaleWorkbookMoneyNumber(memberConfig.yearly_total_target);
    }

    return scaleWorkbookMoneyNumber(memberConfig.yearly_printing_target)
      + scaleWorkbookMoneyNumber(memberConfig.yearly_it_other_target)
      + scaleWorkbookMoneyNumber(memberConfig.yearly_rental_target);
  }

  return scaleWorkbookMoneyNumber(memberConfig.yearly_total_target);
}

function resolveYearlyGpRate(sheetType, memberConfig) {
  const explicit = toNullableNumber(memberConfig.yearly_gp_target_rate);
  if (explicit != null) {
    return explicit;
  }

  return SHEET_DEFINITIONS[sheetType].defaultGpRate || 0;
}

function resolvePlanMonths(sheetConfig, memberConfig) {
  return resolveMonthsValue(
    memberConfig.plan_months_mode,
    memberConfig.plan_months_custom,
    memberConfig.months_in_role_value,
    sheetConfig.ytd_month_number
  );
}

function resolveSalaryMonths(sheetConfig, memberConfig) {
  return resolveMonthsValue(
    memberConfig.salary_months_mode,
    memberConfig.salary_months_custom,
    memberConfig.months_in_role_value,
    sheetConfig.ytd_month_number
  );
}

function resolveMonthsValue(mode, customValue, monthsInRoleValue, periodValue) {
  const normalizedMode = normalizeMonthsMode(mode);
  if (normalizedMode === 'custom') {
    return Math.max(1, toNumber(customValue));
  }
  if (normalizedMode === 'months_in_role') {
    return Math.max(1, toNumber(monthsInRoleValue || periodValue));
  }
  return Math.max(1, toNumber(periodValue));
}

function resolveSalaryFullyLoaded(config, monthsCount) {
  const amount = scaleWorkbookMoneyNumber(config.salary_amount);
  if (!amount) {
    return 0;
  }

  return (amount / nonZero(config.salary_divisor, 1))
    * nonZero(config.salary_multiplier, 1)
    * Math.max(1, toNumber(monthsCount));
}

function resolveSalesYearlyTotalTarget(sheet, rowNumber) {
  const explicitTotal = getCellNumber(sheet, `I${rowNumber}`);
  if (explicitTotal != null) {
    return explicitTotal;
  }

  return toNumber(getCellNumber(sheet, `F${rowNumber}`))
    + toNumber(getCellNumber(sheet, `G${rowNumber}`))
    + toNumber(getCellNumber(sheet, `H${rowNumber}`));
}

function resolveSalesGpRate(sheet, rowNumber) {
  const yearlyTotal = resolveSalesYearlyTotalTarget(sheet, rowNumber);
  const gpCell = getCellNumber(sheet, `J${rowNumber}`);
  if (yearlyTotal > 0 && gpCell != null) {
    return roundNumber(gpCell / yearlyTotal, 6);
  }

  const formula = getCellFormula(sheet, `J${rowNumber}`);
  const match = formula.match(/\*([0-9.]+)$/);
  return match ? toNumber(match[1]) : 0.2;
}

function resolvePresalesGpRate(sheet, rowNumber) {
  const totalTarget = getCellNumber(sheet, `F${rowNumber}`);
  const gpTarget = getCellNumber(sheet, `G${rowNumber}`);
  if (totalTarget && gpTarget != null) {
    return roundNumber(gpTarget / totalTarget, 6);
  }

  const formula = getCellFormula(sheet, `G${rowNumber}`);
  const match = formula.match(/\*([0-9.]+)$/);
  return match ? toNumber(match[1]) : 0;
}

function parseSalaryFormula(formula, monthsLabel, isGroupTotal) {
  const clean = String(formula || '').replace(/^\+/, '').trim();
  if (!clean) {
    return {
      total_salary_amount: isGroupTotal ? null : undefined,
      total_salary_divisor: isGroupTotal ? 1 : undefined,
      total_salary_multiplier: isGroupTotal ? 1 : undefined,
      total_salary_months_mode: isGroupTotal ? 'period' : undefined,
      total_salary_months_custom: isGroupTotal ? null : undefined,
      salary_amount: isGroupTotal ? undefined : null,
      salary_divisor: isGroupTotal ? undefined : 1,
      salary_multiplier: isGroupTotal ? undefined : 1,
      salary_months_mode: isGroupTotal ? undefined : 'period',
      salary_months_custom: isGroupTotal ? undefined : null,
    };
  }

  const formulaTarget = {
    amount: null,
    divisor: 1,
    multiplier: 1,
    monthsMode: 'period',
    monthsCustom: null,
  };

  let match = clean.match(/^\(([0-9.]+)\)\*([0-9.]+)\*D\$2$/i);
  if (match) {
    formulaTarget.amount = toNumber(match[1]);
    formulaTarget.multiplier = toNumber(match[2]);
  } else {
    match = clean.match(/^\(([0-9.]+)\/([0-9.]+)\)\*([0-9.]+)\*(\d+)$/i);
    if (match) {
      formulaTarget.amount = toNumber(match[1]);
      formulaTarget.divisor = nonZero(match[2], 1);
      formulaTarget.multiplier = toNumber(match[3]);
      const monthsValue = parseInt(match[4], 10) || null;
      const monthsInRole = parseMonthsInRole(monthsLabel);
      formulaTarget.monthsMode = monthsInRole && monthsValue === monthsInRole ? 'months_in_role' : 'custom';
      formulaTarget.monthsCustom = formulaTarget.monthsMode === 'custom' ? monthsValue : null;
    }
  }

  if (isGroupTotal) {
    return {
      total_salary_amount: formulaTarget.amount,
      total_salary_divisor: formulaTarget.divisor,
      total_salary_multiplier: formulaTarget.multiplier,
      total_salary_months_mode: formulaTarget.monthsMode,
      total_salary_months_custom: formulaTarget.monthsCustom,
    };
  }

  return {
    salary_amount: formulaTarget.amount,
    salary_divisor: formulaTarget.divisor,
    salary_multiplier: formulaTarget.multiplier,
    salary_months_mode: formulaTarget.monthsMode,
    salary_months_custom: formulaTarget.monthsCustom,
  };
}

function resolvePlanMonthsMode(formula, monthsLabel) {
  const clean = String(formula || '').replace(/^\+/, '').trim();
  const match = clean.match(/\/12\*(\d+)\)?$/i);
  if (!match) {
    return { mode: 'period', custom: null };
  }

  const customValue = parseInt(match[1], 10) || null;
  const monthsInRole = parseMonthsInRole(monthsLabel);
  if (monthsInRole && customValue === monthsInRole) {
    return { mode: 'months_in_role', custom: null };
  }

  return { mode: 'custom', custom: customValue };
}

function parseMonthsInRole(label) {
  const match = String(label || '').match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function getCellString(sheet, address) {
  const value = sheet?.getCell(address)?.value;
  if (value == null) {
    return '';
  }
  if (typeof value === 'object') {
    if (value.richText) {
      return value.richText.map((part) => part.text).join('').trim();
    }
    if (value.text) {
      return String(value.text).trim();
    }
    if (value.result != null) {
      return String(value.result).trim();
    }
  }
  return String(value).trim();
}

function getCellFormula(sheet, address) {
  const value = sheet?.getCell(address)?.value;
  if (value && typeof value === 'object' && value.formula) {
    return String(value.formula).trim();
  }

  return '';
}

function getCellNumber(sheet, address) {
  const value = sheet?.getCell(address)?.value;
  if (value == null || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'object') {
    if (typeof value.result === 'number') {
      return value.result;
    }
    if (typeof value.text === 'string' && value.text.trim() !== '') {
      return toNullableNumber(value.text.trim());
    }
  }

  return toNullableNumber(value);
}

function mapGroupRow(row) {
  return {
    id: Number(row.id),
    group_name: String(row.group_name || ''),
    manager_name: String(row.manager_name || ''),
    manager_user_id: row.manager_user_id == null ? null : Number(row.manager_user_id),
    manager_user_email: toNullableString(row.manager_user_email),
    total_salary_amount: toNullableNumber(row.total_salary_amount),
    total_salary_divisor: toNumber(row.total_salary_divisor || 1),
    total_salary_multiplier: toNumber(row.total_salary_multiplier || 1),
    total_salary_months_mode: normalizeMonthsMode(row.total_salary_months_mode),
    total_salary_months_custom: row.total_salary_months_custom == null ? null : Number(row.total_salary_months_custom),
    sort_order: Number(row.sort_order || 0),
    members: [],
  };
}

function mapMemberRow(row) {
  return {
    id: Number(row.id),
    group_id: Number(row.group_id),
    employee_id: String(row.employee_id || ''),
    seller_name: String(row.seller_name || ''),
    seller_user_id: row.seller_user_id == null ? null : Number(row.seller_user_id),
    seller_user_name: toNullableString(row.seller_user_name),
    seller_user_email: toNullableString(row.seller_user_email),
    market_segment: String(row.market_segment || ''),
    months_in_role_label: String(row.months_in_role_label || ''),
    months_in_role_value: row.months_in_role_value == null ? null : Number(row.months_in_role_value),
    yearly_printing_target: toNullableNumber(row.yearly_printing_target),
    yearly_it_other_target: toNullableNumber(row.yearly_it_other_target),
    yearly_rental_target: toNullableNumber(row.yearly_rental_target),
    yearly_total_target: toNullableNumber(row.yearly_total_target),
    yearly_gp_target_rate: toNullableNumber(row.yearly_gp_target_rate),
    plan_months_mode: normalizeMonthsMode(row.plan_months_mode),
    plan_months_custom: row.plan_months_custom == null ? null : Number(row.plan_months_custom),
    salary_amount: toNullableNumber(row.salary_amount),
    salary_divisor: toNumber(row.salary_divisor || 1),
    salary_multiplier: toNumber(row.salary_multiplier || 1),
    salary_months_mode: normalizeMonthsMode(row.salary_months_mode),
    salary_months_custom: row.salary_months_custom == null ? null : Number(row.salary_months_custom),
    is_other_row: Boolean(row.is_other_row),
    sort_order: Number(row.sort_order || 0),
  };
}

function currentMonthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function normalizeConfigMonth(value) {
  const normalized = normalizeDateValue(value);
  if (!normalized) {
    return null;
  }

  return `${normalized.slice(0, 7)}-01`;
}

function normalizeDateValue(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
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

function normalizeSqlParams(values) {
  return values.map((value) => (value === undefined ? null : value));
}

function normalizeLooseLookupKey(value) {
  return normalizeLookupKey(value)
    .split(' ')
    .map((part) => part.replace(/[aeiou]/g, ''))
    .filter(Boolean)
    .join(' ');
}

function normalizeEmployeeLookupKey(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizePerformanceReportType(value) {
  return String(value || '').trim().toLowerCase();
}

function isMirnaPostSalesGroup(group) {
  const groupName = normalizeLookupKey(group?.group_name);
  const managerName = normalizeLookupKey(group?.manager_name);

  return [groupName, managerName].some((value) => value.includes('mirna') && value.includes('castillo'));
}

function resolveSellerMetrics(sheetConfig, groupConfig, memberConfig, metricAssignments) {
  if (!metricAssignments) {
    return EMPTY_METRICS;
  }

  if (isOtherMember(memberConfig)) {
    const groupKey = buildGroupAccessLookupKey(sheetConfig.sheet_type, groupConfig);
    return metricAssignments.otherMetricsByGroup.get(groupKey) || EMPTY_METRICS;
  }

  const memberKey = buildMemberAccessLookupKey(sheetConfig.sheet_type, groupConfig, memberConfig);
  return metricAssignments.memberMetrics.get(memberKey) || EMPTY_METRICS;
}

async function mergeWorkbookSeedDefaults(configMonth, sheets) {
  const targetSheet = sheets.sales_productivity;
  if (!targetSheet || !fs.existsSync(WORKBOOK_PATH)) {
    return;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(WORKBOOK_PATH);
  const seedSheet = parseSalesProductivitySheet(workbook.getWorksheet(SHEET_DEFINITIONS.sales_productivity.workbookName), configMonth);

  const groupsByKey = new Map((targetSheet.groups || []).map((group) => [normalizeLookupKey(group.group_name || group.manager_name), group]));

  seedSheet.groups.forEach((seedGroup) => {
    const groupKey = normalizeLookupKey(seedGroup.group_name || seedGroup.manager_name);
    const existingGroup = groupsByKey.get(groupKey);

    if (!existingGroup) {
      targetSheet.groups.push(seedGroup);
      groupsByKey.set(groupKey, seedGroup);
      return;
    }

    const memberKeys = new Set((existingGroup.members || []).map((member) => buildMemberLookupKey(member)));
    seedGroup.members.forEach((seedMember) => {
      const memberKey = buildMemberLookupKey(seedMember);
      if (memberKeys.has(memberKey)) {
        return;
      }

      existingGroup.members.push(seedMember);
      memberKeys.add(memberKey);
    });

    existingGroup.members = sortMembersWithOtherLast(deduplicateMembers(existingGroup.members || []));

    if (existingGroup.total_salary_amount == null && seedGroup.total_salary_amount != null) {
      existingGroup.total_salary_amount = seedGroup.total_salary_amount;
      existingGroup.total_salary_divisor = seedGroup.total_salary_divisor;
      existingGroup.total_salary_multiplier = seedGroup.total_salary_multiplier;
      existingGroup.total_salary_months_mode = seedGroup.total_salary_months_mode;
      existingGroup.total_salary_months_custom = seedGroup.total_salary_months_custom;
    }
  });
}

async function applyInheritedAccessAssignments(configMonth, sheets) {
  const sourceMonth = await findInheritedAccessSourceMonth(configMonth);
  if (!sourceMonth) {
    return;
  }

  const [groupRows] = await pool.query(
    `SELECT sheet_type, group_name, manager_name, manager_user_id, manager_user_email
       FROM performance_efficiency_groups
      WHERE config_month = ?`,
    [sourceMonth]
  );
  const [memberRows] = await pool.query(
    `SELECT
        m.sheet_type,
        g.group_name,
        g.manager_name,
        m.employee_id,
        m.seller_name,
        m.seller_user_id,
        m.seller_user_name,
        m.seller_user_email
       FROM performance_efficiency_members m
       INNER JOIN performance_efficiency_groups g ON g.id = m.group_id
      WHERE m.config_month = ?`,
    [sourceMonth]
  );

  const groupsByKey = new Map(
    groupRows.map((row) => [buildGroupAccessLookupKey(row.sheet_type, row), row])
  );
  const membersByKey = new Map(
    memberRows.map((row) => [buildMemberAccessLookupKey(row.sheet_type, row, row), row])
  );

  Object.entries(sheets || {}).forEach(([sheetType, sheet]) => {
    (sheet?.groups || []).forEach((group) => {
      const inheritedGroup = groupsByKey.get(buildGroupAccessLookupKey(sheetType, group));
      if (inheritedGroup) {
        if (group.manager_user_id == null && inheritedGroup.manager_user_id != null) {
          group.manager_user_id = Number(inheritedGroup.manager_user_id);
        }
        if (!group.manager_user_email && inheritedGroup.manager_user_email) {
          group.manager_user_email = String(inheritedGroup.manager_user_email);
        }
      }

      (group?.members || []).forEach((member) => {
        const inheritedMember = membersByKey.get(buildMemberAccessLookupKey(sheetType, group, member));
        if (!inheritedMember) {
          return;
        }

        if (member.seller_user_id == null && inheritedMember.seller_user_id != null) {
          member.seller_user_id = Number(inheritedMember.seller_user_id);
        }
        if (!member.seller_user_name && inheritedMember.seller_user_name) {
          member.seller_user_name = String(inheritedMember.seller_user_name);
        }
        if (!member.seller_user_email && inheritedMember.seller_user_email) {
          member.seller_user_email = String(inheritedMember.seller_user_email);
        }
      });
    });
  });
}

async function findInheritedAccessSourceMonth(configMonth) {
  const [[row]] = await pool.query(
    `SELECT MAX(config_month) AS config_month
       FROM (
         SELECT config_month
           FROM performance_efficiency_groups
          WHERE config_month < ?
            AND (manager_user_id IS NOT NULL OR manager_user_email IS NOT NULL)
         UNION ALL
         SELECT config_month
           FROM performance_efficiency_members
          WHERE config_month < ?
            AND (
              seller_user_id IS NOT NULL
              OR seller_user_name IS NOT NULL
              OR seller_user_email IS NOT NULL
            )
       ) access_assignments`,
    [configMonth, configMonth]
  );

  return normalizeConfigMonth(row?.config_month);
}

function buildGroupAccessLookupKey(sheetType, group) {
  return `${sheetType}:${normalizeLookupKey(group?.group_name || group?.manager_name)}`;
}

function buildMemberAccessLookupKey(sheetType, group, member) {
  return `${buildGroupAccessLookupKey(sheetType, group)}:${buildMemberLookupKey(member)}`;
}

function buildMemberLookupKey(member) {
  const sellerKey = normalizeLookupKey(member?.seller_name);
  if (sellerKey) {
    return `seller:${sellerKey}`;
  }

  const employeeId = String(member?.employee_id || '').trim().toLowerCase();
  if (employeeId) {
    return `employee:${employeeId}`;
  }

  return 'member:unknown';
}

function normalizeMonthsMode(value) {
  return ['period', 'months_in_role', 'custom'].includes(value) ? value : 'period';
}

function buildExportRow(group, member) {
  return {
    group_name: group?.group_name || '',
    manager_name: group?.manager_name || '',
    seller_name: member?.seller_name || '',
    market_segment: member?.market_segment || '',
    months_in_role_label: member?.months_in_role_label || '',
    yearly_total_target: member?.yearly_total_target || 0,
    yearly_total_target_gp: member?.yearly_total_target_gp || 0,
    ytd_target_revenue: member?.ytd_target_revenue || 0,
    ytd_target_profit: member?.ytd_target_profit || 0,
    ytd_revenue: member?.ytd_revenue || 0,
    ytd_profit: member?.ytd_profit || 0,
    ytd_plan_percent_revenue: member?.ytd_plan_percent_revenue || 0,
    ytd_plan_percent_profit: member?.ytd_plan_percent_profit || 0,
    salary_fully_loaded: member?.salary_fully_loaded || 0,
    efficiency_rate: member?.efficiency_rate || 0,
  };
}

function buildExportTotalsRow(group) {
  return {
    group_name: `TOTAL ${group?.group_name || ''}`.trim(),
    manager_name: group?.manager_name || '',
    seller_name: '',
    market_segment: '',
    months_in_role_label: '',
    yearly_total_target: group?.totals?.yearly_total_target || 0,
    yearly_total_target_gp: group?.totals?.yearly_total_target_gp || 0,
    ytd_target_revenue: group?.totals?.ytd_target_revenue || 0,
    ytd_target_profit: group?.totals?.ytd_target_profit || 0,
    ytd_revenue: group?.totals?.ytd_revenue || 0,
    ytd_profit: group?.totals?.ytd_profit || 0,
    ytd_plan_percent_revenue: group?.totals?.ytd_plan_percent_revenue || 0,
    ytd_plan_percent_profit: group?.totals?.ytd_plan_percent_profit || 0,
    salary_fully_loaded: group?.totals?.salary_fully_loaded || 0,
    efficiency_rate: group?.totals?.efficiency_rate || 0,
  };
}

function buildExportGrandTotalsRow(sheet) {
  return {
    group_name: 'TOTAL GENERAL',
    manager_name: '',
    seller_name: '',
    market_segment: '',
    months_in_role_label: '',
    yearly_total_target: sheet?.grand_totals?.yearly_total_target || 0,
    yearly_total_target_gp: sheet?.grand_totals?.yearly_total_target_gp || 0,
    ytd_target_revenue: sheet?.grand_totals?.ytd_target_revenue || 0,
    ytd_target_profit: sheet?.grand_totals?.ytd_target_profit || 0,
    ytd_revenue: sheet?.grand_totals?.ytd_revenue || 0,
    ytd_profit: sheet?.grand_totals?.ytd_profit || 0,
    ytd_plan_percent_revenue: sheet?.grand_totals?.ytd_plan_percent_revenue || 0,
    ytd_plan_percent_profit: sheet?.grand_totals?.ytd_plan_percent_profit || 0,
    salary_fully_loaded: sheet?.grand_totals?.salary_fully_loaded || 0,
    efficiency_rate: sheet?.grand_totals?.efficiency_rate || 0,
  };
}

function scaleWorkbookMoney(value) {
  const numeric = toNullableNumber(value);
  if (numeric == null) {
    return null;
  }

  return roundNumber(numeric * WORKBOOK_MONEY_MULTIPLIER, 2);
}

function scaleWorkbookMoneyNumber(value) {
  return toNumber(value) * WORKBOOK_MONEY_MULTIPLIER;
}

function normalizeSheetOutput(sheet) {
  const groups = Array.isArray(sheet?.groups) ? sheet.groups : [];

  return {
    ...sheet,
    groups: groups
      .filter((group) => !shouldDropGroup(group))
      .sort((left, right) => Number(left?.sort_order || 0) - Number(right?.sort_order || 0))
      .map((group, index) => ({
        ...group,
        sort_order: index,
        members: sortMembersWithOtherLast(deduplicateMembers(group.members || [])),
      })),
  };
}

function deduplicateMembers(members) {
  const deduplicated = new Map();

  members.forEach((member) => {
    const key = buildMemberLookupKey(member);
    const current = deduplicated.get(key);
    if (!current) {
      deduplicated.set(key, member);
      return;
    }

    deduplicated.set(key, mergeMemberRecords(current, member));
  });

  return Array.from(deduplicated.values());
}

function mergeMemberRecords(primary, secondary) {
  const merged = { ...primary };

  MEMBER_MERGE_FIELDS.forEach((field) => {
    if (!hasMeaningfulValue(merged[field]) && hasMeaningfulValue(secondary?.[field])) {
      merged[field] = secondary[field];
    }
  });

  merged.is_other_row = Boolean(primary?.is_other_row) || Boolean(secondary?.is_other_row);
  merged.sort_order = Math.min(
    Number.isFinite(Number(primary?.sort_order)) ? Number(primary.sort_order) : Number.MAX_SAFE_INTEGER,
    Number.isFinite(Number(secondary?.sort_order)) ? Number(secondary.sort_order) : Number.MAX_SAFE_INTEGER
  );

  return merged;
}

function hasMeaningfulValue(value) {
  return value != null && value !== '';
}

function shouldDropGroup(group) {
  const groupName = String(group?.group_name || group?.manager_name || '').trim();
  const managerName = String(group?.manager_name || group?.group_name || '').trim();
  const totalLikeGroup = isTotalLikeLabel(groupName) && isTotalLikeLabel(managerName);

  if (!totalLikeGroup) {
    return false;
  }

  return !(Array.isArray(group?.members) && group.members.some((member) => hasMeaningfulMember(member)));
}

function hasMeaningfulMember(member) {
  return !isOtherMember(member) && String(member?.seller_name || '').trim() !== '';
}

function sortMembersWithOtherLast(members) {
  return [...members]
    .sort((left, right) => {
      const leftIsOther = isOtherMember(left);
      const rightIsOther = isOtherMember(right);

      if (leftIsOther !== rightIsOther) {
        return leftIsOther ? 1 : -1;
      }

      return Number(left?.sort_order || 0) - Number(right?.sort_order || 0);
    })
    .map((member, index) => ({
      ...member,
      is_other_row: isOtherMember(member),
      sort_order: index,
    }));
}

function isOtherMember(member) {
  return Boolean(member?.is_other_row) || String(member?.seller_name || '').trim().toLowerCase() === 'other';
}

function isTotalLikeLabel(value) {
  const normalized = normalizeTextValue(value);
  return normalized === 'total' || normalized.startsWith('total ');
}

function normalizeTextValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function safeDivide(numerator, denominator) {
  const safeNumerator = toNumber(numerator);
  const safeDenominator = toNumber(denominator);
  if (!safeDenominator) {
    return 0;
  }
  return roundNumber(safeNumerator / safeDenominator, 6);
}

function sumRows(rows, key) {
  return roundNumber(rows.reduce((total, row) => total + toNumber(row[key]), 0));
}

function sumNested(rows, pathExpression) {
  const path = pathExpression.split('.');
  return roundNumber(rows.reduce((total, row) => total + toNumber(path.reduce((carry, segment) => carry?.[segment], row)), 0));
}

function mapNumericObject(obj) {
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, typeof value === 'number' ? roundNumber(value) : value]));
}

function nonZero(value, fallback) {
  const numeric = toNumber(value);
  return numeric === 0 ? fallback : numeric;
}

function clampInt(value, fallback, min, max) {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function toNullableInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableString(value) {
  const normalized = String(value || '').trim();
  return normalized ? normalized : null;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundNumber(value, precision = 4) {
  const numeric = toNumber(value);
  return Number(numeric.toFixed(precision));
}

const EMPTY_METRICS = {
  total_revenue: 0,
  total_gross_profit: 0,
};

const MEMBER_MERGE_FIELDS = [
  'id',
  'group_id',
  'employee_id',
  'seller_name',
  'seller_user_id',
  'seller_user_name',
  'seller_user_email',
  'market_segment',
  'months_in_role_label',
  'months_in_role_value',
  'yearly_printing_target',
  'yearly_it_other_target',
  'yearly_rental_target',
  'yearly_total_target',
  'yearly_gp_target_rate',
  'plan_months_mode',
  'plan_months_custom',
  'salary_amount',
  'salary_divisor',
  'salary_multiplier',
  'salary_months_mode',
  'salary_months_custom',
];

module.exports = {
  exportEfficiencyProductivityWorkbook,
  getEfficiencyAccessSummary,
  getEfficiencyConfig,
  getEfficiencyOverview,
  saveEfficiencyConfig,
};