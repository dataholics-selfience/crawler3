const Groq = require('groq-sdk');
const logger = require('../utils/logger');
const { GROQ_MODELS } = require('../utils/constants');

class GroqParser {
  constructor() {
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });
    this.model = GROQ_MODELS.STRUCTURED;
  }

  async parseHtmlToJson(htmlContent, schema) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('Groq API key is required for HTML parsing');
    }

    try {
      const cleanText = this.cleanHtmlContent(htmlContent);
      
      const response = await this.groq.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are an expert at extracting structured patent data from Brazilian INPI (Instituto Nacional da Propriedade Industrial) search results. Extract only the requested information and return valid JSON according to the provided schema. If a field is not found, use null or an empty string as appropriate.`
          },
          {
            role: 'user',
            content: `Extract patent information from this INPI search result and return JSON according to the schema: ${JSON.stringify(schema)}\n\nContent: ${cleanText}`
          }
        ],
        temperature: 0.1,
        max_tokens: 2048,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content);
      
      logger.info('Successfully parsed HTML to JSON with Groq', {
        inputLength: cleanText.length,
        outputKeys: Object.keys(result),
        model: this.model
      });

      return result;

    } catch (error) {
      logger.error('Groq HTML parsing failed', {
        error: error.message,
        model: this.model,
        inputLength: htmlContent ? htmlContent.length : 0
      });
      throw new Error(`HTML parsing failed: ${error.message}`);
    }
  }

  async enhancePatentData(patent, searchTerm) {
    if (!process.env.GROQ_API_KEY) {
      return null;
    }

    try {
      const response = await this.groq.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are a pharmaceutical and patent analysis expert. Provide insights about patents related to pharmaceutical compounds and medicines. Focus on clinical relevance, market potential, and technical innovation.`
          },
          {
            role: 'user',
            content: `Analyze this Brazilian patent and provide insights related to the medicine "${searchTerm}":

Title: ${patent.title}
Abstract: ${patent.abstract}
Applicant: ${patent.applicant_name}
Status: ${patent.status}
Filing Date: ${patent.filing_date}
IPC Classification: ${patent.ipc_classification.join(', ')}

Provide a JSON response with the following structure:
{
  "relevance_score": 1-10,
  "clinical_significance": "brief analysis",
  "market_potential": "brief analysis", 
  "innovation_level": "brief analysis",
  "key_differentiators": ["feature1", "feature2"],
  "related_conditions": ["condition1", "condition2"]
}`
          }
        ],
        temperature: 0.3,
        max_tokens: 1000,
        response_format: { type: 'json_object' }
      });

      const insights = JSON.parse(response.choices[0].message.content);
      
      logger.info('Enhanced patent data with AI insights', {
        patentId: patent.application_number,
        relevanceScore: insights.relevance_score
      });

      return insights;

    } catch (error) {
      logger.warn('Failed to enhance patent data with AI', {
        patentId: patent.application_number,
        error: error.message
      });
      return null;
    }
  }

  async batchParsePatents(htmlContents, batchSize = 5) {
    if (!Array.isArray(htmlContents)) {
      throw new Error('htmlContents must be an array');
    }

    const results = [];
    
    // Process in batches to avoid rate limiting
    for (let i = 0; i < htmlContents.length; i += batchSize) {
      const batch = htmlContents.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (content, index) => {
        try {
          await this.delay(index * 200); // Stagger requests
          return await this.parseHtmlToJson(content, this.getPatentSchema());
        } catch (error) {
          logger.error(`Batch parsing failed for item ${i + index}`, { error: error.message });
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(result => result !== null));

      // Delay between batches
      if (i + batchSize < htmlContents.length) {
        await this.delay(1000);
      }
    }

    return results;
  }

  getPatentSchema() {
    return {
      type: 'object',
      properties: {
        application_number: { type: 'string' },
        title: { type: 'string' },
        applicant_name: { type: 'string' },
        inventor_name: { 
          type: 'array',
          items: { type: 'string' }
        },
        filing_date: { type: 'string' },
        publication_date: { type: 'string' },
        status: { 
          type: 'string',
          enum: ['pending', 'granted', 'rejected', 'extinct', 'shelved']
        },
        ipc_classification: {
          type: 'array',
          items: { type: 'string' }
        },
        abstract: { type: 'string' },
        patent_type: {
          type: 'string',
          enum: ['invention', 'utility_model']
        }
      },
      required: ['application_number', 'title', 'applicant_name'],
      additionalProperties: false
    };
  }

  cleanHtmlContent(htmlContent) {
    if (!htmlContent) return '';
    
    return htmlContent
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim()
      .substring(0, 10000); // Limit content length
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = GroqParser;
