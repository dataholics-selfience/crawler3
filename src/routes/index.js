const express = require('express');
const router = express.Router();
const apiRoutes = require('./api');
const healthRoutes = require('./health');

// Mount the API routes under /api/data
router.use('/api/data', apiRoutes);

// Mount health routes
router.use('/', healthRoutes);

// Root endpoint
router.get('/', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Patent Crawler API',
        endpoints: {
            inpi: '/api/data/inpi/patents?medicine=nome',
            patentscope: '/api/data/patentscope/patents?medicine=nome',
            compare: '/api/data/compare/patents?medicine=nome',
            health: '/health'
        }
    });
});

module.exports = router;
