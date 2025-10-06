const puppeteer = require('puppeteer');
const logger = require('../utils/logger');

class PatentScopeCrawler {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    try {
      logger.info('Initializing PatentScope browser...');
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });
      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1366, height: 768 });
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      );
      logger.info('PatentScope browser initialized');
    } catch (error) {
      logger.error('Failed to initialize PatentScope browser', error);
      throw error;
    }
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

  async search(medicine, maxPages = 3) {
    if (!this.page) throw new Error('Browser not initialized');

    try {
      const searchUrl = `https://patentscope.wipo.int/search/en/result.jsf?query=FP:(${encodeURIComponent(medicine)})`;
      logger.info(`Navigating to: ${searchUrl}`);

      await this.page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

      await this.page.waitForTimeout(5000); // esperar JS renderizar

      const allPatents = [];

      for (let pageIndex = 1; pageIndex <= maxPages; pageIndex++) {
        logger.info(`Extracting page ${pageIndex}...`);

        // Extração de dados da página dinâmica
        const pagePatents = await this.page.evaluate(() => {
          const cleanText = (text) => text.replace(/\s+/g, ' ').trim();
          const results = [];
          const seenNumbers = new Set();

          // Tentando pegar títulos, abstracts e números de patente
          document.querySelectorAll('div.resultItem, div.searchResultRow').forEach(el => {
            const numberEl = el.querySelector('.publicationNumber, .patentNumber');
            const titleEl = el.querySelector('.title, .patentTitle');
            const abstractEl = el.querySelector('.abstract, .patentAbstract');
            if (numberEl && !seenNumbers.has(numberEl.textContent)) {
              seenNumbers.add(numberEl.textContent);
              results.push({
                publicationNumber: cleanText(numberEl.textContent),
                title: titleEl ? cleanText(titleEl.textContent) : '',
                abstract: abstractEl ? cleanText(abstractEl.textContent) : '',
                source: 'PatentScope',
              });
            }
          });

          return results;
        });

        logger.info(`Found ${pagePatents.length} patents on page ${pageIndex}`);
        allPatents.push(...pagePatents);

        // Tentar próxima página
        if (pageIndex < maxPages) {
          const nextBtn = await this.page.$('a[title*="Next"], .pagination-next');
          if (!nextBtn) {
            logger.info('No next button found');
            break;
          }

          await Promise.all([
            this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
            nextBtn.click(),
          ]);

          await this.page.waitForTimeout(3000);
        }
      }

      // Deduplicação final
      const uniquePatents = Array.from(new Map(allPatents.map(p => [p.publicationNumber, p])).values());

      logger.info(`Total unique patents: ${uniquePatents.length}`);
      return uniquePatents.length > 0 ? uniquePatents : [{
        publicationNumber: 'NO_RESULTS',
        title: 'No patents found',
        abstract: 'PatentScope returned no results',
        source: 'PatentScope',
      }];

    } catch (error) {
      logger.error('PatentScope search failed', error);
      return [{
        publicationNumber: 'ERROR',
        title: 'Search failed',
        abstract: error.message,
        source: 'PatentScope',
      }];
    }
  }

  async searchPatents(medicine) {
    return await this.search(medicine, 3);
  }
}

module.exports = PatentScopeCrawler;
