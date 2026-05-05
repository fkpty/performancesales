import ReactECharts from 'echarts-for-react';
import { useState } from 'react';
import { fetchContracts } from '../../services/api';
import useContractStore from '../../store/contractStore';
import OwnerContractsDetailModal from './OwnerContractsDetailModal';
import Spinner from '../ui/Spinner';

const CHART_THEME = {
  text:      '#64748b',
  grid:      '#e2e8f0',
  expired:   '#f59e0b',
  cancelled: '#ef4444',
  expiredHov:'#d97706',
  cancelHov: '#dc2626',
};

export default function OwnerClosedChart() {
  const rows    = useContractStore(s => s.ownerClosed);
  const loading = useContractStore(s => s.ownerClosedLoading);
  const period = useContractStore(s => s.period);
  const year = useContractStore(s => s.year);
  const month = useContractStore(s => s.month);
  const quarter = useContractStore(s => s.quarter);
  const startDate = useContractStore(s => s.startDate);
  const endDate = useContractStore(s => s.endDate);
  const filters = useContractStore(s => s.filters);
  const [detailState, setDetailState] = useState({ open: false, owner: '', periodLabel: '', rows: [], loading: false, error: '', defaultTab: 'expired' });

  const sorted   = [...(rows || [])].sort((a, b) => b.total - a.total);
  const owners   = sorted.map(r => r.owner);
  const expired  = sorted.map(r => r.expiredCount);
  const cancelled = sorted.map(r => r.cancelledCount);
  const monthLabels = sorted[0]?.monthlyBreakdown?.map(item => item.label) || [];
  const showTemporalView = monthLabels.length > 1;
  const temporalData = showTemporalView ? buildClosedTemporalData(sorted) : { data: [], maxTotal: 0 };

  const hasData = sorted.length > 0;
  const option = showTemporalView
    ? {
        tooltip: {
          position: 'top',
          formatter: (params) => `
            <div style="font-size:13px;line-height:1.8;max-width:300px">
              <strong>${params.data.owner}</strong><br/>
              ${params.data.label}<br/>
              <span style="color:${CHART_THEME.expired}">●</span> Vencidos: <strong>${params.data.expiredCount}</strong><br/>
              <span style="color:${CHART_THEME.cancelled}">●</span> Cancelados: <strong>${params.data.cancelledCount}</strong><br/>
              Total: <strong>${params.data.total}</strong>
            </div>`,
        },
        visualMap: {
          show: false,
          min: 0,
          max: Math.max(1, temporalData.maxTotal),
          inRange: { color: ['#fff7ed', '#fecaca', '#f87171', '#b91c1c'] },
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
            color: '#7f1d1d',
            fontSize: 10,
            formatter: ({ data }) => data.total > 0 ? String(data.total) : '',
          },
          itemStyle: {
            borderColor: '#ffffff',
            borderWidth: 1,
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(185,28,28,0.25)',
            },
          },
        }],
      }
    : {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (params) => {
            const idx  = params[0]?.dataIndex ?? 0;
            const row  = sorted[idx];
            const exp  = row?.expiredCount ?? 0;
            const can  = row?.cancelledCount ?? 0;

            return `
              <div style="font-size:13px;line-height:1.8;max-width:280px">
                <strong>${owners[idx]}</strong><br/>
                <span style="color:${CHART_THEME.expired}">●</span> Vencidos: <strong>${exp}</strong><br/>
                <span style="color:${CHART_THEME.cancelled}">●</span> Cancelados: <strong>${can}</strong>
              </div>`;
          },
        },
        legend: {
          data: ['Vencidos', 'Cancelados'],
          bottom: 0,
          textStyle: { color: CHART_THEME.text, fontSize: 11 },
          icon: 'circle',
          itemWidth: 8,
          itemHeight: 8,
        },
        grid: { left: '2%', right: '6%', top: '4%', bottom: '10%', containLabel: true },
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
        series: [
          {
            name:      'Vencidos',
            type:      'bar',
            stack:     'total',
            data:      expired,
            itemStyle: { color: CHART_THEME.expired },
            emphasis:  { itemStyle: { color: CHART_THEME.expiredHov } },
            label: { show: false },
          },
          {
            name:      'Cancelados',
            type:      'bar',
            stack:     'total',
            data:      cancelled,
            itemStyle: { color: CHART_THEME.cancelled, borderRadius: [0, 3, 3, 0] },
            emphasis:  { itemStyle: { color: CHART_THEME.cancelHov } },
            label: {
              show: true,
              position: 'right',
              color: CHART_THEME.text,
              fontSize: 11,
              formatter: (p) => {
                const total = sorted[p.dataIndex]?.total || 0;
                return total > 0 ? String(total) : '';
              },
            },
          },
        ],
      };

  const chartHeight = showTemporalView
    ? Math.max(320, sorted.length * 34 + 56)
    : Math.max(240, sorted.length * 36 + 60);

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

  const openDetail = async ({ owner, bucket, label, total, defaultTab }) => {
    if (!owner || Number(total || 0) <= 0) return;

    setDetailState({ open: true, owner, periodLabel: label || buildRangeLabel(), rows: [], loading: true, error: '', defaultTab });

    try {
      const bucketRange = bucket ? getMonthRange(bucket) : null;
      const data = await fetchContracts({
        ...buildBaseParams(),
        ...(bucketRange ? { period: 'personalizado', ...bucketRange } : {}),
        owner,
        table: 'vencidos',
        page: 1,
        limit: 10000,
        sortBy: 'event_date',
        sortDir: 'desc',
      });

      setDetailState({
        open: true,
        owner,
        periodLabel: label || buildRangeLabel(),
        rows: data.data || [],
        loading: false,
        error: '',
        defaultTab,
      });
    } catch (error) {
      setDetailState({
        open: true,
        owner,
        periodLabel: label || buildRangeLabel(),
        rows: [],
        loading: false,
        error: error.response?.data?.error || error.message || 'No se pudo cargar el detalle.',
        defaultTab,
      });
    }
  };

  const handleChartClick = (params) => {
    if (showTemporalView) {
      const expiredCount = Number(params.data?.expiredCount || 0);
      const cancelledCount = Number(params.data?.cancelledCount || 0);
      const defaultTab = cancelledCount > 0 && expiredCount === 0 ? 'cancelled' : 'expired';

      openDetail({
        owner: params.data?.owner,
        bucket: params.data?.bucket,
        label: params.data?.label,
        total: params.data?.total,
        defaultTab,
      });
      return;
    }

    const row = sorted[params.dataIndex];
    openDetail({
      owner: row?.owner,
      label: buildRangeLabel(),
      total: row?.total,
      defaultTab: params.seriesName === 'Cancelados' ? 'cancelled' : 'expired',
    });
  };

  return (
    <>
      <div className="bg-white rounded-2xl border border-outline-variant p-md flex flex-col gap-sm">
        <h3 className="font-h3 text-h3 text-on-surface">Vencidos y cancelados por vendedor</h3>
        <p className="text-[12px] text-on-surface-variant -mt-xs">
          {showTemporalView
            ? 'Vista mensual por responsable. Haz clic en un cuadro para ver el detalle del mes.'
            : 'Contratos vencidos y cancelados en el periodo filtrado, agrupados por responsable. Haz clic en una barra para ver el detalle.'}
        </p>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Spinner />
          </div>
        ) : !hasData ? (
          <div className="flex items-center justify-center h-40 text-[13px] text-on-surface-variant">
            No hay contratos vencidos o cancelados para los filtros actuales.
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
        mode="closed"
        owner={detailState.owner}
        periodLabel={detailState.periodLabel}
        rows={detailState.rows}
        loading={detailState.loading}
        error={detailState.error}
        defaultTab={detailState.defaultTab}
        onClose={() => setDetailState((current) => ({ ...current, open: false }))}
      />
    </>
  );
}

function buildClosedTemporalData(rows = []) {
  const data = [];
  let maxTotal = 0;

  rows.forEach((row, ownerIndex) => {
    (row.monthlyBreakdown || []).forEach((item, monthIndex) => {
      const expiredCount = Number(item.expiredCount || 0);
      const cancelledCount = Number(item.cancelledCount || 0);
      const total = Number(item.total || 0);
      maxTotal = Math.max(maxTotal, total);

      data.push({
        value: [monthIndex, ownerIndex, total],
        owner: row.owner,
        bucket: item.bucket,
        label: item.label,
        expiredCount,
        cancelledCount,
        total,
      });
    });
  });

  return { data, maxTotal };
}
