import { useEffect } from 'react';
import useContractStore from '../store/contractStore';
import ContractTable from '../components/dashboard/ContractTable';

export default function ContractsPage() {
  const loadTable = useContractStore(s => s.loadTable);
  const setTableConfig = useContractStore(s => s.setTableConfig);

  useEffect(() => {
    setTableConfig('vigentes', { limit: 25, page: 1 });
    loadTable('vigentes');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-lg">
      <div>
        <h2 className="font-h2 text-h2 text-on-surface">Contratos vigentes</h2>
        <p className="text-body-sm text-on-surface-variant mt-xs">
          Vista detallada y exportable de los contratos activos para el periodo seleccionado.
        </p>
      </div>
      <ContractTable tableKey="vigentes" showSearch showExport />
    </div>
  );
}
