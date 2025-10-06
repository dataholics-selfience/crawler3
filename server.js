const app = require('./src/app');
const logger = require('./src/utils/logger');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  logger.info(`Patent Crawler API server running on port ${PORT}`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown handling for Railway
const shutdown = (signal) => {
  logger.info(`${signal} received, shutting down gracefully`);
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle unhandled promise rejections safely
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);

  // Apenas loga o erro, não fecha o servidor automaticamente
  // Isso garante que outros crawlers, como INPI, continuem funcionando
});

// Catch uncaught exceptions without stopping other services
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  // Não encerra o servidor, só loga
});

module.exports = server;
