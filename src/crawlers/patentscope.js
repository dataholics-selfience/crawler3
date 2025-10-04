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
        
        if (name.includes('search') || id.includes('search') || 
            name.includes('query') || name.includes('fpsearch')) {
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
    console.log('Performing PatentScope search...');
    
    // Estratégia 1: Busca direta via URL (mais confiável)
    const directUrl = `https://patentscope.wipo.int/search/en/result.jsf?query=${encodeURIComponent(searchTerm)}`;
    console.log(`Using direct URL: ${directUrl}`);
    
    try {
      await this.page.goto(directUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      await this.page.waitForTimeout(5000);
      
      const hasResults = await this.page.evaluate(() => {
        const text = document.body.innerText;
        return text.includes('result') || text.includes('WO/') || text.includes('patent');
      });
      
      if (hasResults) {
        console.log('Direct URL search successful');
        return;
      }
    } catch (e) {
      console.log('Direct URL failed, trying form search');
    }
    
    // Estratégia 2: Busca via formulário
    await this.page.goto(this.baseUrl, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    await this.page.waitForTimeout(3000);
    
    const fields = await this.detectSearchFieldsIntelligently();
    
    const searchSelectors = [
      `input[name="${fields.searchField}"]`,
      `#${fields.searchField}`,
      'input[type="text"]'
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
      throw new Error('Search field not found');
    }
    
    await searchInput.click({ clickCount: 3 });
    await searchInput.type(searchTerm);
    console.log(`Typed: ${searchTerm}`);
    
    try {
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
        this.page.click(fields.submitSelector)
      ]);
    } catch (e) {
      console.log('Navigation timeout, continuing...');
    }
    
    await this.page.waitForTimeout(5000);
  }

  async extractResults() {
    console.log('Extracting PatentScope results...');
    
    const patents = await this.page.evaluate(() => {
      const results = [];
      const allElements = document.querySelectorAll('div, span, td');
      const validResults = new Set();
      
      for (const element of allElements) {
        const text = element.textContent || '';
        
        // Procurar padrões de número de patente
        const patentMatch = text.match(/\b(WO|US|EP|CN|JP|KR|BR)\s*\d{4}[\/\s]\d+/i);
        
        if (patentMatch && text.length > 50 && text.length < 2000) {
          const lines = text.split('\n').filter(line => line.trim().length > 10);
          
          if (lines.length > 0 && !text.includes('Download') && !text.includes('Authority File')) {
            validResults.add(JSON.stringify({
              publicationNumber: patentMatch[0].trim(),
              title: lines[0].substring(0, 200).trim(),
              abstract: text.substring(0, 500).trim(),
              source: 'PatentScope'
            }));
          }
        }
      }
      
      validResults.forEach(item => {
        try {
          results.push(JSON.parse(item));
        } catch (e) {
          // Skip
        }
      });
      
      return results;
    });
    
    if (patents.length === 0) {
      console.log('No valid patents found');
      return [{
        publicationNumber: 'NO_RESULTS',
        title: 'No patents found for this search term',
        abstract: 'PatentScope search returned no results',
        source: 'PatentScope'
      }];
    }
    
    console.log(`Extracted ${patents.length} valid patents`);
    return patents;
  }

  async searchPatents(medicine) {
    console.log(`Starting PatentScope search for: ${medicine}`);
    
    try {
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
