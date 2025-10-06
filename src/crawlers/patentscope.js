const puppeteer = require('puppeteer');
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

      await this.page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });

      await this.page.waitForTimeout(8000);

      const patents = await this.page.evaluate(() => {
        const cleanText = (text) => {
          if (!text) return '';
          return text.replace(/\t+/g, ' ').replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        };

        const results = [];
        const seen = new Set();
        
        const allText = document.body.innerText;
        const patentMatches = allText.match(/\b(WO|US|EP|CN|JP)\s*\/?\s*\d{4}\s*\/?\s*\d{5,}/gi);
        
        if (!patentMatches) return [];

        const allElements = document.querySelectorAll('div, span, td, tr');
        
        for (const match of patentMatches) {
          const number = cleanText(match);
          if (seen.has(number)) continue;
          seen.add(number);

          for (const el of allElements) {
            const text = el.textContent || '';
            if (text.includes(number) && text.length > 100 && text.length < 3000) {
              const lines = text.split('\n').filter(l => l.trim().length > 20);
              
              if (lines.length > 0 && 
                  !text.includes('Download') && 
                  !text.includes('Authority')) {
                
                const title = lines.find(l => l.length > 30) || lines[0] || '';
                const applicant = text.match(/(?:Applicant|Assignee)[:\s]+([^\n]{10,100})/i);
                const inventor = text.match(/Inventor[:\s]+([^\n]{10,100})/i);
                
                results.push({
                  publicationNumber: number,
                  title: cleanText(title).substring(0, 200),
                  abstract: cleanText(text).substring(0, 500),
                  applicant: applicant ? cleanText(applicant[1]) : '',
                  inventor: inventor ? cleanText(inventor[1]) : '',
                  source: 'PatentScope'
                });
                break;
              }
            }
          }
        }

        return results;
      });

      const unique = Array.from(new Map(patents.map(p => [p.publicationNumber, p])).values());
      
      logger.info(`Found ${unique.length} patents`);

      return unique.length > 0 ? unique : [{
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
    }
  }
}

module.exports = PatentScopeCrawler;
