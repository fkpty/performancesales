import { useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { fetchLifecycleDetails } from '../../services/api';
import useContractStore from '../../store/contractStore';
import LifecycleContractsModal from './LifecycleContractsModal';
import Spinner from '../ui/Spinner';

const CHART_THEME = {
  text: '#64748b',
  axis: '#94a3b8',
  grid: '#e2e8f0',
  primary: '#01a1e1',
  cancelled: '#ef4444',
  expired: '#ba1a1a',
};

function fmtCount(value) {
  return Number(value || 0).toLocaleString('es-ES');
}

function buildBucketKeys(range) {
  if (!range?.startDate || !range?.endDate) return [];

  const buckets = [];
  const cursor = new Date(`${range.startDate}T00:00:00Z`);
  const end = new Date(`${range.endDate}T00:00:00Z`);

  cursor.setUTCDate(1);
  end.setUTCDate(1);

  while (cursor <= end) {
    const year = cursor.getUTCFullYear();
    const month = String(cursor.getUTCMonth() + 1).padStart(2, '0');
    buckets.push(`${year}-${month}`);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return buckets;
}

function buildDateParams({ period, year, month, quarter, startDate, endDate }) {
  const params = { period, year };

  if (period === 'mensual') {
    params.month = month;
  }

  if (period === 'trimestral') {
    params.quarter = quarter;
  }

  if (period === 'personalizado') {
    params.startDate = startDate;
    params.endDate = endDate;
  }

  return params;
}

export default function RevenueLineChart() {
  const charts  = useContractStore(s => s.charts);
  const loading = useContractStore(s => s.chartsLoading);
  const period = useContractStore(s => s.period);
  const year = useContractStore(s => s.year);
  const month = useContractStore(s => s.month);
  const quarter = useContractStore(s => s.quarter);
  const startDate = useContractStore(s => s.startDate);
  const endDate = useContractStore(s => s.endDate);
  const filters = useContractStore(s => s.filters);

  const lifecycle = charts?.contractLifecycle;
  const bucketKeys = buildBucketKeys(charts?.range);
  const requestIdRef = useRef(0);
  const [detailModal, setDetailModal] = useState({
    open: false,
    monthLabel: '',
    defaultTab: 'new',
    loading: false,
    error: '',
    detail: null,
  });

  const openMonthDetail = async (monthIndex, preferredTab) => {
    const bucket = bucketKeys[monthIndex];
    const monthLabel = lifecycle?.months?.[monthIndex] || '';

    if (!bucket || monthIndex < 0) return;

    const requestId = ++requestIdRef.current;
    setDetailModal({
      open: true,
      monthLabel,
      defaultTab: preferredTab,
      loading: true,
      error: '',
      detail: null,
    });

    try {
      const detail = await fetchLifecycleDetails({
        ...buildDateParams({ period, year, month, quarter, startDate, endDate }),
        ...filters,
        bucket,
      });

      if (requestId !== requestIdRef.current) return;

      setDetailModal({
        open: true,
        monthLabel: detail.month || monthLabel,
        defaultTab: preferredTab,
        loading: false,
        error: '',
        detail,
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) return;

      setDetailModal({
        open: true,
        monthLabel,
        defaultTab: preferredTab,
        loading: false,
        error: error.response?.data?.error || error.message || 'No se pudo cargar el detalle del mes seleccionado.',
        detail: null,
      });
    }
  };

  const onEvents = {
    click: (params) => {
      const isMonthClick = params?.componentType === 'series' || params?.componentType === 'xAxis';
      if (!isMonthClick) return;

      const label = typeof params?.name === 'string' && params.name
        ? params.name
        : typeof params?.value === 'string'
          ? params.value
          : '';
      const monthIndex = Number.isInteger(params?.dataIndex)
        ? params.dataIndex
        : lifecycle?.months?.findIndex(item => item === label);

      if (monthIndex == null || monthIndex < 0) return;

      let preferredTab = 'new';
      if (params.seriesName === 'Cancelados') {
        preferredTab = 'cancelled';
      } else if (params.seriesName === 'Vencidos') {
        preferredTab = 'expired';
      } else if (!params.seriesName) {
        const newValue = Number(lifecycle?.newContracts?.[monthIndex] || 0);
        const cancelledValue = Number(lifecycle?.cancelledContracts?.[monthIndex] || 0);
        const expiredValue = Number(lifecycle?.expiredContracts?.[monthIndex] || 0);
        if (newValue === 0) {
          if (cancelledValue > 0 && expiredValue === 0) {
            preferredTab = 'cancelled';
          } else if (expiredValue > 0 && cancelledValue === 0) {
            preferredTab = 'expired';
          } else if (cancelledValue > 0 || expiredValue > 0) {
            preferredTab = cancelledValue >= expiredValue ? 'cancelled' : 'expired';
          }
        }
      }

      openMonthDetail(monthIndex, preferredTab);
    },
  };

  const option = {
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const lines = params.map(p => `${p.marker} ${p.seriesName}: ${fmtCount(p.value)}`);
        return `<b>${params[0]?.axisValue}</b><br/>${lines.join('<br/>')}`;
      },
    },
    legend: {
      data: ['Contratos nuevos', 'Cancelados', 'Vencidos'],
      bottom: 0,
      textStyle: { color: CHART_THEME.text, fontSize: 12, fontFamily: 'Inter' },
    },
    grid: { left: 8, right: 8, top: 8, bottom: 40, containLabel: true },
    xAxis: {
      type: 'category',
      data: lifecycle?.months || [],
      triggerEvent: true,
      axisLabel: { color: CHART_THEME.text, fontSize: 11, fontFamily: 'Inter' },
      axisLine: { lineStyle: { color: CHART_THEME.axis } },
    },
    yAxis: {
      type:  'value',
      axisLabel: {
        color:      CHART_THEME.text,
        fontSize:   11,
        fontFamily: 'Inter',
        formatter:  fmtCount,
      },
      minInterval: 1,
      splitLine: { lineStyle: { color: CHART_THEME.grid } },
    },
    series: [
      {
        name:      'Contratos nuevos',
        type:      'line',
        smooth:    true,
        data:      lifecycle?.newContracts || [],
        lineStyle: { color: CHART_THEME.primary, width: 2.5 },
        itemStyle: { color: CHART_THEME.primary },
        areaStyle: { color: 'rgba(1,161,225,0.10)' },
        symbol: 'circle',
        symbolSize: 6,
      },
      {
        name:      'Cancelados',
        type:      'line',
        smooth:    true,
        data:      lifecycle?.cancelledContracts || [],
        lineStyle: { color: CHART_THEME.cancelled, width: 2.25 },
        itemStyle: { color: CHART_THEME.cancelled },
        areaStyle: { color: 'rgba(239,68,68,0.10)' },
        symbol: 'circle',
        symbolSize: 5,
      },
      {
        name:      'Vencidos',
        type:      'line',
        smooth:    true,
        data:      lifecycle?.expiredContracts || [],
        lineStyle: { color: CHART_THEME.expired, width: 2.25 },
        itemStyle: { color: CHART_THEME.expired },
        areaStyle: { color: 'rgba(186,26,26,0.08)' },
        symbol: 'circle',
        symbolSize: 5,
      },
    ],
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl border border-outline-variant shadow-sm p-md flex flex-col h-full">
      <h3 className="font-h3 text-h3 text-on-surface mb-md">Contratos nuevos vs cancelados y vencidos</h3>
      <p className="text-[12px] text-on-surface-variant mb-sm">Haz clic en un mes para ver el detalle de contratos correspondientes.</p>
      {loading ? (
        <div className="flex-1 flex items-center justify-center"><Spinner /></div>
      ) : !(lifecycle?.months?.length) ? (
        <div className="flex-1 flex items-center justify-center text-on-surface-variant font-body-sm">
          No hay datos de contratos disponibles para el periodo.
        </div>
      ) : (
        <ReactECharts option={option} style={{ flex: 1, minHeight: 0 }} onEvents={onEvents} />
      )}
      <LifecycleContractsModal
        open={detailModal.open}
        monthLabel={detailModal.monthLabel}
        detail={detailModal.detail}
        loading={detailModal.loading}
        error={detailModal.error}
        defaultTab={detailModal.defaultTab}
        onClose={() => {
          requestIdRef.current += 1;
          setDetailModal(current => ({ ...current, open: false }));
        }}
      />
    </div>
  );
}
