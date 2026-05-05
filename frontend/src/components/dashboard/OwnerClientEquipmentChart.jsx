import { useEffect, useState } from 'react';
import useContractStore from '../../store/contractStore';
import Spinner from '../ui/Spinner';

function formatCount(value) {
	return Number(value || 0).toLocaleString('es-ES');
}

function formatCurrency(value) {
	return Number(value || 0).toLocaleString('es-ES', {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

function getSellerShare(value, total) {
	return total > 0 ? ((Number(value || 0) / total) * 100).toFixed(1) : '0.0';
}

function SellerDetailModal({ seller, totalChargeFixed, onClose }) {
	useEffect(() => {
		if (!seller) return undefined;

		const handleKeyDown = (event) => {
			if (event.key === 'Escape') {
				onClose();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [seller, onClose]);

	if (!seller) return null;

	const totalContracts = seller.children.reduce((sum, client) => sum + Number(client.contractCount || 0), 0);

	return (
		<div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
			<div className="min-h-full flex items-start md:items-center justify-center">
				<div
					className="bg-white rounded-2xl shadow-xl w-full max-w-6xl my-4 overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col"
					onClick={event => event.stopPropagation()}
				>
					<div className="flex items-center justify-between px-lg py-md border-b border-outline-variant">
						<div>
							<h2 className="font-h3 text-h3 text-on-surface">Detalle de equipos activos por vendedor</h2>
							<p className="text-[12px] text-on-surface-variant mt-0.5">{seller.name}</p>
						</div>
						<button
							onClick={onClose}
							className="text-outline hover:text-on-surface material-symbols-outlined text-[22px] transition-colors"
						>
							close
						</button>
					</div>

					<div className="p-lg overflow-y-auto space-y-md">
						<div className="grid grid-cols-1 md:grid-cols-4 gap-sm">
							<div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-md py-sm">
								<div className="text-[11px] uppercase tracking-wider text-on-surface-variant">Clientes</div>
								<div className="mt-1 font-h3 text-h3 text-on-surface">{formatCount(seller.clientCount)}</div>
							</div>
							<div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-md py-sm">
								<div className="text-[11px] uppercase tracking-wider text-on-surface-variant">Contratos</div>
								<div className="mt-1 font-h3 text-h3 text-on-surface">{formatCount(totalContracts)}</div>
							</div>
							<div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-md py-sm">
								<div className="text-[11px] uppercase tracking-wider text-on-surface-variant">Series / equipos</div>
								<div className="mt-1 font-h3 text-h3 text-on-surface">{formatCount(seller.value)}</div>
							</div>
							<div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-md py-sm">
								<div className="text-[11px] uppercase tracking-wider text-on-surface-variant">Cargo fijo total</div>
								<div className="mt-1 font-h3 text-h3 text-on-surface">{`$${formatCurrency(seller.totalChargeFixed || 0)}`}</div>
								<div className="text-[11px] text-on-surface-variant mt-1">{`${getSellerShare(seller.totalChargeFixed, totalChargeFixed)}% del total`}</div>
							</div>
						</div>

						<div className="overflow-auto rounded-xl border border-outline-variant bg-white max-h-[26rem]">
							<table className="w-full text-left border-collapse">
								<thead>
									<tr className="bg-surface-container text-on-surface-variant font-label-caps text-label-caps border-b border-outline-variant">
										<th className="p-sm font-semibold uppercase tracking-wider whitespace-nowrap sticky top-0 z-[1] bg-surface-container">Cliente</th>
										<th className="p-sm font-semibold uppercase tracking-wider text-right whitespace-nowrap sticky top-0 z-[1] bg-surface-container">Contratos</th>
										<th className="p-sm font-semibold uppercase tracking-wider text-right whitespace-nowrap sticky top-0 z-[1] bg-surface-container">Series / equipos</th>
										<th className="p-sm font-semibold uppercase tracking-wider text-right whitespace-nowrap sticky top-0 z-[1] bg-surface-container">Cargo fijo total</th>
										<th className="p-sm font-semibold uppercase tracking-wider whitespace-nowrap sticky top-0 z-[1] bg-surface-container">Detalle de contratos</th>
									</tr>
								</thead>
								<tbody className="font-table-data text-table-data text-on-surface divide-y divide-outline-variant">
									{seller.children.map((client) => (
										<tr key={`${seller.name}-${client.name}-modal`} className="align-top hover:bg-surface-container-low transition-colors">
											<td className="p-sm font-semibold max-w-[280px] break-words">{client.name}</td>
											<td className="p-sm text-right whitespace-nowrap">{formatCount(client.contractCount || 0)}</td>
											<td className="p-sm text-right whitespace-nowrap">{formatCount(client.equipmentCount || client.value)}</td>
											<td className="p-sm text-right whitespace-nowrap">{`$${formatCurrency(client.totalChargeFixed || 0)}`}</td>
											<td className="p-sm min-w-[24rem]">
												<div className="space-y-1">
													{client.contracts?.length ? client.contracts.map((contract) => (
														<div key={`${client.name}-${contract.contractName}-modal`} className="flex items-start justify-between gap-sm rounded-md bg-surface-container-low px-sm py-1.5">
															<div className="break-words text-on-surface max-w-[40ch]">{contract.contractName}</div>
															<div className="text-right whitespace-nowrap text-on-surface-variant">{`${formatCount(contract.equipmentCount)} serie${contract.equipmentCount === 1 ? '' : 's'} · $${formatCurrency(contract.totalChargeFixed || 0)}`}</div>
														</div>
													)) : (
														<div className="text-[12px] text-on-surface-variant">Sin contratos detallados.</div>
													)}
												</div>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>

					<div className="px-lg py-md border-t border-outline-variant flex justify-end">
						<button
							onClick={onClose}
							className="px-md py-xs border border-outline-variant rounded-lg text-on-surface font-body-sm hover:bg-surface-container transition-colors"
						>
							Cerrar
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function OwnerClientEquipmentChart() {
	const charts = useContractStore(s => s.charts);
	const loading = useContractStore(s => s.chartsLoading);
	const [selectedSeller, setSelectedSeller] = useState(null);

	const chartData = charts?.ownerClientEquipment;
	const sellers = chartData?.sellers || [];
	const hasData = sellers.length > 0;
	const totalChargeFixed = sellers.reduce((sum, seller) => sum + Number(seller.totalChargeFixed || 0), 0);

	return (
		<div className="bg-white rounded-2xl border border-outline-variant p-md flex flex-col gap-sm">
			<div className="flex items-start justify-between gap-md flex-wrap">
				<div>
					<h3 className="font-h3 text-h3 text-on-surface">Detalle de equipos activos por vendedor</h3>
					<p className="text-[12px] text-on-surface-variant mt-0.5">
						Clientes y contratos vigentes por vendedor, con cantidad de series/equipos y cargo fijo acumulado.
					</p>
				</div>

				<div className="text-[12px] text-on-surface-variant bg-surface-container-low rounded-lg px-sm py-xs">
					{`${formatCount(chartData?.totalOwners || 0)} vendedores · ${formatCount(chartData?.totalClients || 0)} relaciones vendedor/cliente · ${formatCount(chartData?.totalEquipmentCount || 0)} equipos`}
				</div>
			</div>

			{loading ? (
				<div className="flex items-center justify-center h-[28rem]">
					<Spinner />
				</div>
			) : !hasData ? (
				<div className="flex items-center justify-center h-[28rem] text-[13px] text-on-surface-variant text-center">
					No hay series activas para los filtros actuales.
				</div>
			) : (
				<div className="flex flex-col gap-md">
					<div className="rounded-xl border border-outline-variant overflow-hidden bg-surface-container-lowest">
						<div className="px-md py-sm border-b border-outline-variant bg-surface-container-low">
							<div>
								<h4 className="text-[13px] font-semibold text-on-surface">Resumen por vendedor</h4>
								<p className="text-[12px] text-on-surface-variant mt-0.5">Haz clic en un vendedor para ver el detalle completo.</p>
							</div>
						</div>

						<div className="max-h-[20rem] overflow-auto">
							<table className="w-full text-left border-collapse">
								<thead>
									<tr className="bg-surface-container text-on-surface-variant font-label-caps text-label-caps border-b border-outline-variant">
										<th className="p-sm font-semibold uppercase tracking-wider sticky top-0 z-[1] bg-surface-container">Vendedor</th>
										<th className="p-sm font-semibold uppercase tracking-wider text-right sticky top-0 z-[1] bg-surface-container">Clientes</th>
										<th className="p-sm font-semibold uppercase tracking-wider text-right sticky top-0 z-[1] bg-surface-container">Series / equipos</th>
										<th className="p-sm font-semibold uppercase tracking-wider text-right sticky top-0 z-[1] bg-surface-container">Cargo fijo total</th>
									</tr>
								</thead>

								<tbody className="font-table-data text-table-data text-on-surface divide-y divide-outline-variant">
									{sellers.map((seller) => (
										<tr
											key={`summary-${seller.name}`}
											tabIndex={0}
											role="button"
											onClick={() => setSelectedSeller(seller)}
											onKeyDown={(event) => {
												if (event.key === 'Enter' || event.key === ' ') {
													event.preventDefault();
													setSelectedSeller(seller);
												}
											}}
											className="cursor-pointer hover:bg-surface-container-low focus:outline-none focus:bg-surface-container transition-colors"
										>
											<td className="p-sm font-semibold whitespace-nowrap">{seller.name}</td>
											<td className="p-sm text-right whitespace-nowrap">{formatCount(seller.clientCount)}</td>
											<td className="p-sm text-right whitespace-nowrap">{formatCount(seller.value)}</td>
											<td className="p-sm text-right whitespace-nowrap">{`$${formatCurrency(seller.totalChargeFixed || 0)}`}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>

					<div className="rounded-xl border border-outline-variant overflow-hidden bg-surface-container-lowest">
						<div className="px-md py-sm border-b border-outline-variant bg-surface-container-low">
							<h4 className="text-[13px] font-semibold text-on-surface">Detalle por cliente</h4>
						</div>

						<div className="max-h-[34rem] overflow-auto">
							<table className="w-full text-left border-collapse">
								<thead>
									<tr className="bg-surface-container text-on-surface-variant font-label-caps text-label-caps border-b border-outline-variant">
										<th className="p-sm font-semibold uppercase tracking-wider sticky top-0 z-[1] bg-surface-container">Vendedor</th>
										<th className="p-sm font-semibold uppercase tracking-wider text-right sticky top-0 z-[1] bg-surface-container">Clientes</th>
										<th className="p-sm font-semibold uppercase tracking-wider text-right sticky top-0 z-[1] bg-surface-container">Series / equipos</th>
										<th className="p-sm font-semibold uppercase tracking-wider text-right sticky top-0 z-[1] bg-surface-container">Cargo fijo total</th>
										<th className="p-sm font-semibold uppercase tracking-wider sticky top-0 z-[1] bg-surface-container">Detalle por cliente</th>
									</tr>
								</thead>

								<tbody className="font-table-data text-table-data text-on-surface divide-y divide-outline-variant">
									{sellers.map((seller) => (
										<tr key={seller.name} className="align-top hover:bg-surface-container-low transition-colors">
											<td className="p-sm font-semibold whitespace-nowrap">{seller.name}</td>
											<td className="p-sm text-right whitespace-nowrap">{formatCount(seller.clientCount)}</td>
											<td className="p-sm text-right whitespace-nowrap">{formatCount(seller.value)}</td>
											<td className="p-sm text-right whitespace-nowrap">
												<div className="font-medium text-on-surface">{`$${formatCurrency(seller.totalChargeFixed || 0)}`}</div>
												<div className="text-[11px] text-on-surface-variant">
													{`${totalChargeFixed > 0 ? ((Number(seller.totalChargeFixed || 0) / totalChargeFixed) * 100).toFixed(1) : '0.0'}% del total`}
												</div>
											</td>
											<td className="p-sm min-w-[24rem]">
												<div className="space-y-xs">
													{seller.children.map((client) => (
														<div key={`${seller.name}-${client.name}`} className="rounded-lg bg-surface-container-low px-sm py-xs">
															<div className="flex items-start justify-between gap-sm">
																<div className="text-[12px] text-on-surface break-words font-medium">{client.name}</div>
																<div className="text-[12px] text-on-surface-variant text-right whitespace-nowrap">
																	{`${formatCount(client.contractCount || 0)} contrato${(client.contractCount || 0) === 1 ? '' : 's'} · ${formatCount(client.equipmentCount || client.value)} serie${(client.equipmentCount || client.value) === 1 ? '' : 's'} · $${formatCurrency(client.totalChargeFixed || 0)}`}
																</div>
															</div>

															<div className="mt-2 space-y-1 text-[12px] text-on-surface-variant">
																{client.contracts?.length ? client.contracts.map((contract) => (
																	<div key={`${client.name}-${contract.contractName}`} className="flex items-start justify-between gap-sm rounded-md bg-white/70 px-sm py-1">
																		<div className="break-words text-on-surface max-w-[42ch]">{contract.contractName}</div>
																		<div className="text-right whitespace-nowrap">{`${formatCount(contract.equipmentCount)} serie${contract.equipmentCount === 1 ? '' : 's'} · $${formatCurrency(contract.totalChargeFixed || 0)}`}</div>
																	</div>
																)) : (
																	<div className="text-[12px] text-on-surface-variant">Sin contratos detallados.</div>
																)}
															</div>
														</div>
													))}
												</div>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			)}

			<SellerDetailModal
				seller={selectedSeller}
				totalChargeFixed={totalChargeFixed}
				onClose={() => setSelectedSeller(null)}
			/>
		</div>
	);
}
