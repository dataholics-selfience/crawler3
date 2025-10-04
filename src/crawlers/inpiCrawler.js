const puppeteer = require('puppeteer');
const GroqParser = require('../services/groqParser');

class InpiCrawler {
  constructor(credentials = null) {
    this.browser = null;
    this.credentials = credentials;
    this.groqParser = new GroqParser();
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

  async findFieldsWithGroq(html) {
    console.log('🤖 Using Groq to detect form fields...');
    
    const prompt = `Analyze this HTML from INPI (Brazilian patent office) login/search page and identify field names.

HTML snippet:
${html.substring(0, 3000)}

Return ONLY a JSON object with these exact keys:
{
  "loginField": "exact name attribute of login/username input field",
  "passwordField": "exact name attribute of password input field",
  "searchField": "exact name attribute of keyword/expression search input field",
  "submitSelector": "CSS selector for submit button"
}

Common patterns:
- Login fields: T_Login, login, usuario
- Password fields: T_Senha, senha, password
- Search fields: ExpressaoPesquisa, palavra, resumo

Return ONLY valid JSON, no markdown, no explanations.`;

    try {
      const response = await this.groqParser.askGroq(prompt);
      const cleaned = response.replace(/```json\n?/g, '').replace(/```/g, '').trim();
      const fields = JSON.parse(cleaned);
      console.log('✅ Groq detected fields:', fields);
      return fields;
    } catch (error) {
      console.error('❌ Groq field detection failed:', error.message);
      // Fallback to hardcoded values
      return {
        loginField: 'T_Login',
        passwordField: 'T_Senha',
        searchField: 'ExpressaoPesquisa',
        submitSelector: 'input[type="submit"]'
      };
    }
  }

  async extractPatentsWithGroq(html) {
    console.log('🤖 Using Groq to extract patent data...');
    
    const prompt = `Extract ALL patent data from this INPI results page HTML.

HTML:
${html.substring(0, 8000)}

Return a JSON array of patents with this structure:
[{
  "processNumber": "patent/application number",
  "title": "patent title or description",
  "depositDate": "deposit/filing date",
  "applicant": "applicant/owner name",
  "source": "INPI"
}]

Rules:
- Extract ALL visible patents from the HTML
- If a field is not found, use empty string ""
- Ignore login/authentication messages
- Return ONLY valid JSON array, no markdown, no explanations`;

    try {
      const response = await this.groqParser.askGroq(prompt);
      const cleaned = response.replace(/```json\n?/g, '').replace(/```/g, '').trim();
      const patents = JSON.parse(cleaned);
      console.log('✅ Groq extracted', patents.length, 'patents');
      return patents;
    } catch (error) {
      console.error('❌ Groq extraction failed, using traditional parsing');
      return null;
    }
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
        console.log('🔐 Attempting intelligent login with Groq...');
        
        const html = await page.content();
        const fields = await this.findFieldsWithGroq(html);
        
        await page.type(`input[name="${fields.loginField}"]`, this.credentials.username, { delay: 100 });
        await page.type(`input[name="${fields.passwordField}"]`, this.credentials.password, { delay: 100 });
        
        console.log('Credentials entered, clicking submit...');
        
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
          page.click(fields.submitSelector)
        ]);
        
        await page.waitForTimeout(3000);
        console.log('✅ Login completed');
        
        console.log('Navigating back to search page...');
        await page.goto(searchUrl, { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });
        
        await page.waitForTimeout(2000);
      }
      
      console.log('🔍 Detecting search field with Groq...');
      const searchHtml = await page.content();
      const searchFields = await this.findFieldsWithGroq(searchHtml);
      
      const searchInput = await page.$(`input[name="${searchFields.searchField}"]`);
      
      if (!searchInput) {
        throw new Error('Search field not found');
      }
      
      await searchInput.type(medicine, { delay: 100 });
      console.log('Typed search term:', medicine);
      
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        page.click(searchFields.submitSelector)
      ]);
      
      await page.waitForTimeout(3000);
      
      // Try Groq extraction first
      const resultsHtml = await page.content();
      let patents = await this.extractPatentsWithGroq(resultsHtml);
      
      // Fallback to traditional parsing if Groq fails
      if (!patents || patents.length === 0) {
        console.log('Using traditional parsing as fallback...');
        patents = await page.evaluate(() => {
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
                applicant: cells[3]?.innerText?.trim() || '',
                fullText: text.trim(),
                source: 'INPI'
              });
            }
          });
          
          return results;
        });
      }
      
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
