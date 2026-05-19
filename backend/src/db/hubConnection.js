require('dotenv').config();
const mysql = require('mysql2/promise');

let hubPool;

function getHubPool() {
  if (!hubPool) {
    hubPool = mysql.createPool({
      host: process.env.HUB_DB_HOST || process.env.DB_HOST || '10.0.0.187',
      port: parseInt(process.env.HUB_DB_PORT || process.env.DB_PORT || '3306', 10),
      user: process.env.HUB_DB_USER || process.env.DB_USER || 'root',
      password: process.env.HUB_DB_PASSWORD || process.env.DB_PASSWORD || '',
      database: process.env.HUB_DB_NAME || 'pbs_hub',
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
      timezone: '+00:00',
      dateStrings: false,
    });
  }

  return hubPool;
}

module.exports = {
  getHubPool,
};