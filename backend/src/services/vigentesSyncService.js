const { getSqlServerPool } = require('../db/sqlserver');
const {
  buildCanonicalKey,
  collectQualityFlags,
  deriveTotals,
  normalizeText,
  parseNullableNumber,
  resolveCanonicalStatus,
  resolveLegacyStatus,
  toIsoDate,
} = require('../utils/importRecordUtils');

const SOURCE_TYPE = 'vigente';
const SOURCE_SHEET = 'sqlserver_vigentes';
const EXCLUDED_CONTRACT_TYPES = ['USI', 'GAR'];

const ACTIVE_VIGENTES_SQL = `
SELECT
  LTRIM(RTRIM(dbo.Pan_Gc_Mae_Contrato.Cg_Cli_Codigo_Cliente)) AS cliente_codigo,
  LTRIM(RTRIM(dbo.Pan_Cg_Cat_CLientes.Cg_Cli_Razon_Social)) AS razon_social,
  LTRIM(RTRIM(dbo.Pan_Gc_Mae_Contrato.Gc_Mco_Numero_Contrato)) AS contrato,
  LTRIM(RTRIM(dbo.Pan_Gc_Mae_Contrato.Gc_Ctc_Tipo_Contrato)) AS tipo_contrato,
  LTRIM(RTRIM(dbo.Pan_Pl_Cat_Empleados.Pl_Cem_Nombre)) AS responsable,
  dbo.Pan_Gc_Mae_Contrato.Gc_Mco_Numero_Meses AS duracion,
  CONVERT(varchar(10), dbo.Pan_Gc_Mae_Contrato.Gc_Mco_Fecha_Inicial_Contrato, 23) AS fecha_inicial,
  CONVERT(varchar(10), dbo.Pan_Gc_Mae_Contrato.Gc_Mco_Fecha_Final_Contrato, 23) AS fecha_final,
  CAST(SUM(COALESCE(dbo.Pan_Gc_Det_Precios.Gc_Dec_Cargo_Fijo, 0)) AS decimal(18, 2)) AS cargo_fijo,
  CAST(SUM(COALESCE(dbo.Pan_Gc_Det_Precios.Gc_Dde_CuotaBox, 0)) AS decimal(18, 2)) AS cuota_box,
  CAST(SUM(COALESCE(dbo.Pan_Gc_Det_Precios.Gc_Dde_CuotaServicio, 0)) AS decimal(18, 2)) AS cuota_serv
FROM
  (
    (
      dbo.Pan_Gc_Mae_Contrato
      INNER JOIN dbo.Pan_Gc_Det_Contrato ON (
        dbo.Pan_Gc_Mae_Contrato.Cg_Emp_Codigo_Empresa = dbo.Pan_Gc_Det_Contrato.Cg_Emp_Codigo_Empresa
      )
      AND (
        dbo.Pan_Gc_Mae_Contrato.Gc_Mco_Numero_Contrato = dbo.Pan_Gc_Det_Contrato.Gc_Mco_Numero_Contrato
      )
    )
    INNER JOIN dbo.Pan_Cg_Cat_CLientes ON (
      dbo.Pan_Gc_Mae_Contrato.Cg_Emp_Codigo_Empresa = dbo.Pan_Cg_Cat_CLientes.Cg_Emp_Codigo_Empresa
    )
    AND (
      dbo.Pan_Gc_Mae_Contrato.Cg_Cli_Codigo_Cliente = dbo.Pan_Cg_Cat_CLientes.Cg_Cli_Codigo_Cliente
    )
  )
  INNER JOIN dbo.Pan_Gc_Det_Precios ON (
    dbo.Pan_Gc_Det_Contrato.Cg_Emp_Codigo_Empresa = dbo.Pan_Gc_Det_Precios.Cg_Emp_Codigo_Empresa
  )
  AND (
    dbo.Pan_Gc_Det_Contrato.Gc_Mco_Numero_Contrato = dbo.Pan_Gc_Det_Precios.Gc_Mco_Numero_Contrato
  )
  AND (
    dbo.Pan_Gc_Det_Contrato.Ie_Mre_Resumido = dbo.Pan_Gc_Det_Precios.Ie_Mre_Resumido
  )
  AND (
    dbo.Pan_Gc_Det_Contrato.Ie_Cpr_Producto = dbo.Pan_Gc_Det_Precios.Ie_Cpr_Producto
  )
  INNER JOIN dbo.Pan_Pl_Cat_Empleados ON (
    dbo.Pan_Gc_Mae_Contrato.Cg_Emp_Codigo_Empresa = dbo.Pan_Pl_Cat_Empleados.Cg_Emp_Codigo_Empresa
  )
  AND (
    dbo.Pan_Gc_Mae_Contrato.Pl_Cem_Empleado = dbo.Pan_Pl_Cat_Empleados.Pl_Cem_Empleado
  )
WHERE
  (
    (
      (dbo.Pan_Gc_Mae_Contrato.Gc_Ctc_Tipo_Contrato) NOT IN ('USI', 'GAR')
    )
    AND (
      (dbo.Pan_Gc_Mae_Contrato.Gc_Cca_Codigo_Cancelacion) = '0'
    )
    AND (
      (dbo.Pan_Gc_Det_Contrato.Gc_Dco_Periodo_Retiro) IS NULL
    )
  )
GROUP BY
  dbo.Pan_Gc_Mae_Contrato.Cg_Cli_Codigo_Cliente,
  dbo.Pan_Cg_Cat_CLientes.Cg_Cli_Razon_Social,
  dbo.Pan_Gc_Mae_Contrato.Gc_Mco_Numero_Contrato,
  dbo.Pan_Gc_Mae_Contrato.Gc_Ctc_Tipo_Contrato,
  dbo.Pan_Pl_Cat_Empleados.Pl_Cem_Nombre,
  dbo.Pan_Gc_Mae_Contrato.Gc_Mco_Numero_Meses,
  dbo.Pan_Gc_Mae_Contrato.Gc_Mco_Fecha_Inicial_Contrato,
  dbo.Pan_Gc_Mae_Contrato.Gc_Mco_Fecha_Final_Contrato
HAVING
  (
    CAST(dbo.Pan_Gc_Mae_Contrato.Gc_Mco_Fecha_Final_Contrato AS date) > CAST(GETDATE() AS date)
  )
ORDER BY cliente_codigo, contrato;
`;

async function fetchVigentesFromSqlServer() {
  const pool = await getSqlServerPool();
  const result = await pool.request().query(ACTIVE_VIGENTES_SQL);
  const rows = Array.isArray(result.recordset) ? result.recordset : [];

  const records = [];
  const errors = [];

  rows.forEach((row, index) => {
    const mapped = mapSqlRow(row, index + 1, errors);
    if (mapped) records.push(mapped);
  });

  return {
    records,
    errors,
    meta: {
      excludedContractTypes: EXCLUDED_CONTRACT_TYPES,
      source: 'sqlserver',
      rawRows: rows.length,
    },
  };
}

function mapSqlRow(row, rowNumber, errors) {
  const clientCode = normalizeText(row.cliente_codigo);
  const client = normalizeText(row.razon_social);
  const contractName = normalizeText(row.contrato);
  const contractType = normalizeText(row.tipo_contrato);
  const commercialOwner = normalizeText(row.responsable);
  const durationMonths = row.duracion == null ? null : Number.parseInt(row.duracion, 10);
  const startDate = toIsoDate(row.fecha_inicial);
  const endDate = toIsoDate(row.fecha_final);

  if (!clientCode || !client || !contractName || !contractType) {
    errors.push(`Fila SQL ${rowNumber}: faltan datos base de cliente, razón social, contrato o tipo.`);
    return null;
  }

  if (!startDate || !endDate) {
    errors.push(`Fila SQL ${rowNumber}: fechas inicial/final inválidas para el contrato ${contractName}.`);
    return null;
  }

  const chargeFixedRaw = parseNullableNumber(row.cargo_fijo);
  const boxFeeRaw = parseNullableNumber(row.cuota_box);
  const serviceFeeRaw = parseNullableNumber(row.cuota_serv);
  const chargeFixed = chargeFixedRaw != null ? Number(chargeFixedRaw.toFixed(2)) : null;
  const boxFee = boxFeeRaw != null ? Number(boxFeeRaw.toFixed(2)) : null;
  const serviceFee = serviceFeeRaw != null ? Number(serviceFeeRaw.toFixed(2)) : null;
  const monthlyRevenueRaw = [chargeFixed, boxFee, serviceFee]
    .filter(value => value != null)
    .reduce((total, value) => total + value, 0);
  const monthlyRevenue = Number.isFinite(monthlyRevenueRaw)
    ? Number(monthlyRevenueRaw.toFixed(2))
    : null;
  const derivedTotals = deriveTotals(monthlyRevenue, null);
  const sourceStatus = 'VIGENTE';
  const canonicalStatus = resolveCanonicalStatus({
    sourceType: SOURCE_TYPE,
    sourceStatus,
    cancellationDate: null,
    cancellationReason: '',
  });

  return {
    client_code: clientCode,
    client,
    contract_name: contractName,
    contract_type: contractType,
    duration_months: Number.isFinite(durationMonths) ? durationMonths : null,
    start_date: startDate,
    end_date: endDate,
    cancellation_date: null,
    canonical_status: canonicalStatus,
    cancellation_reason: '',
    status: resolveLegacyStatus(canonicalStatus, endDate),
    source_status: sourceStatus,
    business_div_name: 'Sin clasificar',
    charge_fixed: chargeFixed,
    box_fee: boxFee,
    service_fee: serviceFee,
    monthly_revenue: derivedTotals.monthlyRevenue,
    annual_total: derivedTotals.annualTotal,
    profitability: null,
    commercial_owner: commercialOwner,
    source_type: SOURCE_TYPE,
    source_report: 'vigentes',
    source_sheet: SOURCE_SHEET,
    source_row_number: rowNumber,
    special_source_group: 0,
    canonical_key: buildCanonicalKey({
      client,
      contractName,
      contractType,
      startDate,
      endDate,
      sourceType: SOURCE_TYPE,
    }),
    data_quality: collectQualityFlags({
      monthlyRevenue: derivedTotals.monthlyRevenue,
      annualTotal: derivedTotals.annualTotal,
      profitability: null,
    }),
  };
}

module.exports = {
  EXCLUDED_CONTRACT_TYPES,
  fetchVigentesFromSqlServer,
};