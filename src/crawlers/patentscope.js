const puppeteer = require('puppeteer');
const logger = require('../utils/logger');

class PatentScopeCrawler {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    try {
      logger.info('Initializing PatentScope browser...');
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });
      
      this.page = await this.browser.newPage();
      
      // Interceptar requests para acelerar
      await this.page.setRequestInterception(true);
      this.page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });
      
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );
      await this.page.setViewport({ width: 1920, height: 1080 });
      
      logger.info('PatentScope browser initialized');
    } catch (error) {
      logger.error('Failed to initialize PatentScope browser', error);
      throw error;
    }
  }

  async close() {
    try {
      if (this.page) await this.page.close();
      if (this.browser) await this.browser.close();
      logger.info('PatentScope browser closed');
    } catch (error) {
      logger.warn('Error closing PatentScope browser', error);
    }
  }

  /**
   * Aguarda AJAX completar observando mudanças no DOM
   */
  async waitForAjaxComplete(timeout = 30000) {
    try {
      await this.page.waitForFunction(
        () => {
          // Verifica se há elementos com padrão de patente
          const text = document.body.innerText;
          return text.includes('WO/') || text.includes('US/') || text.includes('EP/');
        },
        { timeout, polling: 500 }
      );
      
      // Aguarda mais um pouco para garantir render completo
      await this.page.waitForTimeout(2000);
      
      logger.info('AJAX content loaded successfully');
      return true;
    } catch (e) {
      logger.warn('AJAX wait timeout, continuing anyway');
      return false;
    }
  }

  /**
   * Extrai patentes usando múltiplas estratégias de parsing
   */
  async extractPatentsFromPage() {
    return await this.page.evaluate(() => {
      const cleanText = (text) => {
        if (!text) return '';
        return text
          .replace(/\t+/g, ' ')
          .replace(/\n+/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();
      };

      const patents = [];
      const seenNumbers = new Set();

      // Estratégia 1: Buscar em todas as divs e spans
      const allElements = Array.from(document.querySelectorAll('div, span, td, li, p'));

      for (const element of allElements) {
        const text = element.textContent || '';
        
        // Regex robusto para números de patente
        const patentMatches = text.match(/\b(WO|US|EP|CN|JP|KR|BR|DE|FR|GB)\s*\/?\s*\d{4}\s*\/?\s*\d{5,}/gi);
        
        if (patentMatches && text.length > 50 && text.length < 3000) {
          for (const match of patentMatches) {
            const number = cleanText(match);
            
            if (!seenNumbers.has(number) && 
                !text.includes('Download') && 
                !text.includes('Authority File') &&
                !text.includes('National Phase')) {
              
              seenNumbers.add(number);
              
              // Extrair informações adicionais
              const lines = text.split('\n').filter(l => l.trim().length > 15);
              const title = lines.find(l => l.length > 30 && l.length < 300) || lines[0] || '';
              
              // Buscar applicant/inventor no contexto próximo
              const applicantMatch = text.match(/(?:Applicant|Assignee)[:\s]+([^\n]{10,100})/i);
              const inventorMatch = text.match(/Inventor[:\s]+([^\n]{10,100})/i);
              const dateMatch = text.match(/\b(\d{2}[\.\/\-]\d{2}[\.\/\-]\d{4})\b/);
              
              patents.push({
                publicationNumber: number,
                title: cleanText(title).substring(0, 200),
                abstract: cleanText(text).substring(0, 500),
                applicant: applicantMatch ? cleanText(applicantMatch[1]) : '',
                inventor: inventorMatch ? cleanText(inventorMatch[1]) : '',
                date: dateMatch ? dateMatch[1] : '',
                source: 'PatentScope'
              });
            }
          }
        }
      }

      // Estratégia 2: Buscar em tabelas (formato alternativo)
      const tables = document.querySelectorAll('table');
      for (const table of tables) {
        const rows = table.querySelectorAll('tr');
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('td'));
          const rowText = cells.map(c => c.textContent).join(' ');
          
          const patentMatch = rowText.match(/\b(WO|US|EP)\s*\/?\s*\d{4}\s*\/?\s*\d{5,}/i);
          if (patentMatch && cells.length >= 2) {
            const number = cleanText(patentMatch[0]);
            if (!seenNumbers.has(number)) {
              seenNumbers.add(number);
              patents.push({
                publicationNumber: number,
                title: cleanText(cells[0]?.textContent || '').substring(0, 200),
                abstract: cleanText(rowText).substring(0, 500),
                applicant: cleanText(cells[1]?.textContent || ''),
                inventor: '',
                date: '',
                source: 'PatentScope'
              });
            }
          }
        }
      }

      return patents;
    });
  }

  /**
   * Busca com retry e múltiplas tentativas
   */
  async searchWithRetry(medicine, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.info(`Search attempt ${attempt}/${maxAttempts}`);
        
        const searchUrl = `https://patentscope.wipo.int/search/en/result.jsf?query=FP:(${encodeURIComponent(medicine)})`;
        logger.info(`Navigating to: ${searchUrl}`);
        
        await this.page.goto(searchUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 45000
        });
        
        // Aguarda AJAX completar
        await this.waitForAjaxComplete(30000);
        
        // Extrai patentes
        const patents = await this.extractPatentsFromPage();
        
        if (patents.length > 0) {
          logger.info(`Successfully extracted ${patents.length} patents`);
          return patents;
        }
        
        logger.warn(`Attempt ${attempt}: No patents found, retrying...`);
        await this.page.waitForTimeout(3000);
        
      } catch (error) {
        logger.error(`Attempt ${attempt} failed:`, error.message);
        if (attempt === maxAttempts) {
          throw error;
        }
        await this.page.waitForTimeout(5000);
      }
    }
    
    return [];
  }

  /**
   * Método principal de busca
   */
  async searchPatents(medicine) {
    if (!this.page) throw new Error('Browser not initialized');

    try {
      const patents = await this.searchWithRetry(medicine, 3);
      
      if (patents.length === 0) {
        logger.warn('No patents found after all attempts');
        return [{
          publicationNumber: 'NO_RESULTS',
          title: 'No patents found',
          abstract: `PatentScope search for "${medicine}" returned no results`,
          applicant: '',
          inventor: '',
          date: '',
          source: 'PatentScope'
        }];
      }
      
      // Deduplicação final
      const unique = Array.from(
        new Map(patents.map(p => [p.publicationNumber, p])).values()
      );
      
      logger.info(`Returning ${unique.length} unique patents`);
      return unique;
      
    } catch (error) {
      logger.error('PatentScope search failed completely', error);
      return [{
        publicationNumber: 'ERROR',
        title: 'Search failed',
        abstract: error.message,
        applicant: '',
        inventor: '',
        date: '',
        source: 'PatentScope'
      }];
    }
  }
}

module.exports = PatentScopeCrawler;
