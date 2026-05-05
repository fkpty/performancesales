function errorHandler(err, _req, res, _next) {
  console.error('[Error]', err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: err.message || 'Error interno del servidor' });
}

module.exports = errorHandler;
