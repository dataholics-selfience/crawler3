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

      // Bloquear imagens, CSS e fonts para acelerar
      await this.page.setRequestInterception(true);
      this.page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });

      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      );
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

  /**
   * Retorna apenas a primeira página de resultados.
   * Se não conseguir extrair patentes, retorna o HTML bruto para parsing externo.
   */
  async searchFirstPage(medicine, maxTimeout = 60000, minPatents = 15) {
    if (!this.page) throw new Error('Browser not initialized');

    try {
      const searchUrl = `https://patentscope.wipo.int/search/en/result.jsf?query=FP:(${encodeURIComponent(medicine)})`;
      logger.info(`Searching: ${searchUrl}`);

      await this.page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: maxTimeout });

      // Espera dinâmica curta para elementos renderizarem
      await this.page.waitForTimeout(8000);

      const patents = await this.page.evaluate((minPatents) => {
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

              if (lines.length > 0 && !text.includes('Download') && !text.includes('Authority')) {
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

          if (results.length >= minPatents) break; // Garantir pelo menos 15 patentes
        }

        return results;
      }, minPatents);

      if (!patents || patents.length === 0) {
        logger.warn('No structured patents found, returning HTML for external parsing');
        const html = await this.page.content();
        return [
          {
            publicationNumber: 'HTML_DUMP',
            title: 'Raw HTML snapshot (to be parsed by AI)',
            abstract: html,
            source: 'PatentScope'
          }
        ];
      }

      logger.info(`Found ${patents.length} patents`);
      return patents;

    } catch (error) {
      logger.error('PatentScope search failed', error);
      return [
        {
          publicationNumber: 'ERROR',
          title: 'Search failed',
          abstract: error.message,
          source: 'PatentScope'
        }
      ];
    }
  }
}

module.exports = PatentScopeCrawler;
