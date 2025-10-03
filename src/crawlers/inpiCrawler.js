const puppeteer = require('puppeteer');

class InpiCrawler {
  constructor(credentials = null) {
    this.browser = null;
    this.credentials = credentials;
    this.cookies = null;
  }

  async initialize() {
    console.log('🔍 Initializing INPI crawler');
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080'
      ]
    });
    console.log('✅ INPI crawler initialized');
  }

  async login(page) {
    try {
      console.log('🔐 Attempting to login to INPI...');
      
      const loginUrl = 'https://busca.inpi.gov.br/pePI/servlet/LoginController?action=login';
      await page.goto(loginUrl, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });
      
      await page.waitForTimeout(3000);
      
      const hasLoginForm = await page.evaluate(() => {
        const loginInput = document.querySelector('input[name="login"]');
        const senhaInput = document.querySelector('input[name="senha"]');
        return !!(loginInput && senhaInput);
      });
      
      if (!hasLoginForm) {
        throw new Error('Login form not found');
      }
      
      await page.type('input[name="login"]', this.credentials.username, { delay: 100 });
      await page.type('input[name="senha"]', this.credentials.password, { delay: 100 });
      
      console.log('🔘 Clicking login button...');
      
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
        page.click('input[type="submit"]')
      ]);
      
      await page.waitForTimeout(5000);
      
      const currentUrl = page.url();
      console.log('📍 After login URL:', currentUrl);
      
      const content = await page.content();
      if (currentUrl.includes('login') || currentUrl.includes('Login') || 
          content.includes('Login:') || content.includes('Senha:')) {
        throw new Error('Login failed - credentials may be incorrect');
      }
      
      this.cookies = await page.cookies();
      console.log('✅ Login successful, cookies saved');
      return true;
      
    } catch (error) {
      console.error('❌ Login failed:', error.message);
      throw error;
    }
  }

  async searchPatents(medicine) {
    console.log('🔍 Starting INPI patent search for:', medicine);
    const page = await this.browser.newPage();
    
    const timeout = setTimeout(() => {
      console.log('⏱️ Global timeout - closing page');
      page.close().catch(() => {});
    }, 90000);
    
    try {
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if(['image', 'stylesheet', 'font'].includes(req.resourceType())){
          req.abort();
        } else {
          req.continue();
        }
      });
      
      if (this.credentials) {
        await this.login(page);
        
        if (this.cookies) {
          await page.setCookie(...this.cookies);
          console.log('🍪 Cookies restored');
        }
      }
      
      const searchUrl = 'https://busca.inpi.gov.br/pePI/jsp/patentes/PatenteSearchBasico.jsp';
      console.log('📡 Navigating to search page...');
      
      await page.goto(searchUrl, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });
      
      console.log('✅ Search page loaded');
      await page.waitForTimeout(3000);
      
      const content = await page.content();
      if (content.includes('Login:') && content.includes('Senha:')) {
        console.log('⚠️ Session expired, trying to login again...');
        await this.login(page);
        await page.goto(searchUrl, { waitUntil: 'networkidle0', timeout: 30000 });
        await page.waitForTimeout(3000);
        
        const recheckContent = await page.content();
        if (recheckContent.includes('Login:') && recheckContent.includes('Senha:')) {
          throw new Error('Authentication failed - INPI credentials may be invalid');
        }
      }
      
      console.log('🔍 Looking for search input...');
      const inputFound = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
        const searchInput = inputs.find(input => {
          const name = (input.name || '').toLowerCase();
          return !name.includes('login') && !name.includes('senha');
        });
        
        if (searchInput) {
          searchInput.focus();
          return true;
        }
        return false;
      });
      
      if (!inputFound) {
        throw new Error('Search input not found');
      }
      
      console.log('⌨️ Typing search term...');
      await page.keyboard.type(medicine, { delay: 50 });
      await page.waitForTimeout(500);
      
      console.log('🔘 Submitting search...');
      const buttonClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('input[type="submit"], button[type="submit"]'));
        const searchButton = buttons.find(btn => {
          const value = (btn.value || btn.textContent || '').toLowerCase();
          return !value.includes('entrar') && !value.includes('login');
        });
        
        if (searchButton) {
          searchButton.click();
          return true;
        }
        return false;
      });
      
      if (!buttonClicked) {
        throw new Error('Submit button not found');
      }
      
      console.log('⏳ Waiting for results...');
      await page.waitForNavigation({ 
        waitUntil: 'networkidle0',
        timeout: 30000 
      }).catch(() => console.log('Navigation timeout - continuing'));
      
      await page.waitForTimeout(5000);
      
      console.log('📊 Extracting results...');
      const patents = await page.evaluate(() => {
        const results = [];
        const rows = document.querySelectorAll('table tr');
        
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            const text = row.innerText || '';
            if (!text.includes('Login:') && !text.includes('Senha:') && text.trim()) {
              results.push({
                processNumber: cells[0]?.innerText?.trim() || '',
                title: cells[1]?.innerText?.trim() || '',
                depositDate: cells[2]?.innerText?.trim() || '',
                applicant: cells[3]?.innerText?.trim() || '',
                fullText: text.trim(),
                source: 'INPI'
              });
            }
          }
        });
        
        return results;
      });
      
      console.log('✅ Found', patents.length, 'patents');
      clearTimeout(timeout);
      
      return patents;
      
    } catch (error) {
      clearTimeout(timeout);
      console.error('❌ INPI search error:', error.message);
      throw error;
    } finally {
      await page.close().catch(() => {});
      console.log('🔒 Page closed');
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('🔒 INPI crawler closed');
    }
  }
}

module.exports = InpiCrawler;
