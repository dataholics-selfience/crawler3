const puppeteer = require('puppeteer');
const logger = require('../utils/logger');

class PatentScopeCrawler {
  constructor() {
    this.browser = null;
    this.page = null;
    this.maxRetries = 3;
  }

  async initialize() {
    try {
      logger.info('Initializing PatentScope browser...');
      this.browser = await puppeteer.launch({
        headless: true,
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

    const searchUrl = `https://patentscope.wipo.int/search/en/result.jsf?query=${encodeURIComponent(medicine)}`;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logger.info(`Searching PatentScope patents (attempt ${attempt})...`);
        await this.page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // Forçar scroll para garantir carregamento de resultados JS
        await this.page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await this.page.waitForTimeout(2000); // espera extra 2s

        // Espera pelo container de resultados
        await this.page.waitForSelector('.result-list', { timeout: 30000 });

        // Extrair os dados
        const patents = await this.page.evaluate((limit) => {
          const items = Array.from(document.querySelectorAll('.result-list .result-item'));
          return items.slice(0, limit).map(item => {
            const titleEl = item.querySelector('.title a');
            const applicantsEl = item.querySelector('.applicants');
            const publicationDateEl = item.querySelector('.publicationDate');

            return {
              title: titleEl ? titleEl.innerText.trim() : null,
              link: titleEl ? titleEl.href : null,
              applicants: applicantsEl ? applicantsEl.innerText.trim() : null,
              publicationDate: publicationDateEl ? publicationDateEl.innerText.trim() : null,
            };
          });
        }, limit);

        logger.info(`Found ${patents.length} patents for "${medicine}"`);
        return patents;
      } catch (error) {
        logger.warn(`Attempt ${attempt} failed for PatentScope: ${error.message}`);
        if (attempt === this.maxRetries) throw error;
        await this.page.waitForTimeout(2000); // espera antes de tentar novamente
      }
    }
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
