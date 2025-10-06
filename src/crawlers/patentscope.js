// src/crawlers/patentscope.js
const puppeteer = require('puppeteer');
const logger = require('../utils/logger');

class PatentScopeCrawler {
  constructor() {
    this.browser = null;
    this.page = null;
    this.maxRetries = 3; // retries automáticos
  }

  async initialize() {
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1280, height: 800 });
    } catch (error) {
      logger.error('PatentScopeCrawler initialize error:', error);
      throw error;
    }
  }

  async search(query, limit = 10) {
    if (!this.page) throw new Error('Crawler not initialized');

    const url = `https://patentscope.wipo.int/search/en/detail.jsf?docId=&query=${encodeURIComponent(query)}`;
    let results = [];

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        await this.page.waitForSelector('.result-list', { timeout: 15000 });

        results = await this.page.evaluate((limit) => {
          const nodes = Array.from(document.querySelectorAll('.result-item'));
          return nodes.slice(0, limit).map((node) => {
            const titleNode = node.querySelector('.title a');
            const numberNode = node.querySelector('.publicationNumber');
            const dateNode = node.querySelector('.publicationDate');
            const assigneeNode = node.querySelector('.assignee');
            return {
              title: titleNode?.innerText || '',
              link: titleNode?.href || '',
              publicationNumber: numberNode?.innerText || '',
              publicationDate: dateNode?.innerText || '',
              assignee: assigneeNode?.innerText || '',
            };
          });
        }, limit);

        break; // sucesso, sai do loop
      } catch (err) {
        logger.warn(`Attempt ${attempt} failed for PatentScope:`, err);
        if (attempt === this.maxRetries) throw err;
        await new Promise(r => setTimeout(r, 3000)); // espera antes de tentar novamente
      }
    }

    return results;
  }

  async close() {
    try {
      if (this.page) await this.page.close();
      if (this.browser) await this.browser.close();
    } catch (error) {
      logger.error('Error closing PatentScopeCrawler:', error);
    }
  }
}

module.exports = PatentScopeCrawler;
