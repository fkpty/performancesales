const { getHubPool } = require('../db/hubConnection');

const HUB_USER_MODEL_TYPE = 'App\\Models\\User';

async function listHubUsers() {
  const pool = getHubPool();
  const [rows] = await pool.query(
    `SELECT
        u.id,
        TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS full_name,
        NULLIF(TRIM(u.email), '') AS email,
        GROUP_CONCAT(DISTINCT LOWER(TRIM(r.name)) ORDER BY LOWER(TRIM(r.name)) SEPARATOR ',') AS role_names
       FROM users u
       LEFT JOIN model_has_roles mhr
         ON mhr.model_type = ?
        AND mhr.model_id = u.id
       LEFT JOIN roles r
         ON r.id = mhr.role_id
      WHERE u.deleted_at IS NULL
        AND u.is_active = 1
      GROUP BY u.id, u.first_name, u.last_name, u.email
      ORDER BY full_name ASC, u.id ASC`,
    [HUB_USER_MODEL_TYPE]
  );

  return rows.map(mapHubUserRow);
}

function mapHubUserRow(row) {
  const fullName = String(row?.full_name || '').trim();
  const email = String(row?.email || '').trim();
  const roles = String(row?.role_names || '')
    .split(',')
    .map((roleName) => String(roleName || '').trim().toLowerCase())
    .filter(Boolean);

  return {
    id: Number(row?.id || 0),
    full_name: fullName || email || `Usuario #${row?.id || ''}`,
    email: email || null,
    roles,
  };
}

module.exports = {
  listHubUsers,
};