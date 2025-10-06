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
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ],
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

  async search(medicine, maxPages = 3) {
    if (!this.page) throw new Error('Browser not initialized');

    try {
      // Busca direta via URL com Full Text (mais confiável)
      const searchUrl = `https://patentscope.wipo.int/search/en/result.jsf?query=FP:(${encodeURIComponent(medicine)})`;
      logger.info(`Navigating to: ${searchUrl}`);

      await this.page.goto(searchUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await this.page.waitForTimeout(5000);

      const allPatents = [];
      let currentPage = 1;

      while (currentPage <= maxPages) {
        logger.info(`Extracting page ${currentPage}...`);

        const pagePatents = await this.page.evaluate(() => {
          const cleanText = (text) => {
            return text
              .replace(/\t+/g, ' ')
              .replace(/\n+/g, ' ')
              .replace(/\s{2,}/g, ' ')
              .trim();
          };

          const results = [];
          const seenNumbers = new Set();
          const allElements = document.querySelectorAll('div, span, td');

          for (const element of allElements) {
            const text = element.textContent || '';
            const patentMatch = text.match(/\b(WO|US|EP|CN|JP|KR|BR)\s*\d{4}[\/\s]\d+/i);

            if (patentMatch && text.length > 50 && text.length < 2000) {
              const number = cleanText(patentMatch[0]);

              if (!seenNumbers.has(number)) {
                seenNumbers.add(number);
                
                const lines = text.split('\n').filter(line => line.trim().length > 10);

                if (lines.length > 0 && 
                    !text.includes('Download') && 
                    !text.includes('Authority File')) {
                  
                  const applicantMatch = text.match(/Applicant[:\s]+([^\n]+)/i);
                  const inventorMatch = text.match(/Inventor[:\s]+([^\n]+)/i);

                  results.push({
                    publicationNumber: number,
                    title: cleanText(lines[0].substring(0, 200)),
                    abstract: cleanText(text.substring(0, 500)),
                    applicant: applicantMatch ? cleanText(applicantMatch[1].substring(0, 100)) : '',
                    inventor: inventorMatch ? cleanText(inventorMatch[1].substring(0, 100)) : '',
                    source: 'PatentScope'
                  });
                }
              }
            }
          }

          return results;
        });

        logger.info(`Found ${pagePatents.length} patents on page ${currentPage}`);
        allPatents.push(...pagePatents);

        // Tentar ir para próxima página
        if (currentPage < maxPages) {
          try {
            const nextButton = await this.page.$('a[title*="Next"]');
            
            if (!nextButton) {
              logger.info('No next button found');
              break;
            }

            await Promise.all([
              this.page.waitForNavigation({
                waitUntil: 'domcontentloaded',
                timeout: 15000
              }),
              nextButton.click()
            ]);

            await this.page.waitForTimeout(3000);
          } catch (e) {
            logger.warn(`Failed to navigate to next page: ${e.message}`);
            break;
          }
        }

        currentPage++;
      }

      // Deduplicação final
      const uniquePatents = Array.from(
        new Map(allPatents.map(p => [p.publicationNumber, p])).values()
      );

      logger.info(`Total unique patents: ${uniquePatents.length}`);

      return uniquePatents.length > 0 ? uniquePatents : [{
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
