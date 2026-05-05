const { getSqlServerPool } = require('../db/sqlserver');
const {
  buildCanonicalKey,
  collectQualityFlags,
  deriveTotals,
  normalizeText,
  parseNullableNumber,
  resolveLegacyStatus,
  toIsoDate,
} = require('../utils/importRecordUtils');

const SOURCE_TYPE = 'vencido';
const SOURCE_SHEET = 'sqlserver_vencidos_cancelados';
const HISTORY_START_DATE = '2025-01-01';

const CLOSED_CONTRACTS_SQL = `
SELECT DISTINCT
  LTRIM(RTRIM(A.Cg_Cli_Codigo_Cliente)) AS cliente_codigo,
  LTRIM(RTRIM(A.Gc_Ctc_Tipo_Contrato)) AS tipo_contrato,
  LTRIM(RTRIM(A.Gc_Mco_Numero_Contrato)) AS contrato,
  A.Gc_Mco_Numero_Meses AS duracion,
  CONVERT(varchar(10), A.Gc_Mco_Fecha_Inicial_Contrato, 23) AS fecha_inicial,
  CONVERT(varchar(10), A.Gc_Mco_Fecha_Final_Contrato, 23) AS fecha_final,
  CONVERT(varchar(10), A.Gc_Mco_Fecha_Cancelacion, 23) AS fecha_cancelacion,
  LTRIM(RTRIM(A.Gc_Ctv_Codigo_Vencimiento)) AS codigo_vencimiento,
  LTRIM(RTRIM(A.Gc_Cca_Codigo_Cancelacion)) AS codigo_cancelacion,
  LTRIM(RTRIM(C.Cg_Cli_Razon_Social)) AS razon_social,
  LTRIM(RTRIM(T.Gc_Ctc_Nombre_Contrato)) AS tipo_contrato_nombre,
  LTRIM(RTRIM(E.Pl_Cem_Nombre)) AS responsable,
  A.Gc_Mco_MaxRenovaciones AS max_renovaciones,
  CAST(
    CASE
      WHEN P.Gc_Mco_Moneda_Local = '1' THEN
        P.Cuota_Fija_Contrato /
        CASE
          WHEN ISNULL(P.Tipo_Cambio, 0) = 0 THEN 1
          ELSE P.Tipo_Cambio
        END
      ELSE P.Cuota_Fija_Contrato
    END
    AS decimal(18, 2)
  ) AS cargo_fijo_dol,
  CAST(
    CASE
      WHEN F.Gc_Mfa_Moneda_Local <> 0 THEN
        ROUND(
          F.Sum_Total /
          CASE
            WHEN ISNULL(F.Gc_Inp_Valor, 0) = 0 THEN 1
            ELSE F.Gc_Inp_Valor
          END,
          2
        )
      ELSE F.Sum_Total
    END
    AS decimal(18, 2)
  ) AS fact_anual_dol
FROM dbo.Pan_Gc_Mae_Contrato A
INNER JOIN dbo.Pan_Gc_Det_Contrato D
  ON A.Gc_Mco_Numero_Contrato = D.Gc_Mco_Numero_Contrato
  AND A.Cg_Emp_Codigo_Empresa = D.Cg_Emp_Codigo_Empresa
INNER JOIN dbo.Pan_Cg_Cat_Clientes C
  ON A.Cg_Cli_Codigo_Cliente = C.Cg_Cli_Codigo_Cliente
  AND A.Cg_Emp_Codigo_Empresa = C.Cg_Emp_Codigo_Empresa
INNER JOIN dbo.Pan_Pl_Cat_Empleados E
  ON A.Pl_Cem_Empleado = E.Pl_Cem_Empleado
  AND A.Cg_Emp_Codigo_Empresa = E.Cg_Emp_Codigo_Empresa
INNER JOIN dbo.Pan_Gc_Cat_Tipo_Contrato T
  ON A.Gc_Ctc_Tipo_Contrato = T.Gc_Ctc_Tipo_Contrato
  AND A.Cg_Emp_Codigo_Empresa = T.Cg_Emp_Codigo_Empresa
INNER JOIN dbo.Pan_vwXlar_GC_Precios_Cancelaciones P
  ON A.Cg_Emp_Codigo_Empresa = P.Cg_Emp_Codigo_Empresa
  AND A.Gc_Mco_Numero_Contrato = P.Gc_Mco_Numero_Contrato
INNER JOIN dbo.Pan_vwXlar_GC_Precios_Fact12_Cancelaciones F
  ON A.Cg_Emp_Codigo_Empresa = F.Cg_Emp_Codigo_Empresa
  AND A.Gc_Mco_Numero_Contrato = F.Gc_Mco_Numero_Contrato
WHERE A.Cg_Emp_Codigo_Empresa = 'PAN'
  AND CAST(A.Gc_Mco_Fecha_Final_Contrato AS date) >= '${HISTORY_START_DATE}'
  AND CAST(A.Gc_Mco_Fecha_Final_Contrato AS date) <= CAST(GETDATE() AS date)
ORDER BY cliente_codigo, contrato;
`;

async function fetchVencidosFromSqlServer() {
  const pool = await getSqlServerPool();
  const result = await pool.request().query(CLOSED_CONTRACTS_SQL);
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
      source: 'sqlserver',
      rawRows: rows.length,
      historyStartDate: HISTORY_START_DATE,
    },
  };
}

function mapSqlRow(row, rowNumber, errors) {
  const clientCode = normalizeText(row.cliente_codigo);
  const client = normalizeText(row.razon_social);
  const contractName = normalizeText(row.contrato);
  const contractType = normalizeText(row.tipo_contrato);
  const durationMonths = row.duracion == null ? null : Number.parseInt(row.duracion, 10);
  const startDate = toIsoDate(row.fecha_inicial);
  const endDate = toIsoDate(row.fecha_final);
  const cancellationDate = toIsoDate(row.fecha_cancelacion);
  const cancellationCode = normalizeText(row.codigo_cancelacion);
  const commercialOwner = normalizeText(row.responsable);

  if (!clientCode || !client || !contractName || !contractType) {
    errors.push(`Fila SQL ${rowNumber}: faltan datos base de cliente, razón social, contrato o tipo.`);
    return null;
  }

  if (!startDate || !endDate) {
    errors.push(`Fila SQL ${rowNumber}: fechas inicial/final inválidas para el contrato ${contractName}.`);
    return null;
  }

  const chargeFixedRaw = parseNullableNumber(row.cargo_fijo_dol);
  const annualTotalRaw = parseNullableNumber(row.fact_anual_dol);
  const chargeFixed = chargeFixedRaw != null ? Number(chargeFixedRaw.toFixed(2)) : null;
  const annualTotal = annualTotalRaw != null ? Number(annualTotalRaw.toFixed(2)) : null;
  const derivedTotals = deriveTotals(annualTotal == null ? chargeFixed : null, annualTotal);
  const isCancelled = Boolean(cancellationDate) || isNonZeroCode(cancellationCode);
  const canonicalStatus = isCancelled ? 'CANCELADO' : 'VENCIDO';

  return {
    client_code: clientCode,
    client,
    contract_name: contractName,
    contract_type: contractType,
    duration_months: Number.isFinite(durationMonths) ? durationMonths : null,
    start_date: startDate,
    end_date: endDate,
    cancellation_date: cancellationDate,
    canonical_status: canonicalStatus,
    cancellation_reason: isCancelled ? (cancellationCode || 'Cancelado') : '',
    status: resolveLegacyStatus(canonicalStatus, endDate),
    source_status: canonicalStatus,
    business_div_name: 'Sin clasificar',
    charge_fixed: chargeFixed,
    box_fee: null,
    service_fee: null,
    monthly_revenue: derivedTotals.monthlyRevenue,
    annual_total: derivedTotals.annualTotal,
    profitability: null,
    commercial_owner: commercialOwner,
    source_type: SOURCE_TYPE,
    source_report: 'vencidos_cancelados',
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

function isNonZeroCode(value) {
  const normalized = normalizeText(value);
  return normalized !== '' && normalized !== '0';
}

module.exports = {
  fetchVencidosFromSqlServer,
  HISTORY_START_DATE,
};