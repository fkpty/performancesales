function normalizeText(value) {
  return String(value?.text || value || '').trim();
}

function toIsoDate(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }

    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function parseNullableNumber(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

  const cleaned = String(raw).replace(/[^0-9,.-]/g, '').trim();
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;

  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalized = cleaned.replace(/,/g, '');
  } else {
    normalized = cleaned.replace(',', '.');
  }

  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function deriveTotals(monthlyRevenue, annualTotal) {
  if (monthlyRevenue != null && annualTotal != null) {
    return { monthlyRevenue, annualTotal };
  }

  if (monthlyRevenue != null) {
    return {
      monthlyRevenue,
      annualTotal: Number((monthlyRevenue * 12).toFixed(2)),
    };
  }

  if (annualTotal != null) {
    return {
      monthlyRevenue: Number((annualTotal / 12).toFixed(2)),
      annualTotal,
    };
  }

  return { monthlyRevenue: null, annualTotal: null };
}

function resolveCanonicalStatus({ sourceType, cancellationDate }) {
  if (cancellationDate) return 'CANCELADO';
  if (sourceType === 'vigente') return 'VIGENTE';
  return 'VENCIDO';
}

function resolveLegacyStatus(canonicalStatus, endDate) {
  if (canonicalStatus === 'CANCELADO' || canonicalStatus === 'VENCIDO') return 'LOST';
  return endDate && endDate <= todayIsoPlusMonths(3) ? 'AT RISK' : 'ACTIVE';
}

function todayIsoPlusMonths(months) {
  const current = new Date();
  current.setMonth(current.getMonth() + months);
  return current.toISOString().substring(0, 10);
}

function buildCanonicalKey({ client, contractName, contractType, startDate, endDate, sourceType }) {
  return [client, contractName, contractType, startDate, endDate, sourceType]
    .map(value => String(value || '').trim().toLowerCase())
    .join('|');
}

function collectQualityFlags({ monthlyRevenue, annualTotal, profitability }) {
  const flags = [];
  if (monthlyRevenue == null) flags.push('missing_monthly_total');
  if (annualTotal == null) flags.push('missing_annual_total');
  if (profitability == null) flags.push('missing_profitability');
  return flags;
}

function normalizeFreeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function isNonCancellationText(value) {
  const normalized = normalizeFreeText(value);
  return [
    'no es motivo de cancelacion',
    'no aplica',
    'vigente',
    'activo',
    '0',
  ].includes(normalized);
}

module.exports = {
  buildCanonicalKey,
  collectQualityFlags,
  deriveTotals,
  normalizeText,
  parseNullableNumber,
  resolveCanonicalStatus,
  resolveLegacyStatus,
  toIsoDate,
};