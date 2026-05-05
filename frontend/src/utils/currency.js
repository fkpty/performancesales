const USD_CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatUsdCurrency(value, empty = '—') {
  if (value == null || value === '') {
    return empty;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return empty;
  }

  return USD_CURRENCY_FORMATTER.format(numeric);
}