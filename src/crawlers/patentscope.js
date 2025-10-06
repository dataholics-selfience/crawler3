// src/crawlers/patentscope.js
const puppeteer = require('puppeteer-core');
const logger = require('../utils/logger');

class PatentScopeCrawler {
  constructor() {
    this.browser = null;
    this.page = null;
    this.maxRetries = 3;
    this.timeout = 30000; // Timeout para esperar elementos
  }

  async initialize() {
    try {
      this.browser = await puppeteer.launch({
        headless: 'new', // novo modo headless confiável
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
    if (!this.page) throw new Error('Crawler not initialized');
    const results = [];

    const query = encodeURIComponent(medicine);
    const url = `https://patentscope.wipo.int/search/en/search.jsf?query=${query}`;

    let attempt = 0;
    while (attempt < this.maxRetries) {
      try {
        logger.info(`PatentScope attempt ${attempt + 1} for ${medicine}`);
        await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Esperar resultados
        await this.page.waitForSelector('.result-item', { timeout: this.timeout });

        // Extrair dados
        const patents = await this.page.evaluate((limit) => {
          const items = Array.from(document.querySelectorAll('.result-item')).slice(0, limit);
          return items.map(item => {
            const title = item.querySelector('.title')?.innerText.trim() || '';
            const publicationNumber = item.querySelector('.publication-number')?.innerText.trim() || '';
            const publicationDate = item.querySelector('.publication-date')?.innerText.trim() || '';
            const assignee = item.querySelector('.assignee')?.innerText.trim() || '';
            const linkEl = item.querySelector('.title a');
            const link = linkEl ? linkEl.href : '';
            return { title, publicationNumber, publicationDate, assignee, link };
          });
        }, limit);

        results.push(...patents);
        logger.info(`PatentScope search completed: ${patents.length} results`);
        break; // sucesso, sair do loop
      } catch (error) {
        logger.warn(`Attempt ${attempt + 1} failed for PatentScope: ${error.message}`);
        attempt += 1;
        if (attempt >= this.maxRetries) throw error;
      }
    }

    return results;
  }

  async close() {
    try {
      if (this.page) await this.page.close();
      if (this.browser) await this.browser.close();
      logger.info('PatentScope browser closed');
    } catch (error) {
      logger.error('Error closing PatentScope browser', error);
    }
  }
}

module.exports = PatentScopeCrawler;
