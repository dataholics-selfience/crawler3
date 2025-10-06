// src/crawlers/patentscope.js
const puppeteer = require('puppeteer'); // Puppeteer completo
const logger = require('../utils/logger');

class PatentScopeCrawler {
  constructor() {
    this.browser = null;
    this.page = null;
    this.maxRetries = 3;
    this.retryDelay = 2000; // 2 segundos
  }

  async initialize() {
    try {
      logger.info('Initializing PatentScope browser...');
      this.browser = await puppeteer.launch({
        headless: 'new', // modo headless moderno
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1280, height: 800 });
      logger.info('PatentScope browser initialized');
    } catch (error) {
      logger.error('Failed to initialize PatentScope browser', error);
      throw error;
    }
  }

  async search(medicine, limit = 10) {
    if (!this.page) throw new Error('Browser not initialized');

    const url = `https://patentscope.wipo.int/search/en/result.jsf?query=${encodeURIComponent(medicine)}`;
    let attempt = 0;
    let results = [];

    while (attempt < this.maxRetries) {
      try {
        logger.info(`Searching PatentScope patents (attempt ${attempt + 1})...`);
        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // Espera os resultados aparecerem
        await this.page.waitForSelector('.result-list', { timeout: 15000 });

        // Extrai os dados
        results = await this.page.$$eval('.result-item', (nodes, max) => {
          return nodes.slice(0, max).map(node => {
            const titleEl = node.querySelector('.result-title a');
            const link = titleEl ? titleEl.href : null;
            const title = titleEl ? titleEl.textContent.trim() : null;
            const publication = node.querySelector('.result-publication')?.textContent.trim() || null;
            const applicant = node.querySelector('.result-applicant')?.textContent.trim() || null;
            return { title, link, publication, applicant };
          });
        }, limit);

        logger.info(`PatentScope search completed: ${results.length} results`);
        break;
      } catch (error) {
        attempt++;
        logger.warn(`Attempt ${attempt} failed for PatentScope:`, error);
        if (attempt >= this.maxRetries) throw error;
        await new Promise(r => setTimeout(r, this.retryDelay));
      }
    }

    return results;
  }

  async close() {
    if (this.browser) {
      try {
        await this.browser.close();
        logger.info('PatentScope browser closed');
      } catch (error) {
        logger.error('Error closing PatentScope browser', error);
      }
      this.browser = null;
      this.page = null;
    }
  }
}

module.exports = PatentScopeCrawler;
