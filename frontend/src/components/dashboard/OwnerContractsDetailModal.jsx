import { useEffect, useMemo, useState } from 'react';
import { formatUsdCurrency } from '../../utils/currency';
import Spinner from '../ui/Spinner';
import StatusBadge from '../ui/StatusBadge';

const UPCOMING_COLUMNS = [
	{ key: 'client', label: 'Cliente', wide: true },
	{ key: 'contract_name', label: 'Contrato' },
	{ key: 'contract_type', label: 'Tipo' },
	{ key: 'business_div_name', label: 'Negocio' },
	{ key: 'start_date', label: 'Fecha inicio' },
	{ key: 'end_date', label: 'Fecha final' },
	{ key: 'monthly_revenue', label: 'Monto total', align: 'right' },
];

const CLOSED_COLUMNS = [
	{ key: 'client', label: 'Cliente', wide: true },
	{ key: 'contract_name', label: 'Contrato' },
	{ key: 'contract_type', label: 'Tipo' },
	{ key: 'business_div_name', label: 'Negocio' },
	{ key: 'event_date', label: 'Fecha cierre' },
	{ key: 'cancellation_date', label: 'Fecha canc.' },
	{ key: 'end_date', label: 'Fecha final' },
	{ key: 'display_status', label: 'Estado', align: 'center' },
	{ key: 'monthly_revenue', label: 'Monto total', align: 'right' },
];

function formatDate(value) {
	if (!value) return '—';

	const normalized = typeof value === 'string'
		? value.slice(0, 10)
		: new Date(value).toISOString().slice(0, 10);
	const date = new Date(`${normalized}T00:00:00Z`);

	if (Number.isNaN(date.getTime())) return '—';

	return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function getStatusValue(row) {
	return row.display_status || row.canonical_status || row.status;
}

function renderCell(row, column) {
	switch (column.key) {
		case 'start_date':
		case 'end_date':
		case 'event_date':
		case 'cancellation_date':
			return formatDate(row[column.key]);
		case 'monthly_revenue':
			return formatUsdCurrency(row[column.key]);
		case 'display_status':
			return <StatusBadge status={getStatusValue(row)} />;
		default:
			return row[column.key] || '—';
	}
}

function DetailTable({ columns, rows, emptyLabel }) {
	return (
		<div className="overflow-auto rounded-xl border border-outline-variant bg-white max-h-[26rem]">
			<table className="w-full text-left border-collapse">
				<thead>
					<tr className="bg-surface-container text-on-surface-variant font-label-caps text-label-caps border-b border-outline-variant">
						{columns.map((column) => (
							<th
								key={column.key}
								className={`p-sm font-semibold uppercase tracking-wider whitespace-nowrap sticky top-0 z-[1] bg-surface-container ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''}`}
							>
								{column.label}
							</th>
						))}
					</tr>
				</thead>
				<tbody className="font-table-data text-table-data text-on-surface divide-y divide-outline-variant">
					{rows.length === 0 ? (
						<tr>
							<td colSpan={columns.length} className="p-xl text-center text-on-surface-variant">
								{emptyLabel}
							</td>
						</tr>
					) : rows.map((row) => (
						<tr key={row.id} className="hover:bg-surface-container-low transition-colors">
							{columns.map((column) => (
								<td
									key={column.key}
									className={`p-sm ${column.wide ? 'min-w-[18rem] max-w-[18rem] align-top' : 'whitespace-nowrap'} ${column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''}`}
								>
									{renderCell(row, column)}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export default function OwnerContractsDetailModal({
	open,
	mode,
	owner,
	periodLabel,
	rows,
	loading,
	error,
	defaultTab = 'expired',
	onClose,
}) {
	const [activeTab, setActiveTab] = useState(defaultTab);

	useEffect(() => {
		if (open) {
			setActiveTab(defaultTab);
		}
	}, [defaultTab, open, owner, periodLabel]);

	useEffect(() => {
		if (!open) return undefined;

		const handleKeyDown = (event) => {
			if (event.key === 'Escape') {
				onClose();
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [open, onClose]);

	const upcomingRows = useMemo(
		() => (rows || []).filter((row) => row.is_upcoming_in_range === 1),
		[rows]
	);

	const expiredRows = useMemo(
		() => (rows || []).filter((row) => getStatusValue(row) === 'VENCIDO'),
		[rows]
	);

	const cancelledRows = useMemo(
		() => (rows || []).filter((row) => getStatusValue(row) === 'CANCELADO'),
		[rows]
	);

	if (!open) return null;

	const upcomingRevenue = upcomingRows.reduce((sum, row) => sum + Number(row.monthly_revenue || 0), 0);
	const expiredRevenue = expiredRows.reduce((sum, row) => sum + Number(row.monthly_revenue || 0), 0);
	const cancelledRevenue = cancelledRows.reduce((sum, row) => sum + Number(row.monthly_revenue || 0), 0);

	const closedSections = [
		{
			key: 'expired',
			label: 'Vencidos',
			rows: expiredRows,
			revenue: expiredRevenue,
			emptyLabel: 'No hay contratos vencidos para la selección actual.',
		},
		{
			key: 'cancelled',
			label: 'Cancelados',
			rows: cancelledRows,
			revenue: cancelledRevenue,
			emptyLabel: 'No hay contratos cancelados para la selección actual.',
		},
	];

	const activeClosedSection = closedSections.find((section) => section.key === activeTab) || closedSections[0];

	return (
		<div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
			<div className="min-h-full flex items-start md:items-center justify-center">
				<div
					className="bg-white rounded-2xl shadow-xl w-full max-w-6xl my-4 overflow-hidden max-h-[calc(100vh-2rem)] flex flex-col"
					onClick={(event) => event.stopPropagation()}
				>
					<div className="flex items-center justify-between px-lg py-md border-b border-outline-variant">
						<div>
							<h2 className="font-h3 text-h3 text-on-surface">
								{mode === 'upcoming' ? 'Detalle por vencer por vendedor' : 'Detalle de vencidos y cancelados por vendedor'}
							</h2>
							<p className="text-[12px] text-on-surface-variant mt-0.5">{owner} · {periodLabel}</p>
						</div>
						<button
							onClick={onClose}
							className="text-outline hover:text-on-surface material-symbols-outlined text-[22px] transition-colors"
						>
							close
						</button>
					</div>

					<div className="p-lg overflow-y-auto">
						{loading ? (
							<div className="h-72 flex items-center justify-center"><Spinner /></div>
						) : error ? (
							<div className="bg-error-container border border-red-200 rounded-xl p-md text-on-error-container">
								{error}
							</div>
						) : mode === 'upcoming' ? (
							<div className="space-y-md">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
									<div className="px-md py-sm rounded-xl bg-surface-container border border-outline-variant">
										<div className="text-[12px] text-on-surface-variant uppercase tracking-wider">Contratos</div>
										<div className="mt-1 font-h3 text-h3 text-on-surface">{upcomingRows.length.toLocaleString('es-ES')}</div>
									</div>
									<div className="px-md py-sm rounded-xl bg-surface-container border border-outline-variant">
										<div className="text-[12px] text-on-surface-variant uppercase tracking-wider">Monto total</div>
										<div className="mt-1 font-h3 text-h3 text-on-surface">{formatUsdCurrency(upcomingRevenue)}</div>
									</div>
								</div>
								<DetailTable
									columns={UPCOMING_COLUMNS}
									rows={upcomingRows}
									emptyLabel="No hay contratos por vencer para la selección actual."
								/>
							</div>
						) : (
							<div className="space-y-md">
								<div className="flex items-start justify-between gap-md flex-wrap">
									<div className="flex flex-wrap gap-sm">
										{closedSections.map((section) => (
											<button
												key={section.key}
												onClick={() => setActiveTab(section.key)}
												className={`px-md py-xs rounded-xl border transition-colors ${
													activeTab === section.key
														? 'bg-surface-container text-on-surface border-outline-variant'
														: 'bg-white text-on-surface-variant border-outline-variant hover:bg-surface-container-low'
												}`}
											>
												<span className="font-semibold">{section.label}</span>
												<span className="ml-xs text-[12px] text-on-surface-variant">{section.rows.length.toLocaleString('es-ES')}</span>
											</button>
										))}
									</div>
									<div className="px-sm py-xs rounded-lg bg-surface-container text-on-surface text-[13px] font-semibold">
										{formatUsdCurrency(activeClosedSection.revenue)}
									</div>
								</div>
								<DetailTable
									columns={CLOSED_COLUMNS}
									rows={activeClosedSection.rows}
									emptyLabel={activeClosedSection.emptyLabel}
								/>
							</div>
						)}
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