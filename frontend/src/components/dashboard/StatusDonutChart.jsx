import ReactECharts from 'echarts-for-react';
import useContractStore from '../../store/contractStore';
import Spinner from '../ui/Spinner';

const STATUS_LABELS = {
  'VIGENTE': 'Vigente',
  'VENCIDO': 'Vencido',
  'CANCELADO': 'Cancelado',
};

const CHART_THEME = {
  text: '#64748b',
  fallback: '#94a3b8',
};

// Design system colors for each status
const STATUS_COLORS = {
  'VIGENTE':   '#131b2e',
  'VENCIDO':   '#ba1a1a',
  'CANCELADO': '#ef4444',
};

export default function StatusDonutChart() {
  const charts      = useContractStore(s => s.charts);
  const loading     = useContractStore(s => s.chartsLoading);
  const setFilter   = useContractStore(s => s.setChartFilter);
  const chartFilter = useContractStore(s => s.chartFilter);

  const data = charts?.doughnut || [];

  const option = {
    tooltip: {
      trigger: 'item',
      formatter: params => `${STATUS_LABELS[params.name] || params.name}: ${params.value} (${params.percent}%)`,
    },
    legend: {
      orient:  'vertical',
      right:   0,
      top:     'middle',
      formatter: value => STATUS_LABELS[value] || value,
      textStyle: { color: CHART_THEME.text, fontSize: 12, fontFamily: 'Inter' },
    },
    series: [{
      type:       'pie',
      radius:     ['45%', '72%'],
      center:     ['38%', '50%'],
      avoidLabelOverlap: false,
      label:      { show: false },
      emphasis: {
        label:      { show: true, fontSize: 13, fontWeight: 'bold', fontFamily: 'Inter' },
        itemStyle:  { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.2)' },
      },
      data: data.map(d => ({
        name:      d.name,
        label:     STATUS_LABELS[d.name] || d.name,
        value:     d.value,
        itemStyle: {
          color:   STATUS_COLORS[d.name] || CHART_THEME.fallback,
          opacity: chartFilter && chartFilter !== d.name ? 0.35 : 1,
        },
      })),
    }],
  };

  const onEvents = {
    click: (params) => setFilter(params.name),
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-md flex flex-col h-full">
      <h3 className="font-h3 text-h3 text-on-surface mb-md">Estado de contratos</h3>
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Spinner />
        </div>
      ) : data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-on-surface-variant font-body-sm">
          No hay datos para el periodo seleccionado
        </div>
      ) : (
        <ReactECharts
          option={option}
          style={{ flex: 1, minHeight: 0 }}
          onEvents={onEvents}
        />
      )}
    </div>
  );
}
