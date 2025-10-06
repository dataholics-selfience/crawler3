const puppeteer = require('puppeteer');
const Tesseract = require('tesseract.js');
const logger = require('../utils/logger');

class PatentScopeCrawler {
  constructor() {
    this.browser = null;
  }

  async initialize() {
    if (!this.browser) {
      logger.info('Initializing PatentScope browser');
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });
      logger.info('PatentScope browser initialized');
    }
  }

  async close() {
    try {
      if (this.browser) {
        await this.browser.close();
        logger.info('PatentScope browser closed');
        this.browser = null;
      }
    } catch (error) {
      logger.warn('Error closing PatentScope browser', error);
    }
  }

  async searchPatents(medicine) {
    await this.initialize();

    let page;
    try {
      page = await this.browser.newPage();
      await page.setRequestInterception(true);

      page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });

      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await page.setViewport({ width: 1920, height: 1080 });

      const searchUrl = `https://patentscope.wipo.int/search/en/result.jsf?query=FP:(${encodeURIComponent(medicine)})`;
      logger.info(`Navigating to: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

      // Espera a página carregar
      await page.waitForTimeout(5000);

      // Captura print da página para OCR
      const screenshotBuffer = await page.screenshot({ fullPage: true });

      const ocrResult = await Tesseract.recognize(screenshotBuffer, 'eng', {
        logger: (m) => logger.debug(`Tesseract: ${m.status} ${m.progress}`)
      });

      const text = ocrResult.data.text;

      // Extrai patentes pelo padrão conhecido
      const patentMatches = text.match(/\b(WO|US|EP|CN|JP)\s*\/?\s*\d{4}\s*\/?\s*\d{5,}/gi) || [];
      const uniquePatents = Array.from(new Set(patentMatches)).slice(0, 15); // no mínimo 15

      const results = uniquePatents.map((number, idx) => ({
        publicationNumber: number,
        title: `Patent ${idx + 1} - ${number}`,
        abstract: text.substring(0, 300),
        applicant: '',
        inventor: '',
        source: 'PatentScope'
      }));

      logger.info(`Found ${results.length} patents via OCR`);

      return results.length > 0 ? results : [{
        publicationNumber: 'NO_RESULTS',
        title: 'No patents found',
        abstract: `Search for "${medicine}" returned no results`,
        applicant: '',
        inventor: '',
        source: 'PatentScope'
      }];

    } catch (error) {
      logger.error('PatentScope search failed', error);
      return [{
        publicationNumber: 'ERROR',
        title: 'Search failed',
        abstract: error.message,
        applicant: '',
        inventor: '',
        source: 'PatentScope'
      }];
    } finally {
      if (page) await page.close();
    }
  }
}

module.exports = PatentScopeCrawler;
