const puppeteer = require('puppeteer');

class InpiCrawler {
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
                '--disable-gpu',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-extensions'
            ]
        });
        
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1366, height: 768 });
        await this.page.setDefaultTimeout(30000);
    }

    async searchPatents(medicine) {
        const results = [];
        
        try {
            console.log('Starting INPI patent search');
            
            // Navegar para a página de busca
            await this.page.goto(this.baseUrl, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });
            
            // Aguardar o formulário carregar
            await this.page.waitForSelector('input[name="palavra"]', { timeout: 10000 });
            
            // Preencher o campo de busca
            await this.page.type('input[name="palavra"]', medicine);
            
            // Submeter o formulário
            await this.page.click('input[type="submit"][value="Pesquisar"]');
            
            // Aguardar os resultados
            await this.page.waitForNavigation({ waitUntil: 'networkidle2' });
            
            // Aguardar a tabela de resultados aparecer
            try {
                await this.page.waitForSelector('table', { timeout: 5000 });
            } catch (e) {
                console.log('No results table found');
                return results;
            }
            
            // Extrair informações das patentes
            const patents = await this.page.evaluate(() => {
                const patentList = [];
                const rows = document.querySelectorAll('table tr');
                
                rows.forEach((row, index) => {
                    if (index === 0) return; // Pular header
                    
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 3) {
                        const processNumber = cells[0]?.textContent?.trim() || '';
                        const title = cells[1]?.textContent?.trim() || '';
                        const depositDate = cells[2]?.textContent?.trim() || '';
                        
                        if (processNumber || title) {
                            patentList.push({
                                processNumber,
                                title,
                                depositDate,
                                source: 'INPI'
                            });
                        }
                    }
                });
                
                return patentList;
            });
            
            results.push(...patents);
            console.log(`INPI patent search completed. Found ${results.length} patents`);
            
        } catch (error) {
            console.error('INPI search error:', error);
            throw error;
        }
        
        return results;
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('🔒 INPI crawler closed');
        }
    }
}

module.exports = InpiCrawler;
