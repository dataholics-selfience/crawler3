const express = require('express');
const router = express.Router();

console.log('🔍 ========================================');
console.log('🔍 API Routes - Starting to load...');
console.log('🔍 ========================================');

let InpiCrawler;
try {
    InpiCrawler = require('../crawlers/inpiCrawler');
    console.log('✅ InpiCrawler loaded successfully');
} catch (error) {
    console.error('❌ Error loading InpiCrawler:', error.message);
}

let PatentScopeCrawler;
try {
    PatentScopeCrawler = require('../crawlers/patentscope');
    console.log('✅ PatentScopeCrawler loaded successfully');
} catch (error) {
    console.error('❌ Error loading PatentScopeCrawler:', error.message);
}

console.log('🔍 ========================================');
console.log('🔍 Registering routes...');
console.log('🔍 ========================================');

// INPI Route with authentication
router.get('/inpi/patents', async (req, res) => {
    console.log('📍 INPI route called');
    console.log('📍 Query params:', req.query);
    
    const { medicine } = req.query;
    
    if (!medicine) {
        return res.status(400).json({
            success: false,
            error: 'Medicine parameter is required'
        });
    }
    
    const credentials = {
        username: process.env.INPI_USERNAME,
        password: process.env.INPI_PASSWORD
    };
    
    if (!credentials.username || !credentials.password) {
        return res.status(401).json({
            success: false,
            error: 'INPI credentials not configured',
            message: 'Set INPI_USERNAME and INPI_PASSWORD environment variables'
        });
    }
    
    const crawler = new InpiCrawler(credentials);
    
    try {
        console.log('Initializing INPI crawler for:', medicine);
        await crawler.initialize();
        
        console.log('Searching INPI patents...');
        const patents = await crawler.searchPatents(medicine);
        console.log('Found', patents.length, 'INPI patents');
        
        res.json({
            success: true,
            query: medicine,
            source: 'INPI Brazil',
            totalResults: patents.length,
            timestamp: new Date().toISOString(),
            patents
        });
    } catch (error) {
        console.error('INPI crawler error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch INPI patents',
            message: error.message
        });
    } finally {
        await crawler.close();
    }
});

// PatentScope Route
router.get('/patentscope/patents', async (req, res) => {
    console.log('📍 PatentScope route called');
    console.log('📍 Query params:', req.query);
    
    const { medicine } = req.query;
    
    if (!medicine) {
        return res.status(400).json({
            error: 'Medicine parameter is required'
        });
    }
    
    if (!PatentScopeCrawler) {
        return res.status(500).json({
            success: false,
            error: 'PatentScope crawler not available'
        });
    }
    
    const crawler = new PatentScopeCrawler();
    
    try {
        console.log('Starting PatentScope search for:', medicine);
        await crawler.initialize();
        
        console.log('Searching PatentScope patents...');
        const patents = await crawler.searchPatents(medicine);
        console.log('Found', patents.length, 'PatentScope patents');
        
        res.json({
            success: true,
            query: medicine,
            source: 'PatentScope (WIPO)',
            totalResults: patents.length,
            timestamp: new Date().toISOString(),
            patents
        });
    } catch (error) {
        console.error('PatentScope crawler error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch PatentScope patents',
            message: error.message
        });
    } finally {
        await crawler.close();
    }
});

// Compare Route
router.get('/compare/patents', async (req, res) => {
    console.log('📍 Compare route called');
    console.log('📍 Query params:', req.query);
    
    const { medicine } = req.query;
    
    if (!medicine) {
        return res.status(400).json({
            error: 'Medicine parameter is required'
        });
    }
    
    const credentials = {
        username: process.env.INPI_USERNAME,
        password: process.env.INPI_PASSWORD
    };
    
    const inpiCrawler = new InpiCrawler(credentials);
    const patentscopeCrawler = new PatentScopeCrawler();
    
    try {
        console.log('Starting comparison search...');
        const [inpiResults, patentscopeResults] = await Promise.all([
            (async () => {
                try {
                    await inpiCrawler.initialize();
                    const results = await inpiCrawler.searchPatents(medicine);
                    await inpiCrawler.close();
                    return results;
                } catch (err) {
                    console.error('INPI comparison error:', err.message);
                    return [];
                }
            })(),
            (async () => {
                try {
                    await patentscopeCrawler.initialize();
                    const results = await patentscopeCrawler.searchPatents(medicine);
                    await patentscopeCrawler.close();
                    return results;
                } catch (err) {
                    console.error('PatentScope comparison error:', err.message);
                    return [];
                }
            })()
        ]);
        
        res.json({
            success: true,
            query: medicine,
            timestamp: new Date().toISOString(),
            comparison: {
                inpi: {
                    source: 'INPI Brazil',
                    totalResults: inpiResults.length,
                    patents: inpiResults.slice(0, 20)
                },
                patentscope: {
                    source: 'PatentScope (WIPO)',
                    totalResults: patentscopeResults.length,
                    patents: patentscopeResults.slice(0, 20)
                }
            },
            summary: {
                totalPatents: inpiResults.length + patentscopeResults.length,
                inpiBrazil: inpiResults.length,
                patentscopeInternational: patentscopeResults.length
            }
        });
    } catch (error) {
        console.error('Comparison error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Failed to compare patents',
            message: error.message
        });
    }
});

console.log('✅ Route /inpi/patents registered');
console.log('✅ Route /patentscope/patents registered');
console.log('✅ Route /compare/patents registered');
console.log('🔍 ========================================');
console.log('✅ All routes registered successfully');
console.log('🔍 ========================================');

module.exports = router;
