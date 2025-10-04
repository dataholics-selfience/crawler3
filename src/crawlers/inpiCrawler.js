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
        
        await page.type('input[name="T_Login"]', this.credentials.username, { delay: 100 });
        await page.type('input[name="T_Senha"]', this.credentials.password, { delay: 100 });
        
        console.log('Credentials entered, clicking submit...');
        
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
          page.click('input[type="submit"]')
        ]);
        
        await page.waitForTimeout(3000);
        console.log('✅ Login completed');
        
        console.log('Navigating back to search page...');
        await page.goto(searchUrl, { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });
        
        await page.waitForTimeout(2000);
        console.log('Back at search page');
      }
      
      console.log('🔍 Using ExpressaoPesquisa field...');
      
      const searchInput = await page.$('input[name="ExpressaoPesquisa"]');
      
      if (!searchInput) {
        throw new Error('ExpressaoPesquisa field not found');
      }
      
      await searchInput.type(medicine, { delay: 100 });
      console.log('Typed search term:', medicine);
      
      const submitButton = await page.$('input[type="submit"]');
      if (submitButton) {
        console.log('Submitting search...');
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
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
