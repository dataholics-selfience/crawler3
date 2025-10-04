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
    console.log('Initializing PatentScope crawler');
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
    console.log('PatentScope crawler initialized');
  }

  async detectSearchFieldsIntelligently() {
    console.log('Detecting PatentScope search fields...');
    
    const html = await this.page.content();
    
    const prompt = `Analyze this PatentScope WIPO search page HTML and identify search fields.

HTML:
${html.substring(0, 3000)}

Identify:
1. Main search/keyword input field (usually for text search)
2. Submit/search button

Return ONLY this JSON:
{
  "searchField": "exact name or id attribute of search input",
  "submitSelector": "CSS selector for search button"
}

Common patterns:
- Search: fpSearch, simpleSearch, query, searchInput
- Submit: commandSimpleFPSearch, searchButton, input[type="submit"]

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
      console.log('Groq failed, using fallback detection');
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
        
        if (name.includes('search') || id.includes('search') || 
            name.includes('query') || id.includes('query') ||
            name.includes('fpsearch') || id.includes('fpsearch')) {
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
      submitSelector: detectedFields.submitSelector || 'input[type="submit"]'
    };
    
    console.log('Fallback PatentScope fields:', fields);
    return fields;
  }

  async performSearch(searchTerm) {
    console.log('Performing PatentScope search...');
    
    const fields = await this.detectSearchFieldsIntelligently();
    
    const searchSelectors = [
      `input[name="${fields.searchField}"]`,
      `#${fields.searchField}`,
      `input[id*="${fields.searchField.split(':')[0]}"]`
    ];
    
    let searchInput = null;
    for (const selector of searchSelectors) {
      try {
        searchInput = await this.page.$(selector);
        if (searchInput) {
          console.log(`Search field found: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!searchInput) {
      console.log('Direct field not found, trying URL-based search');
      const directUrl = `https://patentscope.wipo.int/search/en/result.jsf?query=${encodeURIComponent(searchTerm)}`;
      await this.page.goto(directUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      return;
    }
    
    await searchInput.click({ clickCount: 3 });
    await searchInput.type(searchTerm);
    console.log(`Typed: ${searchTerm}`);
    
    try {
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        this.page.click(fields.submitSelector)
      ]);
    } catch (e) {
      console.log('Navigation timeout, continuing...');
    }
    
    await this.page.waitForTimeout(5000);
  }

  async extractResults() {
    console.log('Extracting PatentScope results with traditional parsing...');
    
    const patents = await this.page.evaluate(() => {
      const results = [];
      
      const resultSelectors = [
        '.searchResultRecord',
        '.resultItem',
        '[class*="result"]',
        'div[id*="result"]',
        'table tr'
      ];
      
      let elements = [];
      for (const selector of resultSelectors) {
        elements = Array.from(document.querySelectorAll(selector));
        if (elements.length > 0) break;
      }
      
      if (elements.length === 0) {
        const allDivs = document.querySelectorAll('div');
        for (const div of allDivs) {
          const text = div.textContent || '';
          if (text.includes('WO/') || text.includes('US/') || text.includes('EP/')) {
            elements = [div];
            break;
          }
        }
      }
      
      elements.forEach((element, index) => {
        try {
          const text = element.textContent || '';
          
          if (text.trim().length < 10) return;
          
          const pubNumberMatch = text.match(/([A-Z]{2}[\/\s]?\d{4}[\/\s]?\d+|[A-Z]{2}\d+)/);
          const publicationNumber = pubNumberMatch ? pubNumberMatch[0] : `Result ${index + 1}`;
          
          const lines = text.split('\n').filter(line => line.trim().length > 20);
          const title = lines[0] || 'Patent result';
          
          results.push({
            publicationNumber,
            title: title.substring(0, 200),
            abstract: text.substring(0, 500),
            resultIndex: index + 1,
            source: 'PatentScope'
          });
        } catch (err) {
          console.error(`Error at index ${index}`);
        }
      });
      
      return results;
    });
    
    if (patents.length === 0) {
      console.log('No results found, returning test data');
      return [{
        publicationNumber: 'NO_RESULTS',
        title: 'Search completed but no results found',
        abstract: 'PatentScope returned no results or page structure is different',
        source: 'PatentScope'
      }];
    }
    
    console.log(`Extracted ${patents.length} patents`);
    return patents;
  }

  async searchPatents(medicine) {
    console.log(`Starting PatentScope search for: ${medicine}`);
    
    try {
      await this.page.goto(this.baseUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      await this.page.waitForTimeout(5000);
      
      await this.performSearch(medicine);
      
      const patents = await this.extractResults();
      
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
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('PatentScope crawler closed');
    }
  }
}

module.exports = PatentScopeCrawler;
