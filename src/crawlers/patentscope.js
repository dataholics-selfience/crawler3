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
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      });
      this.page = await this.browser.newPage();
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
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

  async search(medicine, maxPages = 3) {
    if (!this.page) throw new Error('Browser not initialized');

    try {
      const searchUrl = `https://patentscope.wipo.int/search/en/result.jsf?query=FP:(${encodeURIComponent(medicine)})`;
      logger.info(`Navigating to: ${searchUrl}`);
      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 40000 });

      await this.page.waitForTimeout(5000); // espera inicial

      const allPatents = [];
      let currentPage = 1;

      while (currentPage <= maxPages) {
        logger.info(`Extracting page ${currentPage}...`);

        const pagePatents = await this.page.evaluate(() => {
          const cleanText = (text) =>
            text.replace(/\t+/g, ' ').replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim();

          const results = [];
          const seenNumbers = new Set();
          const items = document.querySelectorAll('.result-list .result-item');

          items.forEach((item) => {
            const text = item.textContent || '';
            const patentMatch = text.match(/\b(?:WO|US|EP|CN|JP|KR|BR)\d{4,}[A-Z]?\d*/i);

            if (patentMatch) {
              const number = cleanText(patentMatch[0]);
              if (!seenNumbers.has(number)) {
                seenNumbers.add(number);

                const titleElement = item.querySelector('h3, .title');
                const abstractElement = item.querySelector('.abstract');
                const applicantMatch = text.match(/Applicant[:\s]+([^\n]+)/i);
                const inventorMatch = text.match(/Inventor[:\s]+([^\n]+)/i);

                results.push({
                  publicationNumber: number,
                  title: titleElement ? cleanText(titleElement.textContent) : cleanText(text.substring(0, 200)),
                  abstract: abstractElement ? cleanText(abstractElement.textContent) : cleanText(text.substring(0, 500)),
                  applicant: applicantMatch ? cleanText(applicantMatch[1].substring(0, 100)) : '',
                  inventor: inventorMatch ? cleanText(inventorMatch[1].substring(0, 100)) : '',
                  source: 'PatentScope',
                });
              }
            }
          });

          return results;
        });

        logger.info(`Found ${pagePatents.length} patents on page ${currentPage}`);
        allPatents.push(...pagePatents);

        if (currentPage < maxPages) {
          try {
            const nextButton = await this.page.$('a[title*="Next"]');
            if (!nextButton) break;

            await Promise.all([
              this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }),
              nextButton.click(),
            ]);

            await this.page.waitForTimeout(3000);
          } catch (e) {
            logger.warn(`Failed to navigate to next page: ${e.message}`);
            break;
          }
        }

        currentPage++;
      }

      const uniquePatents = Array.from(new Map(allPatents.map(p => [p.publicationNumber, p])).values());

      logger.info(`Total unique patents: ${uniquePatents.length}`);

      return uniquePatents.length > 0
        ? uniquePatents
        : [{
            publicationNumber: 'NO_RESULTS',
            title: 'No patents found',
            abstract: 'PatentScope returned no results',
            source: 'PatentScope'
          }];
    } catch (error) {
      logger.error('PatentScope search failed', error);
      return [{
        publicationNumber: 'ERROR',
        title: 'Search failed',
        abstract: error.message,
        source: 'PatentScope'
      }];
    }
  }

  async searchPatents(medicine) {
    return await this.search(medicine, 3);
  }
}

module.exports = PatentScopeCrawler;
