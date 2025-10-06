const puppeteer = require('puppeteer');
const GroqParser = require('../services/groqParser');

class PatentScopeCrawler {
  constructor() {
    this.baseUrl = 'https://patentscope.wipo.int/search/en/search.jsf';
    this.browser = null;
    this.page = null;
    this.groqParser = new GroqParser();
  }

  async initialize() {
    console.log('Initializing PatentScope crawler...');
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
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    await this.page.setViewport({ width: 1366, height: 768 });
    await this.page.setDefaultTimeout(60000);
    console.log('PatentScope crawler initialized.');
  }

  async detectSearchFieldsIntelligently() {
    console.log('Detecting PatentScope search fields...');
    const html = await this.page.content();

    const prompt = `Analyze this PatentScope WIPO search page HTML and identify search fields.

HTML:
${html.substring(0, 3000)}

Return ONLY this JSON:
{
  "searchField": "exact name or id attribute of search input",
  "submitSelector": "CSS selector for search button"
}`;

    try {
      const response = await this.groqParser.askGroq(prompt);
      if (!response) throw new Error('Groq returned null');
      const fields = JSON.parse(response);
      if (fields.searchField && fields.submitSelector) {
        console.log('Groq detected PatentScope fields:', fields);
        return fields;
      }
      throw new Error('Incomplete fields');
    } catch (error) {
      console.log('Groq failed, using fallback');
      return await this.fallbackDetection();
    }
  }

  async fallbackDetection() {
    const detectedFields = await this.page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
      let searchField = null;

      for (const input of inputs) {
        const name = (input.name || '').toLowerCase();
        const id = (input.id || '').toLowerCase();

        if (
          name.includes('search') ||
          id.includes('search') ||
          name.includes('query') ||
          name.includes('fpsearch')
        ) {
          searchField = input.name || input.id;
          break;
        }
      }

      return {
        searchField: searchField,
        submitSelector: 'input[type="submit"]'
      };
    });

    const fields = {
      searchField: detectedFields.searchField || 'simpleSearchSearchForm:fpSearch',
      submitSelector: 'input[type="submit"]'
    };

    console.log('Fallback fields:', fields);
    return fields;
  }

  async performSearch(searchTerm) {
    console.log('Performing PatentScope full-text search...');
    const fullTextUrl = `https://patentscope.wipo.int/search/en/result.jsf?query=FP:(${encodeURIComponent(searchTerm)})`;
    console.log(`Using full-text URL: ${fullTextUrl}`);

    try {
      await this.page.goto(fullTextUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await this.page.waitForTimeout(5000);

      const hasResults = await this.page.evaluate(() => {
        const text = document.body.innerText;
        return text.includes('result') || text.includes('WO/') || text.includes('patent');
      });

      if (hasResults) {
        console.log('Full-text search successful');
        return;
      }
    } catch (e) {
      console.log('Full-text URL failed:', e.message);
    }

    throw new Error('PatentScope search failed');
  }

  async extractResultsFromCurrentPage() {
    const patents = await this.page.evaluate(() => {
      const cleanText = (text) => {
        return text
          .replace(/\t+/g, ' ')
          .replace(/\n+/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();
      };

      const results = [];
      const allElements = document.querySelectorAll('div, span, td, a');
      const seenNumbers = new Set();

      for (const element of allElements) {
        const text = element.textContent || '';
        const patentMatch = text.match(/\b(WO|US|EP|CN|JP|KR|BR)\s*\d{4}[\/\s]\d+/i);

        if (patentMatch && text.length > 50 && text.length < 2000) {
          const number = cleanText(patentMatch[0]);

          if (!seenNumbers.has(number)) {
            const lines = text.split('\n').filter((line) => line.trim().length > 10);

            if (lines.length > 0 && !text.includes('Download') && !text.includes('Authority File')) {
              seenNumbers.add(number);
              results.push({
                publicationNumber: number,
                title: cleanText(lines[0].substring(0, 200)),
                abstract: cleanText(text.substring(0, 500)),
                source: 'PatentScope'
              });
            }
          }
        }
      }

      return results;
    });

    return patents;
  }

  async goToNextPage() {
    try {
      const nextButton =
        (await this.page.$('a[title*="Next"]')) ||
        (await this.page.$('a:contains("Next")')) ||
        (await this.page.$('.paginationNext')) ||
        (await this.page.$('input[value*="Next"]'));

      if (!nextButton) {
        console.log('No next button found');
        return false;
      }

      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
        nextButton.click()
      ]);

      await this.page.waitForTimeout(3000);
      console.log('Navigated to next page');
      return true;
    } catch (e) {
      console.log('Failed to go to next page:', e.message);
      return false;
    }
  }

  async extractResults(maxPages = 5) {
    console.log(`Extracting results from up to ${maxPages} pages...`);
    let allPatents = [];
    let currentPage = 1;

    while (currentPage <= maxPages) {
      console.log(`Extracting page ${currentPage}...`);
      const pagePatents = await this.extractResultsFromCurrentPage();
      allPatents = allPatents.concat(pagePatents);
      console.log(`Found ${pagePatents.length} patents on page ${currentPage}`);

      if (currentPage < maxPages) {
        const hasNext = await this.goToNextPage();
        if (!hasNext) {
          console.log('No more pages available');
          break;
        }
      }

      currentPage++;
    }

    const uniquePatents = Array.from(
      new Map(allPatents.map((p) => [p.publicationNumber, p])).values()
    );

    if (uniquePatents.length === 0) {
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
    console.log(`Starting PatentScope full-text search for: ${medicine}`);

    try {
      await this.performSearch(medicine);
      const patents = await this.extractResults(5);
      console.log(`PatentScope search completed: ${patents.length} patents found`);
      return patents;
    } catch (error) {
      console.error('PatentScope search error:', error.message);
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

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('PatentScope crawler closed.');
    }
  }
}

module.exports = PatentScopeCrawler;
