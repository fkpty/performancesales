import ReactECharts from 'echarts-for-react';
import useContractStore from '../../store/contractStore';
import { formatUsdCurrency } from '../../utils/currency';
import Spinner from '../ui/Spinner';

const CHART_THEME = {
  text: '#64748b',
  axis: '#94a3b8',
  grid: '#e2e8f0',
};

const RISK_SERIES_META = {
  RIESGO:         { label: 'Crítico',    color: '#ef4444', emphasis: '#dc2626' },
  HASTA_6_MESES:  { label: 'Precaución', color: '#fbbf24', emphasis: '#f59e0b' },
  MAS_DE_6_MESES: { label: 'Estable',    color: '#10b981', emphasis: '#059669' },
};

function sanitizeBusinessLabel(value) {
  const label = String(value || '').trim();
  if (/^sin\s+(clasificar|negocio)$/i.test(label)) {
    return '';
  }

  return label;
}

function fmtContracts(value) {
  const count = Number(value || 0);
  return `${count.toLocaleString('es-ES')} contrato${count === 1 ? '' : 's'}`;
}

export default function RiskBarChart() {
  const charts  = useContractStore(s => s.charts);
  const loading = useContractStore(s => s.chartsLoading);

  const risk = charts?.revenueAtRisk;
  const labels = risk?.labels || risk?.months || [];
  const stackedSeries = (Array.isArray(risk?.series) ? risk.series : [])
    .map((series) => {
      const meta = RISK_SERIES_META[series.key] || { label: series.label || series.key, color: '#94a3b8', emphasis: '#64748b' };
      const values = labels.map((_, index) => Number(series.values?.[index] || 0));
      const counts = labels.map((_, index) => Number(series.counts?.[index] || 0));

      if (values.every(value => value <= 0)) {
        return null;
      }

      return {
        name: meta.label,
        type: 'bar',
        emphasis: { focus: 'series', itemStyle: { color: meta.emphasis } },
        itemStyle: { color: meta.color },
        data: values.map((value, index) => ({
          value,
          contractCount: counts[index],
        })),
      };
    })
    .filter(Boolean);

  const fallbackSeries = labels
    .map((label, index) => ({ label, value: Number(risk?.values?.[index] || 0) }))
    .filter(item => item.value > 0);

  const hasStackedSeries = stackedSeries.length > 0;
  const chartLabels = (hasStackedSeries ? labels : fallbackSeries.map(item => item.label))
    .map(sanitizeBusinessLabel);

  const option = {
    tooltip: hasStackedSeries
      ? {
          trigger: 'item',
          formatter: (param) => {
            const amount = Number(param.value || param.data?.value || 0);
            const contracts = Number(param.data?.contractCount || 0);
            const title = param.name ? `<b>${param.name}</b><br/>` : '';
            return `${title}${param.marker} ${param.seriesName}<br/>${fmtContracts(contracts)} · ${formatUsdCurrency(amount)}`;
          },
        }
      : {
          trigger: 'item',
          formatter: (param) => param.name
            ? `<b>${param.name}</b><br/>${formatUsdCurrency(param.value)}`
            : formatUsdCurrency(param.value),
        },
    legend: hasStackedSeries
      ? {
          bottom: 0,
          textStyle: { color: CHART_THEME.text, fontSize: 12, fontFamily: 'Inter' },
        }
      : undefined,
    grid: { left: 8, right: 8, top: 8, bottom: hasStackedSeries ? 40 : 8, containLabel: true },
    xAxis: {
      type: 'category',
      data: chartLabels,
      axisLabel: { color: CHART_THEME.text, fontSize: 11, fontFamily: 'Inter', rotate: chartLabels.length > 5 ? 25 : 0 },
      axisLine:  { lineStyle: { color: CHART_THEME.axis } },
    },
    yAxis: {
      type:  'value',
      axisLabel: {
        color:      CHART_THEME.text,
        fontSize:   11,
        fontFamily: 'Inter',
        formatter:  formatUsdCurrency,
      },
      splitLine: { lineStyle: { color: CHART_THEME.grid } },
    },
    series: hasStackedSeries
      ? stackedSeries
          .map(series => ({
            ...series,
            barMaxWidth: 28,
            itemStyle: {
              ...series.itemStyle,
              borderRadius: [4, 4, 0, 0],
            },
          }))
      : [{
          type: 'bar',
          data: fallbackSeries.map(item => item.value),
          itemStyle: {
            color: '#ef4444',
            borderRadius: [4, 4, 0, 0],
          },
          emphasis: { itemStyle: { color: '#dc2626' } },
        }],
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-md flex flex-col h-full">
      <h3 className="font-h3 text-h3 text-on-surface mb-md">Ingresos en riesgo por negocio</h3>
      <p className="text-[12px] text-on-surface-variant mb-sm">
        Crítico hasta 90 días, Precaución hasta 180 días y Estable después de 180 días.
      </p>
      {loading ? (
        <div className="flex-1 flex items-center justify-center"><Spinner /></div>
      ) : chartLabels.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-on-surface-variant font-body-sm">
          No hay ingresos en riesgo para el periodo seleccionado
        </div>
      ) : (
        <ReactECharts option={option} style={{ flex: 1, minHeight: 0 }} />
      )}
    </div>
  );
}
