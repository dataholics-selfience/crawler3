// src/routes/patentscope.js
const express = require('express');
const PatentScopeCrawler = require('../crawlers/patentscope');
const logger = require('../utils/logger');
const router = express.Router();

router.get('/patentscope/patents', async (req, res) => {
  const { medicine } = req.query;
  if (!medicine) return res.status(400).json({ success: false, error: 'Medicine query param is required' });

  const crawler = new PatentScopeCrawler();

  try {
    await crawler.initialize();
    const patents = await crawler.searchPatents(medicine); // ✅ chama o método correto
    res.json({ success: true, query: medicine, totalResults: patents.length, patents });
  } catch (error) {
    logger.error('PatentScope crawler error', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch PatentScope patents',
      message: error.message
    });
  } finally {
    await crawler.close();
  }
});

module.exports = router;
