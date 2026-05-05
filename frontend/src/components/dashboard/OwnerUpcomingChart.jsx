import ReactECharts from 'echarts-for-react';
import { useState } from 'react';
import { fetchContracts } from '../../services/api';
import useContractStore from '../../store/contractStore';
import { formatUsdCurrency } from '../../utils/currency';
import OwnerContractsDetailModal from './OwnerContractsDetailModal';
import Spinner from '../ui/Spinner';

const CHART_THEME = {
  text:    '#64748b',
  axis:    '#94a3b8',
  grid:    '#e2e8f0',
  bar:     '#f59e0b',
  barHover:'#d97706',
  heatText:'#7c2d12',
};

export default function OwnerUpcomingChart() {
  const rows    = useContractStore(s => s.ownerUpcoming);
  const loading = useContractStore(s => s.ownerUpcomingLoading);
  const period = useContractStore(s => s.period);
  const year = useContractStore(s => s.year);
  const month = useContractStore(s => s.month);
  const quarter = useContractStore(s => s.quarter);
  const startDate = useContractStore(s => s.startDate);
  const endDate = useContractStore(s => s.endDate);
  const filters = useContractStore(s => s.filters);
  const [detailState, setDetailState] = useState({ open: false, owner: '', periodLabel: '', rows: [], loading: false, error: '' });

  const sorted  = [...(rows || [])].sort((a, b) => b.contractCount - a.contractCount);
  const owners  = sorted.map(r => r.owner);
  const counts  = sorted.map(r => r.contractCount);
  const revenues = sorted.map(r => r.totalRevenue);
  const monthLabels = sorted[0]?.monthlyBreakdown?.map(item => item.label) || [];
  const showTemporalView = monthLabels.length > 1;
  const temporalData = showTemporalView ? buildUpcomingTemporalData(sorted) : { data: [], maxCount: 0 };

  const hasData = sorted.length > 0;
  const option = showTemporalView
    ? {
        tooltip: {
          position: 'top',
          formatter: (params) => `
            <div style="font-size:13px;line-height:1.7;max-width:280px">
              <strong>${params.data.owner}</strong><br/>
              ${params.data.label}<br/>
              Contratos: <strong>${params.data.contractCount}</strong><br/>
              Monto total: <strong>${formatUsdCurrency(params.data.totalRevenue)}</strong>
            </div>`,
        },
        visualMap: {
          show: false,
          min: 0,
          max: Math.max(1, temporalData.maxCount),
          inRange: { color: ['#fff7ed', '#fdba74', '#fb923c', '#d97706'] },
        },
        grid: { left: '2%', right: '2%', top: '4%', bottom: '6%', containLabel: true },
        xAxis: {
          type: 'category',
          data: monthLabels,
          axisLabel: {
            color: CHART_THEME.text,
            fontSize: 11,
            rotate: monthLabels.length > 6 ? 30 : 0,
          },
          axisLine: { lineStyle: { color: CHART_THEME.grid } },
        },
        yAxis: {
          type: 'category',
          data: owners,
          inverse: true,
          axisLabel: {
            color: CHART_THEME.text,
            fontSize: 11,
            width: 140,
            overflow: 'truncate',
            ellipsis: '…',
          },
          axisLine: { lineStyle: { color: CHART_THEME.grid } },
        },
        series: [{
          type: 'heatmap',
          data: temporalData.data,
          label: {
            show: sorted.length <= 8,
            color: CHART_THEME.heatText,
            fontSize: 10,
            formatter: ({ data }) => data.contractCount > 0 ? String(data.contractCount) : '',
          },
          itemStyle: {
            borderColor: '#ffffff',
            borderWidth: 1,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(217,119,6,0.25)',
            },
          },
        }],
      }
    : {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (params) => {
            const idx = params[0].dataIndex;

            return `
              <div style="font-size:13px;line-height:1.6;max-width:280px">
                <strong>${owners[idx]}</strong><br/>
                Contratos: <strong>${counts[idx]}</strong><br/>
                Monto total: <strong>${formatUsdCurrency(revenues[idx])}</strong>
              </div>`;
          },
        },
        grid: { left: '2%', right: '6%', top: '4%', bottom: '4%', containLabel: true },
        xAxis: {
          type: 'value',
          minInterval: 1,
          axisLabel: { color: CHART_THEME.text, fontSize: 11 },
          splitLine: { lineStyle: { color: CHART_THEME.grid } },
        },
        yAxis: {
          type: 'category',
          data: owners,
          inverse: true,
          axisLabel: {
            color: CHART_THEME.text,
            fontSize: 11,
            width: 140,
            overflow: 'truncate',
            ellipsis: '…',
          },
          axisLine: { lineStyle: { color: CHART_THEME.grid } },
        },
        series: [{
          type:      'bar',
          data:      counts,
          itemStyle: { color: CHART_THEME.bar, borderRadius: [0, 3, 3, 0] },
          emphasis:  { itemStyle: { color: CHART_THEME.barHover } },
          label: {
            show: true,
            position: 'right',
            color: CHART_THEME.text,
            fontSize: 11,
            formatter: (p) => `${p.value}  ${formatUsdCurrency(revenues[p.dataIndex])}`,
          },
        }],
      };

  const chartHeight = showTemporalView
    ? Math.max(320, sorted.length * 34 + 56)
    : Math.max(240, sorted.length * 36 + 40);

  const buildBaseParams = () => ({
    ...filters,
    period,
    year,
    ...(period === 'mensual' ? { month } : {}),
    ...(period === 'trimestral' ? { quarter } : {}),
    ...(period === 'personalizado' ? { startDate, endDate } : {}),
  });

  const buildRangeLabel = () => {
    if (period === 'mensual') {
      return monthLabels[0] || `Mes ${month}/${year}`;
    }

    if (period === 'trimestral') {
      return `Trimestre ${quarter} ${year}`;
    }

    if (period === 'personalizado') {
      return `${startDate} a ${endDate}`;
    }

    return `Año ${year}`;
  };

  const getMonthRange = (bucket) => {
    if (!/^\d{4}-\d{2}$/.test(String(bucket || ''))) return null;

    const [bucketYear, bucketMonth] = bucket.split('-').map(Number);
    const lastDay = new Date(Date.UTC(bucketYear, bucketMonth, 0)).getUTCDate();

    return {
      startDate: `${bucket}-${String(1).padStart(2, '0')}`,
      endDate: `${bucket}-${String(lastDay).padStart(2, '0')}`,
    };
  };

  const openDetail = async ({ owner, bucket, label, count }) => {
    if (!owner || Number(count || 0) <= 0) return;

    setDetailState({ open: true, owner, periodLabel: label || buildRangeLabel(), rows: [], loading: true, error: '' });

    try {
      const bucketRange = bucket ? getMonthRange(bucket) : null;
      const data = await fetchContracts({
        ...buildBaseParams(),
        ...(bucketRange ? { period: 'personalizado', ...bucketRange } : {}),
        owner,
        table: 'upcoming',
        page: 1,
        limit: 10000,
        sortBy: 'end_date',
        sortDir: 'asc',
      });

      setDetailState({
        open: true,
        owner,
        periodLabel: label || buildRangeLabel(),
        rows: data.data || [],
        loading: false,
        error: '',
      });
    } catch (error) {
      setDetailState({
        open: true,
        owner,
        periodLabel: label || buildRangeLabel(),
        rows: [],
        loading: false,
        error: error.response?.data?.error || error.message || 'No se pudo cargar el detalle.',
      });
    }
  };

  const handleChartClick = (params) => {
    if (showTemporalView) {
      openDetail({
        owner: params.data?.owner,
        bucket: params.data?.bucket,
        label: params.data?.label,
        count: params.data?.contractCount,
      });
      return;
    }

    const row = sorted[params.dataIndex];
    openDetail({ owner: row?.owner, label: buildRangeLabel(), count: row?.contractCount });
  };

  return (
    <>
      <div className="bg-white rounded-2xl border border-outline-variant p-md flex flex-col gap-sm">
        <h3 className="font-h3 text-h3 text-on-surface">Por vencer por vendedor</h3>
        <p className="text-[12px] text-on-surface-variant -mt-xs">
          {showTemporalView
            ? 'Vista mensual por responsable. Haz clic en un cuadro para ver el detalle del mes.'
            : 'Contratos próximos a vencer en el periodo filtrado, agrupados por responsable. Haz clic en una barra para ver el detalle.'}
        </p>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Spinner />
          </div>
        ) : !hasData ? (
          <div className="flex items-center justify-center h-40 text-[13px] text-on-surface-variant">
            No hay contratos próximos a vencer para los filtros actuales.
          </div>
        ) : (
          <ReactECharts
            option={option}
            style={{ height: chartHeight, width: '100%' }}
            notMerge
            onEvents={{ click: handleChartClick }}
          />
        )}
      </div>

      <OwnerContractsDetailModal
        open={detailState.open}
        mode="upcoming"
        owner={detailState.owner}
        periodLabel={detailState.periodLabel}
        rows={detailState.rows}
        loading={detailState.loading}
        error={detailState.error}
        onClose={() => setDetailState((current) => ({ ...current, open: false }))}
      />
    </>
  );
}

function buildUpcomingTemporalData(rows = []) {
  const data = [];
  let maxCount = 0;

  rows.forEach((row, ownerIndex) => {
    (row.monthlyBreakdown || []).forEach((item, monthIndex) => {
      const contractCount = Number(item.contractCount || 0);
      const totalRevenue = Number(item.totalRevenue || 0);
      maxCount = Math.max(maxCount, contractCount);

      data.push({
        value: [monthIndex, ownerIndex, contractCount],
        owner: row.owner,
        bucket: item.bucket,
        label: item.label,
        contractCount,
        totalRevenue,
      });
    });
  });

  return { data, maxCount };
}
