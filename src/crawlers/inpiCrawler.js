const puppeteer = require('puppeteer');

class InpiCrawler {
  constructor(credentials = null) {
    this.browser = null;
    this.credentials = credentials;
  }

  async initialize() {
    console.log('🔍 Initializing INPI crawler');
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    console.log('✅ INPI crawler initialized');
  }

  async searchPatents(medicine) {
    console.log('Starting INPI patent search');
    const page = await this.browser.newPage();
    
    try {
      const searchUrl = 'https://busca.inpi.gov.br/pePI/jsp/patentes/PatenteSearchBasico.jsp';
      console.log('Navigating to:', searchUrl);
      
      await page.goto(searchUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      await page.waitForTimeout(3000);
      
      const hasLoginForm = await page.evaluate(() => {
        return document.body.innerText.includes('Login') || 
               document.body.innerText.includes('Senha');
      });
      
      console.log('Has login form:', hasLoginForm);
      
      if (hasLoginForm && this.credentials) {
        console.log('🔐 Attempting login...');
        
        // DEBUG: Listar TODOS os inputs
        const allInputs = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input'));
          return inputs.map(inp => ({
            type: inp.type,
            name: inp.name,
            id: inp.id,
            placeholder: inp.placeholder,
            value: inp.value
          }));
        });
        console.log('All inputs on page:', JSON.stringify(allInputs, null, 2));
        
        // Tentar encontrar campos de forma mais flexível
        const loginField = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input'));
          for (const inp of inputs) {
            const attrs = (inp.name + inp.id + inp.placeholder).toLowerCase();
            if (attrs.includes('login') || attrs.includes('usuario')) {
              return { name: inp.name, id: inp.id, type: inp.type };
            }
          }
          return null;
        });
        
        const passwordField = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input'));
          for (const inp of inputs) {
            if (inp.type === 'password') {
              return { name: inp.name, id: inp.id, type: inp.type };
            }
            const attrs = (inp.name + inp.id + inp.placeholder).toLowerCase();
            if (attrs.includes('senha') || attrs.includes('password')) {
              return { name: inp.name, id: inp.id, type: inp.type };
            }
          }
          return null;
        });
        
        console.log('Login field found:', loginField);
        console.log('Password field found:', passwordField);
        
        if (loginField && passwordField) {
          // Usar o ID ou name para preencher
          if (loginField.id) {
            await page.type(`#${loginField.id}`, this.credentials.username, { delay: 100 });
          } else if (loginField.name) {
            await page.type(`input[name="${loginField.name}"]`, this.credentials.username, { delay: 100 });
          }
          
          if (passwordField.id) {
            await page.type(`#${passwordField.id}`, this.credentials.password, { delay: 100 });
          } else if (passwordField.name) {
            await page.type(`input[name="${passwordField.name}"]`, this.credentials.password, { delay: 100 });
          }
          
          console.log('Credentials entered, submitting...');
          
          const submitButton = await page.$('input[type="submit"]') || 
                              await page.$('button[type="submit"]');
          
          if (submitButton) {
            await submitButton.click();
            await page.waitForTimeout(5000);
            console.log('✅ Login submitted');
          }
        } else {
          console.log('⚠️ Login fields not found properly');
        }
      }
      
      // Procurar campo de busca
      const selectors = [
        'input[name="palavra"]',
        'input[name="Palavra"]',
        'input[type="text"]'
      ];
      
      let searchInput = null;
      for (const selector of selectors) {
        const inputs = await page.$$(selector);
        for (const input of inputs) {
          const name = await page.evaluate(el => el.name || '', input);
          if (!name.toLowerCase().includes('login') && !name.toLowerCase().includes('senha')) {
            searchInput = input;
            break;
          }
        }
        if (searchInput) break;
      }
      
      if (!searchInput) {
        throw new Error('Search input not found after login');
      }
      
      await searchInput.type(medicine);
      console.log('Typed search term:', medicine);
      
      const submitButton = await page.$('input[value="Pesquisar"]') ||
                          await page.$('input[type="submit"]');
      if (submitButton) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2' }),
          submitButton.click()
        ]);
      }
      
      await page.waitForTimeout(3000);
      
      const patents = await page.evaluate(() => {
        const results = [];
        const rows = document.querySelectorAll('table tr');
        
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          const text = row.innerText || '';
          
          if (cells.length >= 3 && 
              !text.includes('Login') && 
              !text.includes('Senha')) {
            results.push({
              processNumber: cells[0]?.innerText?.trim() || '',
              title: cells[1]?.innerText?.trim() || '',
              depositDate: cells[2]?.innerText?.trim() || '',
              fullText: text.trim(),
              source: 'INPI'
            });
          }
        });
        
        return results;
      });
      
      console.log('INPI patent search completed. Found', patents.length, 'patents');
      return patents;
      
    } catch (error) {
      console.error('Error in INPI search:', error.message);
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
