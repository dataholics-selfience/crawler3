const puppeteer = require('puppeteer');

class PatentScopeCrawler {
    constructor(options = {}) {
        this.browser = null;
        this.page = null;
        this.options = options;
        this.maxPages = options.maxPages || 5; // Máximo de páginas a navegar
    }

    async initialize() {
        this.browser = await puppeteer.launch({
            headless: 'new', // evita aviso de depreciação
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        this.page = await this.browser.newPage();
        console.log('PatentScope crawler initialized');
    }

    async search(medicine) {
        if (!this.page) throw new Error('Crawler not initialized');

        const results = [];
        const baseUrl = `https://patentscope.wipo.int/search/en/result.jsf?query=FP:(${encodeURIComponent(medicine)})`;

        await this.page.goto(baseUrl, { waitUntil: 'networkidle2' });

        let currentPage = 1;

        while (currentPage <= this.maxPages) {
            console.log(`Processing page ${currentPage}...`);

            // Aguarda os resultados da página carregarem
            await this.page.waitForSelector('.resultRow', { timeout: 5000 }).catch(() => {});

            const patentsOnPage = await this.page.evaluate(() => {
                const rows = Array.from(document.querySelectorAll('.resultRow'));
                return rows.map(row => {
                    const titleEl = row.querySelector('.title');
                    const linkEl = row.querySelector('a');
                    const assigneeEl = row.querySelector('.assignee');
                    const inventorEl = row.querySelector('.inventor');
                    return {
                        title: titleEl ? titleEl.textContent.trim() : null,
                        link: linkEl ? linkEl.href : null,
                        assignee: assigneeEl ? assigneeEl.textContent.trim() : null,
                        inventor: inventorEl ? inventorEl.textContent.trim() : null
                    };
                });
            });

            results.push(...patentsOnPage);

            // Verifica se existe botão "Next" e se ainda não chegou no limite de páginas
            const nextButton = await this.page.$('a[title="Next"]');
            if (!nextButton) break;

            await Promise.all([
                this.page.waitForNavigation({ waitUntil: 'networkidle2' }),
                nextButton.click()
            ]);

            currentPage++;
        }

        return results;
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('PatentScope crawler closed');
        }
    }
}

module.exports = PatentScopeCrawler;
