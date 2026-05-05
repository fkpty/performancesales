import { useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
import usePerformanceStore from '../store/performanceStore';
import {
  formatCount,
  formatCurrency,
  formatDateTime,
  formatPercent,
  formatReportType,
} from '../utils/formatters';

export default function DashboardPage() {
  const loadAll = usePerformanceStore(s => s.loadAll);
  const overview = usePerformanceStore(s => s.overview);
  const overviewLoading = usePerformanceStore(s => s.overviewLoading);
  const overviewError = usePerformanceStore(s => s.overviewError);
  const uploads = usePerformanceStore(s => s.uploads.data);
  const uploadsLoading = usePerformanceStore(s => s.uploads.loading);

  useEffect(() => {
    loadAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = overview?.summary || {};
  const monthlyTrend = overview?.monthlyTrend || [];
  const reportTypeBreakdown = overview?.reportTypeBreakdown || [];
  const topSalespeople = overview?.topSalespeople || [];
  const topClients = overview?.topClients || [];

  return (
    <div className="space-y-lg">
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-md">
        <MetricCard label="Revenue total" value={formatCurrency(summary.total_revenue)} helper={`${formatCount(summary.rows_count)} filas activas`} icon="payments" />
        <MetricCard label="Gross Profit" value={formatCurrency(summary.total_gross_profit)} helper={`${formatPercent(summary.weighted_margin)} margen ponderado`} icon="trending_up" />
        <MetricCard label="Ultima carga" value={summary.last_upload_at ? formatDateTime(summary.last_upload_at) : '—'} helper={`${formatCount(summary.active_months)} mes${summary.active_months === 1 ? '' : 'es'} con snapshot activo`} icon="schedule" />
      </section>

      {(overviewLoading || uploadsLoading) && (
        <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm px-lg py-xl text-center text-on-surface-variant">
          Cargando panel de Performance Sales...
        </section>
      )}

      {overviewError && (
        <section className="bg-red-50 border border-red-200 rounded-2xl px-lg py-md text-red-700">
          {overviewError}
        </section>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-[1.7fr,1fr] gap-md">
        <Card title="Tendencia mensual" subtitle="Revenue y gross profit del snapshot activo por mes">
          {monthlyTrend.length ? (
            <ReactECharts option={buildMonthlyTrendOption(monthlyTrend)} style={{ height: 320 }} notMerge lazyUpdate />
          ) : (
            <EmptyState message="Aun no hay datos para construir la tendencia mensual." />
          )}
        </Card>

        <Card title="Mix por tipo" subtitle="Comparativo actual entre Xerox e IT">
          {reportTypeBreakdown.length ? (
            <ReactECharts option={buildReportTypeOption(reportTypeBreakdown)} style={{ height: 320 }} notMerge lazyUpdate />
          ) : (
            <EmptyState message="Carga al menos un reporte para ver el mix por tipo." />
          )}
        </Card>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-2 gap-md">
        <Card title="Top ejecutivos" subtitle="Ordenados por gross profit acumulado">
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

        <Card title="Top clientes" subtitle="Clientes con mayor revenue en el snapshot activo">
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

      <Card title="Ultimas cargas" subtitle="Historial reciente de lotes cargados">
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
                    No hay cargas registradas todavía.
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

function MetricCard({ label, value, helper, icon }) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm p-lg">
      <div className="flex items-start justify-between gap-md">
        <div>
          <p className="text-[12px] uppercase tracking-wide text-on-surface-variant">{label}</p>
          <p className="font-h2 text-h2 text-on-surface mt-sm">{value}</p>
          <p className="text-[12px] text-on-surface-variant mt-sm">{helper}</p>
        </div>
        <span className="material-symbols-outlined text-[24px] text-primary">{icon}</span>
      </div>
    </div>
  );
}

function Card({ title, subtitle, children }) {
  return (
    <section className="bg-surface-container-lowest rounded-2xl border border-outline-variant shadow-sm overflow-hidden">
      <div className="px-lg py-md border-b border-outline-variant bg-surface-container-low/30">
        <h2 className="font-h3 text-h3 text-on-surface">{title}</h2>
        {subtitle && <p className="text-[12px] text-on-surface-variant mt-xs">{subtitle}</p>}
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
  return <th className={`px-md py-sm text-left font-medium text-[12px] uppercase tracking-wide ${className}`}>{children}</th>;
}

function Td({ children, className = '' }) {
  return <td className={`px-md py-sm text-on-surface ${className}`}>{children}</td>;
}

function buildMonthlyTrendOption(rows) {
  const labels = Array.from(new Set(rows.map(row => row.month_label)));
  const xeroxRevenue = labels.map((label) => findMetric(rows, label, 'xerox', 'total_revenue'));
  const itRevenue = labels.map((label) => findMetric(rows, label, 'it', 'total_revenue'));
  const xeroxProfit = labels.map((label) => findMetric(rows, label, 'xerox', 'total_gross_profit'));
  const itProfit = labels.map((label) => findMetric(rows, label, 'it', 'total_gross_profit'));

  return {
    color: ['#005f73', '#ee9b00', '#0a9396', '#ca6702'],
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
    series: [
      { name: 'Xerox Revenue', type: 'bar', stack: 'revenue', data: xeroxRevenue },
      { name: 'IT Revenue', type: 'bar', stack: 'revenue', data: itRevenue },
      { name: 'Xerox Gross Profit', type: 'line', smooth: true, data: xeroxProfit },
      { name: 'IT Gross Profit', type: 'line', smooth: true, data: itProfit },
    ],
  };
}

function buildReportTypeOption(rows) {
  return {
    color: ['#005f73', '#ee9b00'],
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
