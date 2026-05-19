/**
 * Run once to create performance_sales_db tables.
 * Usage: node src/db/setup.js
 */
require('dotenv').config();
const fs    = require('fs');
const path  = require('path');
const mysql = require('mysql2/promise');

async function setup() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || '10.0.0.187',
    port:     parseInt(process.env.DB_PORT || '3306', 10),
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await conn.query(sql);
  console.log('[Setup] Base de datos y tablas creadas correctamente.');
  await conn.end();
}

setup().catch(err => { console.error('[Setup] Error:', err.message); process.exit(1); });
