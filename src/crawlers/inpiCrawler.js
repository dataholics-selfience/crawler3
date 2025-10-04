const puppeteer = require('puppeteer');
const GroqParser = require('../services/groqParser');

class InpiCrawler {
  constructor(credentials = null) {
    this.browser = null;
    this.credentials = credentials;
    this.groqParser = new GroqParser();
    this.detectedFields = null; // Cache para campos detectados
  }

  async initialize() {
    console.log('Initializing INPI crawler with AI-powered adaptability');
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-dev-shm-usage'
      ]
    });
    console.log('INPI crawler initialized');
  }

  async detectFieldsIntelligently(page, pageType) {
    console.log(`AI: Analyzing ${pageType} page structure...`);
    
    const html = await page.content();
    const fields = await this.groqParser.detectFields(html, pageType);
    
    if (fields) {
      console.log(`AI: Successfully detected ${pageType} fields`);
      return fields;
    }
    
    // Fallback: manual detection
    console.log(`AI: Failed, using fallback detection for ${pageType}`);
    return await this.fallbackDetection(page);
  }

  async fallbackDetection(page) {
    console.log('Using fallback field detection');
    
    return await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const fields = {
        loginField: null,
        passwordField: null,
        searchField: null,
        submitSelector: 'input[type="submit"]'
      };
      
      for (const input of inputs) {
        const name = (input.name || '').toLowerCase();
        const id = (input.id || '').toLowerCase();
        const attrs = name + id;
        
        if (!fields.loginField && (attrs.includes('login') || attrs.includes('usuario'))) {
          fields.loginField = input.name || input.id;
        }
        
        if (!fields.passwordField && (input.type === 'password' || attrs.includes('senha'))) {
          fields.passwordField = input.name || input.id;
        }
        
        if (!fields.searchField && 
            !attrs.includes('login') && 
            !attrs.includes('senha') &&
            !attrs.includes('pedido') &&
            input.type === 'text') {
          fields.searchField = input.name || input.id;
        }
      }
      
      return fields;
    });
  }

  async performLogin(page, fields) {
    console.log('AI: Performing intelligent login...');
    
    try {
      // Try different selector strategies
      const selectors = [
        `input[name="${fields.loginField}"]`,
        `input[id="${fields.loginField}"]`,
        `#${fields.loginField}`
      ];
      
      let loginInput = null;
      for (const selector of selectors) {
        try {
          loginInput = await page.$(selector);
          if (loginInput) break;
        } catch (e) {
          continue;
        }
      }
      
      if (!loginInput) {
        throw new Error('Login field not found');
      }
      
      await loginInput.type(this.credentials.username, { delay: 100 });
      console.log('Username entered');
      
      // Same for password
      const passwordSelectors = [
        `input[name="${fields.passwordField}"]`,
        `input[id="${fields.passwordField}"]`,
        `input[type="password"]`
      ];
      
      let passwordInput = null;
      for (const selector of passwordSelectors) {
        try {
          passwordInput = await page.$(selector);
          if (passwordInput) break;
        } catch (e) {
          continue;
        }
      }
      
      if (!passwordInput) {
        throw new Error('Password field not found');
      }
      
      await passwordInput.type(this.credentials.password, { delay: 100 });
      console.log('Password entered');
      
      // Submit
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        page.click(fields.submitSelector)
      ]);
      
      await page.waitForTimeout(3000);
      
      // Verify login success
      const currentUrl = page.url();
      const content = await page.content();
      
      if (currentUrl.includes('login') || content.includes('Login ou Senha incorreta')) {
        throw new Error('Login failed - check credentials');
      }
      
      console.log('Login successful');
      return true;
      
    } catch (error) {
      console.error('Login error:', error.message);
      throw error;
    }
  }

  async performSearch(page, fields, searchTerm) {
    console.log('AI: Performing intelligent search...');
    
    const searchSelectors = [
      `input[name="${fields.searchField}"]`,
      `input[id="${fields.searchField}"]`,
      `#${fields.searchField}`
    ];
    
    let searchInput = null;
    for (const selector of searchSelectors) {
      try {
        searchInput = await page.$(selector);
        if (searchInput) {
          console.log(`Found search field with: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!searchInput) {
      throw new Error('Search field not found');
    }
    
    await searchInput.type(searchTerm, { delay: 100 });
    console.log(`Typed: ${searchTerm}`);
    
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.click(fields.submitSelector)
    ]);
    
    await page.waitForTimeout(3000);
    console.log('Search completed');
  }

  async extractResults(page) {
    console.log('AI: Extracting results intelligently...');
    
    // Get only the results table
    const tableHtml = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const text = table.innerText || '';
        if (text.includes('Pedido') || text.includes('Depósito') || text.includes('BR ')) {
          return table.outerHTML;
        }
      }
      return null;
    });
    
    if (!tableHtml) {
      console.log('No results table found');
      return [];
    }
    
    // Try Groq first
    const groqPatents = await this.groqParser.extractPatents(tableHtml);
    
    if (groqPatents && groqPatents.length > 0) {
      console.log(`AI: Extracted ${groqPatents.length} patents`);
      return groqPatents;
    }
    
    // Fallback to traditional
    console.log('AI: Using traditional extraction fallback');
    return await page.evaluate(() => {
      const results = [];
      const rows = document.querySelectorAll('table tr');
      
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        const text = row.innerText || '';
        
        if (cells.length >= 3 && 
            !text.includes('Login') && 
            !text.includes('Pedido\t') &&
            text.trim()) {
          results.push({
            processNumber: cells[0]?.innerText?.trim() || '',
            title: cells[1]?.innerText?.trim() || '',
            depositDate: cells[2]?.innerText?.trim() || '',
            applicant: cells[3]?.innerText?.trim() || '',
            fullText: text.trim(),
            source: 'INPI'
          });
        }
      });
      
      return results;
    });
  }

  async searchPatents(medicine) {
    console.log(`=== Starting AI-powered INPI search for: ${medicine} ===`);
    const page = await this.browser.newPage();
    
    try {
      const searchUrl = 'https://busca.inpi.gov.br/pePI/jsp/patentes/PatenteSearchBasico.jsp';
      
      await page.goto(searchUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      await page.waitForTimeout(3000);
      
      // Check if login needed
      const needsLogin = await page.evaluate(() => {
        return document.body.innerText.includes('Login') || 
               document.body.innerText.includes('Senha');
      });
      
      if (needsLogin && this.credentials) {
        console.log('Login required - using AI detection');
        
        // Detect login fields
        const loginFields = await this.detectFieldsIntelligently(page, 'login');
        
        // Perform login
        await this.performLogin(page, loginFields);
        
        // Return to search page
        await page.goto(searchUrl, { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });
        await page.waitForTimeout(2000);
      }
      
      // Detect search fields
      const searchFields = await this.detectFieldsIntelligently(page, 'search');
      
      // Perform search
      await this.performSearch(page, searchFields, medicine);
      
      // Extract results
      const patents = await this.extractResults(page);
      
      console.log(`=== INPI search completed: ${patents.length} patents found ===`);
      return patents;
      
    } catch (error) {
      console.error('INPI search error:', error.message);
      throw error;
    } finally {
      await page.close();
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('INPI crawler closed');
    }
  }
}

module.exports = InpiCrawler;
