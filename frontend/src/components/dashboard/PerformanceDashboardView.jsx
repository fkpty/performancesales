import ReactECharts from 'echarts-for-react';
import usePerformancePageScope from '../../hooks/usePerformancePageScope';
import usePerformanceStore from '../../store/performanceStore';
import {
  formatCount,
  formatCurrency,
  formatDateTime,
  formatPercent,
  formatReportType,
} from '../../utils/formatters';

const REPORT_TYPE_PALETTE = {
  xerox: { revenue: '#005f73', profit: '#0a9396' },
  it: { revenue: '#ee9b00', profit: '#ca6702' },
  postventas: { revenue: '#5b8c5a', profit: '#2f5d50' },
};

const FALLBACK_PALETTE = [
  { revenue: '#35607a', profit: '#2f4858' },
  { revenue: '#9c6644', profit: '#7f5539' },
  { revenue: '#52796f', profit: '#354f52' },
];

const VIEW_CONFIG = {
  dashboard: {
    scope: 'dashboard',
    eyebrow: 'Panel principal',
    title: 'Xerox e IT',
    description: 'Consolida unicamente Xerox e IT. Post Ventas se mantiene operativo en Eficiencia y ahora vive en su propio panel.',
    loadingMessage: 'Cargando panel principal de Performance Sales...',
    trendSubtitle: 'Revenue y gross profit del snapshot activo por mes.',
    showReportTypeBreakdown: true,
    breakdownTitle: 'Mix por tipo',
    breakdownSubtitle: 'Comparativo actual entre Xerox e IT.',
    topSalespeopleSubtitle: 'Ordenados por gross profit acumulado en Xerox e IT.',
    topClientsSubtitle: 'Clientes con mayor revenue en el snapshot activo de Xerox e IT.',
    uploadsSubtitle: 'Historial reciente de lotes cargados para Xerox e IT.',
    reportTypes: ['xerox', 'it'],
  },
  postventas: {
    scope: 'postventas',
    eyebrow: 'Panel especializado',
    title: 'Post Ventas',
    description: 'Vista dedicada para seguir exclusivamente las cargas y el rendimiento de Post Ventas sin contaminar el panel principal.',
    loadingMessage: 'Cargando panel de Post Ventas...',
    trendSubtitle: 'Revenue y gross profit del snapshot activo de Post Ventas por mes.',
    showReportTypeBreakdown: false,
    breakdownTitle: 'Resumen operativo',
    breakdownSubtitle: 'Indicadores del snapshot activo de Post Ventas.',
    topSalespeopleSubtitle: 'Ordenados por gross profit acumulado de Post Ventas.',
    topClientsSubtitle: 'Clientes con mayor revenue en el snapshot activo de Post Ventas.',
    uploadsSubtitle: 'Historial reciente de lotes cargados para Post Ventas.',
    reportTypes: ['postventas'],
  },
};

export default function PerformanceDashboardView({ viewKey = 'dashboard' }) {
  const view = VIEW_CONFIG[viewKey] || VIEW_CONFIG.dashboard;

  usePerformancePageScope(view.scope, 'dashboard');

  const overview = usePerformanceStore((state) => state.overview);
  const overviewLoading = usePerformanceStore((state) => state.overviewLoading);
  const overviewError = usePerformanceStore((state) => state.overviewError);
  const uploads = usePerformanceStore((state) => state.uploads.data);
  const uploadsLoading = usePerformanceStore((state) => state.uploads.loading);

  const summary = overview?.summary || {};
  const monthlyTrend = overview?.monthlyTrend || [];
  const reportTypeBreakdown = overview?.reportTypeBreakdown || [];
  const topSalespeople = overview?.topSalespeople || [];
  const topClients = overview?.topClients || [];
  const visibleReportTypes = resolveVisibleReportTypes(view.reportTypes, monthlyTrend, reportTypeBreakdown);

  return (
    <div className="space-y-lg">
      <section className="rounded-[28px] border border-outline-variant bg-[linear-gradient(135deg,#f4f9fb_0%,#ffffff_60%,#eef4f6_100%)] px-xl py-xl shadow-sm">
        <p className="text-[12px] uppercase tracking-[0.24em] text-primary/80">{view.eyebrow}</p>
        <div className="mt-sm flex flex-col gap-lg xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl space-y-sm">
            <h2 className="font-h1 text-[clamp(2rem,4vw,3.25rem)] leading-none text-on-surface">{view.title}</h2>
            <p className="max-w-2xl text-body-sm text-on-surface-variant">{view.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-sm xl:min-w-[28rem]">
            <HeroStat label="Facturas" value={formatCount(summary.invoices_count)} />
            <HeroStat label="Lotes activos" value={formatCount(summary.active_batches)} />
            <HeroStat label="Meses activos" value={formatCount(summary.active_months)} />
            <HeroStat label="Cantidad total" value={formatCount(summary.total_quantity)} />
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-md md:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Revenue total" value={formatCurrency(summary.total_revenue)} helper={`${formatCount(summary.rows_count)} filas activas`} icon="payments" />
        <MetricCard label="Gross Profit" value={formatCurrency(summary.total_gross_profit)} helper={`${formatPercent(summary.weighted_margin)} margen ponderado`} icon="trending_up" />
        <MetricCard label="Ultima carga" value={summary.last_upload_at ? formatDateTime(summary.last_upload_at) : '—'} helper={`${formatCount(summary.active_months)} mes${summary.active_months === 1 ? '' : 'es'} con snapshot activo`} icon="schedule" />
      </section>

      {(overviewLoading || uploadsLoading) && (
        <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest px-lg py-xl text-center text-on-surface-variant shadow-sm">
          {view.loadingMessage}
        </section>
      )}

      {overviewError && (
        <section className="rounded-2xl border border-red-200 bg-red-50 px-lg py-md text-red-700">
          {overviewError}
        </section>
      )}

      <section className="grid grid-cols-1 gap-md xl:grid-cols-[1.7fr,1fr]">
        <Card title="Tendencia mensual" subtitle={view.trendSubtitle}>
          {monthlyTrend.length ? (
            <ReactECharts option={buildMonthlyTrendOption(monthlyTrend, visibleReportTypes)} style={{ height: 320 }} notMerge lazyUpdate />
          ) : (
            <EmptyState message="Aun no hay datos para construir la tendencia mensual." />
          )}
        </Card>

        {view.showReportTypeBreakdown ? (
          <Card title={view.breakdownTitle} subtitle={view.breakdownSubtitle}>
            {reportTypeBreakdown.length ? (
              <ReactECharts option={buildReportTypeOption(reportTypeBreakdown)} style={{ height: 320 }} notMerge lazyUpdate />
            ) : (
              <EmptyState message="Carga al menos un reporte para ver el mix por tipo." />
            )}
          </Card>
        ) : (
          <Card title={view.breakdownTitle} subtitle={view.breakdownSubtitle}>
            <SummarySnapshotCard summary={summary} />
          </Card>
        )}
      </section>

      <section className="grid grid-cols-1 gap-md xl:grid-cols-2">
        <Card title="Top ejecutivos" subtitle={view.topSalespeopleSubtitle}>
          <CompactTable
            rows={topSalespeople}
            emptyMessage="No hay ejecutivos para mostrar en el periodo seleccionado."
            columns={[
              { key: 'sales_person_name', label: 'Ejecutivo' },
              { key: 'total_revenue', label: 'Revenue', render: (row) => formatCurrency(row.total_revenue) },
              { key: 'total_gross_profit', label: 'Gross Profit', render: (row) => formatCurrency(row.total_gross_profit) },
              { key: 'weighted_margin', label: 'Margen', render: (row) => formatPercent(row.weighted_margin) },
            ]}
          />
        </Card>

        <Card title="Top clientes" subtitle={view.topClientsSubtitle}>
          <CompactTable
            rows={topClients}
            emptyMessage="No hay clientes para mostrar en el periodo seleccionado."
            columns={[
              { key: 'client_name', label: 'Cliente' },
              { key: 'rows_count', label: 'Filas', render: (row) => formatCount(row.rows_count) },
              { key: 'total_revenue', label: 'Revenue', render: (row) => formatCurrency(row.total_revenue) },
              { key: 'total_gross_profit', label: 'Gross Profit', render: (row) => formatCurrency(row.total_gross_profit) },
            ]}
          />
        </Card>
      </section>

      <Card title="Ultimas cargas" subtitle={view.uploadsSubtitle}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-container-low/30 text-on-surface-variant">
              <tr>
                <Th>Mes</Th>
                <Th>Tipo</Th>
                <Th>Archivo</Th>
                <Th className="text-right">Registros</Th>
                <Th className="text-right">Revenue</Th>
                <Th className="text-right">Gross Profit</Th>
                <Th>Subido</Th>
              </tr>
            </thead>
            <tbody>
              {!uploadsLoading && uploads.slice(0, 6).map((upload) => (
                <tr key={upload.id} className="border-t border-outline-variant/70 hover:bg-surface-container-low/20">
                  <Td>{upload.month_label}</Td>
                  <Td>{formatReportType(upload.report_type)}</Td>
                  <Td className="max-w-[26rem] truncate">{upload.filename}</Td>
                  <Td className="text-right">{formatCount(upload.records_imported)}</Td>
                  <Td className="text-right">{formatCurrency(upload.total_revenue)}</Td>
                  <Td className="text-right">{formatCurrency(upload.total_gross_profit)}</Td>
                  <Td>{formatDateTime(upload.created_at)}</Td>
                </tr>
              ))}
              {!uploadsLoading && uploads.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-lg py-xl text-center text-on-surface-variant">
                    No hay cargas registradas todavia.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function HeroStat({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/80 px-md py-sm shadow-sm backdrop-blur-sm">
      <p className="text-[11px] uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className="mt-xs font-h3 text-h3 text-on-surface">{value}</p>
    </div>
  );
}

function SummarySnapshotCard({ summary }) {
  const items = [
    { label: 'Facturas activas', value: formatCount(summary.invoices_count) },
    { label: 'Lotes activos', value: formatCount(summary.active_batches) },
    { label: 'Cantidad total', value: formatCount(summary.total_quantity) },
    { label: 'Margen ponderado', value: formatPercent(summary.weighted_margin) },
  ];

  return (
    <div className="grid grid-cols-1 gap-sm sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-outline-variant bg-surface-container-low/20 px-md py-md">
          <p className="text-[12px] uppercase tracking-wide text-on-surface-variant">{item.label}</p>
          <p className="mt-xs font-h3 text-h3 text-on-surface">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function MetricCard({ label, value, helper, icon }) {
  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-lg shadow-sm">
      <div className="flex items-start justify-between gap-md">
        <div>
          <p className="text-[12px] uppercase tracking-wide text-on-surface-variant">{label}</p>
          <p className="mt-sm font-h2 text-h2 text-on-surface">{value}</p>
          <p className="mt-sm text-[12px] text-on-surface-variant">{helper}</p>
        </div>
        <span className="material-symbols-outlined text-[24px] text-primary">{icon}</span>
      </div>
    </div>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-lowest shadow-sm">
      <div className="border-b border-outline-variant bg-surface-container-low/30 px-lg py-md">
        <h2 className="font-h3 text-h3 text-on-surface">{title}</h2>
        {subtitle && <p className="mt-xs text-[12px] text-on-surface-variant">{subtitle}</p>}
      </div>
      <div className="p-lg">{children}</div>
    </section>
  );
}

function CompactTable({ rows, columns, emptyMessage }) {
  if (!rows.length) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-surface-container-low/30 text-on-surface-variant">
          <tr>
            {columns.map((column) => <Th key={column.key}>{column.label}</Th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row[columns[0].key]}-${index}`} className="border-t border-outline-variant/70 hover:bg-surface-container-low/20">
              {columns.map((column) => (
                <Td key={column.key}>{column.render ? column.render(row) : row[column.key]}</Td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyState({ message }) {
  return <div className="py-16 text-center text-on-surface-variant">{message}</div>;
}

function Th({ children, className = '' }) {
  return <th className={`px-md py-sm text-left text-[12px] font-medium uppercase tracking-wide ${className}`}>{children}</th>;
}

function Td({ children, className = '' }) {
  return <td className={`px-md py-sm text-on-surface ${className}`}>{children}</td>;
}

function buildMonthlyTrendOption(rows, reportTypes) {
  const labels = Array.from(new Set(rows.map((row) => row.month_label)));
  const visibleReportTypes = reportTypes.filter((reportType) => rows.some((row) => row.report_type === reportType));
  const colors = visibleReportTypes.flatMap((reportType, index) => {
    const palette = resolveReportTypePalette(reportType, index);
    return [palette.revenue, palette.profit];
  });

  return {
    color: colors,
    tooltip: { trigger: 'axis' },
    legend: {
      bottom: 0,
      textStyle: { color: '#51606d' },
    },
    grid: { left: 18, right: 18, top: 24, bottom: 56, containLabel: true },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: '#c7d7e0' } },
      axisLabel: { color: '#51606d' },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#51606d' },
      splitLine: { lineStyle: { color: '#e4edf2' } },
    },
    series: visibleReportTypes.flatMap((reportType, index) => {
      const reportTypeLabel = formatReportType(reportType);
      const palette = resolveReportTypePalette(reportType, index);

      return [
        {
          name: `${reportTypeLabel} Revenue`,
          type: 'bar',
          stack: 'revenue',
          itemStyle: { color: palette.revenue },
          data: labels.map((label) => findMetric(rows, label, reportType, 'total_revenue')),
        },
        {
          name: `${reportTypeLabel} Gross Profit`,
          type: 'line',
          smooth: true,
          lineStyle: { width: 3, color: palette.profit },
          itemStyle: { color: palette.profit },
          data: labels.map((label) => findMetric(rows, label, reportType, 'total_gross_profit')),
        },
      ];
    }),
  };
}

function buildReportTypeOption(rows) {
  return {
    color: rows.map((row, index) => resolveReportTypePalette(row.report_type, index).revenue),
    tooltip: { trigger: 'item' },
    legend: {
      bottom: 0,
      textStyle: { color: '#51606d' },
    },
    series: [
      {
        type: 'pie',
        radius: ['48%', '72%'],
        center: ['50%', '45%'],
        label: {
          formatter: ({ data }) => `${formatReportType(data.name)}\n${formatCurrency(data.value)}`,
        },
        data: rows.map((row) => ({
          name: row.report_type,
          value: row.total_revenue,
        })),
      },
    ],
  };
}

function findMetric(rows, monthLabel, reportType, metric) {
  return rows.find((row) => row.month_label === monthLabel && row.report_type === reportType)?.[metric] || 0;
}

function resolveReportTypePalette(reportType, index) {
  return REPORT_TYPE_PALETTE[reportType] || FALLBACK_PALETTE[index % FALLBACK_PALETTE.length];
}

function resolveVisibleReportTypes(expectedReportTypes, monthlyTrend, reportTypeBreakdown) {
  const presentReportTypes = new Set([
    ...monthlyTrend.map((row) => row.report_type),
    ...reportTypeBreakdown.map((row) => row.report_type),
  ]);

  return expectedReportTypes.filter((reportType) => presentReportTypes.has(reportType));
}