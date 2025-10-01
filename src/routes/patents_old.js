const express = require('express');
const router = express.Router();
const ResponseFormatter = require('../utils/responseFormatter');
const Validator = require('../middleware/validator');
const InpiCrawler = require('../crawlers/inpiCrawler');
const logger = require('../utils/logger');

// GET /api/data/inpi/patents
router.get('/inpi/patents', Validator.validatePatentSearch, async (req, res, next) => {
  try {
    const startTime = Date.now();
    
    // Extract and sanitize parameters
    const searchParams = {
      medicine: Validator.sanitizeInput(req.query.medicine),
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      status: req.query.status || null,
      year: req.query.year ? parseInt(req.query.year) : null
    };

    logger.info('INPI patent search initiated', {
      searchParams,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    // Initialize crawler
    const crawler = new InpiCrawler();
    
    // Perform search
    const searchResults = await crawler.searchPatents(searchParams);

    const duration = Date.now() - startTime;
    
    logger.info('INPI patent search completed', {
      searchParams,
      resultsCount: searchResults.data.patents.length,
      totalResults: searchResults.data.total_results,
      duration,
      ip: req.ip
    });

    // Return paginated response
    res.json(ResponseFormatter.paginated(
      {
        patents: searchResults.data.patents,
        total_results: searchResults.data.total_results,
        search_params: searchParams,
        search_metadata: {
          duration_ms: duration,
          source: 'INPI (Instituto Nacional da Propriedade Industrial)',
          disclaimer: 'This is mock data for development. Real INPI integration requires authentication.',
          last_updated: new Date().toISOString()
        }
      },
      {
        page: searchParams.page,
        limit: searchParams.limit,
        total: searchResults.data.total_results
      }
    ));

  } catch (error) {
    logger.error('Error in INPI patent search', {
      error: error.message,
      stack: error.stack,
      searchParams: req.query,
      ip: req.ip
    });
    
    next(error);
  }
});

module.exports = router;
