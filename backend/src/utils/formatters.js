/**
 * Number / currency formatters shared across services.
 */

function formatCurrency(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function roundTwo(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Compute % delta between current and previous values.
 * Returns { delta, direction } where direction is 'up' | 'down' | 'flat'.
 */
function pctDelta(current, previous) {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  if (prev === 0) return { delta: null, direction: 'flat' };
  const d = roundTwo(((cur - prev) / Math.abs(prev)) * 100);
  return { delta: Math.abs(d), direction: d > 0 ? 'up' : d < 0 ? 'down' : 'flat' };
}

module.exports = { formatCurrency, roundTwo, pctDelta };
