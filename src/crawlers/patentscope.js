const puppeteer = require('puppeteer');
const GroqParser = require('../services/groqParser');

class PatentScopeCrawler {
  constructor() {
    this.browser = null;
    this.page = null;
    this.groqParser = new GroqParser();
  }

  async initialize() {
    console.log('Initializing PatentScope crawler...');
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    this.page = await this.browser.newPage();
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    );
    await this.page.setViewport({ width: 1366, height: 768 });
    await this.page.setDefaultTimeout(60000);
    console.log('PatentScope crawler initialized');
  }

  async performSearch(searchTerm) {
    const url = `https://patentscope.wipo.int/search/en/result.jsf?query=FP:(${encodeURIComponent(searchTerm)})`;
    console.log(`Navigating to full-text URL: ${url}`);
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Espera o primeiro resultado aparecer
    await this.page.waitForSelector('table.resultList tbody tr', { timeout: 60000 });
    console.log('Search page loaded with results');
  }

  async extractResultsFromPage() {
    // Pega HTML das linhas de resultados
    const html = await this.page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('table.resultList tbody tr'));
      return rows.map(row => row.innerHTML).join('\n');
    });

    if (!html) return [];

    // Passa o HTML para o GroqParser
    const prompt = `Extract patent information from the following HTML of PatentScope results.
Return a JSON array where each item has:
- publicationNumber
- title
- abstract
- inventor
- applicant
- source ("PatentScope")

HTML:
${html.substring(0, 30000)}
Return ONLY valid JSON array.`;

    try {
      const response = await this.groqParser.askGroq(prompt);
      if (!response) throw new Error('Groq returned null');
      const results = JSON.parse(response);
      return results.map(p => ({ ...p, source: 'PatentScope' }));
    } catch (e) {
      console.error('Groq parsing failed:', e.message);
      return [];
    }
  }

  async goToNextPage() {
    try {
      const nextButton = await this.page.$('a[title*="Next"], a.paginationNext');

      if (!nextButton) {
        console.log('No next page button found');
        return false;
      }

      await Promise.all([
        this.page.waitForSelector('table.resultList tbody tr', { timeout: 30000 }),
        nextButton.click()
      ]);

      await this.page.waitForTimeout(2000);
      console.log('Moved to next page');
      return true;
    } catch (e) {
      console.log('Failed to go to next page:', e.message);
      return false;
    }
  }

  async extractResults(maxPages = 5) {
    let allPatents = [];
    for (let i = 1; i <= maxPages; i++) {
      console.log(`Processing page ${i}...`);
      const pageResults = await this.extractResultsFromPage();
      console.log(`Extracted ${pageResults.length} patents from current page`);
      allPatents = allPatents.concat(pageResults);

      const hasNext = await this.goToNextPage();
      if (!hasNext) break;
    }

    // Deduplica
    const uniquePatents = Array.from(
      new Map(allPatents.map(p => [p.publicationNumber, p])).values()
    );

    if (!uniquePatents.length) {
      return [
        {
          publicationNumber: 'NO_RESULTS',
          title: 'No patents found',
          abstract: 'PatentScope returned no results',
          source: 'PatentScope'
        }
      ];
    }

    console.log(`Total unique patents extracted: ${uniquePatents.length}`);
    return uniquePatents;
  }

  async searchPatents(medicine) {
    console.log(`Starting PatentScope search for: ${medicine}`);
    try {
      await this.initialize();
      await this.performSearch(medicine);
      const patents = await this.extractResults(5);
      console.log(`PatentScope search completed: ${patents.length} patents found`);
      await this.browser.close();
      return patents;
    } catch (error) {
      console.error('PatentScope search error:', error.message);
      if (this.browser) await this.browser.close();
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
