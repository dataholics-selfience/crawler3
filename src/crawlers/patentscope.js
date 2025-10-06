// src/crawlers/patentscope.js
const puppeteer = require('puppeteer');
const logger = require('../utils/logger');

const MAX_PAGES = 5; // limite de páginas por busca

class PatentScopeCrawler {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      this.page = await this.browser.newPage();
      logger.info('PatentScope crawler initialized');
    } catch (error) {
      logger.error('Error initializing PatentScope crawler:', error);
      throw error;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      logger.info('PatentScope crawler closed');
    }
  }

  async search(medicine) {
    if (!this.page) {
      throw new Error('Crawler not initialized');
    }

    const results = [];
    const query = encodeURIComponent(medicine);
    const url = `https://patentscope.wipo.int/search/en/result.jsf?query=FP:(${query})`;

    try {
      await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      logger.info(`Navigated to PatentScope search page for: ${medicine}`);

      for (let pageIndex = 1; pageIndex <= MAX_PAGES; pageIndex++) {
        logger.info(`Processing page ${pageIndex}...`);

        // Espera a tabela de resultados ou exibe fallback
        const tableExists = await this.page.$('table.resultList tbody tr');
        if (!tableExists) {
          logger.warn('No results table found, stopping pagination');
          break;
        }

        // Extrai resultados da página atual
        const pageResults = await this.page.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('table.resultList tbody tr'));
          return rows.map(row => {
            const cols = row.querySelectorAll('td');
            return {
              publicationNumber: cols[0]?.innerText.trim() || 'N/A',
              title: cols[1]?.innerText.trim() || 'N/A',
              abstract: cols[2]?.innerText.trim() || 'N/A',
              applicant: cols[3]?.innerText.trim() || 'N/A',
              inventor: cols[4]?.innerText.trim() || 'N/A',
              source: 'PatentScope',
            };
          });
        });

        results.push(...pageResults);
        logger.info(`Extracted ${pageResults.length} patents from page ${pageIndex}`);

        // Tenta ir para a próxima página
        const nextButton = await this.page.$('a[title*="Next"], a.paginationNext');
        if (!nextButton) break;

        try {
          await Promise.all([
            this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
            nextButton.click(),
          ]);
        } catch (err) {
          logger.warn('Failed to go to next page:', err.message);
          break;
        }
      }
    } catch (error) {
      logger.error('PatentScope search error:', error.message);
      return [
        {
          publicationNumber: 'ERROR',
          title: 'Search failed',
          abstract: error.message,
          source: 'PatentScope',
        },
      ];
    }

    return results.length > 0
      ? results
      : [
          {
            publicationNumber: 'NO_RESULTS',
            title: 'No patents found',
            abstract: 'PatentScope returned no results',
            source: 'PatentScope',
          },
        ];
  }
}

module.exports = PatentScopeCrawler;
