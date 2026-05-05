const pool = require('../db/connection');
const { daysUntil } = require('../utils/dateUtils');
const { buildScopedContractsQuery, getTableScopeCondition } = require('../utils/dashboardFilters');

const IMPORT_COLUMNS = [
  'client_code',
  'client',
  'contract_name',
  'contract_type',
  'duration_months',
  'start_date',
  'end_date',
  'cancellation_date',
  'canonical_status',
  'cancellation_reason',
  'status',
  'source_status',
  'business_div_name',
  'charge_fixed',
  'box_fee',
  'service_fee',
  'monthly_revenue',
  'annual_total',
  'profitability',
  'commercial_owner_code',
  'commercial_owner',
  'risk_score',
  'source_type',
  'source_report',
  'source_sheet',
  'source_row_number',
  'special_source_group',
  'canonical_key',
  'data_quality',
  'upload_batch_id',
];
const IMPORT_ROW_PLACEHOLDER = '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
const MAX_INSERT_ROWS = 1000;

async function importBatch(records, uploadBatchId, sourceType = records[0]?.source_type) {
  if (!records.length) return;
  if (!sourceType) {
    throw new Error('No se recibio source_type para la importacion.');
  }

  const recordsToInsert = dedupeImportedRecords(records, sourceType);
  const atRiskMonths = await getAtRiskMonths();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute('DELETE FROM contracts WHERE source_type = ?', [sourceType]);

    for (let index = 0; index < recordsToInsert.length; index += MAX_INSERT_ROWS) {
      const chunk = recordsToInsert.slice(index, index + MAX_INSERT_ROWS);
      const values = chunk.map(record => [
        record.client_code || '',
        record.client,
        record.contract_name,
        record.contract_type,
        record.duration_months ?? null,
        record.start_date || null,
        record.end_date || null,
        record.cancellation_date || null,
        record.canonical_status,
        record.cancellation_reason || '',
        record.status,
        record.source_status,
        record.business_div_name,
        record.charge_fixed ?? null,
        record.box_fee ?? null,
        record.service_fee ?? null,
        record.monthly_revenue,
        record.annual_total,
        record.profitability,
        record.commercial_owner_code || '',
        record.commercial_owner || '',
        computeRiskScore(record, atRiskMonths),
        sourceType,
        record.source_report,
        record.source_sheet,
        record.source_row_number || null,
        record.special_source_group ? 1 : 0,
        record.canonical_key,
        JSON.stringify(record.data_quality || []),
        uploadBatchId,
      ]);

      await connection.execute(
        `INSERT INTO contracts (${IMPORT_COLUMNS.join(', ')})
         VALUES ${chunk.map(() => IMPORT_ROW_PLACEHOLDER).join(',')}`,
        values.flat()
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listContracts(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(10000, Math.max(1, parseInt(query.limit, 10) || 25));
  const offset = (page - 1) * limit;
  const table = normalizeTable(query.table);
  const scopeCondition = getTableScopeCondition(table);
  const { cte, params, range } = buildScopedContractsQuery(query);
  const order = resolveSort(table, query.sortBy, query.sortDir);
  const tableSource = buildTableListSource(table, scopeCondition);
  const sourceCondition = buildSourceCondition(tableSource.sourceCondition, table, query.upcomingRisk);

  const countSql = `${cte}${tableSource.extraCteSql}
    SELECT COUNT(*) AS total
    FROM ${tableSource.sourceTable}
    WHERE ${sourceCondition}`;

  const rowsSql = `${cte}${tableSource.extraCteSql}
    SELECT
      id,
      client_code,
      client,
      contract_name,
      contract_type,
      duration_months,
      start_date,
      end_date,
      cancellation_date,
      canonical_status,
      cancellation_reason,
      status,
      source_status,
      business_div_name,
      charge_fixed,
      box_fee,
      service_fee,
      monthly_revenue,
      annual_total,
      profitability,
      commercial_owner_code,
      commercial_owner,
      risk_score,
      source_type,
      source_report,
      source_sheet,
      source_row_number,
      special_source_group,
      canonical_key,
      data_quality,
      event_date,
      is_active_in_range,
      is_upcoming_in_range,
      is_expired_in_range,
      display_status
    FROM ${tableSource.sourceTable}
    WHERE ${sourceCondition}
    ORDER BY ${order.column} ${order.direction}
    LIMIT ? OFFSET ?`;

  const [[{ total }]] = await pool.query(countSql, params);
  const [rows] = await pool.query(rowsSql, [...params, limit, offset]);

  return {
    data: rows,
    total: Number(total || 0),
    page,
    limit,
    totalPages: Math.ceil(Number(total || 0) / limit),
    table,
    range,
  };
}

function buildSourceCondition(baseCondition, table, upcomingRisk) {
  const riskCondition = resolveUpcomingRiskCondition(table, upcomingRisk);

  if (!riskCondition) {
    return baseCondition;
  }

  return `${baseCondition} AND ${riskCondition}`;
}

function resolveUpcomingRiskCondition(table, upcomingRisk) {
  if (table !== 'upcoming') {
    return '';
  }

  switch (String(upcomingRisk || '').trim().toUpperCase()) {
    case 'RIESGO':
      return 'end_date IS NOT NULL AND DATEDIFF(end_date, UTC_DATE()) BETWEEN 0 AND 90';
    case 'HASTA_6_MESES':
      return 'end_date IS NOT NULL AND DATEDIFF(end_date, UTC_DATE()) BETWEEN 91 AND 180';
    case 'MAS_DE_6_MESES':
      return 'end_date IS NOT NULL AND DATEDIFF(end_date, UTC_DATE()) > 180';
    default:
      return '';
  }
}

async function getFilterOptions(query = {}) {
  const table = query.table ? normalizeTable(query.table) : null;
  const scopeCondition = table
    ? getTableScopeCondition(table)
    : '(is_active_in_range = 1 OR is_upcoming_in_range = 1 OR is_expired_in_range = 1)';
  const { cte, params } = buildScopedContractsQuery(query);
  const [rows] = await pool.query(
    `${cte}
      SELECT 'clients' AS filter_name, client AS filter_value FROM scoped_contracts WHERE ${scopeCondition}
      UNION ALL
      SELECT 'types' AS filter_name, contract_type AS filter_value FROM scoped_contracts WHERE ${scopeCondition}
      UNION ALL
      SELECT 'owners' AS filter_name, commercial_owner AS filter_value FROM scoped_contracts WHERE ${scopeCondition}
      UNION ALL
      SELECT 'statuses' AS filter_name, canonical_status AS filter_value FROM scoped_contracts WHERE ${scopeCondition}
      UNION ALL
      SELECT 'businesses' AS filter_name, business_div_name AS filter_value FROM scoped_contracts WHERE ${scopeCondition}`,
    [...params, ...params, ...params, ...params, ...params]
  );

  const grouped = {
    clients: new Set(),
    types: new Set(),
    owners: new Set(),
    statuses: new Set(),
    businesses: new Set(),
  };

  for (const row of rows) {
    const value = String(row.filter_value || '').trim();
    if (value) grouped[row.filter_name].add(value);
  }

  // Fetch all unique years from end_date of vigentes, always include 2025, sorted desc
  const [yearRowsRaw] = await pool.query(
    `SELECT DISTINCT YEAR(end_date) AS yr FROM contracts
     WHERE end_date IS NOT NULL AND source_type = 'vigente'`
  );
  const yearRows = Array.isArray(yearRowsRaw) ? yearRowsRaw : [yearRowsRaw];
  const yearsSet = new Set();
  for (const row of yearRows) {
    const y = Number(row.yr);
    if (y && y >= 2025) yearsSet.add(y);
  }
  yearsSet.add(2025);
  const yearsArray = Array.from(yearsSet).sort((a, b) => b - a);

  return {
    ...Object.fromEntries(
      Object.entries(grouped).map(([key, values]) => [key, Array.from(values).sort()])
    ),
    years: yearsArray,
  };
}

function computeRiskScore(record, atRiskMonths = 3) {
  if (record.source_type !== 'vigente' || record.canonical_status !== 'VIGENTE' || !record.end_date) {
    return 0;
  }

  const days = daysUntil(record.end_date);
  if (days === null || days < 0) return 0;

  const horizonDays = Math.max(30, atRiskMonths * 30);
  if (days > horizonDays) return 0;

  const timeScore = Math.max(0, (horizonDays - days) / horizonDays);
  const revenueScore = Math.min(10, Number(record.monthly_revenue || 0) / 10000);
  const profitability = Number(record.profitability || 0);
  const profitabilityScore = profitability > 0 ? 1 / profitability : 1;
  const rawScore = timeScore * revenueScore * profitabilityScore * 100;

  return Math.min(100, Math.max(0, Math.round(rawScore * 100) / 100));
}

async function getAtRiskMonths() {
  const [[row]] = await pool.execute(
    'SELECT `value` FROM app_settings WHERE `key` = ? LIMIT 1',
    ['at_risk_months']
  );
  const parsed = parseInt(row?.value || '3', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
}

function buildTableListSource(table, scopeCondition) {
  const preparedContractsCte = `,
      prepared_contracts AS (
        SELECT
          scoped_contracts.*,
          ${buildDisplayStatusExpression('scoped_contracts')} AS display_status,
          ${buildRowScoreExpression('scoped_contracts')} AS row_score,
          ${buildDedupeKeyExpression('scoped_contracts')} AS dedupe_key
        FROM scoped_contracts
      )`;

  if (table === 'vigentes' || table === 'upcoming') {
    return {
      extraCteSql: `${preparedContractsCte},
      ranked_contracts AS (
        SELECT
          prepared_contracts.*,
          ROW_NUMBER() OVER (
            PARTITION BY dedupe_key
            ORDER BY row_score DESC, COALESCE(end_date, '0000-00-00') DESC, COALESCE(start_date, '0000-00-00') DESC, id DESC
          ) AS contract_rank
        FROM prepared_contracts
        WHERE ${scopeCondition}
      )`,
      sourceTable: 'ranked_contracts',
      sourceCondition: 'contract_rank = 1',
    };
  }

  return {
    extraCteSql: preparedContractsCte,
    sourceTable: 'prepared_contracts',
    sourceCondition: scopeCondition,
  };
}

function dedupeImportedRecords(records, sourceType) {
  if (sourceType !== 'vigente') {
    return records;
  }

  const bestByKey = new Map();

  for (const record of records) {
    const dedupeKey = record.canonical_key || buildImportDedupeKey(record, sourceType);
    const current = bestByKey.get(dedupeKey);

    if (!current || isBetterImportedRecord(record, current)) {
      bestByKey.set(dedupeKey, record);
    }
  }

  return Array.from(bestByKey.values());
}

function buildImportDedupeKey(record, sourceType) {
  return [
    record.client,
    record.contract_name,
    record.contract_type,
    record.start_date,
    record.end_date,
    sourceType,
  ]
    .map(value => String(value || '').trim().toLowerCase())
    .join('|');
}

function isBetterImportedRecord(candidate, current) {
  const scoreDiff = getImportedRecordScore(candidate) - getImportedRecordScore(current);
  if (scoreDiff !== 0) {
    return scoreDiff > 0;
  }

  const endDateDiff = compareNullableValues(candidate.end_date, current.end_date);
  if (endDateDiff !== 0) {
    return endDateDiff > 0;
  }

  const startDateDiff = compareNullableValues(candidate.start_date, current.start_date);
  if (startDateDiff !== 0) {
    return startDateDiff > 0;
  }

  return Number(candidate.source_row_number || 0) >= Number(current.source_row_number || 0);
}

function getImportedRecordScore(record) {
  let score = 0;

  if (hasMeaningfulText(record.client_code)) score += 1;
  if (hasMeaningfulText(record.source_status)) score += 1;
  if (hasMeaningfulBusiness(record.business_div_name)) score += 1;
  if (record.charge_fixed != null) score += 1;
  if (record.box_fee != null) score += 1;
  if (record.service_fee != null) score += 1;
  if (record.monthly_revenue != null) score += 2;
  if (record.annual_total != null) score += 2;
  if (record.profitability != null) score += 1;
  if (hasMeaningfulText(record.commercial_owner)) score += 1;
  if (Array.isArray(record.data_quality) && record.data_quality.length) {
    score -= record.data_quality.length;
  }

  return score;
}

function hasMeaningfulText(value) {
  return String(value || '').trim() !== '';
}

function hasMeaningfulBusiness(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized !== '' && normalized !== 'sin clasificar';
}

function compareNullableValues(left, right) {
  if (left === right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  return String(left).localeCompare(String(right));
}

function buildDisplayStatusExpression(alias) {
  const qualifiedCancellationDate = qualifyColumn(alias, 'cancellation_date');
  const qualifiedSourceType = qualifyColumn(alias, 'source_type');
  const qualifiedCanonicalStatus = qualifyColumn(alias, 'canonical_status');
  const qualifiedStatus = qualifyColumn(alias, 'status');

  return `CASE
    WHEN ${qualifiedCancellationDate} IS NOT NULL THEN 'CANCELADO'
    WHEN ${qualifiedCanonicalStatus} = 'CANCELADO' THEN 'CANCELADO'
    WHEN ${qualifiedSourceType} = 'vencido' THEN 'VENCIDO'
    ELSE COALESCE(NULLIF(${qualifiedCanonicalStatus}, ''), NULLIF(${qualifiedStatus}, ''), 'VIGENTE')
  END`;
}

function buildRowScoreExpression(alias) {
  const qualifiedSourceStatus = qualifyColumn(alias, 'source_status');
  const qualifiedBusiness = qualifyColumn(alias, 'business_div_name');
  const qualifiedMonthlyRevenue = qualifyColumn(alias, 'monthly_revenue');
  const qualifiedAnnualTotal = qualifyColumn(alias, 'annual_total');
  const qualifiedProfitability = qualifyColumn(alias, 'profitability');
  const qualifiedOwner = qualifyColumn(alias, 'commercial_owner');

  return `(
    CASE WHEN NULLIF(TRIM(${qualifiedSourceStatus}), '') IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN NULLIF(TRIM(${qualifiedBusiness}), '') IS NOT NULL AND LOWER(TRIM(${qualifiedBusiness})) <> 'sin clasificar' THEN 1 ELSE 0 END +
    CASE WHEN ${qualifiedMonthlyRevenue} IS NOT NULL THEN 2 ELSE 0 END +
    CASE WHEN ${qualifiedAnnualTotal} IS NOT NULL THEN 2 ELSE 0 END +
    CASE WHEN ${qualifiedProfitability} IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN NULLIF(TRIM(${qualifiedOwner}), '') IS NOT NULL THEN 1 ELSE 0 END
  )`;
}

function buildDedupeKeyExpression(alias) {
  const qualifiedCanonicalKey = qualifyColumn(alias, 'canonical_key');

  return `COALESCE(
    NULLIF(${qualifiedCanonicalKey}, ''),
    CONCAT_WS('|',
      LOWER(TRIM(COALESCE(${qualifyColumn(alias, 'client')}, ''))),
      LOWER(TRIM(COALESCE(${qualifyColumn(alias, 'contract_name')}, ''))),
      LOWER(TRIM(COALESCE(${qualifyColumn(alias, 'contract_type')}, ''))),
      COALESCE(${qualifyColumn(alias, 'start_date')}, ''),
      COALESCE(${qualifyColumn(alias, 'end_date')}, ''),
      LOWER(TRIM(COALESCE(${qualifyColumn(alias, 'source_type')}, '')))
    )
  )`;
}

function qualifyColumn(alias, column) {
  return alias ? `${alias}.${column}` : column;
}

function normalizeTable(value) {
  switch (String(value || 'vigentes').toLowerCase()) {
    case 'proximos':
    case 'upcoming':
      return 'upcoming';
    case 'vencidos':
    case 'expired':
      return 'vencidos';
    case 'vigentes':
    case 'active':
    default:
      return 'vigentes';
  }
}

function resolveSort(table, sortBy, sortDir) {
  const sortableColumns = {
    client_code: 'client_code',
    client: 'client',
    contract_name: 'contract_name',
    contract_type: 'contract_type',
    duration_months: 'duration_months',
    start_date: 'start_date',
    end_date: 'end_date',
    cancellation_date: 'cancellation_date',
    cancellation_reason: 'cancellation_reason',
    canonical_status: 'display_status',
    status: 'display_status',
    source_status: 'source_status',
    business_div_name: 'business_div_name',
    charge_fixed: 'charge_fixed',
    box_fee: 'box_fee',
    service_fee: 'service_fee',
    monthly_revenue: 'monthly_revenue',
    annual_total: 'annual_total',
    profitability: 'profitability',
    commercial_owner_code: 'commercial_owner_code',
    commercial_owner: 'commercial_owner',
    risk_score: 'risk_score',
    event_date: 'event_date',
  };
  const defaultDirection = table === 'vencidos' ? 'DESC' : 'ASC';

  return {
    column: sortableColumns[sortBy] || 'end_date',
    direction: sortDir === 'desc' ? 'DESC' : sortDir === 'asc' ? 'ASC' : defaultDirection,
  };
}

async function logUpload({ filename, recordsImported, errorsCount, errorDetails, uploadedBy }) {
  const [result] = await pool.execute(
    `INSERT INTO upload_log (filename, records_imported, errors_count, error_details, uploaded_by)
     VALUES (?, ?, ?, ?, ?)`,
    [filename, recordsImported, errorsCount, JSON.stringify(errorDetails), uploadedBy]
  );
  return result.insertId;
}

async function clearContractsBySource(sourceType) {
  const [result] = await pool.execute(
    'DELETE FROM contracts WHERE source_type = ?',
    [sourceType]
  );

  return Number(result.affectedRows || 0);
}

module.exports = { importBatch, listContracts, getFilterOptions, logUpload, clearContractsBySource };
