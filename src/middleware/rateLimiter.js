const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl
    });
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
      }
    });
  }
});

// Crawler-specific rate limiter (more restrictive)
const crawlerLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // Limit each IP to 100 crawler requests per 5 minutes
  message: {
    success: false,
    error: {
      code: 'CRAWLER_RATE_LIMIT_EXCEEDED',
      message: 'Too many crawler requests from this IP, please try again later.',
      retryAfter: '5 minutes'
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('Crawler rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl,
      query: req.query
    });
    res.status(429).json({
      success: false,
      error: {
        code: 'CRAWLER_RATE_LIMIT_EXCEEDED',
        message: 'Too many crawler requests from this IP, please try again later.',
        retryAfter: '5 minutes'
      }
    });
  }
});

module.exports = {
  apiLimiter,
  crawlerLimiter
};
