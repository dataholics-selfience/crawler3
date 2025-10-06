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

const PatentScopeCrawler = require('./crawlers/patentscope');

const app = express();
app.set('trust proxy', 1);

// Segurança
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

// CORS
app.use(cors({ origin: true, credentials: true, optionsSuccessStatus: 200 }));

// Performance
app.use(compression());

// Logging HTTP
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim(), { type: 'http' }) } }));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use('/api/', rateLimiter.apiLimiter);
app.use('/api/data/', rateLimiter.crawlerLimiter);

// Rotas principais
app.use('/health', healthRoutes);
app.use('/', indexRoutes);
app.use('/api/data', apiRoutes);

// Rota temporária para PatentScope (novo crawler)
app.get('/api/data/patentscope/patents', async (req, res) => {
    const { medicine } = req.query;
    const crawler = new PatentScopeCrawler();

    try {
        await crawler.initialize();
        const patents = await crawler.search(medicine, 5); // até 5 páginas
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

// 404
app.use('*', (req, res) => {
    logger.warn(`404 - Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        success: false,
        error: 'Route not found',
        message: `Cannot ${req.method} ${req.originalUrl}`,
        timestamp: new Date().toISOString()
    });
});

module.exports = app;
