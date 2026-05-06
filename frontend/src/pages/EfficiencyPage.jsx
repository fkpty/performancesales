import ReactECharts from 'echarts-for-react';
import { useEffect, useState } from 'react';
import { fetchEfficiencyOverview } from '../services/api';
import usePerformanceStore from '../store/performanceStore';
import { formatCount, formatCurrency, formatPercent } from '../utils/formatters';

// ─── Semáforo helpers ────────────────────────────────────────────────────────
// Plan % Rev / Plan % Profit: values are decimals (0.85 = 85 %)
function getPlanPercentColor(value) {
  if (value == null || value === '') return '';
  if (value >= 0.85) return 'bg-green-100 text-green-800 font-semibold';
  if (value >= 0.50) return 'bg-yellow-100 text-yellow-800 font-semibold';
  return 'bg-red-100 text-red-800 font-semibold';
}

// Efficiency Rate: numeric (e.g. 6.28, 8.94)
// scale: min≈5 (red), mid≈6 (yellow), max≈8 (green)
function getEfficiencyColor(value) {
  if (value == null || value === '') return '';
  if (value >= 7) return 'bg-green-100 text-green-800 font-semibold';
  if (value >= 5) return 'bg-yellow-100 text-yellow-800 font-semibold';
  return 'bg-red-100 text-red-800 font-semibold';
}

// Return hex color for chart bars
function getEfficiencyHex(value) {
  if (value == null) return '#94a3b8';
  if (value >= 7) return '#22c55e';
  if (value >= 5) return '#eab308';
  return '#ef4444';
}

const SALES_COLUMNS = [
  { key: 'group', label: 'Gerente' },
  { key: 'seller_name', label: 'Vendedor' },
  { key: 'market_segment', label: 'Segmento' },
  { key: 'months_in_role_label', label: 'Meses en ventas' },
  { key: 'yearly_printing_target', label: 'Meta impresion', type: 'currency' },
  { key: 'yearly_it_other_target', label: 'Meta IT / Otros', type: 'currency' },
  { key: 'yearly_rental_target', label: 'Meta rental PV', type: 'currency' },
  { key: 'yearly_total_target', label: 'Meta anual total', type: 'currency' },
  { key: 'yearly_total_target_gp', label: 'Meta anual GP', type: 'currency' },
  { key: 'ytd_target_revenue', label: 'YTD Target Rev', type: 'currency' },
  { key: 'ytd_target_profit', label: 'YTD Target Profit', type: 'currency' },
  { key: 'ytd_revenue', label: 'YTD Rev', type: 'currency' },
  { key: 'ytd_profit', label: 'YTD Profit', type: 'currency' },
  { key: 'ytd_plan_percent_revenue', label: 'Plan % Rev', type: 'percent' },
  { key: 'ytd_plan_percent_profit', label: 'Plan % Profit', type: 'percent' },
  { key: 'salary_fully_loaded', label: 'Salary Fully Loaded', type: 'currency' },
  { key: 'efficiency_rate', label: 'Eficiencia', type: 'count' },
];

export default function EfficiencyPage() {
  const year = usePerformanceStore((state) => state.year);
  const month = usePerformanceStore((state) => state.month);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    fetchEfficiencyOverview({ year, month })
      .then((response) => {
        if (!active) {
          return;
        }
        setOverview(response);
      })
      .catch((requestError) => {
        if (!active) {
          return;
        }
        setError(
          requestError?.response?.data?.error
          || requestError.message
          || 'No se pudo cargar la vista de eficiencia.'
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [year, month]);

  const salesSheet = overview?.sheets?.sales_productivity || null;

  return (
    <div className="space-y-lg">
      <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm p-lg space-y-sm">
        <div className="flex flex-wrap items-start justify-between gap-md">
          <div>
            <h2 className="font-h2 text-h2 text-on-surface">Eficiencia</h2>
            <p className="text-body-sm text-on-surface-variant mt-xs max-w-3xl">
              Replica operativa del workbook con YTD Revenue y YTD Profit tomados segun la fuente configurada de cada grupo.
            </p>
          </div>
          <div className="rounded-xl bg-surface-container-low px-md py-sm text-body-sm text-on-surface-variant border border-outline-variant">
            Periodo de configuracion: <strong className="text-on-surface">{year}-{String(month).padStart(2, '0')}</strong>
          </div>
        </div>
      </section>

      {loading && (
        <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm px-lg py-xl text-center text-on-surface-variant">
          Cargando eficiencia comercial...
        </section>
      )}

      {error && (
        <section className="bg-red-50 border border-red-200 rounded-2xl px-lg py-md text-red-700">
          {error}
        </section>
      )}

      {!loading && !error && overview && (
        <>
          <section className="grid grid-cols-1 gap-md">
            <SheetSummaryCard sheet={salesSheet} />
          </section>

          <EfficiencyChart sheet={salesSheet} />

          <SheetPanel
            title="Productividad comercial"
            subtitle="Vista basada en la hoja Sales Productivity"
            sheet={salesSheet}
            columns={SALES_COLUMNS}
          />
        </>
      )}
    </div>
  );
}

function SheetSummaryCard({ sheet }) {
  if (!sheet) {
    return null;
  }

  return (
    <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="px-lg py-md border-b border-outline-variant bg-surface-container-low/30 flex flex-wrap items-center justify-between gap-md">
        <div>
          <h3 className="font-h3 text-h3 text-on-surface">{sheet.label}</h3>
          <p className="text-[12px] text-on-surface-variant mt-xs">
            Año base {sheet.report_year} · YTD month #{sheet.ytd_month_number}
          </p>
        </div>
        <div className="flex items-center gap-xs text-body-sm text-on-surface-variant">
          <span className="material-symbols-outlined text-[18px]">groups</span>
          {formatCount(sheet.groups?.length || 0)} grupos
        </div>
      </div>

      <div className="p-lg grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-md">
        <MetricCard label="YTD Revenue" value={formatCurrency(sheet.grand_totals?.ytd_revenue)} />
        <MetricCard label="YTD Profit" value={formatCurrency(sheet.grand_totals?.ytd_profit)} />
        <MetricCard label="Plan % Profit" value={formatPercent(sheet.grand_totals?.ytd_plan_percent_profit)} />
        <MetricCard label="Eficiencia" value={formatCount(sheet.grand_totals?.efficiency_rate, '0.0')} />
      </div>
    </section>
  );
}

function SheetPanel({ title, subtitle, sheet, columns }) {
  if (!sheet) {
    return null;
  }

  return (
    <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="px-lg py-md border-b border-outline-variant bg-surface-container-low/30">
        <h3 className="font-h3 text-h3 text-on-surface">{title}</h3>
        <p className="text-[12px] text-on-surface-variant mt-xs">{subtitle}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-container-low/20 text-on-surface-variant">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-md py-sm text-left font-medium text-[12px] uppercase tracking-wide whitespace-nowrap">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {buildGroupedRows(sheet, columns)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function buildGroupedRows(sheet, columns) {
  const elements = [];

  (sheet.groups || []).forEach((group, groupIdx) => {
    const managerName = group.manager_name || group.group_name;
    const members = group.members || [];

    // Spacer between groups (not before the first)
    if (groupIdx > 0) {
      elements.push(
        <tr key={`spacer-${groupIdx}`}>
          <td colSpan={columns.length} className="h-6 p-0 border-0 bg-surface-container-low/5" />
        </tr>
      );
    }

    members.forEach((member, memberIdx) => {
      const row = { type: 'member', group: managerName, ...member };
      elements.push(
        <tr
          key={`member-${groupIdx}-${memberIdx}`}
          className="border-t border-outline-variant/60 hover:bg-surface-container-low/10"
        >
          {columns.map((column) => {
            const colorClass = getCellColorClass(row, column);
            return (
              <td
                key={column.key}
                className={`px-md py-sm whitespace-nowrap align-middle ${colorClass || 'text-on-surface'}`}
              >
                {/* Show group name only in first member row */}
                {column.key === 'group'
                  ? (memberIdx === 0 ? managerName : '')
                  : renderCell(row, column)}
              </td>
            );
          })}
        </tr>
      );
    });

    // Group total row
    const totalRow = {
      type: 'group-total',
      group: `Total ${managerName}`,
      seller_name: '',
      market_segment: '',
      months_in_role_label: '',
      ...group.totals,
    };
    elements.push(
      <tr
        key={`group-total-${groupIdx}`}
        className="bg-surface-container-low/30 border-t border-outline-variant/70"
      >
        {columns.map((column) => {
          const colorClass = getCellColorClass(totalRow, column);
          return (
            <td
              key={column.key}
              className={`px-md py-sm whitespace-nowrap align-middle font-medium ${colorClass || 'text-on-surface'}`}
            >
              {renderCell(totalRow, column)}
            </td>
          );
        })}
      </tr>
    );
  });

  // Grand total row
  const grandRow = {
    type: 'grand-total',
    group: 'TOTAL',
    seller_name: '',
    market_segment: '',
    months_in_role_label: '',
    ...sheet.grand_totals,
  };
  elements.push(
    <tr key="grand-total" className="bg-primary/10 border-t border-primary/15">
      {columns.map((column) => {
        const colorClass = getCellColorClass(grandRow, column);
        return (
          <td
            key={column.key}
            className={`px-md py-sm whitespace-nowrap align-middle font-semibold ${colorClass || 'text-on-surface'}`}
          >
            {renderCell(grandRow, column)}
          </td>
        );
      })}
    </tr>
  );

  return elements;
}

function getCellColorClass(row, column) {
  if (column.key === 'ytd_plan_percent_revenue' || column.key === 'ytd_plan_percent_profit') {
    return getPlanPercentColor(row[column.key]);
  }
  if (column.key === 'efficiency_rate') {
    return getEfficiencyColor(row[column.key]);
  }
  return '';
}

function renderCell(row, column) {
  if (column.key === 'group') {
    return row.group || '—';
  }

  const value = row[column.key];
  if (column.type === 'currency') {
    return formatCurrency(value);
  }
  if (column.type === 'percent') {
    return formatPercent(value);
  }
  if (column.type === 'count') {
    return formatCount(value, '0.0');
  }

  return value || '—';
}

// ─── Seller Efficiency Chart ────────────────────────────────────────────────
function EfficiencyChart({ sheet }) {
  if (!sheet) return null;

  // Collect only member rows (no totals)
  const sellers = [];
  (sheet.groups || []).forEach((group) => {
    (group.members || []).forEach((member) => {
      if (member.is_other_row) {
        return;
      }

      sellers.push({
        name: member.seller_name || '—',
        efficiency: member.efficiency_rate ?? 0,
      });
    });
  });

  if (sellers.length === 0) return null;

  // Sort descending
  const sorted = [...sellers].sort((a, b) => b.efficiency - a.efficiency);
  const names = sorted.map((s) => s.name);
  const values = sorted.map((s) => ({
    value: s.efficiency,
    itemStyle: { color: getEfficiencyHex(s.efficiency) },
    label: { show: true, position: 'right', formatter: (p) => p.value.toFixed(2) },
  }));

  const option = {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const p = params[0];
        return `<b>${p.name}</b><br/>Eficiencia: <b>${Number(p.value).toFixed(2)}</b>`;
      },
    },
    grid: { left: '2%', right: '12%', top: '4%', bottom: '4%', containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { fontSize: 11, color: '#64748b' },
      splitLine: { lineStyle: { color: '#e2e8f0' } },
    },
    yAxis: {
      type: 'category',
      data: names,
      inverse: true,
      axisLabel: { fontSize: 11, color: '#334155', width: 140, overflow: 'truncate' },
    },
    series: [
      {
        type: 'bar',
        data: values,
        barMaxWidth: 28,
        label: { show: true, position: 'right', color: '#334155', fontSize: 11,
          formatter: (p) => Number(p.value).toFixed(2) },
      },
    ],
  };

  const chartHeight = Math.max(160, sorted.length * 36 + 40);

  return (
    <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="px-lg py-md border-b border-outline-variant bg-surface-container-low/30 flex flex-wrap items-center justify-between gap-sm">
        <div>
          <h3 className="font-h3 text-h3 text-on-surface">Eficiencia por vendedor</h3>
          <p className="text-[12px] text-on-surface-variant mt-xs">Ratio YTD Profit / Salary Fully Loaded</p>
        </div>
        <div className="flex items-center gap-sm text-[11px] text-on-surface-variant">
          <span className="flex items-center gap-xs"><span className="inline-block w-3 h-3 rounded-sm bg-green-500" /> ≥ 7</span>
          <span className="flex items-center gap-xs"><span className="inline-block w-3 h-3 rounded-sm bg-yellow-400" /> 5 – 6.99</span>
          <span className="flex items-center gap-xs"><span className="inline-block w-3 h-3 rounded-sm bg-red-400" /> &lt; 5</span>
        </div>
      </div>
      <div className="p-lg">
        <ReactECharts option={option} style={{ height: chartHeight }} notMerge />
      </div>
    </section>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-low p-md">
      <p className="text-[12px] uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className="font-h3 text-h3 text-on-surface mt-sm">{value}</p>
    </div>
  );
}