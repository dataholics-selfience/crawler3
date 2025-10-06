const puppeteer = require('puppeteer');
const logger = require('../utils/logger');

class PatentScopeCrawler {
  constructor() {
    this.browser = null;
    this.page = null;
    this.maxPatents = 15; // limitar a 15 patentes
  }

  async initialize() {
    try {
      logger.info('Initializing PatentScope browser');
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });

      this.page = await this.browser.newPage();

      await this.page.setRequestInterception(true);
      this.page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });

      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await this.page.setViewport({ width: 1920, height: 1080 });

      logger.info('PatentScope initialized');
    } catch (error) {
      logger.error('Failed to initialize PatentScope', error);
      throw error;
    }
  }

  async close() {
    try {
      if (this.page) await this.page.close();
      if (this.browser) await this.browser.close();
      logger.info('PatentScope closed');
    } catch (error) {
      logger.warn('Error closing PatentScope', error);
    }
  }

  async searchPatents(medicine) {
    if (!this.page) throw new Error('Browser not initialized');

    try {
      const searchUrl = `https://patentscope.wipo.int/search/en/result.jsf?query=FP:(${encodeURIComponent(medicine)})`;
      logger.info(`Searching: ${searchUrl}`);

      await this.page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 60000 // timeout de 60s
      });

      // Esperar a página carregar completamente (JS dinâmico)
      await this.page.waitForTimeout(8000);

      const patents = await this.page.evaluate((max) => {
        const cleanText = (text) => {
          if (!text) return '';
          return text.replace(/\t+/g, ' ').replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        };

        const results = [];
        const seen = new Set();
        
        // Pegar todos os possíveis números de patente
        const patentMatches = Array.from(document.querySelectorAll('div.result-item')).slice(0, max);

        for (const item of patentMatches) {
          const pubNumberEl = item.querySelector('.publication-number');
          const titleEl = item.querySelector('.title');
          const abstractEl = item.querySelector('.abstract');
          const applicantEl = item.querySelector('.applicant');
          const inventorEl = item.querySelector('.inventor');

          if (!pubNumberEl) continue;

          const publicationNumber = cleanText(pubNumberEl.textContent);
          if (seen.has(publicationNumber)) continue;
          seen.add(publicationNumber);

          results.push({
            publicationNumber,
            title: titleEl ? cleanText(titleEl.textContent).substring(0, 200) : '',
            abstract: abstractEl ? cleanText(abstractEl.textContent).substring(0, 500) : '',
            applicant: applicantEl ? cleanText(applicantEl.textContent) : '',
            inventor: inventorEl ? cleanText(inventorEl.textContent) : '',
            source: 'PatentScope'
          });
        }

        return results;
      }, this.maxPatents);

      if (patents.length === 0) {
        return [{
          publicationNumber: 'NO_RESULTS',
          title: 'No patents found',
          abstract: `Search for "${medicine}" returned no results`,
          applicant: '',
          inventor: '',
          source: 'PatentScope'
        }];
      }

      logger.info(`Found ${patents.length} patents`);

      return patents;
    } catch (error) {
      logger.error('PatentScope search failed', error);
      return [{
        publicationNumber: 'ERROR',
        title: 'Search failed',
        abstract: error.message,
        applicant: '',
        inventor: '',
        source: 'PatentScope'
      }];
    }
  }
}

module.exports = PatentScopeCrawler;
