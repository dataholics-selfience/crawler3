const puppeteer = require('puppeteer');
const GroqParser = require('../services/groqParser');

class InpiCrawler {
  constructor(credentials = null) {
    this.browser = null;
    this.credentials = credentials;
    this.groqParser = new GroqParser();
  }

  async initialize() {
    console.log('Initializing INPI crawler with AI-powered adaptability');
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    console.log('INPI crawler initialized');
  }

  async detectFieldsIntelligently(page) {
    console.log('AI: Analyzing page structure...');
    
    const html = await page.content();
    const groqFields = await this.groqParser.detectFields(html);
    
    // Validate Groq response
    if (groqFields && 
        groqFields.loginField && 
        groqFields.passwordField && 
        groqFields.searchField &&
        groqFields.loginField !== '' &&
        groqFields.passwordField !== '' &&
        groqFields.searchField !== '') {
      console.log('AI: Groq detected fields successfully');
      return groqFields;
    }
    
    console.log('AI: Groq failed or returned empty, using fallback');
    return await this.fallbackDetection(page);
  }

  async fallbackDetection(page) {
    console.log('Using fallback field detection');
    
    const detectedFields = await page.evaluate(() => {
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
        
        if (!fields.loginField && (attrs.includes('login') || attrs.includes('usuario') || name === 't_login')) {
          fields.loginField = input.name || input.id;
        }
        
        if (!fields.passwordField && (input.type === 'password' || attrs.includes('senha') || name === 't_senha')) {
          fields.passwordField = input.name || input.id;
        }
        
        if (!fields.searchField && 
            (attrs.includes('expressao') || attrs.includes('palavra') || name === 'expressaopesquisa')) {
          fields.searchField = input.name || input.id;
        }
      }
      
      return fields;
    });
    
    // Use hardcoded defaults if detection failed
    const fields = {
      loginField: detectedFields.loginField || 'T_Login',
      passwordField: detectedFields.passwordField || 'T_Senha',
      searchField: detectedFields.searchField || 'ExpressaoPesquisa',
      submitSelector: 'input[type="submit"]'
    };
    
    console.log('Fallback fields:', fields);
    return fields;
  }

  async performLogin(page, fields) {
    console.log('AI: Performing login...');
    
    try {
      const loginSelectors = [
        `input[name="${fields.loginField}"]`,
        `#${fields.loginField}`,
        `input[id="${fields.loginField}"]`
      ];
      
      let loginInput = null;
      for (const selector of loginSelectors) {
        try {
          loginInput = await page.$(selector);
          if (loginInput) {
            console.log(`Login field found: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!loginInput) {
        throw new Error(`Login field not found. Tried: ${fields.loginField}`);
      }
      
      await loginInput.type(this.credentials.username, { delay: 100 });
      
      const passwordSelectors = [
        `input[name="${fields.passwordField}"]`,
        `#${fields.passwordField}`,
        `input[type="password"]`
      ];
      
      let passwordInput = null;
      for (const selector of passwordSelectors) {
        try {
          passwordInput = await page.$(selector);
          if (passwordInput) {
            console.log(`Password field found: ${selector}`);
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!passwordInput) {
        throw new Error(`Password field not found. Tried: ${fields.passwordField}`);
      }
      
      await passwordInput.type(this.credentials.password, { delay: 100 });
      
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        page.click(fields.submitSelector)
      ]);
      
      await page.waitForTimeout(3000);
      
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
    console.log('AI: Performing search...');
    
    const searchSelectors = [
      `input[name="${fields.searchField}"]`,
      `#${fields.searchField}`,
      `input[id="${fields.searchField}"]`
    ];
    
    let searchInput = null;
    for (const selector of searchSelectors) {
      try {
        searchInput = await page.$(selector);
        if (searchInput) {
          console.log(`Search field found: ${selector}`);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!searchInput) {
      throw new Error(`Search field not found. Tried: ${fields.searchField}`);
    }
    
    await searchInput.type(searchTerm, { delay: 100 });
    
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.click(fields.submitSelector)
    ]);
    
    await page.waitForTimeout(3000);
    console.log('Search completed');
  }

  async extractResults(page) {
    console.log('Extracting results...');
    
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
      console.log(`AI: Groq extracted ${groqPatents.length} patents`);
      return groqPatents;
    }
    
    // Fallback
    console.log('Using traditional extraction');
    return await page.evaluate(() => {
      const results = [];
      const rows = document.querySelectorAll('table tr');
      
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        const text = row.innerText || '';
        
        if (cells.length >= 3 && 
            !text.includes('Login') && 
            !text.startsWith('Pedido\t') &&
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
    console.log(`Starting INPI search for: ${medicine}`);
    const page = await this.browser.newPage();
    
    try {
      const searchUrl = 'https://busca.inpi.gov.br/pePI/jsp/patentes/PatenteSearchBasico.jsp';
      
      await page.goto(searchUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      await page.waitForTimeout(3000);
      
      const needsLogin = await page.evaluate(() => {
        return document.body.innerText.includes('Login') || 
               document.body.innerText.includes('Senha');
      });
      
      if (needsLogin && this.credentials) {
        console.log('Login required');
        
        const loginFields = await this.detectFieldsIntelligently(page);
        await this.performLogin(page, loginFields);
        
        await page.goto(searchUrl, { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });
        await page.waitForTimeout(2000);
      }
      
      const searchFields = await this.detectFieldsIntelligently(page);
      await this.performSearch(page, searchFields, medicine);
      
      const patents = await this.extractResults(page);
      
      console.log(`INPI search completed: ${patents.length} patents found`);
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
