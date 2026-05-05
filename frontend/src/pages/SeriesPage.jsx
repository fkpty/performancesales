import { useEffect } from 'react';
import OwnerClientEquipmentChart from '../components/dashboard/OwnerClientEquipmentChart';
import SeriesTable from '../components/series/SeriesTable';
import useContractStore from '../store/contractStore';

export default function SeriesPage() {
  const loadCharts = useContractStore(s => s.loadCharts);

  useEffect(() => {
    loadCharts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="flex flex-col gap-md">
      <section className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-lg">
        <div className="max-w-4xl space-y-xs">
          <h2 className="font-h2 text-h2 text-on-surface">Por Serie</h2>
          <p className="text-on-surface-variant text-body-sm">
            Vista detallada del mismo universo de vigentes del Panel, pero sin agrupar contratos. Aqui solo se muestran contratos vigentes y proximos a vencer, con el detalle completo de series, escalas y responsable sincronizado desde SQL Server.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-md">
        <OwnerClientEquipmentChart />
      </section>

      <SeriesTable tableKey="upcoming" />
    </section>
  );
}