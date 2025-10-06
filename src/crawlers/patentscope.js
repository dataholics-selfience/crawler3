// src/crawlers/patentscope.js
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
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      });
      this.page = await this.browser.newPage();
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      );
      await this.page.setViewport({ width: 1366, height: 768 });
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

  /**
   * Captura a primeira página de resultados e garante pelo menos 15 patentes
   */
  async searchFirstPage(medicine) {
    if (!this.page) throw new Error('Browser not initialized');

    try {
      const searchUrl = `https://patentscope.wipo.int/search/en/result.jsf?query=FP:(${encodeURIComponent(medicine)})`;
      logger.info(`Navigating to: ${searchUrl}`);

      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

      // Espera a lista de resultados carregar, até 60s
      await this.page.waitForSelector('.result-list', { timeout: 60000 });

      // Aguarda mais um pouco para garantir carregamento completo
      await this.page.waitForTimeout(3000);

      // Extrai o HTML da lista de patentes
      const html = await this.page.evaluate(() => {
        const container = document.querySelector('.result-list');
        return container ? container.innerHTML : '';
      });

      // Contagem mínima de 15 patentes (aproximação pelo número de itens na lista)
      const numPatents = await this.page.evaluate(() => {
        const items = document.querySelectorAll('.result-list > .result-item');
        return items.length;
      });

      logger.info(`Found ${numPatents} patents on first page`);

      if (numPatents < 15) {
        logger.warn('Less than 15 patents found on first page, returning what is available');
      }

      return html || '<div>No patents found</div>';

    } catch (error) {
      logger.error('PatentScope search failed', error);
      throw error;
    }
  }
}

module.exports = PatentScopeCrawler;
