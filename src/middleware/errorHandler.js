const logger = require('../utils/logger');
const ResponseFormatter = require('../utils/responseFormatter');

const errorHandler = (error, req, res, next) => {
  let statusCode = error.statusCode || error.status || 500;
  let message = error.message || 'Internal Server Error';
  let code = error.code || 'INTERNAL_ERROR';

  // Log the full error with stack trace
  logger.error('Unhandled error in request', {
    error: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.body,
    query: req.query
  });

  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed';
  }

  if (error.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_REQUEST';
    message = 'Invalid request parameters';
  }

  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    statusCode = 503;
    code = 'SERVICE_UNAVAILABLE';
    message = 'External service temporarily unavailable';
  }

  if (error.response && error.response.status) {
    // Axios error from external API
    statusCode = error.response.status === 429 ? 429 : 503;
    code = error.response.status === 429 ? 'EXTERNAL_RATE_LIMIT' : 'EXTERNAL_API_ERROR';
    message = 'External API error occurred';
  }

  // Don't leak error details in production
  const errorDetails = process.env.NODE_ENV === 'production' ? null : {
    stack: error.stack,
    originalError: error.message
  };

  res.status(statusCode).json(
    ResponseFormatter.error(message, code, errorDetails, statusCode)
  );
};

module.exports = errorHandler;
