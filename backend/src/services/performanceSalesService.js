const pool = require('../db/connection');
const { formatMonthLabel } = require('../utils/dateUtils');

const INSERT_COLUMNS = [
  'batch_id',
  'report_type',
  'report_month',
  'order_number',
  'account_code',
  'client_name',
  'item_model',
  'configuration',
  'quantity',
  'revenue',
  'cost_usd',
  'itbm',
  'acarreo',
  'reacondicionamiento',
  'garantia',
  'provision',
  'total_cost',
  'gross_profit',
  'margin',
  'sale_date',
  'invoice_number',
  'sales_person_name',
  'document_type',
  'business_unit',
  'sales_mode',
  'operation_type',
  'serial_number',
  'fiscal_sequence',
  'raw_payload',
];
const INSERT_PLACEHOLDER = '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
const MAX_INSERT_ROWS = 500;

async function importPerformanceBatch({ reportType, reportMonth, filename, sheetName, records, errors = [], uploadedBy = null }) {
  if (!records.length) {
    throw new Error('No se encontraron filas validas para importar.');
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [replaceResult] = await connection.execute(
      `UPDATE performance_sales_upload_batches
       SET is_active = 0
       WHERE report_type = ? AND report_month = ? AND is_active = 1`,
      [reportType, reportMonth]
    );

    const [insertBatchResult] = await connection.execute(
      `INSERT INTO performance_sales_upload_batches (
        report_type,
        report_month,
        filename,
        sheet_name,
        records_imported,
        errors_count,
        error_details,
        uploaded_by,
        is_active
      ) VALUES (?,?,?,?,?,?,?,?,1)`,
      [
        reportType,
        reportMonth,
        filename,
        sheetName || '',
        records.length,
        errors.length,
        JSON.stringify(errors),
        uploadedBy,
      ]
    );

    const batchId = insertBatchResult.insertId;

    for (let index = 0; index < records.length; index += MAX_INSERT_ROWS) {
      const chunk = records.slice(index, index + MAX_INSERT_ROWS);
      const values = chunk.map(record => [
        batchId,
        reportType,
        reportMonth,
        record.order_number,
        record.account_code || '',
        record.client_name || '',
        record.item_model || '',
        record.configuration || '',
        record.quantity,
        record.revenue,
        record.cost_usd,
        record.itbm,
        record.acarreo,
        record.reacondicionamiento,
        record.garantia,
        record.provision,
        record.total_cost,
        record.gross_profit,
        record.margin,
        record.sale_date,
        record.invoice_number || '',
        record.sales_person_name || '',
        record.document_type || '',
        record.business_unit || '',
        record.sales_mode || '',
        record.operation_type || '',
        record.serial_number || '',
        record.fiscal_sequence || '',
        JSON.stringify(record.raw_payload || []),
      ]);

      await connection.execute(
        `INSERT INTO performance_sales_rows (${INSERT_COLUMNS.join(', ')})
         VALUES ${chunk.map(() => INSERT_PLACEHOLDER).join(',')}`,
        values.flat()
      );
    }

    await connection.commit();

    return {
      batchId,
      replacedActiveSnapshot: replaceResult.affectedRows > 0,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function getPerformanceOverview(params = {}) {
  const { whereSql, values } = buildRowsWhere(params, { activeOnly: true });

  const [[summaryRow]] = await pool.query(
    `SELECT
      COUNT(*) AS rows_count,
      COUNT(DISTINCT NULLIF(r.invoice_number, '')) AS invoices_count,
      COUNT(DISTINCT DATE_FORMAT(b.report_month, '%Y-%m')) AS active_months,
      COUNT(DISTINCT b.id) AS active_batches,
      COALESCE(SUM(r.quantity), 0) AS total_quantity,
      COALESCE(SUM(r.revenue), 0) AS total_revenue,
      COALESCE(SUM(r.total_cost), 0) AS total_cost,
      COALESCE(SUM(r.gross_profit), 0) AS total_gross_profit,
      CASE
        WHEN COALESCE(SUM(r.revenue), 0) = 0 THEN 0
        ELSE COALESCE(SUM(r.gross_profit), 0) / SUM(r.revenue)
      END AS weighted_margin,
      MAX(b.created_at) AS last_upload_at
    FROM performance_sales_rows r
    INNER JOIN performance_sales_upload_batches b ON b.id = r.batch_id
    WHERE ${whereSql}`,
    values
  );

  const [monthlyRows] = await pool.query(
    `SELECT
      b.report_month,
      b.report_type,
      COUNT(*) AS rows_count,
      COALESCE(SUM(r.quantity), 0) AS total_quantity,
      COALESCE(SUM(r.revenue), 0) AS total_revenue,
      COALESCE(SUM(r.total_cost), 0) AS total_cost,
      COALESCE(SUM(r.gross_profit), 0) AS total_gross_profit,
      CASE
        WHEN COALESCE(SUM(r.revenue), 0) = 0 THEN 0
        ELSE COALESCE(SUM(r.gross_profit), 0) / SUM(r.revenue)
      END AS weighted_margin
    FROM performance_sales_rows r
    INNER JOIN performance_sales_upload_batches b ON b.id = r.batch_id
    WHERE ${whereSql}
    GROUP BY b.report_month, b.report_type
    ORDER BY b.report_month ASC, b.report_type ASC`,
    values
  );

  const [reportTypeRows] = await pool.query(
    `SELECT
      b.report_type,
      COUNT(*) AS rows_count,
      COALESCE(SUM(r.quantity), 0) AS total_quantity,
      COALESCE(SUM(r.revenue), 0) AS total_revenue,
      COALESCE(SUM(r.gross_profit), 0) AS total_gross_profit,
      CASE
        WHEN COALESCE(SUM(r.revenue), 0) = 0 THEN 0
        ELSE COALESCE(SUM(r.gross_profit), 0) / SUM(r.revenue)
      END AS weighted_margin
    FROM performance_sales_rows r
    INNER JOIN performance_sales_upload_batches b ON b.id = r.batch_id
    WHERE ${whereSql}
    GROUP BY b.report_type
    ORDER BY total_revenue DESC`,
    values
  );

  const [salespeopleRows] = await pool.query(
    `SELECT
      r.sales_person_name,
      COUNT(*) AS rows_count,
      COUNT(DISTINCT NULLIF(r.invoice_number, '')) AS invoices_count,
      COALESCE(SUM(r.revenue), 0) AS total_revenue,
      COALESCE(SUM(r.gross_profit), 0) AS total_gross_profit,
      CASE
        WHEN COALESCE(SUM(r.revenue), 0) = 0 THEN 0
        ELSE COALESCE(SUM(r.gross_profit), 0) / SUM(r.revenue)
      END AS weighted_margin
    FROM performance_sales_rows r
    INNER JOIN performance_sales_upload_batches b ON b.id = r.batch_id
    WHERE ${whereSql} AND r.sales_person_name <> ''
    GROUP BY r.sales_person_name
    ORDER BY total_gross_profit DESC, total_revenue DESC
    LIMIT 8`,
    values
  );

  const [clientRows] = await pool.query(
    `SELECT
      r.client_name,
      COUNT(*) AS rows_count,
      COALESCE(SUM(r.revenue), 0) AS total_revenue,
      COALESCE(SUM(r.gross_profit), 0) AS total_gross_profit,
      CASE
        WHEN COALESCE(SUM(r.revenue), 0) = 0 THEN 0
        ELSE COALESCE(SUM(r.gross_profit), 0) / SUM(r.revenue)
      END AS weighted_margin
    FROM performance_sales_rows r
    INNER JOIN performance_sales_upload_batches b ON b.id = r.batch_id
    WHERE ${whereSql} AND r.client_name <> ''
    GROUP BY r.client_name
    ORDER BY total_revenue DESC, total_gross_profit DESC
    LIMIT 8`,
    values
  );

  return {
    summary: formatSummary(summaryRow),
    monthlyTrend: monthlyRows.map(row => {
      const reportMonth = normalizeDateValue(row.report_month);
      return {
        report_month: reportMonth,
        month_label: formatMonthLabel(reportMonth),
        report_type: row.report_type,
        rows_count: Number(row.rows_count || 0),
        total_quantity: Number(row.total_quantity || 0),
        total_revenue: Number(row.total_revenue || 0),
        total_cost: Number(row.total_cost || 0),
        total_gross_profit: Number(row.total_gross_profit || 0),
        weighted_margin: Number(row.weighted_margin || 0),
      };
    }),
    reportTypeBreakdown: reportTypeRows.map(row => ({
      report_type: row.report_type,
      rows_count: Number(row.rows_count || 0),
      total_quantity: Number(row.total_quantity || 0),
      total_revenue: Number(row.total_revenue || 0),
      total_gross_profit: Number(row.total_gross_profit || 0),
      weighted_margin: Number(row.weighted_margin || 0),
    })),
    topSalespeople: salespeopleRows.map(row => ({
      sales_person_name: row.sales_person_name,
      rows_count: Number(row.rows_count || 0),
      invoices_count: Number(row.invoices_count || 0),
      total_revenue: Number(row.total_revenue || 0),
      total_gross_profit: Number(row.total_gross_profit || 0),
      weighted_margin: Number(row.weighted_margin || 0),
    })),
    topClients: clientRows.map(row => ({
      client_name: row.client_name,
      rows_count: Number(row.rows_count || 0),
      total_revenue: Number(row.total_revenue || 0),
      total_gross_profit: Number(row.total_gross_profit || 0),
      weighted_margin: Number(row.weighted_margin || 0),
    })),
  };
}

async function listPerformanceRows(params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(250, Math.max(1, parseInt(params.limit, 10) || 25));
  const offset = (page - 1) * limit;
  const { whereSql, values } = buildRowsWhere(params, { activeOnly: true, includeSearch: true });
  const order = resolveSort(params.sortBy, params.sortDir);

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM performance_sales_rows r
     INNER JOIN performance_sales_upload_batches b ON b.id = r.batch_id
     WHERE ${whereSql}`,
    values
  );

  const [rows] = await pool.query(
    `SELECT
      r.id,
      r.report_type,
      r.report_month,
      r.order_number,
      r.account_code,
      r.client_name,
      r.item_model,
      r.configuration,
      r.quantity,
      r.revenue,
      r.cost_usd,
      r.itbm,
      r.acarreo,
      r.reacondicionamiento,
      r.garantia,
      r.provision,
      r.total_cost,
      r.gross_profit,
      r.margin,
      r.sale_date,
      r.invoice_number,
      r.sales_person_name,
      r.document_type,
      r.business_unit,
      r.sales_mode,
      r.operation_type,
      r.serial_number,
      r.fiscal_sequence,
      b.filename,
      b.created_at AS uploaded_at
    FROM performance_sales_rows r
    INNER JOIN performance_sales_upload_batches b ON b.id = r.batch_id
    WHERE ${whereSql}
    ORDER BY ${order.column} ${order.direction}, r.id DESC
    LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );

  const total = Number(countRow?.total || 0);
  return {
    data: rows.map(row => {
      const reportMonth = normalizeDateValue(row.report_month);
      return {
        ...row,
        report_month: reportMonth,
        sale_date: normalizeDateValue(row.sale_date),
        quantity: Number(row.quantity || 0),
        revenue: Number(row.revenue || 0),
        cost_usd: row.cost_usd == null ? null : Number(row.cost_usd),
        itbm: row.itbm == null ? null : Number(row.itbm),
        acarreo: row.acarreo == null ? null : Number(row.acarreo),
        reacondicionamiento: row.reacondicionamiento == null ? null : Number(row.reacondicionamiento),
        garantia: row.garantia == null ? null : Number(row.garantia),
        provision: row.provision == null ? null : Number(row.provision),
        total_cost: row.total_cost == null ? null : Number(row.total_cost),
        gross_profit: row.gross_profit == null ? null : Number(row.gross_profit),
        margin: row.margin == null ? null : Number(row.margin),
        month_label: formatMonthLabel(reportMonth),
      };
    }),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

async function listUploadBatches(params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(params.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const { whereSql, values } = buildBatchWhere(params);

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM performance_sales_upload_batches b
     WHERE ${whereSql}`,
    values
  );

  const [rows] = await pool.query(
    `SELECT
      b.id,
      b.report_type,
      b.report_month,
      b.filename,
      b.sheet_name,
      b.records_imported,
      b.errors_count,
      b.uploaded_by,
      b.is_active,
      b.created_at,
      COALESCE(SUM(r.revenue), 0) AS total_revenue,
      COALESCE(SUM(r.gross_profit), 0) AS total_gross_profit
    FROM performance_sales_upload_batches b
    LEFT JOIN performance_sales_rows r ON r.batch_id = b.id
    WHERE ${whereSql}
    GROUP BY
      b.id,
      b.report_type,
      b.report_month,
      b.filename,
      b.sheet_name,
      b.records_imported,
      b.errors_count,
      b.uploaded_by,
      b.is_active,
      b.created_at
    ORDER BY b.created_at DESC
    LIMIT ? OFFSET ?`,
    [...values, limit, offset]
  );

  const total = Number(countRow?.total || 0);

  return {
    data: rows.map(row => {
      const reportMonth = normalizeDateValue(row.report_month);
      return {
        ...row,
        report_month: reportMonth,
        records_imported: Number(row.records_imported || 0),
        errors_count: Number(row.errors_count || 0),
        total_revenue: Number(row.total_revenue || 0),
        total_gross_profit: Number(row.total_gross_profit || 0),
        is_active: Boolean(row.is_active),
        month_label: formatMonthLabel(reportMonth),
      };
    }),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
  };
}

async function getPerformanceFilterOptions(params = {}) {
  const { whereSql, values } = buildRowsWhere(params, { activeOnly: true });

  const [filterRows] = await pool.query(
    `SELECT 'clients' AS filter_name, r.client_name AS filter_value
     FROM performance_sales_rows r
     INNER JOIN performance_sales_upload_batches b ON b.id = r.batch_id
     WHERE ${whereSql} AND r.client_name <> ''
     UNION ALL
     SELECT 'owners' AS filter_name, r.sales_person_name AS filter_value
     FROM performance_sales_rows r
     INNER JOIN performance_sales_upload_batches b ON b.id = r.batch_id
     WHERE ${whereSql} AND r.sales_person_name <> ''
     UNION ALL
     SELECT 'businesses' AS filter_name, r.business_unit AS filter_value
     FROM performance_sales_rows r
     INNER JOIN performance_sales_upload_batches b ON b.id = r.batch_id
     WHERE ${whereSql} AND r.business_unit <> ''`,
    [...values, ...values, ...values]
  );

  const [yearRows] = await pool.query(
    `SELECT DISTINCT YEAR(report_month) AS year_value
     FROM performance_sales_upload_batches
     WHERE is_active = 1
     ORDER BY year_value DESC`
  );

  const grouped = {
    clients: new Set(),
    owners: new Set(),
    businesses: new Set(),
  };

  filterRows.forEach(row => {
    const value = String(row.filter_value || '').trim();
    if (value) {
      grouped[row.filter_name]?.add(value);
    }
  });

  return {
    clients: Array.from(grouped.clients).sort(),
    owners: Array.from(grouped.owners).sort(),
    businesses: Array.from(grouped.businesses).sort(),
    reportTypes: ['xerox', 'it'],
    years: yearRows
      .map(row => Number(row.year_value))
      .filter(year => Number.isFinite(year) && year > 0),
  };
}

function buildRowsWhere(params = {}, options = {}) {
  const clauses = [];
  const values = [];

  if (options.activeOnly !== false) {
    clauses.push('b.is_active = 1');
  }

  const reportType = normalizeReportType(params.reportType);
  if (reportType) {
    clauses.push('b.report_type = ?');
    values.push(reportType);
  }

  applyPeriodFilter(params, clauses, values, 'b.report_month');

  if (params.client) {
    clauses.push('r.client_name = ?');
    values.push(String(params.client).trim());
  }

  if (params.owner) {
    clauses.push('r.sales_person_name = ?');
    values.push(String(params.owner).trim());
  }

  if (params.business) {
    clauses.push('r.business_unit = ?');
    values.push(String(params.business).trim());
  }

  if (options.includeSearch && params.search) {
    const term = `%${String(params.search).trim()}%`;
    clauses.push(`(
      r.client_name LIKE ? OR
      r.invoice_number LIKE ? OR
      r.serial_number LIKE ? OR
      r.sales_person_name LIKE ? OR
      r.configuration LIKE ? OR
      r.item_model LIKE ?
    )`);
    values.push(term, term, term, term, term, term);
  }

  return {
    whereSql: clauses.length ? clauses.join(' AND ') : '1 = 1',
    values,
  };
}

function buildBatchWhere(params = {}) {
  const clauses = ['1 = 1'];
  const values = [];
  const reportType = normalizeReportType(params.reportType);

  if (reportType) {
    clauses.push('b.report_type = ?');
    values.push(reportType);
  }

  if (String(params.activeOnly || '').trim() === 'true') {
    clauses.push('b.is_active = 1');
  }

  applyPeriodFilter(params, clauses, values, 'b.report_month');

  return {
    whereSql: clauses.join(' AND '),
    values,
  };
}

function applyPeriodFilter(params, clauses, values, column) {
  const period = String(params.period || '').trim().toLowerCase();
  const year = parseInt(params.year, 10);
  const month = parseInt(params.month, 10);
  const quarter = parseInt(params.quarter, 10);

  if (period === 'mensual' && Number.isFinite(year) && Number.isFinite(month)) {
    clauses.push(`YEAR(${column}) = ? AND MONTH(${column}) = ?`);
    values.push(year, month);
    return;
  }

  if (period === 'trimestral' && Number.isFinite(year) && Number.isFinite(quarter)) {
    clauses.push(`YEAR(${column}) = ? AND QUARTER(${column}) = ?`);
    values.push(year, quarter);
    return;
  }

  if (period === 'personalizado' && params.startDate && params.endDate) {
    clauses.push(`${column} BETWEEN ? AND ?`);
    values.push(params.startDate, params.endDate);
    return;
  }

  if (Number.isFinite(year)) {
    clauses.push(`YEAR(${column}) = ?`);
    values.push(year);
  }
}

function resolveSort(sortBy, sortDir) {
  const columns = {
    report_month: 'r.report_month',
    sale_date: 'r.sale_date',
    client_name: 'r.client_name',
    sales_person_name: 'r.sales_person_name',
    revenue: 'r.revenue',
    total_cost: 'r.total_cost',
    gross_profit: 'r.gross_profit',
    margin: 'r.margin',
    invoice_number: 'r.invoice_number',
    report_type: 'r.report_type',
  };

  return {
    column: columns[sortBy] || 'r.sale_date',
    direction: String(sortDir || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC',
  };
}

function formatSummary(row = {}) {
  return {
    rows_count: Number(row.rows_count || 0),
    invoices_count: Number(row.invoices_count || 0),
    active_months: Number(row.active_months || 0),
    active_batches: Number(row.active_batches || 0),
    total_quantity: Number(row.total_quantity || 0),
    total_revenue: Number(row.total_revenue || 0),
    total_cost: Number(row.total_cost || 0),
    total_gross_profit: Number(row.total_gross_profit || 0),
    weighted_margin: Number(row.weighted_margin || 0),
    last_upload_at: row.last_upload_at || null,
  };
}

function normalizeReportType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'xerox' || normalized === 'it' ? normalized : '';
}

function normalizeDateValue(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().substring(0, 10);
  }

  const match = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

module.exports = {
  getPerformanceFilterOptions,
  getPerformanceOverview,
  importPerformanceBatch,
  listPerformanceRows,
  listUploadBatches,
};