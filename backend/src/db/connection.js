require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:             process.env.DB_HOST     || '10.0.0.187',
  port:             parseInt(process.env.DB_PORT || '3306', 10),
  user:             process.env.DB_USER     || 'root',
  password:         process.env.DB_PASSWORD || '',
  database:         process.env.DB_NAME     || 'performance_sales_db',
  waitForConnections: true,
  connectionLimit:  10,
  queueLimit:       0,
  timezone:         '+00:00',
  dateStrings:      false,
});

// Warm-up – fail fast on bad config
pool.getConnection()
  .then(conn => { conn.release(); console.log('[DB] Pool conectado a', process.env.DB_NAME); })
  .catch(err  => { console.error('[DB] La conexion fallo:', err.message); process.exit(1); });

module.exports = pool;
