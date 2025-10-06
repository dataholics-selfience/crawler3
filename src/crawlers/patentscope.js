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

  async search(medicine) {
    if (!this.page) throw new Error('Browser not initialized');

    const searchUrl = `https://patentscope.wipo.int/search/en/result.jsf?query=FP:(${encodeURIComponent(medicine)})`;
    logger.info(`Navigating to: ${searchUrl}`);

    try {
      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await this.page.waitForTimeout(7000); // aguarda scripts JS do PrimeFaces
      let retries = 0;
      let patents = [];

      while (retries < 3 && patents.length === 0) {
        try {
          patents = await this.page.evaluate(() => {
            const cleanText = (text) => text?.replace(/\s+/g, ' ').trim();
            const results = [];
            const seen = new Set();

            document.querySelectorAll('.resultItem, .searchResultRow').forEach(el => {
              const num = el.querySelector('.publicationNumber, .patentNumber');
              const title = el.querySelector('.title, .patentTitle');
              const abs = el.querySelector('.abstract, .patentAbstract');
              if (num && !seen.has(num.textContent)) {
                seen.add(num.textContent);
                results.push({
                  publicationNumber: cleanText(num.textContent),
                  title: cleanText(title?.textContent || ''),
                  abstract: cleanText(abs?.textContent || ''),
                  source: 'PatentScope'
                });
              }
            });
            return results;
          });

          if (patents.length === 0) {
            retries++;
            await this.page.waitForTimeout(5000);
          }
        } catch (err) {
          logger.warn(`Retry ${retries + 1} on page evaluation`);
          retries++;
          await this.page.waitForTimeout(5000);
        }
      }

      // Se não encontrou nada, retorna o HTML para o n8n processar
      if (patents.length === 0) {
        logger.warn('No structured patents found, returning raw HTML snapshot');
        const htmlContent = await this.page.content();
        return [{
          publicationNumber: 'HTML_DUMP',
          title: 'Raw HTML snapshot (to be parsed by AI)',
          abstract: htmlContent.slice(0, 50000), // evita payload gigante
          source: 'PatentScope'
        }];
      }

      logger.info(`✅ Found ${patents.length} patents in PatentScope`);
      return patents;

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
    return await this.search(medicine);
  }
}

module.exports = PatentScopeCrawler;
