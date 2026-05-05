// Status badge – preserves design system colors
const BADGE_STYLES = {
  'VIGENTE':   'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20',
  'VENCIDO':   'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20',
  'CANCELADO': 'bg-red-50 text-red-600 ring-1 ring-inset ring-red-500/20',
};

const STATUS_LABELS = {
  'VIGENTE': 'Vigente',
  'VENCIDO': 'Vencido',
  'CANCELADO': 'Cancelado',
};

// Risk badges for Próximos a vencer – filled pill with dot indicator
const RISK_CONFIG = {
  'RIESGO':         { bg: 'bg-red-500',     dot: 'bg-red-200',     label: 'Crítico'    },
  'HASTA_6_MESES':  { bg: 'bg-amber-400',   dot: 'bg-amber-100',   label: 'Precaución' },
  'MAS_DE_6_MESES': { bg: 'bg-emerald-500', dot: 'bg-emerald-200', label: 'Estable'    },
};

export default function StatusBadge({ status }) {
  const risk = RISK_CONFIG[status];
  if (risk) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white ${risk.bg}`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${risk.dot}`} />
        {risk.label}
      </span>
    );
  }

  const cls = BADGE_STYLES[status] || 'bg-gray-50 text-gray-600 ring-1 ring-inset ring-gray-500/20';
  return (
    <span className={`px-2 py-1 rounded-full text-[11px] font-semibold tracking-wide ${cls}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}
