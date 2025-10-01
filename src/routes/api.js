const express = require('express');
const router = express.Router();
const InpiCrawler = require('../crawlers/inpi');

// Debug: Tentar carregar PatentScope com tratamento de erro
let PatentScopeCrawler;
try {
    PatentScopeCrawler = require('../crawlers/patentscope');
    console.log('✅ PatentScopeCrawler loaded successfully');
} catch (error) {
    console.error('❌ Failed to load PatentScopeCrawler:', error.message);
    console.error('Full error:', error);
}

// ROTA DE DEBUG - SUPER SIMPLES
router.get('/debug', (req, res) => {
    res.json({ 
        message: 'Debug endpoint working',
        timestamp: new Date().toISOString(),
        patentScopeLoaded: !!PatentScopeCrawler
    });
});

// ROTA DE TESTE PARA PATENTSCOPE - SEM O CRAWLER
router.get('/patentscope/test', (req, res) => {
    res.json({ 
        message: 'PatentScope test route working',
        crawlerAvailable: !!PatentScopeCrawler,
        timestamp: new Date().toISOString()
    });
});

// INPI Route (mantém como está)
router.get('/inpi/patents', async (req, res) => {
    const { medicine } = req.query;
    
    if (!medicine) {
        return res.status(400).json({
            error: 'Medicine parameter is required'
        });
    }
    
    const crawler = new InpiCrawler();
    
    try {
        await crawler.initialize();
        const patents = await crawler.searchPatents(medicine);
        
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
        console.error('INPI crawler error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch INPI patents',
            message: error.message
        });
    } finally {
        await crawler.close();
    }
});

// PatentScope Route - COM VERIFICAÇÃO
router.get('/patentscope/patents', async (req, res) => {
    console.log('🎯 PatentScope route hit!');
    
    // Verifica se o crawler foi carregado
    if (!PatentScopeCrawler) {
        return res.status(500).json({
            success: false,
            error: 'PatentScopeCrawler not loaded',
            message: 'The PatentScope crawler module could not be loaded. Check server logs.'
        });
    }
    
    const { medicine } = req.query;
    
    if (!medicine) {
        return res.status(400).json({
            error: 'Medicine parameter is required'
        });
    }
    
    const crawler = new PatentScopeCrawler();
    
    try {
        console.log(`Starting PatentScope search for: ${medicine}`);
        await crawler.initialize();
        
        const patents = await crawler.searchPatents(medicine);
        
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
        console.error('PatentScope crawler error:', error);
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
    if (!PatentScopeCrawler) {
        return res.status(500).json({
            success: false,
            error: 'PatentScopeCrawler not available',
            message: 'Cannot compare without PatentScope crawler'
        });
    }
    
    const { medicine } = req.query;
    
    if (!medicine) {
        return res.status(400).json({
            error: 'Medicine parameter is required'
        });
    }
    
    const inpiCrawler = new InpiCrawler();
    const patentscopeCrawler = new PatentScopeCrawler();
    
    try {
        const [inpiResults, patentscopeResults] = await Promise.all([
            (async () => {
                try {
                    await inpiCrawler.initialize();
                    const results = await inpiCrawler.searchPatents(medicine);
                    await inpiCrawler.close();
                    return results;
                } catch (err) {
                    console.error('INPI search error:', err);
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
                    console.error('PatentScope search error:', err);
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
        console.error('Comparison error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to compare patents',
            message: error.message
        });
    }
});

// Lista todas as rotas registradas
router.get('/routes', (req, res) => {
    const routes = router.stack
        .filter(r => r.route)
        .map(r => ({
            path: r.route.path,
            methods: Object.keys(r.route.methods)
        }));
    
    res.json({ 
        message: 'Available routes in API',
        routes,
        patentScopeModuleLoaded: !!PatentScopeCrawler
    });
});

console.log('📍 API routes file loaded - version 2.0');

module.exports = router;
