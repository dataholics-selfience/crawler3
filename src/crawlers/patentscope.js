const puppeteer = require('puppeteer');
const logger = require('../utils/logger');

class PatentScopeCrawler {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  // Inicializa Puppeteer
  async initialize() {
    try {
      this.browser = await puppeteer.launch({
        headless: 'new', // modo headless atualizado
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      this.page = await this.browser.newPage();
      logger.info('PatentScope crawler initialized', { timestamp: new Date().toISOString() });
    } catch (error) {
      logger.error('Failed to initialize PatentScope crawler:', error);
      throw error;
    }
  }

  // Pesquisa patentes
  async search(medicine, maxPages = 5) {
    if (!this.page) throw new Error('Crawler not initialized');

    const url = `https://patentscope.wipo.int/search/en/result.jsf?query=FP:(${encodeURIComponent(medicine)})`;
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    const patents = [];
    for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
      logger.info(`Processing page ${pageIndex + 1} for: ${medicine}`);

      // Extraindo resultados robustamente
      const pageResults = await this.page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table.resultList tbody tr'));
        return rows.map(row => {
          const cells = row.querySelectorAll('td');
          return {
            publicationNumber: cells[0]?.innerText.trim() || 'NO_DATA',
            title: cells[1]?.innerText.trim() || 'NO_TITLE',
            abstract: cells[2]?.innerText.trim() || 'NO_ABSTRACT',
          };
        });
      });

      if (pageResults.length === 0) break;

      patents.push(...pageResults);

      // Tenta navegar para próxima página
      const nextButton = await this.page.$('a[title*="Next"], a.paginationNext');
      if (!nextButton) break;
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }),
        nextButton.click(),
      ]);
    }

    return patents;
  }

  // Fecha o browser
  async close() {
    try {
      if (this.page) await this.page.close();
      if (this.browser) await this.browser.close();
      logger.info('PatentScope crawler closed', { timestamp: new Date().toISOString() });
    } catch (error) {
      logger.error('Error closing PatentScope crawler:', error);
    }
  }
}

module.exports = PatentScopeCrawler;
