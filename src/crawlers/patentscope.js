const puppeteer = require('puppeteer');
const Tesseract = require('tesseract.js');
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
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });
      this.page = await this.browser.newPage();

      await this.page.setRequestInterception(true);
      this.page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });

      await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      await this.page.setViewport({ width: 1920, height: 1080 });
      logger.info('PatentScope browser initialized');
    } catch (error) {
      logger.error('Failed to initialize PatentScope', error);
      throw error;
    }
  }

  async close() {
    try {
      if (this.page) await this.page.close();
      if (this.browser) await this.browser.close();
      logger.info('PatentScope browser closed');
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

      await this.page.waitForTimeout(5000); // espera o conteúdo carregar

      // tenta extrair texto diretamente
      let patents = await this.page.evaluate(() => {
        const cleanText = (text) => text?.replace(/\t+/g, ' ').replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        const results = [];
        const seen = new Set();

        const allText = document.body.innerText;
        const patentMatches = allText.match(/\b(WO|US|EP|CN|JP)\s*\/?\s*\d{4}\s*\/?\s*\d{5,}/gi);

        if (!patentMatches) return [];

        for (const match of patentMatches) {
          const number = cleanText(match);
          if (seen.has(number)) continue;
          seen.add(number);

          results.push({
            publicationNumber: number,
            title: number, // título inicial
            abstract: '',
            applicant: '',
            inventor: '',
            source: 'PatentScope'
          });
        }

        return results;
      });

      // se não encontrou nada, usa OCR do screenshot
      if (!patents || patents.length === 0) {
        logger.info('No text detected, using OCR');
        const screenshotBuffer = await this.page.screenshot();
        const { data: { text } } = await Tesseract.recognize(screenshotBuffer, 'eng');
        
        const cleanText = (t) => t.replace(/\t+/g, ' ').replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        const ocrMatches = text.match(/\b(WO|US|EP|CN|JP)\s*\/?\s*\d{4}\s*\/?\s*\d{5,}/gi);
        patents = [];

        if (ocrMatches) {
          const seen = new Set();
          for (const match of ocrMatches) {
            const number = cleanText(match);
            if (seen.has(number)) continue;
            seen.add(number);

            patents.push({
              publicationNumber: number,
              title: number,
              abstract: cleanText(text).substring(0, 500),
              applicant: '',
              inventor: '',
              source: 'PatentScope'
            });
          }
        }
      }

      if (patents.length === 0) {
        return [{
          publicationNumber: 'NO_RESULTS',
          title: 'No patents found',
          abstract: `Search for "${medicine}" returned no results`,
          applicant: '',
          inventor: '',
          source: 'PatentScope'
        }];
      }

      return patents;
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
    }
  }
}

module.exports = PatentScopeCrawler;
