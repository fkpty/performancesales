const { getSqlServerPool } = require('../db/sqlserver');
const {
  normalizeText,
  parseNullableNumber,
  toIsoDate,
} = require('../utils/importRecordUtils');

const EXCLUDED_CONTRACT_TYPES = ['USI', 'GAR'];

const ACTIVE_VIGENTES_SERIES_SQL = `
SELECT
  LTRIM(RTRIM(dbo.Pan_Cg_Cat_CLientes.Cg_Sgm_Segmento_Mercado)) AS segmento,
  LTRIM(RTRIM(dbo.Pan_Cg_Cat_CLientes.Cg_Zco_Cod_Zona_Cobro)) AS billing_zone,
  LTRIM(RTRIM(dbo.Pan_Gc_Mae_Contrato.Gc_Mco_Precios_Por_Contrato)) AS price_mode,
  LTRIM(RTRIM(dbo.Pan_Gc_Mae_Contrato.Cg_Cli_Codigo_Cliente)) AS client_code,
  LTRIM(RTRIM(dbo.Pan_Cg_Cat_CLientes.Cg_Cli_Razon_Social)) AS client,
  LTRIM(RTRIM(dbo.Pan_Gc_Mae_Contrato.Gc_Mco_Numero_Contrato)) AS contract_name,
  LTRIM(RTRIM(dbo.Pan_Gc_Mae_Contrato.Gc_Ctc_Tipo_Contrato)) AS contract_type,
  LTRIM(RTRIM(dbo.Pan_Gc_Mae_Contrato.Gc_Mco_Periodicidad)) AS frequency,
  dbo.Pan_Gc_Mae_Contrato.Gc_Mco_Numero_Meses AS duration_months,
  CONVERT(varchar(10), dbo.Pan_Gc_Mae_Contrato.Gc_Mco_Fecha_Inicial_Contrato, 23) AS start_date,
  CONVERT(varchar(10), dbo.Pan_Gc_Mae_Contrato.Gc_Mco_Fecha_Final_Contrato, 23) AS end_date,
  LTRIM(RTRIM(dbo.Pan_Gc_Det_Contrato.Ie_Meq_Serie)) AS equipment_series,
  LTRIM(RTRIM(dbo.Pan_Gc_Det_Contrato.Ie_Mre_Resumido)) AS model,
  LTRIM(RTRIM(dbo.Pan_Gc_Det_Contrato.Ie_Cpr_Producto)) AS product,
  LTRIM(RTRIM(dbo.Pan_Ie_Cat_Productos.Ie_Mod_Ind_Accesorio)) AS accessory,
  dbo.Pan_Gc_Det_Precios.Gc_Dec_Copiado_Minimo AS min_copies,
  dbo.Pan_Gc_Det_Precios.Gc_Dec_Copiado_Minimo_Color AS min_color_copies,
  dbo.Pan_Gc_Det_Precios.Gc_Dec_Cargo_Fijo AS charge_fixed,
  dbo.Pan_Gc_Det_Precios.Gc_Dde_CuotaBox AS box_fee,
  dbo.Pan_Gc_Det_Precios.Gc_Dde_CuotaServicio AS service_fee,
  dbo.Pan_Gc_Det_Contrato.Gc_Dco_CopiadoPromedio AS average_copies,
  LTRIM(RTRIM(dbo.Pan_Gc_Det_Escalas_Copiado.Gc_Dec_Tipo_Escala)) AS scale_type,
  dbo.Pan_Gc_Det_Escalas_Copiado.Gc_Dec_Numero_Escala AS scale_number,
  dbo.Pan_Gc_Det_Escalas_Copiado.Gc_Dec_Copiado_Desde AS scale_from,
  dbo.Pan_Gc_Det_Escalas_Copiado.Gc_Dec_Copiado_Hasta AS scale_to,
  dbo.Pan_Gc_Det_Escalas_Copiado.Gc_Dec_Precio_Por_Copia AS scale_price_per_copy,
  LTRIM(RTRIM(dbo.Pan_Gc_Mae_Contrato.Gc_Mco_Literal_Facturas)) AS invoice_literal,
  LTRIM(RTRIM(dbo.Pan_Ie_Det_Direcciones_Equipos.Ie_Meq_Dir_Instal)) AS installation_address,
  LTRIM(RTRIM(dbo.Pan_Cg_Cat_CLientes.Cg_Cli_Telefono1)) AS phone1,
  LTRIM(RTRIM(dbo.Pan_Cg_Cat_CLientes.Cg_Cli_Telefono2)) AS phone2,
  LTRIM(RTRIM(dbo.Pan_Pl_Cat_Empleados.Pl_Cem_Nombre)) AS commercial_owner
FROM dbo.Pan_Gc_Det_Escalas_Copiado
RIGHT JOIN (
  (
    (
      (
        (
          (
            dbo.Pan_Gc_Mae_Contrato
            INNER JOIN dbo.Pan_Gc_Det_Contrato
              ON dbo.Pan_Gc_Mae_Contrato.Gc_Mco_Numero_Contrato = dbo.Pan_Gc_Det_Contrato.Gc_Mco_Numero_Contrato
             AND dbo.Pan_Gc_Mae_Contrato.Cg_Emp_Codigo_Empresa = dbo.Pan_Gc_Det_Contrato.Cg_Emp_Codigo_Empresa
          )
          INNER JOIN dbo.Pan_Ie_Det_Direcciones_Equipos
            ON dbo.Pan_Gc_Det_Contrato.Ie_Meq_Serie = dbo.Pan_Ie_Det_Direcciones_Equipos.Ie_Meq_Serie
           AND dbo.Pan_Gc_Det_Contrato.Cg_Emp_Codigo_Empresa = dbo.Pan_Ie_Det_Direcciones_Equipos.Cg_Emp_Codigo_Empresa
        )
        INNER JOIN dbo.Pan_Cg_Cat_CLientes
          ON dbo.Pan_Gc_Mae_Contrato.Cg_Cli_Codigo_Cliente = dbo.Pan_Cg_Cat_CLientes.Cg_Cli_Codigo_Cliente
         AND dbo.Pan_Gc_Mae_Contrato.Cg_Emp_Codigo_Empresa = dbo.Pan_Cg_Cat_CLientes.Cg_Emp_Codigo_Empresa
      )
      LEFT JOIN dbo.Pan_Pl_Cat_Empleados
        ON dbo.Pan_Gc_Mae_Contrato.Pl_Cem_Empleado = dbo.Pan_Pl_Cat_Empleados.Pl_Cem_Empleado
       AND dbo.Pan_Gc_Mae_Contrato.Cg_Emp_Codigo_Empresa = dbo.Pan_Pl_Cat_Empleados.Cg_Emp_Codigo_Empresa
    )
    INNER JOIN dbo.Pan_Ie_Cat_Productos
      ON dbo.Pan_Gc_Det_Contrato.Ie_Cpr_Producto = dbo.Pan_Ie_Cat_Productos.Ie_Cpr_Producto
     AND dbo.Pan_Gc_Det_Contrato.Cg_Emp_Codigo_Empresa = dbo.Pan_Ie_Cat_Productos.Cg_Emp_Codigo_Empresa
  )
  INNER JOIN dbo.Pan_Gc_Det_Precios
    ON dbo.Pan_Gc_Det_Contrato.Ie_Cpr_Producto = dbo.Pan_Gc_Det_Precios.Ie_Cpr_Producto
   AND dbo.Pan_Gc_Det_Contrato.Ie_Mre_Resumido = dbo.Pan_Gc_Det_Precios.Ie_Mre_Resumido
   AND dbo.Pan_Gc_Det_Contrato.Gc_Mco_Numero_Contrato = dbo.Pan_Gc_Det_Precios.Gc_Mco_Numero_Contrato
   AND dbo.Pan_Gc_Det_Contrato.Cg_Emp_Codigo_Empresa = dbo.Pan_Gc_Det_Precios.Cg_Emp_Codigo_Empresa
) ON dbo.Pan_Gc_Det_Escalas_Copiado.Ie_Cpr_Producto = dbo.Pan_Gc_Det_Contrato.Ie_Cpr_Producto
 AND dbo.Pan_Gc_Det_Escalas_Copiado.Ie_Mre_Resumido = dbo.Pan_Gc_Det_Contrato.Ie_Mre_Resumido
 AND dbo.Pan_Gc_Det_Escalas_Copiado.Gc_Mco_Numero_Contrato = dbo.Pan_Gc_Det_Contrato.Gc_Mco_Numero_Contrato
 AND dbo.Pan_Gc_Det_Escalas_Copiado.Cg_Emp_Codigo_Empresa = dbo.Pan_Gc_Det_Contrato.Cg_Emp_Codigo_Empresa
WHERE
  dbo.Pan_Gc_Mae_Contrato.Gc_Ctc_Tipo_Contrato NOT IN ('USI', 'GAR')
  AND dbo.Pan_Gc_Mae_Contrato.Gc_Cca_Codigo_Cancelacion = '0'
  AND dbo.Pan_Gc_Det_Contrato.Gc_Dco_Periodo_Retiro IS NULL
  AND CAST(dbo.Pan_Gc_Mae_Contrato.Gc_Mco_Fecha_Final_Contrato AS date) > CAST(GETDATE() AS date)
ORDER BY
  dbo.Pan_Gc_Mae_Contrato.Cg_Cli_Codigo_Cliente,
  dbo.Pan_Gc_Mae_Contrato.Gc_Mco_Numero_Contrato,
  dbo.Pan_Gc_Det_Contrato.Ie_Meq_Serie,
  dbo.Pan_Gc_Det_Escalas_Copiado.Gc_Dec_Numero_Escala;
`;

async function fetchContractSeriesFromSqlServer() {
  const pool = await getSqlServerPool();
  const result = await pool.request().query(ACTIVE_VIGENTES_SERIES_SQL);
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
  const clientCode = normalizeText(row.client_code);
  const client = normalizeText(row.client);
  const contractName = normalizeText(row.contract_name);
  const contractType = normalizeText(row.contract_type);
  const equipmentSeries = normalizeText(row.equipment_series);
  const startDate = toIsoDate(row.start_date);
  const endDate = toIsoDate(row.end_date);

  if (!clientCode || !client || !contractName || !contractType || !equipmentSeries) {
    errors.push(`Fila SQL ${rowNumber}: faltan datos base de cliente, contrato, tipo o serie.`);
    return null;
  }

  if (!startDate || !endDate) {
    errors.push(`Fila SQL ${rowNumber}: fechas inicial/final invalidas para el contrato ${contractName} serie ${equipmentSeries}.`);
    return null;
  }

  return {
    segment: normalizeText(row.segmento),
    billing_zone: normalizeText(row.billing_zone),
    price_mode: normalizeText(row.price_mode),
    client_code: clientCode,
    client,
    contract_name: contractName,
    contract_type: contractType,
    frequency: normalizeText(row.frequency),
    duration_months: row.duration_months == null ? null : Number.parseInt(row.duration_months, 10),
    start_date: startDate,
    end_date: endDate,
    equipment_series: equipmentSeries,
    model: normalizeText(row.model),
    product: normalizeText(row.product),
    accessory: normalizeText(row.accessory),
    min_copies: parseNullableNumber(row.min_copies),
    min_color_copies: parseNullableNumber(row.min_color_copies),
    charge_fixed: parseNullableNumber(row.charge_fixed),
    box_fee: parseNullableNumber(row.box_fee),
    service_fee: parseNullableNumber(row.service_fee),
    average_copies: parseNullableNumber(row.average_copies),
    scale_type: normalizeText(row.scale_type),
    scale_number: row.scale_number == null ? null : Number.parseInt(row.scale_number, 10),
    scale_from: parseNullableNumber(row.scale_from),
    scale_to: parseNullableNumber(row.scale_to),
    scale_price_per_copy: parseNullableNumber(row.scale_price_per_copy),
    invoice_literal: normalizeText(row.invoice_literal),
    installation_address: normalizeText(row.installation_address),
    phone1: normalizeText(row.phone1),
    phone2: normalizeText(row.phone2),
    commercial_owner: normalizeText(row.commercial_owner),
  };
}

module.exports = {
  EXCLUDED_CONTRACT_TYPES,
  fetchContractSeriesFromSqlServer,
};