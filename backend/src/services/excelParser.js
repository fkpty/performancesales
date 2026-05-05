const ExcelJS = require('exceljs');
const path = require('path');
const { parseExcelDate } = require('../utils/dateUtils');
const {
  buildCanonicalKey,
  collectQualityFlags,
  deriveTotals,
  normalizeText,
  parseNullableNumber,
  resolveCanonicalStatus,
  resolveLegacyStatus,
} = require('../utils/importRecordUtils');

const COLUMN_MAP = {
  client: ['razon_social', 'razon social', 'company', 'empresa', 'client', 'cliente'],
  contract_name: ['contrato', 'contract', 'contract_name', 'contract name', 'nombre contrato'],
  contract_type: ['tipo', 'type', 'contract type', 'tipo de contrato'],
  start_date: ['fecha_inicial', 'fecha inicial', 'fecha inicio', 'start date', 'start_date'],
  end_date: ['fecha_final', 'fecha final', 'fecha fin', 'fecha vencimiento', 'end date', 'end_date'],
  source_status: ['estado', 'status'],
  business_div_name: ['business_div_name', 'business div name', 'business_division', 'business division', 'negocio', 'business_t_name', 'business_team'],
  monthly_revenue: ['total_mensual', 'total mensual', 'monthly total', 'monthly revenue', 'ingresos mensuales', 'revenue', 'cuota_fija_contrato', 'cargo_fijo_dol', 'gc_inp_valor'],
  annual_total: ['total_anual', 'total anual', 'annual total', 'annual revenue', 'ingreso anual', 'valor_anual_contrato', 'fact_anual_dol', 'promfactanual'],
  profitability: ['profitability', 'rentabilidad', 'profitability %', 'profitability%'],
  commercial_owner_code: ['pl_cem_empleado', 'pl cem empleado', 'codigo_empleado', 'codigo empleado', 'employee_code', 'employee code'],
  commercial_owner: ['owner', 'responsable', 'commercial owner', 'responsable comercial', 'commercial_owner'],
  cancellation_date: ['fecha cancelacion', 'fecha_cancelacion', 'fecha de cancelacion', 'fecha_canc', 'cancellation date'],
  cancellation_reason: ['motivo cancelacion', 'motivo de cancelacion', 'motivo', 'cancel reason', 'reason'],
};

const REQUIRED_FIELDS = [
  'client',
  'contract_name',
  'contract_type',
  'start_date',
  'end_date',
];

async function parseExcel(filePath, originalName = '', explicitSourceType = '') {
  const workbook = new ExcelJS.Workbook();
  const ext = path.extname(filePath).toLowerCase();
  const sourceType = normalizeSourceType(explicitSourceType || inferSourceType(originalName || path.basename(filePath)));

  if (!sourceType) {
    return {
      records: [],
      errors: ['No se pudo identificar el tipo de archivo. Usa la carga de vigentes o vencidos/cancelados.'],
    };
  }

  if (ext === '.csv') {
    await workbook.csv.readFile(filePath);
  } else {
    await workbook.xlsx.readFile(filePath);
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) {
    return { records: [], errors: ['La hoja parece estar vacia.'] };
  }

  const headers = [];
  sheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNum) => {
    headers[colNum] = String(cell.text || '').trim();
  });

  const colFieldMap = buildColumnFieldMap(headers);

  const missingRequired = REQUIRED_FIELDS.filter(field => !Object.values(colFieldMap).includes(field));
  if (missingRequired.length > 0) {
    return {
      records: [],
      errors: [`Faltan columnas obligatorias: ${missingRequired.join(', ')}.`],
    };
  }

  const records = [];
  const errors = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const raw = {};
    let hasContent = false;

    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      const field = colFieldMap[colNum];
      const text = String(cell.text || '').trim();
      if (text) hasContent = true;
      if (field) raw[field] = field === 'commercial_owner_code' ? cell.text : cell.value;
    });

    if (!hasContent) return;

    const mapped = mapRow(raw, rowNumber, errors, {
      sourceType,
      sheetName: sheet.name || '',
    });

    if (mapped) records.push(mapped);
  });

  return { records, errors };
}

function resolveHeaderField(header) {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;

  for (const [field, aliases] of Object.entries(COLUMN_MAP)) {
    const priority = aliases.indexOf(normalized);
    if (priority !== -1) {
      return { field, priority };
    }
  }

  return null;
}

function buildColumnFieldMap(headers) {
  const bestMatches = {};

  headers.forEach((header, colNum) => {
    const match = resolveHeaderField(header);
    if (!match) return;

    const current = bestMatches[match.field];
    if (!current || match.priority < current.priority) {
      bestMatches[match.field] = { colNum, priority: match.priority };
    }
  });

  return Object.fromEntries(
    Object.entries(bestMatches).map(([field, match]) => [match.colNum, field])
  );
}

function mapRow(raw, rowNum, errors, context) {
  const client = normalizeText(raw.client);
  const contractName = normalizeText(raw.contract_name);
  const contractType = normalizeText(raw.contract_type);
  const cancellationReason = normalizeText(raw.cancellation_reason);
  const cancellationDate = parseCellDate(raw.cancellation_date, 'FECHA_CANCELACION', rowNum, errors, true);
  const sourceStatus = normalizeText(raw.source_status) || deriveSourceStatus({
    sourceType: context.sourceType,
    cancellationDate,
  });
  const businessDivName = normalizeText(raw.business_div_name) || 'Sin clasificar';

  if (!client || !contractName || !contractType) {
    errors.push(`Fila ${rowNum}: faltan campos obligatorios (cliente, contrato o tipo).`);
    return null;
  }

  const startDate = parseCellDate(raw.start_date, 'FECHA_INICIAL', rowNum, errors);
  const endDate = parseCellDate(raw.end_date, 'FECHA_FINAL', rowNum, errors);

  if (!startDate || !endDate) {
    errors.push(`Fila ${rowNum}: FECHA_INICIAL y FECHA_FINAL deben ser validas.`);
    return null;
  }

  const monthlyRevenue = parseNullableNumber(raw.monthly_revenue);
  const annualTotal = parseNullableNumber(raw.annual_total);
  const profitability = parseNullableNumber(raw.profitability);
  const commercialOwnerCode = normalizeText(raw.commercial_owner_code);
  const derivedTotals = deriveTotals(monthlyRevenue, annualTotal);
  const canonicalStatus = resolveCanonicalStatus({
    sourceType: context.sourceType,
    cancellationDate,
  });

  return {
    client,
    contract_name: contractName,
    contract_type: contractType,
    start_date: startDate,
    end_date: endDate,
    cancellation_date: cancellationDate,
    canonical_status: canonicalStatus,
    cancellation_reason: cancellationReason || (canonicalStatus === 'CANCELADO' ? sourceStatus : ''),
    status: resolveLegacyStatus(canonicalStatus, endDate),
    source_status: sourceStatus,
    business_div_name: businessDivName,
    monthly_revenue: derivedTotals.monthlyRevenue,
    annual_total: derivedTotals.annualTotal,
    profitability: profitability,
    commercial_owner_code: commercialOwnerCode,
    commercial_owner: normalizeText(raw.commercial_owner),
    source_type: context.sourceType,
    source_report: context.sourceType === 'vigente' ? 'vigentes' : 'vencidos_cancelados',
    source_sheet: context.sheetName,
    source_row_number: rowNum,
    special_source_group: 0,
    canonical_key: buildCanonicalKey({ client, contractName, contractType, startDate, endDate, sourceType: context.sourceType }),
    data_quality: collectQualityFlags({
      monthlyRevenue: derivedTotals.monthlyRevenue,
      annualTotal: derivedTotals.annualTotal,
      profitability,
    }),
  };
}

function normalizeSourceType(value) {
  return value === 'vigente' || value === 'vencido' ? value : null;
}

function inferSourceType(fileName) {
  const normalized = String(fileName || '').toLowerCase();
  if (normalized.includes('vigente')) return 'vigente';
  if (normalized.includes('vencid') || normalized.includes('cancelad')) return 'vencido';
  return null;
}

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function parseCellDate(raw, label, rowNum, errors, allowNull = false) {
  if ((raw == null || raw === '') && allowNull) return null;

  const iso = raw instanceof Date
    ? raw.toISOString().substring(0, 10)
    : parseExcelDate(raw);

  if (!iso && !allowNull) {
    errors.push(`Fila ${rowNum}: no se pudo interpretar ${label}.`);
  }

  return iso;
}

function deriveSourceStatus({ sourceType, cancellationDate }) {
  if (sourceType === 'vigente') {
    return cancellationDate ? 'CANCELADO' : 'VIGENTE';
  }
  return cancellationDate ? 'CANCELADO' : 'VENCIDO';
}

function normalizeFreeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

module.exports = { parseExcel };
