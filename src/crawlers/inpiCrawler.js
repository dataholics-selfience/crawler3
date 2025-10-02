// INÍCIO DO ARQUIVO inpiCrawler.js
const puppeteer = require('puppeteer');
// const BaseCrawler = require('./baseCrawler'); // ← REMOVA ESTA LINHA!

class InpiCrawler {  // Não extends BaseCrawler
    constructor() {
        this.baseUrl = 'https://busca.inpi.gov.br/pePI/jsp/patentes/PatenteSearchBasico.jsp';
        this.browser = null;
        this.page = null;
    }

    async initialize() {
        this.browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1366, height: 768 });
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    // ... resto do código do INPI que estava funcionando antes ...
}

module.exports = InpiCrawler;
