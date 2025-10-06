const axios = require('axios');
const logger = require('../utils/logger');

class PatentScopeCrawler {
  constructor() {}

  async search(medicine, maxPages = 3) {
    try {
      logger.info(`Fetching PatentScope HTML for: ${medicine}`);
      const searchUrl = `https://patentscope.wipo.int/search/en/result.jsf?query=FP:(${encodeURIComponent(medicine)})`;

      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 30000
      });

      const html = response.data;

      // Envia HTML para IA processar ou processa via regex básico
      const patents = this.parseHTML(html);

      logger.info(`Total patents found: ${patents.length}`);
      return patents.length > 0 ? patents : [{
        publicationNumber: 'NO_RESULTS',
        title: 'No patents found',
        abstract: 'PatentScope returned no results',
        source: 'PatentScope'
      }];
    } catch (error) {
      logger.error('PatentScope search failed', error);
      return [{
        publicationNumber: 'ERROR',
        title: 'Search failed',
        abstract: error.message,
        source: 'PatentScope'
      }];
    }
  }

  parseHTML(html) {
    // Regex para capturar números de patentes (exemplo)
    const patentRegex = /\b(WO|US|EP|CN|JP|KR|BR)\s*\d{4}[\/\s]\d+/gi;
    const matches = html.match(patentRegex) || [];

    // Deduplicação
    const unique = Array.from(new Set(matches));

    return unique.map(num => ({
      publicationNumber: num,
      title: '',
      abstract: '',
      source: 'PatentScope'
    }));
  }

  async searchPatents(medicine) {
    return await this.search(medicine, 3);
  }
}

module.exports = PatentScopeCrawler;
