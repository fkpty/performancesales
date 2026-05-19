require('dotenv').config();
const sql = require('mssql');

let poolPromise = null;

function buildConfig() {
  return {
    server: process.env.SQLSERVER_HOST || '10.0.0.187',
    port: parseInt(process.env.SQLSERVER_PORT || '1433', 10),
    database: process.env.SQLSERVER_DB_NAME || '',
    user: process.env.SQLSERVER_USER || '',
    password: process.env.SQLSERVER_PASSWORD || '',
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    options: {
      encrypt: String(process.env.SQLSERVER_ENCRYPT || 'false').toLowerCase() === 'true',
      trustServerCertificate: String(process.env.SQLSERVER_TRUST_CERT || 'true').toLowerCase() !== 'false',
      enableArithAbort: true,
      useUTC: true,
    },
  };
}

async function getSqlServerPool() {
  if (!poolPromise) {
    const pool = new sql.ConnectionPool(buildConfig());
    poolPromise = pool.connect().catch((error) => {
      poolPromise = null;
      throw error;
    });
  }

  return poolPromise;
}

module.exports = { getSqlServerPool, sql };