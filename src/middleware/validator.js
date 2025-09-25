const ResponseFormatter = require('../utils/responseFormatter');
const logger = require('../utils/logger');

class Validator {
  static validatePatentSearch(req, res, next) {
    const { medicine, page, limit, status, year } = req.query;

    const errors = [];

    // Validate required medicine parameter
    if (!medicine) {
      errors.push('Medicine parameter is required');
    } else if (typeof medicine !== 'string' || medicine.trim().length === 0) {
      errors.push('Medicine parameter must be a non-empty string');
    } else if (medicine.length > 200) {
      errors.push('Medicine parameter must be less than 200 characters');
    }

    // Validate optional page parameter
    if (page !== undefined) {
      const pageNum = parseInt(page);
      if (isNaN(pageNum) || pageNum < 1 || pageNum > 1000) {
        errors.push('Page must be a positive integer between 1 and 1000');
      }
    }

    // Validate optional limit parameter
    if (limit !== undefined) {
      const limitNum = parseInt(limit);
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        errors.push('Limit must be a positive integer between 1 and 100');
      }
    }

    // Validate optional status parameter
    if (status !== undefined) {
      const validStatuses = ['pending', 'granted', 'rejected', 'extinct', 'shelved'];
      if (!validStatuses.includes(status)) {
        errors.push(`Status must be one of: ${validStatuses.join(', ')}`);
      }
    }

    // Validate optional year parameter
    if (year !== undefined) {
      const yearNum = parseInt(year);
      const currentYear = new Date().getFullYear();
      if (isNaN(yearNum) || yearNum < 1990 || yearNum > currentYear) {
        errors.push(`Year must be between 1990 and ${currentYear}`);
      }
    }

    if (errors.length > 0) {
      logger.warn('Validation failed for patent search request', {
        errors,
        query: req.query,
        ip: req.ip
      });

      return res.status(400).json(
        ResponseFormatter.error(
          'Request validation failed',
          'VALIDATION_ERROR',
          { validationErrors: errors }
        )
      );
    }

    next();
  }

  static sanitizeInput(input) {
    if (typeof input !== 'string') return input;
    
    return input
      .trim()
      .replace(/[<>]/g, '') // Remove potential HTML
      .replace(/['"]/g, '') // Remove quotes that might break queries
      .substring(0, 200); // Limit length
  }
}

module.exports = Validator;
