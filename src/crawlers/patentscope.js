const puppeteer = require('puppeteer');
const tesseract = require('tesseract.js');
const logger = require('../utils/logger');

class PatentScopeCrawler {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    try {
      logger.info('Initializing PatentScope browser');
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      });

      this.page = await this.browser.newPage();

      await this.page.setRequestInterception(true);
      this.page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) req.abort();
        else req.continue();
      });

      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await this.page.setViewport({ width: 1920, height: 1080 });
      logger.info('PatentScope initialized');
    } catch (error) {
      logger.error('Failed to initialize PatentScope', error);
      throw error;
    }
  }

  async close() {
    try {
      if (this.page) await this.page.close();
      if (this.browser) await this.browser.close();
      logger.info('PatentScope closed');
    } catch (error) {
      logger.warn('Error closing PatentScope', error);
    }
  }

  async searchPatents(medicine) {
    if (!this.page) throw new Error('Browser not initialized');

    try {
      const searchUrl = `https://patentscope.wipo.int/search/en/result.jsf?query=FP:(${encodeURIComponent(medicine)})`;
      logger.info(`Searching: ${searchUrl}`);

      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await this.page.waitForTimeout(8000); // espera renderizar JS

      // Tirar screenshot da página
      const screenshotPath = `/tmp/patentscope_${Date.now()}.png`;
      await this.page.screenshot({ path: screenshotPath, fullPage: true });
      logger.info(`Screenshot saved: ${screenshotPath}`);

      // OCR com Tesseract.js
      logger.info('Running OCR on screenshot...');
      const { data: { text } } = await tesseract.recognize(screenshotPath, 'eng');

      logger.info('OCR finished, parsing text...');
      const cleanText = text.replace(/\t+/g, ' ').replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();

      // Extrair patentes com regex
      const patentRegex = /\b(WO|US|EP|CN|JP)\s*\/?\s*\d{4}\s*\/?\s*\d{5,}/gi;
      const matches = [...new Set(cleanText.match(patentRegex) || [])].slice(0, 15); // pegar até 15

      const results = matches.map((num) => ({
        publicationNumber: num,
        title: '',       // título não extraído aqui, só número
        abstract: '',    // abstract não extraído
        applicant: '',
        inventor: '',
        source: 'PatentScope',
      }));

      if (results.length === 0) {
        return [{
          publicationNumber: 'NO_RESULTS',
          title: 'No patents found',
          abstract: `Search for "${medicine}" returned no results`,
          applicant: '',
          inventor: '',
          source: 'PatentScope',
        }];
      }

      logger.info(`Found ${results.length} patents via OCR`);
      return results;

    } catch (error) {
      logger.error('PatentScope OCR search failed', error);
      return [{
        publicationNumber: 'ERROR',
        title: 'Search failed',
        abstract: error.message,
        applicant: '',
        inventor: '',
        source: 'PatentScope',
      }];
    }
  }
}

module.exports = PatentScopeCrawler;
