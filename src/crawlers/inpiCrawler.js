const puppeteer = require('puppeteer');
const GroqParser = require('../services/groqParser');

class InpiCrawler {
  constructor(credentials = null) {
    this.browser = null;
    this.credentials = credentials || {
      username: process.env.INPI_USERNAME,
      password: process.env.INPI_PASSWORD
    };
    this.groqParser = new GroqParser();
  }

  async initialize() {
    console.log('Initializing INPI crawler');
    this.browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
    console.log('INPI crawler initialized');
  }

  async detectFieldsIntelligently(page) {
    const html = await page.content();
    const groqFields = await this.groqParser.detectFields(html);

    if (groqFields && groqFields.loginField && groqFields.passwordField && groqFields.searchField) {
      return groqFields;
    }

    // Fallback robusto
    return await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const fields = { loginField: null, passwordField: null, searchField: null, submitSelector: 'input[type="submit"], button[type="submit"], button' };
      for (const input of inputs) {
        const nameId = (input.name || '').toLowerCase() + (input.id || '').toLowerCase();
        if (!fields.loginField && (nameId.includes('login') || nameId.includes('usuario') || input.name === 'T_Login')) fields.loginField = input.name || input.id;
        if (!fields.passwordField && (input.type === 'password' || nameId.includes('senha') || input.name === 'T_Senha')) fields.passwordField = input.name || input.id;
        if (!fields.searchField && (nameId.includes('expressao') || nameId.includes('palavra') || input.name === 'ExpressaoPesquisa')) fields.searchField = input.name || input.id;
      }
      return fields;
    });
  }

  async performLogin(page, fields) {
    console.log('Performing login...');
    if (!this.credentials.username || !this.credentials.password) throw new Error('Missing INPI credentials');

    const loginInput = await page.$(`input[name="${fields.loginField}"], #${fields.loginField}`);
    const passwordInput = await page.$(`input[name="${fields.passwordField}"], #${fields.passwordField}`);

    if (!loginInput || !passwordInput) throw new Error('Login fields not found');

    await loginInput.type(this.credentials.username, { delay: 50 });
    await passwordInput.type(this.credentials.password, { delay: 50 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.click(fields.submitSelector)
    ]);

    console.log('Login performed');
  }

  async performSearch(page, fields, searchTerm) {
    const searchInput = await page.$(`input[name="${fields.searchField}"], #${fields.searchField}`);
    if (!searchInput) throw new Error('Search field not found');

    await searchInput.type(searchTerm, { delay: 50 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
      page.click(fields.submitSelector)
    ]);
    console.log('Search performed');
  }

  async extractResults(page) {
    const patents = await page.evaluate(() => {
      const results = [];
      const rows = document.querySelectorAll('table tr');
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 3 && !cells[0].innerText.includes('Pedido')) {
          results.push({
            processNumber: cells[0].innerText.trim(),
            title: cells[1].innerText.trim(),
            depositDate: cells[2].innerText.trim(),
            applicant: cells[3]?.innerText?.trim() || '',
            fullText: row.innerText.trim(),
            source: 'INPI'
          });
        }
      });
      return results;
    });
    console.log(`Extracted ${patents.length} patents`);
    return patents;
  }

  async searchPatents(medicine) {
    console.log(`Starting INPI search for: ${medicine}`);
    const page = await this.browser.newPage();
    try {
      const searchUrl = 'https://busca.inpi.gov.br/pePI/jsp/patentes/PatenteSearchBasico.jsp';
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      // Detecta se precisa de login
      const needsLogin = await page.evaluate(() => document.body.innerText.includes('Login') || document.body.innerText.includes('Senha'));
      if (needsLogin) {
        const loginFields = await this.detectFieldsIntelligently(page);
        await this.performLogin(page, loginFields);
        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      }

      const searchFields = await this.detectFieldsIntelligently(page);
      await this.performSearch(page, searchFields, medicine);
      return await this.extractResults(page);

    } catch (err) {
      console.error('INPI search error:', err.message);
      throw err;
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
