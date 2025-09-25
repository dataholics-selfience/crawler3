const express = require('express');
const router = express.Router();
const ResponseFormatter = require('../utils/responseFormatter');

router.get('/', (req, res) => {
  const welcomeData = {
    service: 'Patent Crawler Platform API',
    version: '1.0.0',
    description: 'AI-powered patent data extraction platform',
    endpoints: {
      health: '/health',
      patents_search: '/api/data/inpi/patents?medicine={medicine}',
      documentation: '/api/docs'
    },
    features: [
      'INPI (Brazilian Patent Office) integration',
      'AI-powered HTML parsing with Groq',
      'Rate limiting and security',
      'Comprehensive error handling',
      'Railway cloud deployment ready'
    ]
  };

  res.json(ResponseFormatter.success(welcomeData, 'Welcome to Patent Crawler Platform'));
});

router.get('/api/docs', (req, res) => {
  const documentation = {
    title: 'Patent Crawler Platform API Documentation',
    version: '1.0.0',
    base_url: req.protocol + '://' + req.get('host'),
    endpoints: {
      health_check: {
        method: 'GET',
        path: '/health',
        description: 'Health check endpoint',
        response: 'Service status and metrics'
      },
      search_patents: {
        method: 'GET', 
        path: '/api/data/inpi/patents',
        description: 'Search Brazilian patents by medicine name',
        parameters: {
          medicine: {
            type: 'string',
            required: true,
            description: 'Medicine name to search for',
            example: 'paracetamol'
          },
          page: {
            type: 'integer',
            required: false,
            default: 1,
            description: 'Page number (1-1000)'
          },
          limit: {
            type: 'integer',
            required: false,
            default: 20,
            description: 'Results per page (1-100)'
          },
          status: {
            type: 'string',
            required: false,
            options: ['pending', 'granted', 'rejected', 'extinct', 'shelved'],
            description: 'Filter by patent status'
          },
          year: {
            type: 'integer',
            required: false,
            description: 'Filter by filing year (1990-current)'
          }
        },
        example_request: '/api/data/inpi/patents?medicine=paracetamol&page=1&limit=20&status=granted',
        response_format: {
          success: true,
          data: {
            patents: 'Array of patent objects',
            total_results: 'Number of total results',
            search_params: 'Applied search parameters'
          },
          pagination: 'Pagination information',
          meta: 'Request metadata'
        }
      }
    },
    rate_limits: {
      general_api: '1000 requests per 15 minutes per IP',
      crawler_endpoints: '100 requests per 5 minutes per IP'
    },
    error_handling: {
      format: {
        success: false,
        error: {
          code: 'ERROR_CODE',
          message: 'Human readable error message',
          timestamp: 'ISO timestamp'
        }
      },
      common_codes: {
        'VALIDATION_ERROR': 'Request validation failed',
        'RATE_LIMIT_EXCEEDED': 'Too many requests',
        'SERVICE_UNAVAILABLE': 'External service unavailable',
        'INTERNAL_ERROR': 'Internal server error'
      }
    }
  };

  res.json(ResponseFormatter.success(documentation, 'API Documentation'));
});

module.exports = router;
