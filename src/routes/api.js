const express = require('express');
const router = express.Router();
const InpiCrawler = require('../crawlers/inpi');
const PatentScopeCrawler = require('../crawlers/patentscope');

// INPI Route
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

// PatentScope Route
router.get('/patentscope/patents', async (req, res) => {
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

module.exports = router;
