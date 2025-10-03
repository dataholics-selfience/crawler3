const puppeteer = require('puppeteer');

class InpiCrawler {
  constructor() {
    this.browser = null;
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
      
      console.log('Page status:', page.url());
      await page.waitForTimeout(2000);
      
      // Buscar campo de entrada
      const selectors = [
        'input[name="palavra"]',
        'input[name="Palavra"]',
        'input[type="text"]'
      ];
      
      let searchInput = null;
      for (const selector of selectors) {
        searchInput = await page.$(selector);
        if (searchInput) {
          console.log('Found search input with selector:', selector);
          break;
        }
      }
      
      if (!searchInput) {
        throw new Error('Search input not found');
      }
      
      await searchInput.type(medicine);
      console.log('Typed search term:', medicine);
      
      const submitButton = await page.$('input[type="submit"]');
      if (submitButton) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2' }),
          submitButton.click()
        ]);
      }
      
      await page.waitForTimeout(2000);
      
      // Extrair resultados
      const patents = await page.evaluate(() => {
        const results = [];
        const rows = document.querySelectorAll('table tr');
        
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            results.push({
              processNumber: cells[0]?.innerText?.trim() || '',
              title: cells[1]?.innerText?.trim() || '',
              depositDate: cells[2]?.innerText?.trim() || '',
              fullText: row.innerText.trim(),
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
