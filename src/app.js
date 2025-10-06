const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
require('dotenv').config();

const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');

console.log('🚀 ========================================');
console.log('🚀 Starting application...');
console.log('🚀 ========================================');

// Import routes
console.log('📦 Loading routes...');
const healthRoutes = require('./routes/health');
console.log('✅ Health routes loaded');
const indexRoutes = require('./routes/index');
console.log('✅ Index routes loaded');
const apiRoutes = require('./routes/api');
console.log('✅ API routes loaded');
console.log('   API routes type:', typeof apiRoutes);

const PatentScopeCrawler = require('./crawlers/patentscope'); // novo crawler

const app = express();

// Trust proxy for Railway deployment
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"]
        }
    }
}));

// CORS configuration
app.use(cors({
    origin: true,
    credentials: true,
    optionsSuccessStatus: 200
}));

// Performance middleware
app.use(compression());

// Logging middleware
app.use(morgan('combined', {
    stream: {
        write: (message) => logger.info(message.trim(), { type: 'http' })
    }
}));

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

// ---------- PatentScope route (novo) ----------
app.get('/api/data/patentscope/patents', async (req, res) => {
    const { medicine } = req.query;
    const crawler = new PatentScopeCrawler();

    try {
        await crawler.initialize();
        const patents = await crawler.search(medicine); // <- chama search()
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
        await crawler.close();
        logger.error('PatentScope crawler error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch PatentScope patents',
            message: error.message,
        });
    }
});

// Global error handler
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
    console.log('❌ 404 - Route not found:', req.method, req.originalUrl);
    res.status(404).json({
        success: false,
        error: 'Route not found',
        message: `Cannot ${req.method} ${req.originalUrl}`,
        timestamp: new Date().toISOString()
    });
});

console.log('🚀 ========================================');
console.log('🚀 All routes registered successfully');
console.log('🚀 ========================================');

module.exports = app;
