const express = require('express');
const router = express.Router();
const { query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const INPICrawler = require('../crawlers/inpiCrawler');
const logger = require('../utils/logger');

const dataLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Try again in 1 minute.' }
});

router.use(dataLimiter);

router.get('/inpi/patents', [
  query('medicine')
    .notEmpty()
    .withMessage('Medicine/molecule name is required')
    .isLength({ min: 2, max: 100 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { medicine, page = 1, limit = 20, status, year } = req.query;
    
    logger.info(`INPI API request: ${medicine}`);

    const inpiCrawler = new INPICrawler();
    const results = await inpiCrawler.searchPatents({
      medicine,
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      year: year ? parseInt(year) : null
    });
    
    res.json(results);
    
  } catch (error) {
    logger.error('INPI API error:', error);
    next(error);
  }
});

module.exports = router;
