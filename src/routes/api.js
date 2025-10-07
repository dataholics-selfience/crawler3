const express = require("express");
const router = express.Router();
const PatentScopeCrawler = require("../crawlers/patentscope");

const patentscopeCrawler = new PatentScopeCrawler(); // instância ✅

// PatentScope route
// PatentScope Route
router.get('/patentscope/patents', async (req, res) => {
    console.log('📍 PatentScope route called');
    console.log('📍 Query params:', req.query);
    
    const { medicine } = req.query;
    
    if (!medicine) {
        return res.status(400).json({
            success: false,
            error: 'Medicine parameter is required'
        });
    }
    
    // PatentScopeCrawler agora é uma instância única
    try {
        console.log('Searching PatentScope patents...');
        const patents = await PatentScopeCrawler.search(medicine);
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
    }
});

module.exports = router;
