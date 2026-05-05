import useContractStore from '../../store/contractStore';
import KPICard from './KPICard';
import Spinner from '../ui/Spinner';

const KPI_CONFIG = [
  { key: 'totalActive',      label: 'Activos totales',      icon: 'description',  iconColor: 'text-outline' },
  { key: 'expiringSoon',     label: 'Próximos a vencer',    icon: 'warning',      iconColor: 'text-[#F59E0B]' },
  { key: 'lost',             label: 'Contratos vencidos',   icon: 'event_busy',   iconColor: 'text-error' },
  { key: 'cancelled',        label: 'Cancelados',           icon: 'block',        iconColor: 'text-red-700' },
];

export default function KPISection() {
  const kpis        = useContractStore(s => s.kpis);
  const loading     = useContractStore(s => s.kpisLoading);

  return (
    <section className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-md">
      {KPI_CONFIG.map(({ key, label, icon, iconColor }) => (
        <div key={key} className="relative">
          {loading && (
            <div className="absolute inset-0 bg-surface-container-lowest/70 rounded-xl z-10 flex items-center justify-center">
              <Spinner size="sm" />
            </div>
          )}
          <KPICard
            kpiKey={key}
            label={label}
            icon={icon}
            iconColor={iconColor}
            kpi={kpis?.[key]}
          />
        </div>
      ))}
    </section>
  );
}
