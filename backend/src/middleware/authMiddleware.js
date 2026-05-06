/**
 * Validates the app token cookie issued by the PHP auth bridge.
 * The token is a 64-char random hex value stored in performance_sales_db.contractos_sessions.
 */
const pool = require('../db/connection');

const COOKIE_NAME = process.env.AUTH_COOKIE || 'performance_sales_token';
const PROXY_SHARED_SECRET = process.env.PROXY_SHARED_SECRET || 'replace_with_shared_proxy_secret';
const ALLOW_LOCAL_DEV_AUTH = process.env.ALLOW_LOCAL_DEV_AUTH === '1';

async function authMiddleware(req, res, next) {
  try {
    const proxyUser = getTrustedProxyUser(req.headers);
    if (proxyUser) {
      req.user = proxyUser;
      return next();
    }

    if (ALLOW_LOCAL_DEV_AUTH && isLocalRequest(req)) {
      req.user = {
        id: 1,
        name: 'Local Performance Sales Admin',
        email: 'local@performance-sales.test',
        roles: ['super_admin'],
        canUploadReports: true,
      };
      return next();
    }

    const rawCookie = req.headers.cookie || '';
    const token = parseCookie(rawCookie, COOKIE_NAME);

    if (!token || !/^[0-9a-f]{64}$/.test(token)) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const [rows] = await pool.execute(
      `SELECT user_id, user_name, user_email
         FROM contractos_sessions
        WHERE token = ? AND expires_at > NOW()
        LIMIT 1`,
      [token]
    );

    if (!rows.length) {
      return res.status(401).json({ error: 'La sesion expiro o no es valida' });
    }

    req.user = {
      id:    rows[0].user_id,
      name:  rows[0].user_name,
      email: rows[0].user_email,
      roles: [],
      canUploadReports: false,
    };

    next();
  } catch (err) {
    console.error('[Auth] Middleware error:', err.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
}

function isLocalRequest(req) {
  const candidates = [
    req.ip,
    req.socket?.remoteAddress,
    req.headers['x-forwarded-for'],
    req.hostname,
    req.headers.host,
    req.headers.origin,
    req.headers.referer,
  ]
    .filter(Boolean)
    .map((value) => String(value));

  return candidates.some((value) =>
    value.includes('127.0.0.1') ||
    value.includes('localhost') ||
    value.includes('10.0.0.187') ||
    value.includes('::1')
  );
}

function parseCookie(cookieHeader, name) {
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k.trim() === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function getTrustedProxyUser(headers) {
  const secret = headers['x-performance-sales-proxy-secret'];
  if (!secret || secret !== PROXY_SHARED_SECRET) {
    return null;
  }

  const id = decodeHeaderValue(headers['x-performance-sales-user-id']);
  const name = decodeHeaderValue(headers['x-performance-sales-user-name']);
  const email = decodeHeaderValue(headers['x-performance-sales-user-email']);
  const roles = decodeJsonHeaderValue(headers['x-performance-sales-user-roles']);
  const canUploadReports = String(headers['x-performance-sales-can-upload'] || '') === '1';

  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    email: email || null,
    roles: Array.isArray(roles) ? roles : [],
    canUploadReports,
  };
}

function decodeJsonHeaderValue(value) {
  const decoded = decodeHeaderValue(value);
  if (!decoded) {
    return null;
  }

  try {
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function decodeHeaderValue(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

module.exports = authMiddleware;
