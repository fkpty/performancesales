require('dotenv').config();
const path         = require('path');
const express      = require('express');
const cors         = require('cors');
const rateLimit    = require('express-rate-limit');
const ensureSchema   = require('./db/ensureSchema');
const authMiddleware = require('./middleware/authMiddleware');
const errorHandler   = require('./middleware/errorHandler');

const uploadRoute    = require('./routes/upload');
const contractsRoute = require('./routes/contracts');
const analyticsRoute = require('./routes/analytics');
const performanceRoute = require('./routes/performance');
const efficiencyRoute = require('./routes/efficiency');
const settingsRoute  = require('./routes/settings');

const app  = express();
const PORT = parseInt(process.env.PORT || '3002', 10);
const BIND_HOST = process.env.BIND_HOST || '0.0.0.0';
const publicDir = path.resolve(__dirname, '..', '..', 'public');

// ─── CORS ────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGINS || 'https://hub.collab.grouppbs.com,http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map(s => s.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) {
      cb(null, true);
    } else {
      cb(new Error(`CORS: el origen "${origin}" no esta permitido`));
    }
  },
  credentials: true,
}));

// ─── Body parsing ────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// ─── Rate limiting ───────────────────────────────────────────
app.use('/api/', rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max:      120,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' },
}));

// Stricter limit on uploads
app.use('/api/upload', rateLimit({
  windowMs: 60 * 1000,
  max:      10,
  message: { error: 'Se alcanzo el limite de cargas. Espera un minuto.' },
}));

app.use('/api/performance/uploads', rateLimit({
  windowMs: 60 * 1000,
  max:      10,
  message: { error: 'Se alcanzo el limite de cargas. Espera un minuto.' },
}));

// ─── Health (no auth) ─────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ─── Auth guard for all /api/* routes ────────────────────────
app.use('/api', authMiddleware);

// ─── Routes ───────────────────────────────────────────────────
app.use('/api/upload',    uploadRoute);
app.use('/api/contracts', contractsRoute);
app.use('/api/analytics', analyticsRoute);
app.use('/api/performance', performanceRoute);
app.use('/api/efficiency', efficiencyRoute);
app.use('/api/settings',  settingsRoute);

app.use('/performance-sales', express.static(publicDir));
app.use('/performance-sales/public', express.static(publicDir));

app.get(['/','/performance-sales','/performance-sales/','/performance-sales/public','/performance-sales/public/index.html'], (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ─── 404 ──────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// ─── Error handler ────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────
async function start() {
  await ensureSchema();
  app.listen(PORT, BIND_HOST, () => {
    console.log(`[API] ContractFlow API ejecutandose en http://${BIND_HOST}:${PORT}`);
  });
}

start().catch((error) => {
  console.error(`[API] Error al iniciar: ${error.message}`);
  process.exit(1);
});

module.exports = app;
