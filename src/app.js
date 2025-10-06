const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');

// Rotas
const healthRoutes = require('./routes/health');
const indexRoutes = require('./routes/index');
const apiRoutes = require('./routes/api');

// Crawlers
const INPICrawler = require('./crawlers/inpiCrawler');
const PatentScopeCrawler = require('./crawlers/patentscope');

console.log('🚀 ========================================');
console.log('🚀 Starting application...');
console.log('🚀 ========================================');

console.log('📦 Loading routes...');
console.log('✅ Health routes loaded');
console.log('✅ Index routes loaded');
console.log('✅ API routes loaded');

const app = express();

// Trust proxy for Railway deployment
app.set('trust proxy', 1);

// Security middleware
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  })
);

// CORS configuration
app.use(
  cors({
    origin: true,
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

// Performance middleware
app.use(compression());

// Logging middleware
app.use(
  morgan('combined', {
    stream: {
      write: (message) => logger.info(message.trim(), { type: 'http' }),
    },
  })
);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use('/api/', rateLimiter.apiLimiter);
app.use('/api/data/', rateLimiter.crawlerLimiter);

// Routes
console.log('🔗 Registering routes...');
app.use('/health', healthRoutes);
console.log('✅ Registered: /health');
app.use('/', indexRoutes);
console.log('✅ Registered: /');
app.use('/api/data', apiRoutes);
console.log('✅ Registered: /api/data');

// ===== Custom crawler endpoints =====

// PatentScope endpoint
app.get('/api/data/patentscope/patents', async (req, res) => {
  const { medicine } = req.query;
  if (!medicine) {
    return res.status(400).json({
      success: false,
      error: 'Missing parameter',
      message: 'Query parameter "medicine" is required',
      timestamp: new Date().toISOString(),
    });
  }

  const crawler = new PatentScopeCrawler();
  try {
    logger.info(`Starting PatentScope search for: ${medicine}`);
    await crawler.initialize();
    const patents = await crawler.search(medicine, 5); // <--- corrigido
    await crawler.close();

    res.json({
      success: true,
      query: medicine,
      source: 'PatentScope (WIPO)',
      totalResults: patents.length,
      timestamp: new Date().toISOString(),
      patents,
    });
  } catch (error) {
    logger.error('PatentScope crawler error:', error);
    try { await crawler.close(); } catch (e) {}
    res.status(500).json({
      success: false,
      error: 'Failed to fetch PatentScope patents',
      message: error.message || 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

// INPI endpoint
app.get('/api/data/inpi/patents', async (req, res) => {
  const { medicine } = req.query;
  if (!medicine) {
    return res.status(400).json({
      success: false,
      error: 'Missing parameter',
      message: 'Query parameter "medicine" is required',
      timestamp: new Date().toISOString(),
    });
  }

  const crawler = new INPICrawler();
  try {
    logger.info(`Initializing INPI crawler for: ${medicine}`);
    await crawler.initialize();
    const patents = await crawler.search(medicine);
    await crawler.close();

    res.json({
      success: true,
      query: medicine,
      source: 'INPI',
      totalResults: patents.length,
      timestamp: new Date().toISOString(),
      patents,
    });
  } catch (error) {
    logger.error('INPI crawler error:', error);
    try { await crawler.close(); } catch (e) {}
    res.status(500).json({
      success: false,
      error: 'Failed to fetch INPI patents',
      message: error.message || 'Unknown error',
      timestamp: new Date().toISOString(),
    });
  }
});

// Global error handler
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  logger.warn('❌ 404 - Route not found', { method: req.method, url: req.originalUrl });
  res.status(404).json({
    success: false,
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
  });
});

console.log('🚀 ========================================');
console.log('🚀 All routes registered successfully');
console.log('🚀 ========================================');

module.exports = app;
