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
      
      // Verificar se tem formulário de login na página
      const hasLoginForm = await page.evaluate(() => {
        return document.body.innerText.includes('Login') || 
               document.body.innerText.includes('Senha');
      });
      
      console.log('Has login form:', hasLoginForm);
      
      if (hasLoginForm && this.credentials) {
        console.log('🔐 Attempting login...');
        
        // Procurar campos de login
        const loginInput = await page.$('input[name="login"]') || 
                          await page.$('input[id*="login"]') ||
                          await page.$('input[placeholder*="Login"]');
                          
        const passwordInput = await page.$('input[name="senha"]') || 
                             await page.$('input[type="password"]');
        
        if (loginInput && passwordInput) {
          await loginInput.type(this.credentials.username, { delay: 100 });
          await passwordInput.type(this.credentials.password, { delay: 100 });
          
          console.log('Credentials entered, submitting...');
          
          const submitButton = await page.$('input[type="submit"]') || 
                              await page.$('button[type="submit"]');
          
          if (submitButton) {
            await submitButton.click();
            await page.waitForTimeout(5000);
            console.log('✅ Login submitted');
          }
        } else {
          console.log('⚠️ Login fields not found');
        }
      }
      
      // Agora procurar o campo de busca
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
      
      // Extrair resultados
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
