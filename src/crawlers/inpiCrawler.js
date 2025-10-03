const puppeteer = require('puppeteer-core');

class InpiCrawler {
  constructor(credentials = null) {
    this.browser = null;
    this.credentials = credentials;
  }

async initialize() {
  console.log('🔍 Initializing INPI crawler');
  
  // Testar múltiplos caminhos possíveis do Chrome
  const possiblePaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    'google-chrome-stable',
    'chromium-browser'
  ].filter(Boolean);
  
  let lastError;
  
  for (const executablePath of possiblePaths) {
    try {
      console.log(`Trying Chrome at: ${executablePath}`);
      this.browser = await puppeteer.launch({
        headless: 'new',
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920x1080'
        ]
      });
      console.log(`✅ INPI crawler initialized with: ${executablePath}`);
      return;
    } catch (error) {
      console.log(`Failed with ${executablePath}: ${error.message}`);
      lastError = error;
    }
  }
  
  throw new Error(`Could not find Chrome/Chromium executable. Last error: ${lastError.message}`);
}

  async searchPatents(medicine) {
    console.log('🔍 Starting INPI patent search for:', medicine);
    const page = await this.browser.newPage();
    
    const timeout = setTimeout(() => {
      console.log('⏱️ Global timeout - closing page');
      page.close().catch(() => {});
    }, 60000);
    
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
      }
      
      const searchUrl = 'https://busca.inpi.gov.br/pePI/jsp/patentes/PatenteSearchBasico.jsp';
      console.log('📡 Navigating to search page...');
      
      await page.goto(searchUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 20000 
      });
      
      console.log('✅ Search page loaded');
      await page.waitForTimeout(2000);
      
      const content = await page.content();
      if (content.includes('Login:') && content.includes('Senha:')) {
        throw new Error('Still requires authentication after login attempt');
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
        waitUntil: 'domcontentloaded',
        timeout: 20000 
      }).catch(() => console.log('Navigation timeout - continuing'));
      
      await page.waitForTimeout(3000);
      
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
