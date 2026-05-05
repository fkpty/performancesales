const pool = require('../db/connection');
const { resolveDateRange } = require('../utils/dashboardFilters');

const INSERT_COLUMNS = [
  'segment',
  'billing_zone',
  'price_mode',
  'client_code',
  'client',
  'contract_name',
  'contract_type',
  'frequency',
  'duration_months',
  'start_date',
  'end_date',
  'equipment_series',
  'model',
  'product',
  'accessory',
  'min_copies',
  'min_color_copies',
  'charge_fixed',
  'box_fee',
  'service_fee',
  'average_copies',
  'scale_type',
  'scale_number',
  'scale_from',
  'scale_to',
  'scale_price_per_copy',
  'invoice_literal',
  'installation_address',
  'phone1',
  'phone2',
  'commercial_owner',
  'upload_batch_id',
];
const INSERT_ROW_PLACEHOLDER = `(${INSERT_COLUMNS.map(() => '?').join(',')})`;
const MAX_INSERT_ROWS = 500;

async function replaceContractSeries(records, uploadBatchId = null) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute('DELETE FROM contract_series');

    for (let index = 0; index < records.length; index += MAX_INSERT_ROWS) {
      const chunk = records.slice(index, index + MAX_INSERT_ROWS);
      const values = chunk.map((record) => [
        record.segment || '',
        record.billing_zone || '',
        record.price_mode || '',
        record.client_code || '',
        record.client || '',
        record.contract_name || '',
        record.contract_type || '',
        record.frequency || '',
        record.duration_months ?? null,
        record.start_date || null,
        record.end_date || null,
        record.equipment_series || '',
        record.model || '',
        record.product || '',
        record.accessory || '',
        record.min_copies ?? null,
        record.min_color_copies ?? null,
        record.charge_fixed ?? null,
        record.box_fee ?? null,
        record.service_fee ?? null,
        record.average_copies ?? null,
        record.scale_type || '',
        record.scale_number ?? null,
        record.scale_from ?? null,
        record.scale_to ?? null,
        record.scale_price_per_copy ?? null,
        record.invoice_literal || '',
        record.installation_address || '',
        record.phone1 || '',
        record.phone2 || '',
        record.commercial_owner || '',
        uploadBatchId,
      ]);

      await connection.execute(
        `INSERT INTO contract_series (${INSERT_COLUMNS.join(', ')}) VALUES ${chunk.map(() => INSERT_ROW_PLACEHOLDER).join(',')}`,
        values.flat()
      );
    }

    await connection.commit();
    return records.length;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listContractSeries(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(10000, Math.max(1, parseInt(query.limit, 10) || 25));
  const offset = (page - 1) * limit;
  const table = normalizeSeriesTable(query.table);
  const range = resolveDateRange(query);
  const { whereSql, params } = buildWhereClause(query, table, range);
  const order = resolveSort(query.sortBy, query.sortDir, table);

  const countSql = `SELECT COUNT(*) AS total FROM contract_series WHERE ${whereSql}`;
  const rowsSql = `
    SELECT
      id,
      segment,
      billing_zone,
      price_mode,
      client_code,
      client,
      contract_name,
      contract_type,
      frequency,
      duration_months,
      start_date,
      end_date,
      equipment_series,
      model,
      product,
      accessory,
      min_copies,
      min_color_copies,
      charge_fixed,
      box_fee,
      service_fee,
      average_copies,
      scale_type,
      scale_number,
      scale_from,
      scale_to,
      scale_price_per_copy,
      invoice_literal,
      installation_address,
      phone1,
      phone2,
      commercial_owner,
      upload_batch_id
    FROM contract_series
    WHERE ${whereSql}
    ORDER BY ${order.column} ${order.direction}, id ASC
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

async function clearContractSeries() {
  const [result] = await pool.execute('DELETE FROM contract_series');
  return Number(result.affectedRows || 0);
}

function buildWhereClause(query, table, range) {
  const filters = [];
  const params = [];

  if (table === 'upcoming') {
    filters.push('end_date IS NOT NULL AND end_date BETWEEN ? AND ?');
    params.push(range.startDate, range.endDate);
  } else {
    // For the "vigentes" series table we restrict to rows whose end_date
    // falls inside the selected range (F/FINAL). This ensures the table
    // only shows contracts that match the user's selected period by final
    // date. (Previous logic returned contracts active during the range,
    // which could include contracts ending outside the selected year.)
    filters.push('end_date IS NOT NULL AND end_date BETWEEN ? AND ?');
    params.push(range.startDate, range.endDate);
  }

  applyLikeFilter(filters, params, 'client', query.client);
  applyLikeFilter(filters, params, 'contract_type', query.type);
  applyLikeFilter(filters, params, 'commercial_owner', query.owner);

  const status = String(query.chartFilter || query.status || '').trim().toUpperCase();
  if (status && status !== 'VIGENTE') {
    filters.push('1 = 0');
  }

  const search = String(query.search || '').trim();
  if (search) {
    const likeValue = `%${search}%`;
    filters.push(`(
      client_code LIKE ? OR
      client LIKE ? OR
      contract_name LIKE ? OR
      contract_type LIKE ? OR
      equipment_series LIKE ? OR
      model LIKE ? OR
      product LIKE ? OR
      scale_type LIKE ? OR
      commercial_owner LIKE ? OR
      installation_address LIKE ? OR
      phone1 LIKE ? OR
      phone2 LIKE ?
    )`);
    params.push(
      likeValue,
      likeValue,
      likeValue,
      likeValue,
      likeValue,
      likeValue,
      likeValue,
      likeValue,
      likeValue,
      likeValue,
      likeValue,
      likeValue,
    );
  }

  return {
    whereSql: filters.length ? filters.join(' AND ') : '1 = 1',
    params,
  };
}

function applyLikeFilter(filters, params, field, value) {
  const normalized = String(value || '').trim();
  if (!normalized) return;
  filters.push(`${field} LIKE ?`);
  params.push(`%${normalized}%`);
}

function normalizeSeriesTable(value) {
  switch (String(value || 'vigentes').toLowerCase()) {
    case 'proximos':
    case 'upcoming':
      return 'upcoming';
    case 'vigentes':
    case 'active':
    default:
      return 'vigentes';
  }
}

function resolveSort(sortBy, sortDir, table) {
  const sortableColumns = {
    segment: 'segment',
    billing_zone: 'billing_zone',
    price_mode: 'price_mode',
    client_code: 'client_code',
    client: 'client',
    contract_name: 'contract_name',
    contract_type: 'contract_type',
    frequency: 'frequency',
    duration_months: 'duration_months',
    start_date: 'start_date',
    end_date: 'end_date',
    equipment_series: 'equipment_series',
    model: 'model',
    product: 'product',
    accessory: 'accessory',
    min_copies: 'min_copies',
    min_color_copies: 'min_color_copies',
    charge_fixed: 'charge_fixed',
    box_fee: 'box_fee',
    service_fee: 'service_fee',
    average_copies: 'average_copies',
    scale_type: 'scale_type',
    scale_number: 'scale_number',
    scale_from: 'scale_from',
    scale_to: 'scale_to',
    scale_price_per_copy: 'scale_price_per_copy',
    invoice_literal: 'invoice_literal',
    installation_address: 'installation_address',
    phone1: 'phone1',
    phone2: 'phone2',
    commercial_owner: 'commercial_owner',
  };

  return {
    column: sortableColumns[sortBy] || 'end_date',
    direction: sortDir === 'desc' ? 'DESC' : sortDir === 'asc' ? 'ASC' : (table === 'upcoming' ? 'ASC' : 'ASC'),
  };
}

module.exports = {
  replaceContractSeries,
  listContractSeries,
  clearContractSeries,
};