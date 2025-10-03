const puppeteer = require('puppeteer');

class InpiCrawlerSimple {
  constructor() {
    this.browser = null;
  }

  async initialize() {
    console.log('🔍 Initializing INPI Simple crawler');
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    console.log('✅ INPI Simple crawler initialized');
  }

  async searchPatents(medicine) {
    console.log('🔍 Testing direct INPI search for:', medicine);
    const page = await this.browser.newPage();
    
    try {
      // Tentar busca direta sem login
      const directSearchUrl = `https://busca.inpi.gov.br/pePI/servlet/PatenteServletController?Action=detail&CodPedido=&SearchParameter=${encodeURIComponent(medicine)}`;
      
      console.log('📡 Trying direct search URL...');
      await page.goto(directSearchUrl, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });
      
      await page.waitForTimeout(3000);
      
      const currentUrl = page.url();
      const content = await page.content();
      
      console.log('📍 Final URL:', currentUrl);
      console.log('📄 Has Login form?', content.includes('Login:'));
      console.log('📄 Page title:', await page.title());
      
      // Se redirecionou para login, não funciona sem autenticação
      if (content.includes('Login:') || currentUrl.includes('login')) {
        return {
          requiresAuth: true,
          message: 'INPI requires authentication - cannot search without login'
        };
      }
      
      // Tentar extrair resultados
      const patents = await page.evaluate(() => {
        const results = [];
        const rows = document.querySelectorAll('table tr');
        
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            results.push({
              data: row.innerText?.trim() || ''
            });
          }
        });
        
        return results;
      });
      
      console.log('✅ Direct search result:', patents.length, 'items found');
      
      return {
        requiresAuth: false,
        patents,
        html: content.substring(0, 1000)
      };
      
    } catch (error) {
      console.error('❌ Direct search error:', error.message);
      throw error;
    } finally {
      await page.close();
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
