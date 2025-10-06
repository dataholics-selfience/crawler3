const puppeteer = require('puppeteer-core');
const logger = require('../utils/logger');

class PatentScopeCrawler {
  constructor() {
    this.browser = null;
    this.page = null;
    this.maxRetries = 3;
  }

  async initialize() {
    try {
      const launchOptions = {
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      };

      // Se estiver no Railway (Linux container), usar chrome do sistema
      if (process.env.RAILWAY) {
        launchOptions.executablePath = '/usr/bin/google-chrome-stable';
      }

      this.browser = await puppeteer.launch(launchOptions);
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
    let attempt = 0;
    let patents = [];

    while (attempt < this.maxRetries) {
      try {
        logger.info(`Searching PatentScope patents for: ${medicine}, attempt ${attempt + 1}`);
        const queryUrl = `https://patentscope.wipo.int/search/en/detail.jsf?docId=&query=${encodeURIComponent(medicine)}&maxRec=${limit}`;
        await this.page.goto(queryUrl, { waitUntil: 'networkidle2', timeout: 60000 });

        // Espera os resultados
        await this.page.waitForSelector('.result-list', { timeout: 15000 });

        // Extrai dados
        patents = await this.page.evaluate(() => {
          const items = [];
          const results = document.querySelectorAll('.result-list .result-item');
          results.forEach(r => {
            const titleEl = r.querySelector('.result-title a');
            const applicantEl = r.querySelector('.applicant-name');
            const pubNumberEl = r.querySelector('.publication-number');
            const dateEl = r.querySelector('.publication-date');

            items.push({
              title: titleEl?.innerText?.trim() || null,
              link: titleEl?.href || null,
              applicant: applicantEl?.innerText?.trim() || null,
              publicationNumber: pubNumberEl?.innerText?.trim() || null,
              publicationDate: dateEl?.innerText?.trim() || null,
            });
          });
          return items;
        });

        break; // sucesso
      } catch (error) {
        attempt++;
        logger.warn(`Attempt ${attempt} failed for PatentScope: ${error.message}`);
        if (attempt >= this.maxRetries) throw error;
      }
    }

    return patents.slice(0, limit);
  }

  async close() {
    try {
      if (this.page) await this.page.close();
      if (this.browser) await this.browser.close();
      logger.info('PatentScope browser closed');
    } catch (error) {
      logger.warn('Error closing PatentScope browser', error);
    }
  }
}

module.exports = PatentScopeCrawler;
