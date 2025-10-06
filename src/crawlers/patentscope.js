// src/crawlers/patentscope.js
const puppeteer = require('puppeteer');
const logger = require('../utils/logger');

class PatentScopeCrawler {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  // Inicializa o browser
  async initialize() {
    try {
      logger.info('Initializing PatentScope browser...');
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      this.page = await this.browser.newPage();
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
      );
      await this.page.setViewport({ width: 1366, height: 768 });
      logger.info('PatentScope browser initialized');
    } catch (error) {
      logger.error('Failed to initialize PatentScope browser', error);
      throw error;
    }
  }

  // Fecha o browser
  async close() {
    try {
      if (this.page) await this.page.close();
      if (this.browser) await this.browser.close();
      logger.info('PatentScope browser closed');
    } catch (error) {
      logger.warn('Error closing PatentScope browser', error);
    }
  }

  // Busca patentes por termo
  async search(medicine, maxResults = 10) {
    if (!this.page) throw new Error('Browser not initialized');

    const url = `https://patentscope.wipo.int/search/en/search.jsf`;
    let attempts = 0;
    const patents = [];

    while (attempts < 3 && patents.length === 0) {
      attempts++;
      try {
        logger.info(`Searching PatentScope patents (attempt ${attempts})...`);

        await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Digita o termo na barra de busca
        await this.page.waitForSelector('#query', { timeout: 20000 });
        await this.page.type('#query', medicine, { delay: 100 });
        await Promise.all([
          this.page.click('#searchForm\\:searchBtn'),
          this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }),
        ]);

        // Espera pelo carregamento da lista de resultados ou timeout longo
        await this.page.waitForFunction(
          () =>
            document.querySelectorAll('.result-list .result-item').length > 0,
          { timeout: 60000 }
        );

        // Scroll dinâmico para carregar resultados lazy-loaded
        await this.autoScroll();

        // Extrai os resultados da primeira página
        const results = await this.page.evaluate((max) => {
          const items = Array.from(document.querySelectorAll('.result-list .result-item'));
          return items.slice(0, max).map((item) => {
            const titleEl = item.querySelector('.title');
            const linkEl = item.querySelector('.title a');
            const appNumEl = item.querySelector('.appNumber');
            const pubNumEl = item.querySelector('.pubNumber');
            const dateEl = item.querySelector('.pubDate');

            return {
              title: titleEl?.innerText.trim() || '',
              link: linkEl?.href || '',
              applicationNumber: appNumEl?.innerText.trim() || '',
              publicationNumber: pubNumEl?.innerText.trim() || '',
              publicationDate: dateEl?.innerText.trim() || '',
            };
          });
        }, maxResults);

        patents.push(...results);

      } catch (error) {
        logger.warn(`Attempt ${attempts} failed for PatentScope: ${error.message}`);
        if (attempts === 3) {
          throw new Error(error.message);
        }
        // espera 3 segundos antes da próxima tentativa
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    return patents;
  }

  // Scroll gradual para carregar resultados dinâmicos
  async autoScroll() {
    await this.page.evaluate(async () => {
      const distance = 200;
      const delay = 100;
      const list = document.querySelector('.result-list');
      if (!list) return;

      while (list.scrollHeight > list.clientHeight && list.scrollTop + list.clientHeight < list.scrollHeight) {
        list.scrollBy(0, distance);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    });
  }
}

module.exports = PatentScopeCrawler;
