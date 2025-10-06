const express = require('express');
const router = express.Router();
const PatentScopeCrawler = require('../../crawlers/patentscope');
const logger = require('../../utils/logger');

router.get('/patents', async (req, res) => {
  const { medicine } = req.query;
  if (!medicine) return res.status(400).json({ success: false, message: 'Medicine parameter is required' });

  const crawler = new PatentScopeCrawler();
  try {
    logger.info(`📍 PatentScope route called for: ${medicine}`);
    await crawler.initialize();
    const patents = await crawler.searchPatents(medicine);
    res.json({ success: true, patents });
  } catch (err) {
    logger.error('PatentScope crawler error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch PatentScope patents', message: err.message });
  } finally {
    await crawler.close();
  }
});

module.exports = router;
