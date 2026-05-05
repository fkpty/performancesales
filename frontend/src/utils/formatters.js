import { formatUsdCurrency } from './currency';

const COUNT_FORMATTER = new Intl.NumberFormat('en-US');

export function formatCurrency(value, empty = '—') {
  return formatUsdCurrency(value, empty);
}

export function formatCount(value, empty = '0') {
  if (value == null || value === '') return empty;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return empty;
  return COUNT_FORMATTER.format(numeric);
}

export function formatPercent(value, empty = '—') {
  if (value == null || value === '') return empty;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return empty;
  return `${(numeric * 100).toFixed(1)}%`;
}

export function formatDate(value, empty = '—') {
  if (!value) return empty;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return empty;
  return date.toLocaleDateString('es-PA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(value, empty = '—') {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return empty;
  return date.toLocaleString('es-PA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatMonthLabel(value, empty = '—') {
  if (!value) return empty;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return empty;
  return date.toLocaleDateString('es-PA', {
    month: 'long',
    year: 'numeric',
  });
}

export function formatReportType(value) {
  return String(value || '').toLowerCase() === 'xerox' ? 'Equipos Xerox' : 'Equipo IT';
}