import { formatUsdCurrency } from '../../utils/currency';

// KPI card – exact port from the design HTML
function formatValue(key, value) {
  if (value == null) return '—';
  if (key === 'monthlyRevenue') {
    return formatUsdCurrency(value);
  }
  if (key === 'avgProfitability') return `${Number(value).toFixed(1)}%`;
  return Number(value).toLocaleString();
}

function Arrow({ direction }) {
  const icon  = direction === 'up' ? 'arrow_upward' : 'arrow_downward';
  const color = direction === 'up' ? 'text-primary-container' : 'text-error';
  return <span className={`material-symbols-outlined text-[16px] ${color}`}>{icon}</span>;
}

export default function KPICard({ label, icon, iconColor, kpiKey, kpi }) {
  const { value, delta, direction } = kpi || {};
  const displayValue = formatValue(kpiKey, value);

  // For "Lost" KPI, up is bad (red); for "Expiring Soon", up is warning (amber)
  const isNegativeMetric = kpiKey === 'lost' || kpiKey === 'expiringSoon';
  const arrowColor =
    direction === 'flat'
      ? 'text-on-surface-variant'
      : isNegativeMetric && direction === 'up'
      ? 'text-error'
      : direction === 'up'
      ? 'text-primary-container'
      : 'text-primary-container';

  return (
    <div className="bg-surface-container-lowest p-md rounded-xl border border-outline-variant shadow-sm flex flex-col">
      <div className="flex justify-between items-start mb-sm">
        <span className="font-label-caps text-label-caps text-on-surface-variant uppercase">
          {label}
        </span>
        <span className={`material-symbols-outlined text-[20px] ${iconColor}`}>
          {icon}
        </span>
      </div>

      <div className="font-h1 text-h1 text-on-surface">
        {displayValue}
      </div>
    </div>
  );
}
