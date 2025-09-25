const logger = require('./logger');

class ResponseFormatter {
  static success(data, message = 'Success', meta = {}) {
    return {
      success: true,
      message,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta
      }
    };
  }

  static error(message, code = 'INTERNAL_ERROR', details = null, statusCode = 500) {
    const errorResponse = {
      success: false,
      error: {
        code,
        message,
        timestamp: new Date().toISOString()
      }
    };

    if (details && process.env.NODE_ENV !== 'production') {
      errorResponse.error.details = details;
    }

    logger.error('API Error Response', {
      code,
      message,
      statusCode,
      details: details ? String(details) : null
    });

    return errorResponse;
  }

  static paginated(data, pagination) {
    return {
      success: true,
      data,
      pagination: {
        page: pagination.page || 1,
        limit: pagination.limit || 20,
        total: pagination.total || 0,
        pages: Math.ceil((pagination.total || 0) / (pagination.limit || 20)),
        hasNext: pagination.page < Math.ceil((pagination.total || 0) / (pagination.limit || 20)),
        hasPrev: pagination.page > 1
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    };
  }
}

module.exports = ResponseFormatter;
