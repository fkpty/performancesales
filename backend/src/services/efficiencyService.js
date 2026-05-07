const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const pool = require('../db/connection');

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
const EFFICIENCY_MEMBER_INSERT_PLACEHOLDERS = new Array(24).fill('?').join(',');
const EFFICIENCY_MANUAL_METRIC_INSERT_PLACEHOLDERS = new Array(9).fill('?').join(',');
const seedPromises = new Map();

async function getEfficiencyOverview(params = {}) {
  const config = await getEfficiencyConfig(params);
  const sheets = {};

  for (const sheetType of SHEET_TYPES) {
    sheets[sheetType] = await buildSheetOverview(config.sheets[sheetType]);
  }

  return {
    config_month: config.config_month,
    sheets,
  };
}

async function getEfficiencyConfig(params = {}) {
  const templateConfigMonth = await resolveTemplateConfigMonth(params);
  const context = resolveEfficiencyContext(params, templateConfigMonth);
  await ensureEfficiencySeed(templateConfigMonth);
  return readEfficiencyConfig(templateConfigMonth, context);
}

async function saveEfficiencyConfig(params = {}, payload = {}, user = null) {
  const templateConfigMonth = await resolveTemplateConfigMonth({
    templateConfigMonth: payload.template_config_month || payload.templateConfigMonth || params.templateConfigMonth || params.template_config_month,
  });
  const context = resolveEfficiencyContext({
    configMonth: payload.config_month || payload.configMonth || params.configMonth || params.config_month,
    year: params.year,
    month: params.month,
  }, templateConfigMonth);
  const normalized = normalizeConfigPayload(payload, templateConfigMonth);
  await replaceEfficiencyConfig(templateConfigMonth, normalized, user?.id || null);
  return readEfficiencyConfig(templateConfigMonth, context);
}

async function buildSheetOverview(sheetConfig) {
  const metricBuckets = await fetchYtdMetricBuckets(sheetConfig.report_year, sheetConfig.ytd_month_number);
  const { metricsByMember, unmatchedMetrics } = assignMetricBucketsToMembers(sheetConfig, metricBuckets);
  applyManualMetricsToMembers(sheetConfig, metricsByMember);
  const groups = sheetConfig.groups.map((group) => buildOverviewGroup(sheetConfig, group, metricsByMember));

  if (hasMetricValues(unmatchedMetrics)) {
    const unmatchedGroup = createUnmatchedAdjustmentGroup(sheetConfig, groups.length);
    const unmatchedMember = unmatchedGroup.members[0];
    metricsByMember.set(unmatchedMember, unmatchedMetrics);
    groups.push(buildOverviewGroup(sheetConfig, unmatchedGroup, metricsByMember));
  }

  const grandTotals = buildGrandTotals(sheetConfig.sheet_type, groups);

  return {
    ...sheetConfig,
    groups,
    grand_totals: grandTotals,
  };
}

function buildOverviewGroup(sheetConfig, groupConfig, metricsByMember) {
  const members = groupConfig.members.map((member) => buildOverviewMember(sheetConfig, member, metricsByMember));

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

function buildOverviewMember(sheetConfig, memberConfig, metricsByMember) {
  const sellerMetrics = resolveSellerMetrics(memberConfig, metricsByMember);
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

async function fetchYtdMetricBuckets(reportYear, ytdMonthNumber) {
  if (!Number.isFinite(reportYear) || reportYear <= 0 || !Number.isFinite(ytdMonthNumber) || ytdMonthNumber <= 0) {
    return [];
  }

  const [rows] = await pool.query(
    `SELECT
      COALESCE(TRIM(r.sales_person_name), '') AS sales_person_name,
      COALESCE(SUM(r.revenue), 0) AS total_revenue,
      COALESCE(SUM(r.gross_profit), 0) AS total_gross_profit
     FROM performance_sales_rows r
     INNER JOIN performance_sales_upload_batches b ON b.id = r.batch_id
     WHERE b.is_active = 1
       AND YEAR(b.report_month) = ?
       AND MONTH(b.report_month) <= ?
     GROUP BY COALESCE(TRIM(r.sales_person_name), '')`,
    [reportYear, ytdMonthNumber]
  );

  return rows.map((row) => ({
    seller_name: String(row.sales_person_name || '').trim(),
    lookup_key: normalizeLookupKey(row.sales_person_name),
    total_revenue: toNumber(row.total_revenue),
    total_gross_profit: toNumber(row.total_gross_profit),
  }));
}

function assignMetricBucketsToMembers(sheetConfig, metricBuckets) {
  const metricsByMember = new Map();
  const directMemberEntries = [];
  const manualMemberEntries = [];
  const otherMemberEntries = [];
  const unmatchedMetrics = createEmptyMetrics();

  (sheetConfig.groups || []).forEach((group) => {
    const groupUsesManualMetrics = isManualMetricsGroup(group);
    const firstOtherMember = (group.members || []).find((member) => isOtherMember(member));

    (group.members || []).forEach((member) => {
      metricsByMember.set(member, createEmptyMetrics());

      if (isOtherMember(member)) {
        return;
      }

      const sellerKey = normalizeLookupKey(member?.seller_name);
      if (!sellerKey) {
        return;
      }

      if (groupUsesManualMetrics) {
        manualMemberEntries.push({
          member,
          sellerKey,
        });
        return;
      }

      directMemberEntries.push({
        member,
        sellerKey,
      });
    });

    if (firstOtherMember && !groupUsesManualMetrics) {
      otherMemberEntries.push({
        otherMember: firstOtherMember,
        managerKey: normalizeLookupKey(group.manager_name || group.group_name),
        managerTokens: splitLookupKeyTokens(group.manager_name || group.group_name),
        groupKey: normalizeLookupKey(group.group_name || group.manager_name),
        groupTokens: splitLookupKeyTokens(group.group_name || group.manager_name),
      });
    }
  });

  const directMemberByKey = new Map();
  directMemberEntries.forEach((entry) => {
    if (!directMemberByKey.has(entry.sellerKey)) {
      directMemberByKey.set(entry.sellerKey, entry.member);
    }
  });

  metricBuckets.forEach((bucket) => {
    if (shouldSuppressUploadedBucket(bucket, manualMemberEntries)) {
      return;
    }

    const targetMember = resolveMetricBucketMember(bucket, directMemberEntries, directMemberByKey, otherMemberEntries);
    if (targetMember) {
      accumulateMetrics(metricsByMember, targetMember, bucket);
      return;
    }

    accumulateStandaloneMetrics(unmatchedMetrics, bucket);
  });

  return {
    metricsByMember,
    unmatchedMetrics,
  };
}

function applyManualMetricsToMembers(sheetConfig, metricsByMember) {
  (sheetConfig.groups || []).forEach((group) => {
    if (!isManualMetricsGroup(group)) {
      return;
    }

    (group.members || []).forEach((member) => {
      metricsByMember.set(member, buildManualMetricsForMember(sheetConfig, member));
    });
  });
}

function buildManualMetricsForMember(sheetConfig, member) {
  const metrics = createEmptyMetrics();

  (member?.manual_metrics || []).forEach((entry) => {
    const normalizedMonth = normalizeManualMetricMonth(entry?.metric_month, sheetConfig.report_year);
    if (!normalizedMonth) {
      return;
    }

    const entryYear = parseInt(normalizedMonth.slice(0, 4), 10);
    const entryMonth = parseInt(normalizedMonth.slice(5, 7), 10);
    if (entryYear !== Number(sheetConfig.report_year) || entryMonth > Number(sheetConfig.ytd_month_number || 0)) {
      return;
    }

    metrics.total_revenue += toNumber(entry?.revenue);
    metrics.total_gross_profit += toNumber(entry?.gross_profit);
  });

  return metrics;
}

function shouldSuppressUploadedBucket(bucket, manualMemberEntries) {
  if (!bucket?.lookup_key || !manualMemberEntries.length) {
    return false;
  }

  if (manualMemberEntries.some((entry) => entry.sellerKey === bucket.lookup_key)) {
    return true;
  }

  return Boolean(findClosestMemberEntry(bucket.lookup_key, manualMemberEntries));
}

function resolveMetricBucketMember(bucket, directMemberEntries, directMemberByKey, otherMemberEntries) {
  if (bucket.lookup_key) {
    const exactMember = directMemberByKey.get(bucket.lookup_key);
    if (exactMember) {
      return exactMember;
    }

    const fuzzyMemberEntry = findClosestMemberEntry(bucket.lookup_key, directMemberEntries);
    if (fuzzyMemberEntry) {
      return fuzzyMemberEntry.member;
    }

    const otherMemberEntry = findMatchingOtherMemberEntry(bucket.lookup_key, otherMemberEntries);
    if (otherMemberEntry) {
      return otherMemberEntry.otherMember;
    }
  }

  return null;
}

function findClosestMemberEntry(lookupKey, directMemberEntries) {
  if (!lookupKey) {
    return null;
  }

  let bestEntry = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let secondBestDistance = Number.POSITIVE_INFINITY;

  directMemberEntries.forEach((entry) => {
    const distance = computeEditDistance(lookupKey, entry.sellerKey);
    if (distance < bestDistance) {
      secondBestDistance = bestDistance;
      bestDistance = distance;
      bestEntry = entry;
      return;
    }

    if (distance < secondBestDistance) {
      secondBestDistance = distance;
    }
  });

  if (bestEntry && bestDistance <= 1 && bestDistance < secondBestDistance) {
    return bestEntry;
  }

  return null;
}

function findMatchingOtherMemberEntry(lookupKey, otherMemberEntries) {
  if (!lookupKey) {
    return null;
  }

  const exactMatches = otherMemberEntries.filter((entry) => (
    entry.managerKey === lookupKey || entry.groupKey === lookupKey
  ));
  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  const tokens = splitLookupKeyTokens(lookupKey);
  if (!tokens.length) {
    return null;
  }

  const tokenMatches = otherMemberEntries.filter((entry) => (
    tokens.every((token) => entry.managerTokens.includes(token) || entry.groupTokens.includes(token))
  ));

  return tokenMatches.length === 1 ? tokenMatches[0] : null;
}

function accumulateMetrics(metricsByMember, memberConfig, bucket) {
  const current = metricsByMember.get(memberConfig) || createEmptyMetrics();
  current.total_revenue += toNumber(bucket.total_revenue);
  current.total_gross_profit += toNumber(bucket.total_gross_profit);
  metricsByMember.set(memberConfig, current);
}

function accumulateStandaloneMetrics(target, bucket) {
  target.total_revenue += toNumber(bucket.total_revenue);
  target.total_gross_profit += toNumber(bucket.total_gross_profit);
}

function createUnmatchedAdjustmentGroup(sheetConfig, sortOrder) {
  return {
    id: null,
    group_name: 'Ajustes no asignados',
    manager_name: 'Ajustes no asignados',
    manager_user_id: null,
    total_salary_amount: null,
    total_salary_divisor: 1,
    total_salary_multiplier: 1,
    total_salary_months_mode: 'period',
    total_salary_months_custom: null,
    sort_order: sortOrder,
    members: [
      {
        seller_name: 'No asignado / no mapeado',
        employee_id: '',
        market_segment: '',
        months_in_role_label: '',
        months_in_role_value: null,
        yearly_printing_target: 0,
        yearly_it_other_target: 0,
        yearly_rental_target: 0,
        yearly_total_target: 0,
        yearly_gp_target_rate: SHEET_DEFINITIONS[sheetConfig.sheet_type]?.defaultGpRate || 0,
        plan_months_mode: 'period',
        plan_months_custom: null,
        salary_amount: 0,
        salary_divisor: 1,
        salary_multiplier: 1,
        salary_months_mode: 'period',
        salary_months_custom: null,
        is_other_row: true,
        sort_order: 0,
      },
    ],
  };
}

function createEmptyMetrics() {
  return {
    total_revenue: 0,
    total_gross_profit: 0,
  };
}

function hasMetricValues(metrics) {
  return Boolean(metrics) && (
    Math.abs(toNumber(metrics.total_revenue)) > 0.0001
    || Math.abs(toNumber(metrics.total_gross_profit)) > 0.0001
  );
}

function splitLookupKeyTokens(value) {
  return normalizeLookupKey(value).split(' ').filter(Boolean);
}

function computeEditDistance(leftValue, rightValue) {
  const left = String(leftValue || '');
  const right = String(rightValue || '');

  if (left === right) {
    return 0;
  }
  if (!left.length) {
    return right.length;
  }
  if (!right.length) {
    return left.length;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array(right.length + 1).fill(0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost
      );
    }

    for (let rightIndex = 0; rightIndex <= right.length; rightIndex += 1) {
      previous[rightIndex] = current[rightIndex];
    }
  }

  return previous[right.length];
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

async function resolveTemplateConfigMonth(params = {}) {
  const explicit = normalizeConfigMonth(params.templateConfigMonth || params.template_config_month);
  if (explicit) {
    return explicit;
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

function resolveEfficiencyContext(params = {}, fallbackConfigMonth = null) {
  if (params && typeof params === 'object' && params.requested_config_month) {
    const requestedConfigMonth = normalizeConfigMonth(params.requested_config_month)
      || normalizeConfigMonth(fallbackConfigMonth)
      || currentMonthStart();

    return {
      requested_config_month: requestedConfigMonth,
      report_year: clampInt(params.report_year, parseInt(requestedConfigMonth.slice(0, 4), 10), 2000, 2100),
      ytd_month_number: clampInt(params.ytd_month_number, parseInt(requestedConfigMonth.slice(5, 7), 10), 1, 12),
    };
  }

  const explicitContextMonth = normalizeConfigMonth(params.configMonth || params.config_month);
  const year = parseInt(params.year, 10);
  const month = parseInt(params.month || params.ytd_month_number || params.ytdMonthNumber, 10);

  const requestedConfigMonth = explicitContextMonth
    || (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12
      ? `${year}-${String(month).padStart(2, '0')}-01`
      : normalizeConfigMonth(fallbackConfigMonth) || currentMonthStart());

  return {
    requested_config_month: requestedConfigMonth,
    report_year: clampInt(year, parseInt(requestedConfigMonth.slice(0, 4), 10), 2000, 2100),
    ytd_month_number: clampInt(month, parseInt(requestedConfigMonth.slice(5, 7), 10), 1, 12),
  };
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
  const normalizedSeed = normalizeConfigPayload(workbookSeed, configMonth);
  await replaceEfficiencyConfig(configMonth, normalizedSeed, null);
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
        metrics_source: 'sales_upload',
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
        metrics_source: 'sales_upload',
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

async function readEfficiencyConfig(configMonth, context = null) {
  const runtimeContext = resolveEfficiencyContext(context, configMonth);
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
  const [manualMetricRows] = await pool.query(
    `SELECT *
       FROM performance_efficiency_member_manual_metrics
      WHERE config_month = ?
      ORDER BY sheet_type ASC, group_name ASC, seller_name ASC, metric_month ASC, id ASC`,
    [configMonth]
  );

  const sheets = Object.fromEntries(SHEET_TYPES.map((sheetType) => [sheetType, {
    sheet_type: sheetType,
    label: SHEET_DEFINITIONS[sheetType].label,
    config_month: runtimeContext.requested_config_month,
    template_config_month: configMonth,
    report_year: runtimeContext.report_year,
    ytd_month_number: runtimeContext.ytd_month_number,
    groups: [],
  }]));

  periodRows.forEach((row) => {
    if (!sheets[row.sheet_type]) {
      return;
    }
    sheets[row.sheet_type].id = row.id;
    sheets[row.sheet_type].template_report_year = Number(row.report_year || parseInt(configMonth.slice(0, 4), 10));
    sheets[row.sheet_type].template_ytd_month_number = Number(row.ytd_month_number || parseInt(configMonth.slice(5, 7), 10));
  });

  const groupsById = new Map();
  const membersByLookup = new Map();
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
    const member = mapMemberRow(row);
    group.members.push(member);
    membersByLookup.set(buildManualMetricLookupKey(group.group_name, member.seller_name), member);
  });

  manualMetricRows.forEach((row) => {
    const member = membersByLookup.get(buildManualMetricLookupKey(row.group_name, row.seller_name));
    if (!member) {
      return;
    }

    member.manual_metrics.push(mapManualMetricRow(row));
  });

  await mergeWorkbookSeedDefaults(configMonth, sheets);

  Object.values(sheets).forEach((sheet) => {
    sheet.config_month = runtimeContext.requested_config_month;
    sheet.template_config_month = configMonth;
    sheet.report_year = runtimeContext.report_year;
    sheet.ytd_month_number = runtimeContext.ytd_month_number;
  });

  return {
    config_month: runtimeContext.requested_config_month,
    template_config_month: configMonth,
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
      'DELETE FROM performance_efficiency_member_manual_metrics WHERE config_month = ?',
      [configMonth]
    );
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
        [
          sheetType,
          configMonth,
          sheet.report_year,
          sheet.ytd_month_number,
          userId,
          userId,
        ]
      );

      for (const group of sheet.groups) {
        const [groupResult] = await connection.execute(
          `INSERT INTO performance_efficiency_groups (
            sheet_type,
            config_month,
            group_name,
            manager_name,
            manager_user_id,
            metrics_source,
            total_salary_amount,
            total_salary_divisor,
            total_salary_multiplier,
            total_salary_months_mode,
            total_salary_months_custom,
            sort_order,
            created_by,
            updated_by
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [
            sheetType,
            configMonth,
            group.group_name,
            group.manager_name,
            group.manager_user_id,
            group.metrics_source,
            group.total_salary_amount,
            group.total_salary_divisor,
            group.total_salary_multiplier,
            group.total_salary_months_mode,
            group.total_salary_months_custom,
            group.sort_order,
            userId,
            userId,
          ]
        );

        for (const member of group.members) {
          await connection.execute(
            `INSERT INTO performance_efficiency_members (
              group_id,
              sheet_type,
              config_month,
              employee_id,
              seller_name,
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
            [
              groupResult.insertId,
              sheetType,
              configMonth,
              member.employee_id,
              member.seller_name,
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
            ]
          );

          for (const manualMetric of member.manual_metrics || []) {
            await connection.execute(
              `INSERT INTO performance_efficiency_member_manual_metrics (
                sheet_type,
                config_month,
                group_name,
                seller_name,
                metric_month,
                revenue,
                gross_profit,
                created_by,
                updated_by
              ) VALUES (${EFFICIENCY_MANUAL_METRIC_INSERT_PLACEHOLDERS})`,
              [
                sheetType,
                configMonth,
                group.group_name,
                member.seller_name,
                manualMetric.metric_month,
                manualMetric.revenue,
                manualMetric.gross_profit,
                userId,
                userId,
              ]
            );
          }
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
        groups: normalizeGroups(sourceSheet.groups || [], clampInt(sourceSheet.report_year, fallbackYear, 2000, 2100)),
      }];
    })),
  };
}

function normalizeGroups(groups, reportYear) {
  return Array.isArray(groups)
    ? groups.map((group, index) => normalizeGroup(group, index, reportYear)).filter(Boolean)
    : [];
}

function normalizeGroup(group, index, reportYear) {
  const groupName = String(group?.group_name || group?.manager_name || '').trim();
  if (!groupName) {
    return null;
  }

  const normalizedManagerName = String(group?.manager_name || groupName).trim();
  const normalizedMembers = normalizeMembers(group?.members || [], reportYear);
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
    metrics_source: normalizeMetricsSource(group?.metrics_source),
    total_salary_amount: toNullableNumber(group?.total_salary_amount),
    total_salary_divisor: nonZero(group?.total_salary_divisor, 1),
    total_salary_multiplier: nonZero(group?.total_salary_multiplier, 1),
    total_salary_months_mode: normalizeMonthsMode(group?.total_salary_months_mode),
    total_salary_months_custom: toNullableInt(group?.total_salary_months_custom),
    sort_order: clampInt(group?.sort_order, index, 0, 100000),
    members: normalizedMembers,
  };
}

function normalizeMembers(members, reportYear) {
  const normalizedMembers = Array.isArray(members)
    ? members.map((member, index) => normalizeMember(member, index, reportYear)).filter(Boolean)
    : [];

  return sortMembersWithOtherLast(deduplicateMembers(normalizedMembers));
}

function normalizeMember(member, index, reportYear) {
  const sellerName = String(member?.seller_name || '').trim();
  const isOtherRow = Boolean(member?.is_other_row) || sellerName.toLowerCase() === 'other';
  if (!sellerName && !isOtherRow) {
    return null;
  }

  return {
    seller_name: sellerName || 'Other',
    employee_id: String(member?.employee_id || '').trim(),
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
    manual_metrics: normalizeManualMetrics(member?.manual_metrics || [], reportYear),
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
    metrics_source: normalizeMetricsSource(row.metrics_source),
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
    manual_metrics: [],
    is_other_row: Boolean(row.is_other_row),
    sort_order: Number(row.sort_order || 0),
  };
}

function mapManualMetricRow(row) {
  const metricMonth = normalizeDateValue(row.metric_month);

  return {
    metric_month: metricMonth,
    month_number: metricMonth ? parseInt(metricMonth.slice(5, 7), 10) : null,
    revenue: toNumber(row.revenue),
    gross_profit: toNumber(row.gross_profit),
  };
}

function buildManualMetricLookupKey(groupName, sellerName) {
  return `${normalizeLookupKey(groupName)}::${normalizeLookupKey(sellerName)}`;
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

function resolveSellerMetrics(memberConfig, metricsByMember) {
  return metricsByMember.get(memberConfig) || EMPTY_METRICS;
}

async function mergeWorkbookSeedDefaults(configMonth, sheets) {
  const targetSheet = sheets.sales_productivity;
  if (!targetSheet || !fs.existsSync(WORKBOOK_PATH)) {
    return;
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(WORKBOOK_PATH);
  const seedSheet = parseSalesProductivitySheet(workbook.getWorksheet(SHEET_DEFINITIONS.sales_productivity.workbookName), configMonth);

  mergeSeedGroupsIntoSheet(targetSheet, seedSheet.groups || []);
  mergeSeedGroupsIntoSheet(targetSheet, getSupplementalSeedGroups(targetSheet.sheet_type));
}

function mergeSeedGroupsIntoSheet(targetSheet, seedGroups) {
  if (!targetSheet || !Array.isArray(seedGroups) || !seedGroups.length) {
    return;
  }

  const groupsByKey = new Map((targetSheet.groups || []).map((group) => [normalizeLookupKey(group.group_name || group.manager_name), group]));

  seedGroups.forEach((seedGroup) => {
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

    if (!hasMeaningfulValue(existingGroup.metrics_source) && hasMeaningfulValue(seedGroup.metrics_source)) {
      existingGroup.metrics_source = seedGroup.metrics_source;
    }
  });
}

function getSupplementalSeedGroups(sheetType) {
  if (sheetType !== 'sales_productivity') {
    return [];
  }

  return [createMirnaCastilloManualGroup()];
}

function createMirnaCastilloManualGroup() {
  return {
    group_name: 'Mirna Castillo',
    manager_name: 'Mirna Castillo',
    manager_user_id: null,
    metrics_source: 'manual_monthly',
    total_salary_amount: null,
    total_salary_divisor: 1,
    total_salary_multiplier: 1,
    total_salary_months_mode: 'period',
    total_salary_months_custom: null,
    sort_order: 9999,
    members: [
      createSupplementalManualMember({
        seller_name: 'David Saucedo',
        market_segment: 'Engatel',
        yearly_it_other_target: 1550,
        yearly_total_target: 1550,
        salary_amount: 6,
        sort_order: 0,
      }),
      createSupplementalManualMember({
        seller_name: 'Margarita Robles',
        market_segment: 'General',
        yearly_it_other_target: 1200,
        yearly_total_target: 1200,
        salary_amount: 4,
        sort_order: 1,
      }),
      createSupplementalManualMember({
        seller_name: 'Yelena Coco',
        market_segment: 'General',
        yearly_it_other_target: 1200,
        yearly_total_target: 1200,
        salary_amount: 4,
        sort_order: 2,
      }),
      createSupplementalManualMember({
        seller_name: 'Other',
        market_segment: '',
        yearly_it_other_target: 0,
        yearly_total_target: 0,
        salary_amount: 12,
        sort_order: 3,
        is_other_row: true,
      }),
    ],
  };
}

function createSupplementalManualMember(values) {
  return {
    employee_id: '',
    seller_name: values.seller_name,
    market_segment: values.market_segment,
    months_in_role_label: values.is_other_row ? '' : '12+',
    months_in_role_value: values.is_other_row ? null : 12,
    yearly_printing_target: 0,
    yearly_it_other_target: values.yearly_it_other_target,
    yearly_rental_target: 0,
    yearly_total_target: values.yearly_total_target,
    yearly_gp_target_rate: SHEET_DEFINITIONS.sales_productivity.defaultGpRate,
    plan_months_mode: 'period',
    plan_months_custom: null,
    salary_amount: values.salary_amount,
    salary_divisor: 1,
    salary_multiplier: 1,
    salary_months_mode: 'custom',
    salary_months_custom: 1,
    manual_metrics: [],
    is_other_row: Boolean(values.is_other_row),
    sort_order: values.sort_order,
  };
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

function normalizeMetricsSource(value) {
  return value === 'manual_monthly' ? 'manual_monthly' : 'sales_upload';
}

function isManualMetricsGroup(group) {
  return normalizeMetricsSource(group?.metrics_source) === 'manual_monthly';
}

function normalizeManualMetrics(manualMetrics, reportYear) {
  if (!Array.isArray(manualMetrics)) {
    return [];
  }

  return manualMetrics
    .map((entry) => normalizeManualMetric(entry, reportYear))
    .filter(Boolean)
    .sort((left, right) => String(left.metric_month).localeCompare(String(right.metric_month)));
}

function normalizeManualMetric(entry, reportYear) {
  const metricMonth = normalizeManualMetricMonth(entry?.metric_month, reportYear);
  if (!metricMonth) {
    return null;
  }

  const revenue = toNullableNumber(entry?.revenue);
  const grossProfit = toNullableNumber(entry?.gross_profit);
  if (revenue == null && grossProfit == null) {
    return null;
  }

  return {
    metric_month: metricMonth,
    month_number: parseInt(metricMonth.slice(5, 7), 10),
    revenue: revenue == null ? 0 : revenue,
    gross_profit: grossProfit == null ? 0 : grossProfit,
  };
}

function normalizeManualMetricMonth(value, reportYear) {
  const normalized = normalizeDateValue(value);
  if (normalized) {
    return `${normalized.slice(0, 7)}-01`;
  }

  const monthNumber = clampInt(value?.month_number || value?.monthNumber || value?.month, null, 1, 12);
  if (!Number.isFinite(monthNumber) || !Number.isFinite(Number(reportYear))) {
    return null;
  }

  return `${reportYear}-${String(monthNumber).padStart(2, '0')}-01`;
}

function normalizeMonthsMode(value) {
  return ['period', 'months_in_role', 'custom'].includes(value) ? value : 'period';
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
        metrics_source: normalizeMetricsSource(group?.metrics_source),
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

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value) {
  if (value == null || value === '') {
    return null;
  }

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
  'manual_metrics',
];

module.exports = {
  getEfficiencyConfig,
  getEfficiencyOverview,
  saveEfficiencyConfig,
};