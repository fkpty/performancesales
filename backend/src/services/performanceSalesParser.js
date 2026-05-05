const ExcelJS = require('exceljs');
const path = require('path');
const { parseExcelDate } = require('../utils/dateUtils');

const HEADER_SCAN_LIMIT = 5;

const FIELD_DEFINITIONS = {
  order_number: { label: 'ORDEN', aliases: ['orden'] },
  account_code: { label: 'CUENTA', aliases: ['cuenta'] },
  client_name: { label: 'NOMBRE DEL CLIENTE', aliases: ['nombre_del_cliente', 'nombre_cliente', 'cliente'], required: true },
  item_model: { label: 'MOD', aliases: ['mod'], occurrence: 0 },
  configuration: { label: 'CONF', aliases: ['conf', 'configuracion'] },
  quantity: { label: 'CANT', aliases: ['cant', 'cantidad'] },
  revenue: { label: 'REVENUE', aliases: ['revenue'], required: true },
  cost_usd: { label: 'COSTO DOL', aliases: ['costo_dol', 'costo_usd', 'costo'] },
  itbm: { label: 'ITBM/ITBMS', aliases: ['itbm', 'itbms'] },
  acarreo: { label: 'ACARREO', aliases: ['acarreo'] },
  reacondicionamiento: { label: 'REACONDICIONAMIENTO', aliases: ['reacondicionamiento'] },
  garantia: { label: 'GARANTIA', aliases: ['garantia'] },
  provision: { label: 'PROVISION', aliases: ['provision'] },
  total_cost: { label: 'COSTO TOTAL', aliases: ['costo_total'] },
  gross_profit: { label: 'GROSS PROFIT', aliases: ['gross_profit'] },
  margin: { label: 'MARGEN', aliases: ['margen'] },
  sale_date: { label: 'FECHA', aliases: ['fecha'], required: true },
  invoice_number: { label: 'FACTURA', aliases: ['factura'] },
  sales_person_name: { label: 'NOMBRE', aliases: ['nombre'], required: true },
  document_type: { label: 'DOC', aliases: ['doc'] },
  business_unit: { label: 'NEG.', aliases: ['neg'], required: true },
  sales_mode: { label: 'MOD (COMERCIAL)', aliases: ['mod'], occurrence: 1 },
  operation_type: { label: 'OPER', aliases: ['oper'], required: true },
  serial_number: { label: 'SERIE', aliases: ['serie'], required: true },
  fiscal_sequence: { label: 'SECUENCIAL_FISCAL', aliases: ['secuencial_fiscal'] },
};

const HEADER_SIGNALS = ['orden', 'cuenta', 'nombre_del_cliente', 'revenue', 'fecha', 'serie'];

const MONTH_NAMES = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

async function parsePerformanceWorkbook(filePath, originalName = '', reportType = '') {
  const normalizedType = normalizeReportType(reportType);

  if (!normalizedType) {
    return {
      reportType: null,
      reportMonth: null,
      sheetName: '',
      records: [],
      errors: ['Tipo de reporte no soportado. Usa Xerox o IT.'],
    };
  }

  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.xls') {
    return {
      reportType: normalizedType,
      reportMonth: null,
      sheetName: '',
      records: [],
      errors: ['Los archivos .xls no estan soportados. Convierte el reporte a .xlsx o .csv antes de cargarlo.'],
    };
  }

  const workbook = new ExcelJS.Workbook();
  if (ext === '.csv') {
    await workbook.csv.readFile(filePath);
  } else {
    await workbook.xlsx.readFile(filePath);
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2) {
    return {
      reportType: normalizedType,
      reportMonth: null,
      sheetName: sheet?.name || '',
      records: [],
      errors: ['La hoja parece estar vacia.'],
    };
  }

  const headerRowNumber = findHeaderRowNumber(sheet);
  if (!headerRowNumber) {
    return {
      reportType: normalizedType,
      reportMonth: null,
      sheetName: sheet.name || '',
      records: [],
      errors: ['No se encontro una fila de encabezados valida en el archivo.'],
    };
  }

  const { fieldMap, maxColumn, errors: headerErrors } = buildFieldMap(sheet.getRow(headerRowNumber));
  if (headerErrors.length > 0) {
    return {
      reportType: normalizedType,
      reportMonth: null,
      sheetName: sheet.name || '',
      records: [],
      errors: headerErrors,
    };
  }

  const records = [];
  const errors = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRowNumber) {
      return;
    }

    if (isEmptyRow(row, maxColumn)) {
      return;
    }

    const mapped = mapReportRow(row, rowNumber, normalizedType, fieldMap, maxColumn, errors);
    if (mapped) {
      records.push(mapped);
    }
  });

  const reportMonth = resolveReportMonth(records, originalName || path.basename(filePath));
  if (!reportMonth) {
    errors.push('No se pudo determinar el mes del reporte. Verifica la columna FECHA o el nombre del archivo.');
  }

  if (reportMonth) {
    records.forEach(record => {
      record.report_month = reportMonth;
    });
  }

  return {
    reportType: normalizedType,
    reportMonth,
    sheetName: sheet.name || '',
    records,
    errors,
  };
}

function findHeaderRowNumber(sheet) {
  let bestMatch = { rowNumber: 0, score: 0 };

  for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, HEADER_SCAN_LIMIT); rowNumber += 1) {
    const { headerIndexes } = buildHeaderLookup(sheet.getRow(rowNumber));
    const score = HEADER_SIGNALS.reduce((total, signal) => total + (headerIndexes.get(signal)?.length ? 1 : 0), 0);

    if (score > bestMatch.score) {
      bestMatch = { rowNumber, score };
    }
  }

  return bestMatch.score >= 4 ? bestMatch.rowNumber : 0;
}

function buildFieldMap(headerRow) {
  const { headerIndexes, maxColumn } = buildHeaderLookup(headerRow);
  const fieldMap = {};
  const missing = [];

  for (const [fieldName, definition] of Object.entries(FIELD_DEFINITIONS)) {
    const index = resolveFieldIndex(headerIndexes, definition.aliases, definition.occurrence || 0);
    fieldMap[fieldName] = index;

    if (definition.required && !index) {
      missing.push(definition.label);
    }
  }

  return {
    fieldMap,
    maxColumn,
    errors: missing.length > 0 ? [`Faltan columnas obligatorias: ${missing.join(', ')}.`] : [],
  };
}

function buildHeaderLookup(row) {
  const headerIndexes = new Map();
  let maxColumn = 0;

  row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
    maxColumn = Math.max(maxColumn, columnNumber);
    const normalized = normalizeHeader(readCell(row, columnNumber));
    if (!normalized) {
      return;
    }

    if (!headerIndexes.has(normalized)) {
      headerIndexes.set(normalized, []);
    }

    headerIndexes.get(normalized).push(columnNumber);
  });

  return {
    headerIndexes,
    maxColumn: Math.max(maxColumn, 25),
  };
}

function resolveFieldIndex(headerIndexes, aliases, occurrence = 0) {
  for (const alias of aliases) {
    const candidates = headerIndexes.get(alias);
    if (!candidates || candidates.length <= occurrence) {
      continue;
    }

    return candidates[occurrence];
  }

  return null;
}

function mapReportRow(row, rowNumber, reportType, fieldMap, maxColumn, errors) {
  const saleDate = parseExcelDate(readField(row, fieldMap.sale_date));
  const revenue = parseNullableNumber(readField(row, fieldMap.revenue));
  const costUsd = parseNullableNumber(readField(row, fieldMap.cost_usd));
  const itbm = parseNullableNumber(readField(row, fieldMap.itbm));
  const acarreo = parseNullableNumber(readField(row, fieldMap.acarreo));
  const reacondicionamiento = parseNullableNumber(readField(row, fieldMap.reacondicionamiento));
  const garantia = parseNullableNumber(readField(row, fieldMap.garantia));
  const provision = parseNullableNumber(readField(row, fieldMap.provision));
  const totalCostFromFile = parseNullableNumber(readField(row, fieldMap.total_cost));
  const totalCost = totalCostFromFile ?? sumNumbers([costUsd, itbm, acarreo, reacondicionamiento, garantia, provision]);
  const grossProfitFromFile = parseNullableNumber(readField(row, fieldMap.gross_profit));
  const grossProfit = grossProfitFromFile ?? computeGrossProfit(revenue, totalCost);
  const marginFromFile = parseNullableNumber(readField(row, fieldMap.margin));
  const margin = normalizeMargin(marginFromFile ?? computeMargin(grossProfit, revenue));
  const clientName = normalizeText(readField(row, fieldMap.client_name));
  const serialNumber = normalizeText(readField(row, fieldMap.serial_number));
  const invoiceNumber = normalizeText(readField(row, fieldMap.invoice_number));

  if (!clientName && !serialNumber && !invoiceNumber) {
    errors.push(`Fila ${rowNumber}: no tiene datos suficientes para identificar la venta.`);
    return null;
  }

  return {
    order_number: parseNullableInteger(readField(row, fieldMap.order_number)),
    account_code: normalizeText(readField(row, fieldMap.account_code)),
    client_name: clientName,
    item_model: normalizeText(readField(row, fieldMap.item_model)),
    configuration: normalizeText(readField(row, fieldMap.configuration)),
    quantity: parseNullableNumber(readField(row, fieldMap.quantity)),
    revenue,
    cost_usd: costUsd,
    itbm,
    acarreo,
    reacondicionamiento,
    garantia,
    provision,
    total_cost: totalCost,
    gross_profit: grossProfit,
    margin,
    sale_date: saleDate,
    invoice_number: invoiceNumber,
    sales_person_name: normalizeText(readField(row, fieldMap.sales_person_name)),
    document_type: normalizeText(readField(row, fieldMap.document_type)),
    business_unit: normalizeText(readField(row, fieldMap.business_unit)),
    sales_mode: normalizeText(readField(row, fieldMap.sales_mode)),
    operation_type: normalizeText(readField(row, fieldMap.operation_type)),
    serial_number: serialNumber,
    fiscal_sequence: normalizeText(readField(row, fieldMap.fiscal_sequence)),
    report_type: reportType,
    raw_payload: buildRawPayload(row, maxColumn),
  };
}

function readField(row, columnIndex) {
  if (!columnIndex) {
    return null;
  }

  return readCell(row, columnIndex);
}

function buildRawPayload(row, maxColumn) {
  const values = [];
  for (let index = 1; index <= maxColumn; index += 1) {
    values.push(readCell(row, index));
  }
  return values;
}

function readCell(row, index) {
  const cell = row.getCell(index);
  const value = cell?.value;

  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'object') {
    if (value.result != null) {
      return value.result;
    }
    if (value.formula != null || value.sharedFormula != null) {
      return null;
    }
    if (value.text != null) {
      return value.text;
    }
    if (Array.isArray(value.richText)) {
      return value.richText.map(part => part.text || '').join('');
    }
    if (value.hyperlink) {
      return value.text || value.hyperlink;
    }
  }

  return value;
}

function isEmptyRow(row, maxColumns) {
  for (let index = 1; index <= maxColumns; index += 1) {
    const value = readCell(row, index);
    if (value != null && String(value).trim() !== '') {
      return false;
    }
  }
  return true;
}

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function normalizeText(value) {
  return String(value == null ? '' : value).trim();
}

function parseNullableNumber(value) {
  if (value == null || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  const text = String(value)
    .trim()
    .replace(/[$,%\s]/g, '')
    .replace(/,(?=\d{3}(?:\D|$))/g, '');

  if (!text) {
    return null;
  }

  const normalized = text.includes(',') && !text.includes('.')
    ? text.replace(',', '.')
    : text;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseNullableInteger(value) {
  const parsed = parseNullableNumber(value);
  if (parsed == null) {
    return null;
  }
  return Math.trunc(parsed);
}

function sumNumbers(values) {
  const numeric = values.filter(value => value != null && Number.isFinite(value));
  if (!numeric.length) {
    return null;
  }
  return numeric.reduce((acc, value) => acc + value, 0);
}

function computeGrossProfit(revenue, totalCost) {
  if (revenue == null || totalCost == null) {
    return null;
  }
  return revenue - totalCost;
}

function computeMargin(grossProfit, revenue) {
  if (grossProfit == null || revenue == null || revenue === 0) {
    return null;
  }
  return grossProfit / revenue;
}

function normalizeMargin(value) {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }
  if (value > 1 || value < -1) {
    return value / 100;
  }
  return value;
}

function resolveReportMonth(records, originalName) {
  const uniqueMonths = Array.from(new Set(
    records
      .map(record => record.sale_date ? record.sale_date.substring(0, 7) : null)
      .filter(Boolean)
  ));

  if (uniqueMonths.length === 1) {
    return `${uniqueMonths[0]}-01`;
  }

  const fromFilename = parseMonthFromFilename(originalName);
  if (fromFilename) {
    return fromFilename;
  }

  return null;
}

function parseMonthFromFilename(fileName) {
  const normalized = String(fileName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const monthMatch = normalized.match(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)[^\d]*(20\d{2})/i);
  if (monthMatch) {
    const month = MONTH_NAMES[monthMatch[1]];
    if (month) {
      return `${monthMatch[2]}-${String(month).padStart(2, '0')}-01`;
    }
  }

  const numericMatch = normalized.match(/(20\d{2})[-_\s](0?[1-9]|1[0-2])/);
  if (numericMatch) {
    return `${numericMatch[1]}-${String(Number(numericMatch[2])).padStart(2, '0')}-01`;
  }

  return null;
}

function normalizeReportType(reportType) {
  const value = String(reportType || '').trim().toLowerCase();
  return value === 'it' || value === 'xerox' ? value : null;
}

module.exports = {
  parsePerformanceWorkbook,
  normalizeReportType,
};