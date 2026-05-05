const { getSqlServerPool, sql } = require('../db/sqlserver');
const { normalizeText } = require('../utils/importRecordUtils');

const COMPANY_CODE = 'PAN';
const LOOKUP_CHUNK_SIZE = 500;

async function attachCommercialOwnerNames(records = []) {
  if (!Array.isArray(records) || records.length === 0) {
    return records;
  }

  const uniqueCodes = Array.from(new Set(
    records
      .map(record => normalizeEmployeeCode(record.commercial_owner_code))
      .filter(Boolean)
  ));

  if (uniqueCodes.length === 0) {
    return records;
  }

  const ownersByCode = await fetchOwnerNamesByCode(uniqueCodes);

  return records.map((record) => {
    const commercialOwnerCode = normalizeEmployeeCode(record.commercial_owner_code);
    if (!commercialOwnerCode) {
      return record;
    }

    const resolvedOwner = ownersByCode.get(commercialOwnerCode) || normalizeText(record.commercial_owner);

    return {
      ...record,
      commercial_owner_code: commercialOwnerCode,
      commercial_owner: resolvedOwner,
    };
  });
}

async function fetchOwnerNamesByCode(employeeCodes) {
  const ownersByCode = new Map();
  const pool = await getSqlServerPool();

  for (let index = 0; index < employeeCodes.length; index += LOOKUP_CHUNK_SIZE) {
    const chunk = employeeCodes.slice(index, index + LOOKUP_CHUNK_SIZE);
    const request = pool.request();
    const placeholders = chunk.map((code, chunkIndex) => {
      const paramName = `code${chunkIndex}`;
      request.input(paramName, sql.VarChar(100), code);
      return `@${paramName}`;
    });

    const result = await request.query(`
      SELECT
        LTRIM(RTRIM(Pl_Cem_Empleado)) AS commercial_owner_code,
        LTRIM(RTRIM(Pl_Cem_Nombre)) AS commercial_owner
      FROM dbo.Pan_Pl_Cat_Empleados
      WHERE Cg_Emp_Codigo_Empresa = '${COMPANY_CODE}'
        AND LTRIM(RTRIM(Pl_Cem_Empleado)) IN (${placeholders.join(', ')})
    `);

    for (const row of result.recordset || []) {
      const commercialOwnerCode = normalizeEmployeeCode(row.commercial_owner_code);
      if (!commercialOwnerCode) {
        continue;
      }

      ownersByCode.set(commercialOwnerCode, normalizeText(row.commercial_owner));
    }
  }

  return ownersByCode;
}

function normalizeEmployeeCode(value) {
  return String(value?.text || value || '').trim();
}

module.exports = {
  attachCommercialOwnerNames,
};