const express = require('express');
const router = express.Router();

console.log('🔍 ========================================');
console.log('🔍 API Routes - Starting to load...');
console.log('🔍 ========================================');

// Test InpiCrawler loading
let InpiCrawler;
try {
    InpiCrawler = require('../crawlers/inpiCrawler');
    console.log('✅ InpiCrawler loaded successfully');
    console.log('   Type:', typeof InpiCrawler);
} catch (error) {
    console.error('❌ Error loading InpiCrawler:', error.message);
    console.error('   Stack:', error.stack);
}

// Test PatentScopeCrawler loading
let PatentScopeCrawler;
try {
    PatentScopeCrawler = require('../crawlers/patentscope');
    console.log('✅ PatentScopeCrawler loaded successfully');
    console.log('   Type:', typeof PatentScopeCrawler);
} catch (error) {
    console.error('❌ Error loading PatentScopeCrawler:', error.message);
    console.error('   Stack:', error.stack);
}

console.log('🔍 ========================================');
console.log('🔍 Registering routes...');
console.log('🔍 ========================================');

// INPI Route
router.get('/inpi/patents', async (req, res) => {
    console.log('📍 ========================================');
    console.log('📍 INPI route called');
    console.log('📍 Query params:', req.query);
    console.log('📍 ========================================');
    
    const { medicine } = req.query;
    
    if (!medicine) {
        console.log('⚠️  Missing medicine parameter');
        return res.status(400).json({
            error: 'Medicine parameter is required'
        });
    }
    
    const crawler = new InpiCrawler();
    
    try {
        console.log(`🔍 Initializing INPI crawler for: ${medicine}`);
        await crawler.initialize();
        console.log('✅ INPI crawler initialized');
        
        console.log('🔍 Searching INPI patents...');
        const patents = await crawler.searchPatents(medicine);
        console.log(`✅ Found ${patents.length} INPI patents`);
        
        const response = {
            success: true,
            query: medicine,
            source: 'INPI Brazil',
            totalResults: patents.length,
            timestamp: new Date().toISOString(),
            patents: patents
        };
        
        res.json(response);
    } catch (error) {
        console.error('❌ INPI crawler error:', error.message);
        console.error('   Stack:', error.stack);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch INPI patents',
            message: error.message
        });
    } finally {
        await crawler.close();
        console.log('🔒 INPI crawler closed');
    }
});

// PatentScope Route
router.get('/patentscope/patents', async (req, res) => {
    console.log('📍 ========================================');
    console.log('📍 PatentScope route called');
    console.log('📍 Query params:', req.query);
    console.log('📍 ========================================');
    
    const { medicine } = req.query;
    
    if (!medicine) {
        console.log('⚠️  Missing medicine parameter');
        return res.status(400).json({
            error: 'Medicine parameter is required'
        });
    }
    
    if (!PatentScopeCrawler) {
        console.error('❌ PatentScopeCrawler not loaded!');
        return res.status(500).json({
            success: false,
            error: 'PatentScope crawler not available',
            message: 'Failed to load PatentScope crawler module'
        });
    }
    
    const crawler = new PatentScopeCrawler();
    
    try {
        console.log(`🔍 Starting PatentScope search for: ${medicine}`);
        await crawler.initialize();
        console.log('✅ PatentScope crawler initialized');
        
        console.log('🔍 Searching PatentScope patents...');
        const patents = await crawler.searchPatents(medicine);
        console.log(`✅ Found ${patents.length} PatentScope patents`);
        
        const response = {
            success: true,
            query: medicine,
            source: 'PatentScope (WIPO)',
            totalResults: patents.length,
            timestamp: new Date().toISOString(),
            patents: patents
        };
        
        res.json(response);
    } catch (error) {
        console.error('❌ PatentScope crawler error:', error.message);
        console.error('   Stack:', error.stack);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch PatentScope patents',
            message: error.message
        });
    } finally {
        await crawler.close();
        console.log('🔒 PatentScope crawler closed');
    }
});

// Compare Route
router.get('/compare/patents', async (req, res) => {
    console.log('📍 ========================================');
    console.log('📍 Compare route called');
    console.log('📍 Query params:', req.query);
    console.log('📍 ========================================');
    
    const { medicine } = req.query;
    
    if (!medicine) {
        console.log('⚠️  Missing medicine parameter');
        return res.status(400).json({
            error: 'Medicine parameter is required'
        });
    }
    
    const inpiCrawler = new InpiCrawler();
    const patentscopeCrawler = new PatentScopeCrawler();
    
    try {
        console.log('🔍 Starting comparison search...');
        const [inpiResults, patentscopeResults] = await Promise.all([
            (async () => {
                try {
                    console.log('🔍 INPI comparison search starting...');
                    await inpiCrawler.initialize();
                    const results = await inpiCrawler.searchPatents(medicine);
                    await inpiCrawler.close();
                    console.log(`✅ INPI comparison: ${results.length} results`);
                    return results;
                } catch (err) {
                    console.error('❌ INPI comparison search error:', err.message);
                    return [];
                }
            })(),
            (async () => {
                try {
                    console.log('🔍 PatentScope comparison search starting...');
                    await patentscopeCrawler.initialize();
                    const results = await patentscopeCrawler.searchPatents(medicine);
                    await patentscopeCrawler.close();
                    console.log(`✅ PatentScope comparison: ${results.length} results`);
                    return results;
                } catch (err) {
                    console.error('❌ PatentScope comparison search error:', err.message);
                    return [];
                }
            })()
        ]);
        
        console.log('✅ Comparison complete');
        
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
        console.error('❌ Comparison error:', error.message);
        console.error('   Stack:', error.stack);
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

// Test INPI without login
router.get('/inpi/test', async (req, res) => {
  const InpiCrawlerSimple = require('../crawlers/inpiCrawlerSimple');
  const { medicine = 'insulina' } = req.query;
  
  const crawler = new InpiCrawlerSimple();
  
  try {
    await crawler.initialize();
    const result = await crawler.searchPatents(medicine);
    
    res.json({
      success: true,
      testResult: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    await crawler.close();
  }
});

module.exports = router;
