const puppeteer = require('puppeteer');
const GroqParser = require('../services/groqParser');

class PatentScopeCrawler {
  constructor() {
    this.baseUrl = 'https://patentscope.wipo.int/search/en/search.jsf';
    this.browser = null;
    this.page = null;
    this.groqParser = new GroqParser();
  }

  // Inicializa Puppeteer
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
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    );
    await this.page.setViewport({ width: 1366, height: 768 });
    await this.page.setDefaultTimeout(60000);
    console.log('PatentScope crawler initialized');
  }

  // Fallback inteligente para detectar campos de busca
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
}

Common patterns:
- Search: fpSearch, simpleSearch, query
- Submit: commandSimpleFPSearch, input[type="submit"]

Return ONLY valid JSON.`;

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

        if (name.includes('search') || id.includes('search') || name.includes('query') || name.includes('fpsearch')) {
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

  // Executa a busca full-text
  async performSearch(searchTerm) {
    console.log('Performing PatentScope full-text search...');
    const fullTextUrl = `https://patentscope.wipo.int/search/en/result.jsf?query=FP:(${encodeURIComponent(searchTerm)})`;
    console.log(`Using full-text URL: ${fullTextUrl}`);

    try {
      await this.page.goto(fullTextUrl, { waitUntil: 'networkidle0', timeout: 60000 });
      await this.page.waitForTimeout(5000);
      console.log('Full-text search page loaded');
    } catch (e) {
      throw new Error('PatentScope search failed: ' + e.message);
    }
  }

  // Extrai resultados de uma página
  async extractResultsFromCurrentPage() {
    console.log('Extracting results from current page...');
    const patents = await this.page.evaluate(() => {
      const clean = (txt) => txt.replace(/\s+/g, ' ').trim();
      const rows = Array.from(document.querySelectorAll('table.resultTable tr')).filter(tr =>
        tr.innerText.match(/(WO|US|EP|CN|JP|KR|BR|CA|AU|IN)\s*\d{4,}/i)
      );

      const results = [];
      const seen = new Set();

      for (const tr of rows) {
        const text = clean(tr.innerText);
        const match = text.match(/(WO|US|EP|CN|JP|KR|BR|CA|AU|IN)\s*[\d/]+/i);
        if (!match) continue;

        const publicationNumber = match[0].replace(/\s+/g, '');
        if (seen.has(publicationNumber)) continue;
        seen.add(publicationNumber);

        const title = clean(text.split(/\n| {2,}/)[0] || '');
        const abstract = clean(text.substring(0, 600));

        results.push({
          publicationNumber,
          title: title || 'Untitled patent',
          abstract,
          source: 'PatentScope'
        });
      }

      // fallback se a tabela não existir
      if (results.length === 0) {
        const blocks = Array.from(document.querySelectorAll('div, td')).map(el => el.innerText);
        for (const block of blocks) {
          const match = block.match(/\b(WO|US|EP|CN|JP|KR|BR|CA|AU|IN)\s*\d{4,}[\/\s]?\d*/i);
          if (!match) continue;
          const number = match[0].replace(/\s+/g, '');
          if (seen.has(number)) continue;
          seen.add(number);
          results.push({
            publicationNumber: number,
            title: clean(block.split('\n')[0] || ''),
            abstract: clean(block.substring(0, 600)),
            source: 'PatentScope'
          });
        }
      }

      return results;
    });

    console.log(`Extracted ${patents.length} patents from current page`);
    return patents;
  }

  // Navega para a próxima página
  async goToNextPage() {
    console.log('Trying to go to next page...');
    try {
      const nextButtonSelectors = [
        'a[id*="nextPageLink"]',
        'a[title*="Next"]',
        '.ui-paginator-next',
        'input[value*="Next"]'
      ];

      let nextButton = null;
      for (const sel of nextButtonSelectors) {
        nextButton = await this.page.$(sel);
        if (nextButton) break;
      }

      if (!nextButton) {
        console.log('No next button found — probably last page.');
        return false;
      }

      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }),
        nextButton.click()
      ]);

      await this.page.waitForTimeout(4000);
      console.log('Moved to next page');
      return true;
    } catch (e) {
      console.log('Failed to go to next page:', e.message);
      return false;
    }
  }

  // Extrai resultados de várias páginas
  async extractResults(maxPages = 5) {
    console.log(`Extracting results from up to ${maxPages} pages...`);
    let allPatents = [];
    let currentPage = 1;

    while (currentPage <= maxPages) {
      console.log(`Processing page ${currentPage}...`);
      const pagePatents = await this.extractResultsFromCurrentPage();
      allPatents = allPatents.concat(pagePatents);

      console.log(`Found ${pagePatents.length} patents on page ${currentPage}`);

      const hasNext = await this.goToNextPage();
      if (!hasNext) break;

      currentPage++;
      await this.page.waitForTimeout(3000);
    }

    const uniquePatents = Array.from(new Map(allPatents.map(p => [p.publicationNumber, p])).values());

    if (uniquePatents.length === 0) {
      return [{
        publicationNumber: 'NO_RESULTS',
        title: 'No patents found',
        abstract: 'PatentScope returned no results',
        source: 'PatentScope'
      }];
    }

    console.log(`Total unique patents extracted: ${uniquePatents.length}`);
    return uniquePatents;
  }

  // Função principal de busca
  async searchPatents(medicine) {
    console.log(`Starting PatentScope full-text search for: ${medicine}`);
    try {
      await this.initialize();
      await this.performSearch(medicine);
      const patents = await this.extractResults(5);
      console.log(`PatentScope search completed: ${patents.length} patents found`);
      return patents;
    } catch (error) {
      console.error('PatentScope search error:', error.message);
      return [{
        publicationNumber: 'ERROR',
        title: 'Search failed',
        abstract: error.message,
        source: 'PatentScope'
      }];
    } finally {
      if (this.browser) await this.browser.close();
      console.log('PatentScope crawler closed.');
    }
  }
}

module.exports = PatentScopeCrawler;
