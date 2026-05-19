const pool = require('../db/connection');
const { pctDelta } = require('../utils/formatters');
const {
  buildMonthBuckets,
  buildScopedContractsQuery,
  getTableScopeCondition,
  shiftRangeByYears,
} = require('../utils/dashboardFilters');

async function getKPIs(query = {}) {
  const currentRange = buildRange(query);
  const previousRange = shiftRangeByYears(currentRange, -1);
  const [currentMetrics, previousMetrics, currentActiveSeriesCount, previousActiveSeriesCount] = await Promise.all([
    getOverviewMetrics(query, currentRange),
    getOverviewMetrics(query, previousRange),
    getActiveSeriesCount(query, currentRange),
    getActiveSeriesCount(query, previousRange),
  ]);

  return {
    totalActive: {
      value: currentMetrics.activeCount,
      ...pctDelta(currentMetrics.activeCount, previousMetrics.activeCount),
    },
    expiringSoon: {
      value: currentMetrics.upcomingCount,
      ...pctDelta(currentMetrics.upcomingCount, previousMetrics.upcomingCount),
    },
    lost: {
      value: currentMetrics.expiredCount,
      ...pctDelta(currentMetrics.expiredCount, previousMetrics.expiredCount),
    },
    cancelled: {
      value: currentMetrics.cancelledCount,
      ...pctDelta(currentMetrics.cancelledCount, previousMetrics.cancelledCount),
    },
    activeSeriesCount: {
      value: currentActiveSeriesCount,
      ...pctDelta(currentActiveSeriesCount, previousActiveSeriesCount),
    },
    monthlyRevenue: {
      value: currentMetrics.riskRevenue,
      ...pctDelta(currentMetrics.riskRevenue, previousMetrics.riskRevenue),
    },
    avgProfitability: {
      value: currentMetrics.avgProfitability,
      ...pctDelta(currentMetrics.avgProfitability, previousMetrics.avgProfitability),
    },
    range: currentMetrics.range,
  };
}

async function getCharts(query = {}) {
  const currentRange = buildRange(query);

  const [doughnut, contractLifecycle, barData, ownerClientEquipment] = await Promise.all([
    getStatusDistribution(query, currentRange),
    getContractLifecycleTrend(query, currentRange),
    getRevenueByBusiness(query, currentRange),
    getOwnerClientEquipmentStats(query, currentRange),
  ]);

  return {
    doughnut,
    contractLifecycle,
    revenueAtRisk: barData,
    ownerClientEquipment,
    range: currentRange,
  };
}

async function getExpiryHeatmap(query = {}) {
  const range = buildRange(query);
  const { cte, params } = buildScopedContractsQueryForRange(query, range);
  const [rows] = await pool.query(
    `${cte}
      SELECT
        DATE_FORMAT(end_date, '%Y-%m') AS bucket,
        MIN(end_date) AS nearest_end_date,
        COUNT(*) AS contract_count,
        COALESCE(SUM(COALESCE(monthly_revenue, 0)), 0) AS revenue_at_risk,
        COALESCE(AVG(profitability), 0) AS avg_profitability
      FROM scoped_contracts
      WHERE ${getTableScopeCondition('upcoming')}
      GROUP BY DATE_FORMAT(end_date, '%Y-%m')
      ORDER BY bucket`,
    params
  );

  return rows.map(row => {
    const count = Number(row.contract_count || 0);
    const label = formatBucketLabel(row.bucket);
    return {
      bucket: row.bucket,
      month: label,
      count,
      revenue_at_risk: Number(row.revenue_at_risk || 0),
      avg_profitability: Number(parseFloat(row.avg_profitability || 0).toFixed(2)),
      risk_level: resolveRiskLevel(row.nearest_end_date),
    };
  }).sort((left, right) => right.count - left.count);
}

async function getCanonicalOverview(query = {}) {
  const metrics = await getOverviewMetrics(query);
  const stateDistribution = await getStatusDistribution(query, metrics.range);

  return {
    range: metrics.range,
    kpis: {
      contratosVigentes: metrics.activeCount,
      contratosPorVencer: metrics.upcomingCount,
      contratosVencidos: metrics.expiredCount,
      contratosCancelados: metrics.cancelledCount,
      ingresosEnRiesgo: metrics.riskRevenue,
      rentabilidadPromedio: metrics.avgProfitability,
    },
    stateDistribution: stateDistribution.map(item => ({
      estado: item.name,
      total: item.value,
    })),
    riskDistribution: [],
  };
}

async function listCanonicalContracts(query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.limit, 10) || 25));
  const offset = (page - 1) * limit;
  const range = buildRange(query);
  const scope = resolveCanonicalScope(query);
  const order = resolveCanonicalSort(query.sortBy, query.sortDir);
  const { cte, params } = buildScopedContractsQueryForRange(query, range);

  const [[countRow]] = await pool.query(
    `${cte}
      SELECT COUNT(*) AS total
      FROM scoped_contracts
      WHERE ${scope}`,
    params
  );

  const [rows] = await pool.query(
    `${cte}
      SELECT *
      FROM scoped_contracts
      WHERE ${scope}
      ORDER BY ${order.column} ${order.direction}
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    range,
    data: rows,
    total: Number(countRow.total || 0),
    page,
    limit,
    totalPages: Math.ceil(Number(countRow.total || 0) / limit),
  };
}

async function getCanonicalFilterOptions(query = {}) {
  const range = buildRange(query);
  const { cte, params } = buildScopedContractsQueryForRange(query, range);
  const [rows] = await pool.query(
    `${cte}
      SELECT 'clients' AS filter_name, client AS filter_value FROM scoped_contracts
      UNION ALL
      SELECT 'types' AS filter_name, contract_type AS filter_value FROM scoped_contracts
      UNION ALL
      SELECT 'owners' AS filter_name, commercial_owner AS filter_value FROM scoped_contracts
      UNION ALL
      SELECT 'estados' AS filter_name, canonical_status AS filter_value FROM scoped_contracts
      UNION ALL
      SELECT 'businesses' AS filter_name, business_div_name AS filter_value FROM scoped_contracts`,
    [...params, ...params, ...params, ...params, ...params]
  );

  const grouped = {
    clients: new Set(),
    types: new Set(),
    owners: new Set(),
    estados: new Set(),
    businesses: new Set(),
  };

  for (const row of rows) {
    const value = String(row.filter_value || '').trim();
    if (value) grouped[row.filter_name].add(value);
  }

  return Object.fromEntries(
    Object.entries(grouped).map(([key, values]) => [key, Array.from(values).sort()])
  );
}

async function getOverviewMetrics(query = {}, rangeOverride) {
  const range = rangeOverride || buildRange(query);
  const { cte, params } = buildScopedContractsQueryForRange(query, range);
  const [[row]] = await pool.query(
    `${cte}${buildRankedContractsCtes()}
      SELECT
        COUNT(CASE WHEN is_active_in_range = 1 THEN 1 END) AS active_count,
        COUNT(CASE WHEN is_upcoming_in_range = 1 THEN 1 END) AS upcoming_count,
        COUNT(CASE WHEN is_expired_in_range = 1 AND display_status = 'VENCIDO' THEN 1 END) AS expired_count,
        COUNT(CASE WHEN is_expired_in_range = 1 AND display_status = 'CANCELADO' THEN 1 END) AS cancelled_count,
        COALESCE(SUM(CASE WHEN is_upcoming_in_range = 1 THEN COALESCE(monthly_revenue, 0) ELSE 0 END), 0) AS risk_revenue,
        COALESCE(AVG(CASE WHEN is_active_in_range = 1 THEN profitability END), 0) AS avg_profitability
      FROM ranked_contracts
      WHERE contract_rank = 1`,
    params
  );

  return {
    range,
    activeCount: Number(row.active_count || 0),
    upcomingCount: Number(row.upcoming_count || 0),
    expiredCount: Number(row.expired_count || 0),
    cancelledCount: Number(row.cancelled_count || 0),
    riskRevenue: Number(row.risk_revenue || 0),
    avgProfitability: Number(parseFloat(row.avg_profitability || 0).toFixed(2)),
  };
}

async function getStatusDistribution(query, range) {
  const { cte, params } = buildScopedContractsQueryForRange(query, range);
  const [rows] = await pool.query(
    `${cte}
      SELECT dashboard_status AS status, COUNT(*) AS total
      FROM (
        SELECT CASE
          WHEN is_active_in_range = 1 THEN 'VIGENTE'
          WHEN is_expired_in_range = 1 THEN ${buildDisplayStatusExpression('scoped_contracts')}
          ELSE NULL
        END AS dashboard_status
        FROM scoped_contracts
      ) status_rows
      WHERE dashboard_status IS NOT NULL
      GROUP BY dashboard_status
      ORDER BY FIELD(dashboard_status, 'VIGENTE', 'VENCIDO', 'CANCELADO')`,
    params
  );

  return rows.map(row => ({
    name: row.status,
    value: Number(row.total || 0),
  }));
}

async function getContractLifecycleTrend(query, range) {
  const buckets = buildMonthBuckets(range);
  const totals = Object.fromEntries(
    buckets.map(bucket => [bucket.key, {
      newContracts: 0,
      cancelledContracts: 0,
      expiredContracts: 0,
      closedContracts: 0,
    }])
  );
  const { cte, params } = buildScopedContractsQueryForRange(query, range);
  const [rows] = await pool.query(
    `${cte}${buildRankedContractsCtes()}
      SELECT
        bucket,
        COALESCE(SUM(new_contracts), 0) AS new_contracts,
        COALESCE(SUM(cancelled_contracts), 0) AS cancelled_contracts,
        COALESCE(SUM(expired_contracts), 0) AS expired_contracts
      FROM (
        SELECT
          DATE_FORMAT(start_date, '%Y-%m') AS bucket,
          COUNT(*) AS new_contracts,
          0 AS cancelled_contracts,
          0 AS expired_contracts
        FROM ranked_contracts
        WHERE contract_rank = 1
          AND start_date BETWEEN ? AND ?
        GROUP BY DATE_FORMAT(start_date, '%Y-%m')

        UNION ALL

        SELECT
          DATE_FORMAT(COALESCE(cancellation_date, end_date), '%Y-%m') AS bucket,
          0 AS new_contracts,
          COUNT(CASE WHEN display_status = 'CANCELADO' THEN 1 END) AS cancelled_contracts,
          COUNT(CASE WHEN display_status = 'VENCIDO' THEN 1 END) AS expired_contracts
        FROM ranked_contracts
        WHERE contract_rank = 1
          AND display_status IN ('VENCIDO', 'CANCELADO')
          AND COALESCE(cancellation_date, end_date) BETWEEN ? AND ?
        GROUP BY DATE_FORMAT(COALESCE(cancellation_date, end_date), '%Y-%m')
      ) lifecycle_rows
      GROUP BY bucket
      ORDER BY bucket`,
    [...params, range.startDate, range.endDate, range.startDate, range.endDate]
  );

  for (const row of rows) {
    totals[row.bucket] = {
      newContracts: Number(row.new_contracts || 0),
      cancelledContracts: Number(row.cancelled_contracts || 0),
      expiredContracts: Number(row.expired_contracts || 0),
      closedContracts: Number(row.cancelled_contracts || 0) + Number(row.expired_contracts || 0),
    };
  }

  return {
    months: buckets.map(bucket => bucket.label),
    newContracts: buckets.map(bucket => totals[bucket.key]?.newContracts || 0),
    cancelledContracts: buckets.map(bucket => totals[bucket.key]?.cancelledContracts || 0),
    expiredContracts: buckets.map(bucket => totals[bucket.key]?.expiredContracts || 0),
    closedContracts: buckets.map(bucket => totals[bucket.key]?.closedContracts || 0),
  };
}

async function getContractLifecycleDetails(query = {}) {
  const range = buildRange(query);
  const bucket = normalizeBucket(query.bucket);

  if (!bucket) {
    throw new Error('Debes indicar un mes valido para consultar el detalle.');
  }

  const allowedBuckets = new Set(buildMonthBuckets(range).map(item => item.key));
  if (!allowedBuckets.has(bucket)) {
    throw new Error('El mes solicitado no pertenece al rango actual del grafico.');
  }

  const monthRange = getBucketRange(bucket);
  const { cte, params } = buildScopedActiveSeriesQueryForRange(query, range);

  // Query at contract level to allow per-client contract counts and per-contract aggregates
  const [rows] = await pool.query(
    `${cte}
      SELECT
        owner,
        client,
        contract_name,
        COUNT(*) AS equipment_count,
        COALESCE(SUM(charge_fixed), 0) AS total_charge_fixed,
        COALESCE(AVG(charge_fixed), 0) AS avg_charge_fixed
      FROM active_series
      GROUP BY owner, client, contract_name
      ORDER BY owner ASC, client ASC, equipment_count DESC`,
    params
  );

  const sellersMap = new Map();
  const ownerClientPairs = new Set();
  let totalEquipmentCount = 0;

  for (const row of rows) {
    const owner = String(row.owner || 'Sin asignar');
    const client = String(row.client || 'Sin cliente');
    const contractName = String(row.contract_name || '');
    const equipmentCount = Number(row.equipment_count || 0);
    const totalChargeFixed = Number(row.total_charge_fixed || 0);
    const avgChargeFixed = Number(parseFloat(row.avg_charge_fixed || 0).toFixed(2));

    if (!sellersMap.has(owner)) {
      sellersMap.set(owner, {
        name: owner,
        value: 0,
        clientCount: 0,
        children: new Map(), // clientName -> clientInfo
      });
    }

    const seller = sellersMap.get(owner);
    seller.value += equipmentCount;

    if (!seller.children.has(client)) {
      seller.children.set(client, {
        name: client,
        value: 0,
        contractCount: 0,
        contracts: [],
        totalChargeFixed: 0,
      });
    }

    const clientInfo = seller.children.get(client);
    clientInfo.value += equipmentCount;
    clientInfo.totalChargeFixed += totalChargeFixed;
    clientInfo.contracts.push({
      contractName,
      equipmentCount,
      totalChargeFixed,
      avgChargeFixed,
    });
    clientInfo.contractCount = clientInfo.contracts.length;

    totalEquipmentCount += equipmentCount;
    ownerClientPairs.add(`${owner}::${client}`);
  }

  // Convert maps to arrays and compute seller-level aggregates
  const sellers = Array.from(sellersMap.values()).map((seller) => {
    const childrenArr = Array.from(seller.children.values()).map((client) => ({
      ...client,
      avgChargeFixed: client.value > 0 ? Number((client.totalChargeFixed / client.value).toFixed(2)) : 0,
      contracts: client.contracts.sort((a, b) => b.equipmentCount - a.equipmentCount),
    }));

    return {
      name: seller.name,
      value: seller.value,
      clientCount: childrenArr.length,
      avgChargeFixed: seller.value > 0 ? Number((childrenArr.reduce((s, c) => s + c.totalChargeFixed, 0) / seller.value).toFixed(2)) : 0,
      children: childrenArr.sort((a, b) => b.value - a.value),
    };
  }).sort((left, right) => {
    if (right.value !== left.value) return right.value - left.value;
    return left.name.localeCompare(right.name, 'es');
  });

  return {
    sellers,
    totalEquipmentCount,
    totalOwners: sellers.length,
    totalClients: ownerClientPairs.size,
  };
 
}

async function getRevenueByBusiness(query, range) {
  const { cte, params } = buildScopedContractsQueryForRange(query, range);
  const [rows] = await pool.query(
    `${cte}
      SELECT
        COALESCE(NULLIF(business_div_name, ''), 'Sin negocio') AS label,
        COUNT(CASE
          WHEN DATEDIFF(end_date, UTC_DATE()) <= 90 THEN 1
          ELSE NULL
        END) AS critical_count,
        COALESCE(SUM(CASE
          WHEN DATEDIFF(end_date, UTC_DATE()) <= 90 THEN COALESCE(monthly_revenue, 0)
          ELSE 0
        END), 0) AS critical_total,
        COUNT(CASE
          WHEN DATEDIFF(end_date, UTC_DATE()) > 90 AND DATEDIFF(end_date, UTC_DATE()) <= 180 THEN 1
          ELSE NULL
        END) AS warning_count,
        COALESCE(SUM(CASE
          WHEN DATEDIFF(end_date, UTC_DATE()) > 90 AND DATEDIFF(end_date, UTC_DATE()) <= 180 THEN COALESCE(monthly_revenue, 0)
          ELSE 0
        END), 0) AS warning_total,
        COUNT(CASE
          WHEN DATEDIFF(end_date, UTC_DATE()) > 180 THEN 1
          ELSE NULL
        END) AS stable_count,
        COALESCE(SUM(CASE
          WHEN DATEDIFF(end_date, UTC_DATE()) > 180 THEN COALESCE(monthly_revenue, 0)
          ELSE 0
        END), 0) AS stable_total,
        COALESCE(SUM(COALESCE(monthly_revenue, 0)), 0) AS grand_total
      FROM scoped_contracts
      WHERE ${getTableScopeCondition('upcoming')}
      GROUP BY COALESCE(NULLIF(business_div_name, ''), 'Sin negocio')
      HAVING grand_total > 0
      ORDER BY grand_total DESC, label ASC
      LIMIT 10`,
    params
  );

  const labels = rows.map(row => row.label);

  return {
    labels,
    months: labels,
    totals: rows.map(row => Number(row.grand_total || 0)),
    series: [
      {
        key: 'RIESGO',
        label: 'Critico',
        values: rows.map(row => Number(row.critical_total || 0)),
        counts: rows.map(row => Number(row.critical_count || 0)),
      },
      {
        key: 'HASTA_6_MESES',
        label: 'Precaucion',
        values: rows.map(row => Number(row.warning_total || 0)),
        counts: rows.map(row => Number(row.warning_count || 0)),
      },
      {
        key: 'MAS_DE_6_MESES',
        label: 'Estable',
        values: rows.map(row => Number(row.stable_total || 0)),
        counts: rows.map(row => Number(row.stable_count || 0)),
      },
    ],
  };
}

function buildRange(query) {
  return buildScopedContractsQuery(query).range;
}

async function getOwnerUpcomingStats(query = {}) {
  const range = buildRange(query);
  const monthBuckets = buildMonthBuckets(range);
  const monthIndexByKey = new Map(monthBuckets.map((bucket, index) => [bucket.key, index]));
  const { cte, params } = buildScopedContractsQueryForRange(query, range);

  const [rows] = await pool.query(
    `${cte}
      SELECT
        COALESCE(NULLIF(TRIM(commercial_owner), ''), 'Sin asignar') AS owner,
        DATE_FORMAT(end_date, '%Y-%m') AS bucket,
        COUNT(*) AS contract_count,
        COALESCE(SUM(COALESCE(monthly_revenue, 0)), 0) AS total_revenue
      FROM scoped_contracts
      WHERE is_upcoming_in_range = 1
      GROUP BY owner, bucket
      ORDER BY owner ASC, bucket ASC`,
    params
  );

  return Array.from(rows.reduce((ownersMap, row) => {
    const owner = String(row.owner || 'Sin asignar');
    const bucketKey = String(row.bucket || '');
    const bucketIndex = monthIndexByKey.get(bucketKey);

    if (!ownersMap.has(owner)) {
      ownersMap.set(owner, {
        owner,
        contractCount: 0,
        totalRevenue: 0,
        monthlyBreakdown: monthBuckets.map(bucket => ({
          bucket: bucket.key,
          label: bucket.label,
          contractCount: 0,
          totalRevenue: 0,
        })),
      });
    }

    const ownerStats = ownersMap.get(owner);
    const contractCount = Number(row.contract_count || 0);
    const totalRevenue = Number(row.total_revenue || 0);

    ownerStats.contractCount += contractCount;
    ownerStats.totalRevenue += totalRevenue;

    if (bucketIndex != null) {
      ownerStats.monthlyBreakdown[bucketIndex] = {
        ...ownerStats.monthlyBreakdown[bucketIndex],
        contractCount,
        totalRevenue,
      };
    }

    return ownersMap;
  }, new Map()).values())
    .sort((left, right) => {
      if (right.contractCount !== left.contractCount) {
        return right.contractCount - left.contractCount;
      }

      return left.owner.localeCompare(right.owner, 'es');
    })
    .slice(0, 15);
}

async function getOwnerClosedStats(query = {}) {
  const range = buildRange(query);
  const monthBuckets = buildMonthBuckets(range);
  const monthIndexByKey = new Map(monthBuckets.map((bucket, index) => [bucket.key, index]));
  const { cte, params } = buildScopedContractsQueryForRange(query, range);

  const [rows] = await pool.query(
    `${cte}
      SELECT
        COALESCE(NULLIF(TRIM(commercial_owner), ''), 'Sin asignar') AS owner,
        DATE_FORMAT(event_date, '%Y-%m') AS bucket,
        COUNT(CASE WHEN cancellation_date IS NOT NULL THEN 1 END) AS cancelled_count,
        COUNT(CASE WHEN cancellation_date IS NULL THEN 1 END) AS expired_count,
        COUNT(*) AS total_count
      FROM scoped_contracts
      WHERE is_expired_in_range = 1
      GROUP BY owner, bucket
      ORDER BY owner ASC, bucket ASC`,
    params
  );

  return Array.from(rows.reduce((ownersMap, row) => {
    const owner = String(row.owner || 'Sin asignar');
    const bucketKey = String(row.bucket || '');
    const bucketIndex = monthIndexByKey.get(bucketKey);

    if (!ownersMap.has(owner)) {
      ownersMap.set(owner, {
        owner,
        cancelledCount: 0,
        expiredCount: 0,
        total: 0,
        monthlyBreakdown: monthBuckets.map(bucket => ({
          bucket: bucket.key,
          label: bucket.label,
          expiredCount: 0,
          cancelledCount: 0,
          total: 0,
        })),
      });
    }

    const ownerStats = ownersMap.get(owner);
    const cancelledCount = Number(row.cancelled_count || 0);
    const expiredCount = Number(row.expired_count || 0);
    const total = Number(row.total_count || 0);

    ownerStats.cancelledCount += cancelledCount;
    ownerStats.expiredCount += expiredCount;
    ownerStats.total += total;

    if (bucketIndex != null) {
      ownerStats.monthlyBreakdown[bucketIndex] = {
        ...ownerStats.monthlyBreakdown[bucketIndex],
        expiredCount,
        cancelledCount,
        total,
      };
    }

    return ownersMap;
  }, new Map()).values())
    .sort((left, right) => {
      if (right.total !== left.total) {
        return right.total - left.total;
      }

      return left.owner.localeCompare(right.owner, 'es');
    })
    .slice(0, 15);
}

async function getActiveSeriesCount(query = {}, range = buildRange(query)) {
  const { cte, params } = buildScopedActiveSeriesQueryForRange(query, range);
  const [[row]] = await pool.query(
    `${cte}
      SELECT COUNT(*) AS active_series_count
      FROM active_series`,
    params
  );

  return Number(row.active_series_count || 0);
}

async function getOwnerClientEquipmentStats(query = {}, range = buildRange(query)) {
  const { cte, params } = buildScopedActiveSeriesQueryForRange(query, range);
  const [rows] = await pool.query(
    `${cte}
      SELECT
        owner,
        client,
        contract_name,
        COUNT(*) AS equipment_count,
        COALESCE(SUM(charge_fixed), 0) AS total_charge_fixed,
        COALESCE(AVG(charge_fixed), 0) AS avg_charge_fixed
      FROM active_series
      GROUP BY owner, client, contract_name
      ORDER BY owner ASC, client ASC, equipment_count DESC, contract_name ASC`,
    params
  );

  const sellersMap = new Map();
  const ownerClientPairs = new Set();
  let totalEquipmentCount = 0;

  for (const row of rows) {
    const owner = String(row.owner || 'Sin asignar');
    const client = String(row.client || 'Sin cliente');
    const contractName = String(row.contract_name || 'Sin contrato');
    const equipmentCount = Number(row.equipment_count || 0);
    const totalChargeFixed = Number(row.total_charge_fixed || 0);
    const avgChargeFixed = Number(parseFloat(row.avg_charge_fixed || 0).toFixed(2));

    if (!sellersMap.has(owner)) {
      sellersMap.set(owner, {
        name: owner,
        value: 0,
        clientCount: 0,
        children: new Map(),
        totalChargeFixed: 0,
        avgChargeFixed: 0,
      });
    }

    const seller = sellersMap.get(owner);
    seller.value += equipmentCount;
    seller.totalChargeFixed += totalChargeFixed;

    if (!seller.children.has(client)) {
      seller.children.set(client, {
        name: client,
        value: 0,
        equipmentCount: 0,
        contractCount: 0,
        totalChargeFixed: 0,
        avgChargeFixed: 0,
        contracts: [],
      });
    }

    const clientInfo = seller.children.get(client);
    clientInfo.value += equipmentCount;
    clientInfo.equipmentCount += equipmentCount;
    clientInfo.totalChargeFixed += totalChargeFixed;
    clientInfo.contracts.push({
      contractName,
      equipmentCount,
      totalChargeFixed,
      avgChargeFixed,
    });
    clientInfo.contractCount = clientInfo.contracts.length;
    clientInfo.avgChargeFixed = clientInfo.equipmentCount > 0
      ? Number((clientInfo.totalChargeFixed / clientInfo.equipmentCount).toFixed(2))
      : 0;

    totalEquipmentCount += equipmentCount;
    ownerClientPairs.add(`${owner}::${client}`);
  }

  const sellers = Array.from(sellersMap.values())
    .map((seller) => ({
      ...seller,
      clientCount: seller.children.size,
      avgChargeFixed: seller.value > 0 ? Number((seller.totalChargeFixed / seller.value).toFixed(2)) : 0,
      children: Array.from(seller.children.values())
        .map((client) => ({
          ...client,
          contracts: client.contracts.sort((left, right) => {
            if (right.equipmentCount !== left.equipmentCount) {
              return right.equipmentCount - left.equipmentCount;
            }

            return left.contractName.localeCompare(right.contractName, 'es');
          }),
        }))
        .sort((left, right) => {
        if (right.value !== left.value) {
          return right.value - left.value;
        }

        return left.name.localeCompare(right.name, 'es');
        }),
    }))
    .sort((left, right) => {
      if (right.value !== left.value) {
        return right.value - left.value;
      }

      return left.name.localeCompare(right.name, 'es');
    });

  return {
    sellers,
    totalEquipmentCount,
    totalOwners: sellers.length,
    totalClients: ownerClientPairs.size,
  };
}

function buildScopedActiveSeriesQueryForRange(query, range) {
  const { cte, params } = buildScopedContractsQueryForRange(query, range);

  return {
    params,
    cte: `${cte}${buildRankedContractsCtes()}
      , active_contracts AS (
        SELECT DISTINCT
          TRIM(client_code) AS client_code,
          TRIM(contract_name) AS contract_name,
          COALESCE(NULLIF(TRIM(client), ''), 'Sin cliente') AS client,
          COALESCE(NULLIF(TRIM(commercial_owner), ''), 'Sin asignar') AS contract_owner
        FROM ranked_contracts
        WHERE contract_rank = 1
          AND is_active_in_range = 1
          AND COALESCE(TRIM(client_code), '') <> ''
          AND COALESCE(TRIM(contract_name), '') <> ''
      ),
      active_series AS (
        SELECT DISTINCT
          active_contracts.client_code,
          active_contracts.contract_name,
          TRIM(contract_series.equipment_series) AS equipment_series,
          COALESCE(active_contracts.client, NULLIF(TRIM(contract_series.client), ''), 'Sin cliente') AS client,
          COALESCE(active_contracts.contract_owner, NULLIF(TRIM(contract_series.commercial_owner), ''), 'Sin asignar') AS owner,
          contract_series.charge_fixed AS charge_fixed
        FROM contract_series
        INNER JOIN active_contracts
          ON TRIM(contract_series.client_code) = active_contracts.client_code
         AND TRIM(contract_series.contract_name) = active_contracts.contract_name
        WHERE COALESCE(TRIM(contract_series.equipment_series), '') <> ''
      )`,
  };
}

function buildScopedContractsQueryForRange(query, range) {
  return buildScopedContractsQuery({
    ...query,
    period: 'personalizado',
    startDate: range.startDate,
    endDate: range.endDate,
  });
}

function resolveCanonicalScope(query) {
  if (query.estado === 'VIGENTE') return getTableScopeCondition('vigentes');
  if (query.estado === 'VENCIDO' || query.estado === 'CANCELADO') return getTableScopeCondition('vencidos');
  if (query.semaforo === 'AMARILLO' || query.semaforo === 'ROJO') return getTableScopeCondition('upcoming');
  return '(is_active_in_range = 1 OR is_upcoming_in_range = 1 OR is_expired_in_range = 1)';
}

function resolveCanonicalSort(sortBy, sortDir) {
  const allowedColumns = [
    'client',
    'contract_name',
    'contract_type',
    'start_date',
    'end_date',
    'cancellation_date',
    'canonical_status',
    'source_status',
    'business_div_name',
    'monthly_revenue',
    'annual_total',
    'profitability',
    'commercial_owner',
    'risk_score',
    'event_date',
  ];

  return {
    column: allowedColumns.includes(sortBy) ? sortBy : 'end_date',
    direction: sortDir === 'asc' ? 'ASC' : 'DESC',
  };
}

function buildDisplayStatusExpression(alias) {
  return `CASE
    WHEN ${qualifyColumn(alias, 'cancellation_date')} IS NOT NULL THEN 'CANCELADO'
    WHEN ${qualifyColumn(alias, 'canonical_status')} = 'CANCELADO' THEN 'CANCELADO'
    WHEN ${qualifyColumn(alias, 'source_type')} = 'vencido' THEN 'VENCIDO'
    ELSE COALESCE(NULLIF(${qualifyColumn(alias, 'canonical_status')}, ''), NULLIF(${qualifyColumn(alias, 'status')}, ''), 'VIGENTE')
  END`;
}

function buildRankedContractsCtes(sourceTable = 'scoped_contracts') {
  return `,
      prepared_contracts AS (
        SELECT
          ${sourceTable}.*,
          ${buildDisplayStatusExpression(sourceTable)} AS display_status,
          ${buildRowScoreExpression(sourceTable)} AS row_score,
          ${buildDedupeKeyExpression(sourceTable)} AS dedupe_key
        FROM ${sourceTable}
      ),
      ranked_contracts AS (
        SELECT
          prepared_contracts.*,
          ROW_NUMBER() OVER (
            PARTITION BY dedupe_key
            ORDER BY row_score DESC, COALESCE(end_date, '0000-00-00') DESC, COALESCE(start_date, '0000-00-00') DESC, id DESC
          ) AS contract_rank
        FROM prepared_contracts
      )`;
}

function buildRowScoreExpression(alias) {
  return `(
    CASE WHEN NULLIF(TRIM(${qualifyColumn(alias, 'source_status')}), '') IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN NULLIF(TRIM(${qualifyColumn(alias, 'business_div_name')}), '') IS NOT NULL AND LOWER(TRIM(${qualifyColumn(alias, 'business_div_name')})) <> 'sin clasificar' THEN 1 ELSE 0 END +
    CASE WHEN ${qualifyColumn(alias, 'monthly_revenue')} IS NOT NULL THEN 2 ELSE 0 END +
    CASE WHEN ${qualifyColumn(alias, 'annual_total')} IS NOT NULL THEN 2 ELSE 0 END +
    CASE WHEN ${qualifyColumn(alias, 'profitability')} IS NOT NULL THEN 1 ELSE 0 END +
    CASE WHEN NULLIF(TRIM(${qualifyColumn(alias, 'commercial_owner')}), '') IS NOT NULL THEN 1 ELSE 0 END
  )`;
}

function buildDedupeKeyExpression(alias) {
  return `COALESCE(
    NULLIF(${qualifyColumn(alias, 'canonical_key')}, ''),
    CONCAT_WS('|',
      LOWER(TRIM(COALESCE(${qualifyColumn(alias, 'client')}, ''))),
      LOWER(TRIM(COALESCE(${qualifyColumn(alias, 'contract_name')}, ''))),
      LOWER(TRIM(COALESCE(${qualifyColumn(alias, 'contract_type')}, ''))),
      COALESCE(${qualifyColumn(alias, 'start_date')}, ''),
      COALESCE(${qualifyColumn(alias, 'end_date')}, ''),
      LOWER(TRIM(COALESCE(${qualifyColumn(alias, 'source_type')}, '')))
    )
  )`;
}

function qualifyColumn(alias, column) {
  return alias ? `${alias}.${column}` : column;
}

function formatBucketLabel(bucket) {
  if (!bucket) return 'Sin fecha';
  const [year, month] = bucket.split('-');
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return date.toLocaleDateString('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function normalizeBucket(value) {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}$/.test(raw) ? raw : '';
}

function getBucketRange(bucket) {
  const [yearRaw, monthRaw] = bucket.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const startDate = `${yearRaw}-${monthRaw}-01`;
  const endDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  return { startDate, endDate };
}

function getDaysUntil(value) {
  if (!value) return null;

  const normalized = typeof value === 'string'
    ? value.slice(0, 10)
    : new Date(value).toISOString().slice(0, 10);
  const targetDate = new Date(`${normalized}T00:00:00Z`);

  if (Number.isNaN(targetDate.getTime())) return null;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  return Math.round((targetDate.getTime() - today.getTime()) / 86400000);
}

function resolveRiskLevel(endDate) {
  const daysUntil = getDaysUntil(endDate);

  if (daysUntil == null) return 'MAS_DE_6_MESES';
  if (daysUntil <= 90) return 'RIESGO';
  if (daysUntil <= 180) return 'HASTA_6_MESES';
  return 'MAS_DE_6_MESES';
}

const JSON_SETTING_KEYS = new Set(['full_view_access_users']);

async function getAllSettings() {
  const [rows] = await pool.execute('SELECT `key`, `value` FROM app_settings');
  return Object.fromEntries(rows.map(row => [row.key, parseSettingValue(row.key, row.value)]));
}

async function getSettingValue(key, fallbackValue = null) {
  const [rows] = await pool.execute(
    'SELECT `value` FROM app_settings WHERE `key` = ? LIMIT 1',
    [key]
  );

  if (!rows.length) {
    return fallbackValue;
  }

  const parsedValue = parseSettingValue(key, rows[0].value);
  return parsedValue == null ? fallbackValue : parsedValue;
}

async function updateSettings(updates) {
  for (const [key, value] of Object.entries(updates)) {
    await pool.execute(
      `INSERT INTO app_settings (\`key\`, \`value\`)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
      [key, serializeSettingValue(key, value)]
    );
  }
}

function parseSettingValue(key, value) {
  if (!JSON_SETTING_KEYS.has(key)) {
    return value;
  }

  try {
    const parsedValue = JSON.parse(String(value || '[]'));
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

function serializeSettingValue(key, value) {
  if (JSON_SETTING_KEYS.has(key)) {
    return JSON.stringify(Array.isArray(value) ? value : []);
  }

  return String(value);
}

module.exports = {
  getKPIs,
  getCharts,
  getExpiryHeatmap,
  getContractLifecycleDetails,
  getCanonicalOverview,
  listCanonicalContracts,
  getCanonicalFilterOptions,
  getAllSettings,
  getSettingValue,
  updateSettings,
  getOwnerUpcomingStats,
  getOwnerClosedStats,
};
