const express = require('express');
const router = express.Router();
const ResponseFormatter = require('../utils/responseFormatter');
const logger = require('../utils/logger');

router.get('/', (req, res) => {
  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: Math.floor(process.uptime()),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100,
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024 * 100) / 100
    },
    services: {
      groq_api: process.env.GROQ_API_KEY ? 'configured' : 'not_configured'
    }
  };

  res.status(200).json(ResponseFormatter.success(healthData, 'Service is healthy'));
});

router.get('/ping', (req, res) => {
  res.status(200).json({ pong: true, timestamp: new Date().toISOString() });
});

module.exports = router;
