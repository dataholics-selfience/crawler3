const puppeteer = require('puppeteer');

class PatentScopeCrawler {
    constructor() {
        this.baseUrl = 'https://patentscope.wipo.int/search/en/search.jsf';
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
                '--disable-extensions'
            ]
        });
        this.page = await this.browser.newPage();
        
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await this.page.setViewport({ width: 1366, height: 768 });
        await this.page.setDefaultTimeout(60000);
    }

    async searchPatents(medicine) {
        const results = [];
        
        try {
            console.log(`Searching PatentScope for: ${medicine}`);
            
            // Navegar para a página
            await this.page.goto(this.baseUrl, { 
                waitUntil: 'networkidle2',
                timeout: 60000 
            });
            
            // Aguardar a página carregar completamente
            await this.page.waitForTimeout(5000);
            
            // Tentar múltiplos seletores possíveis
            const searchSelectors = [
                '#simpleSearchSearchForm\\:fpSearch',
                'input[id*="fpSearch"]',
                'input[name*="fpSearch"]',
                '.searchInput',
                'input[type="text"]'
            ];
            
            let searchInput = null;
            for (const selector of searchSelectors) {
                try {
                    searchInput = await this.page.$(selector);
                    if (searchInput) {
                        console.log(`Found search input with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (!searchInput) {
                // Alternativa: Usar a busca avançada diretamente na URL
                const searchUrl = `https://patentscope.wipo.int/search/en/result.jsf?query=${encodeURIComponent(medicine)}`;
                console.log(`Using direct search URL: ${searchUrl}`);
                
                await this.page.goto(searchUrl, { 
                    waitUntil: 'networkidle2',
                    timeout: 60000 
                });
                
                await this.page.waitForTimeout(5000);
            } else {
                // Usar o campo de busca normal
                await searchInput.click({ clickCount: 3 });
                await searchInput.type(medicine);
                
                // Procurar e clicar no botão de busca
                const searchButtonSelectors = [
                    '#simpleSearchSearchForm\\:commandSimpleFPSearch',
                    'input[id*="commandSimpleFPSearch"]',
                    'button[type="submit"]',
                    'input[type="submit"]'
                ];
                
                for (const selector of searchButtonSelectors) {
                    try {
                        const button = await this.page.$(selector);
                        if (button) {
                            await button.click();
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }
                
                // Aguardar resultados
                await this.page.waitForTimeout(5000);
            }
            
            // Extrair resultados - tentar múltiplos seletores
            const patents = await this.page.evaluate(() => {
                const patentData = [];
                
                // Tentar diferentes seletores para os resultados
                const resultSelectors = [
                    '.searchResultRecord',
                    '.resultItem',
                    '[class*="result"]',
                    'div[id*="result"]'
                ];
                
                let patentElements = [];
                for (const selector of resultSelectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        patentElements = elements;
                        break;
                    }
                }
                
                if (patentElements.length === 0) {
                    // Tentar pegar qualquer coisa que pareça um resultado
                    const allDivs = document.querySelectorAll('div');
                    for (const div of allDivs) {
                        const text = div.textContent || '';
                        if (text.includes('WO/') || text.includes('US/') || text.includes('EP/')) {
                            patentElements = [div];
                            break;
                        }
                    }
                }
                
                patentElements.forEach((element, index) => {
                    try {
                        const text = element.textContent || '';
                        
                        // Extrair número de publicação
                        const pubNumberMatch = text.match(/([A-Z]{2}\/?\d{4}\/?\d+|[A-Z]{2}\d+)/);
                        const publicationNumber = pubNumberMatch ? pubNumberMatch[0] : `Result ${index + 1}`;
                        
                        // Extrair título (qualquer texto longo)
                        const lines = text.split('\n').filter(line => line.trim().length > 20);
                        const title = lines[0] || 'Patent result';
                        
                        patentData.push({
                            publicationNumber,
                            title: title.substring(0, 200),
                            abstract: text.substring(0, 500),
                            resultIndex: index + 1
                        });
                    } catch (err) {
                        console.error(`Error extracting patent at index ${index}:`, err);
                    }
                });
                
                return patentData;
            });
            
            if (patents.length === 0) {
                console.log('No patents found, returning mock data for testing');
                // Retornar dados mock para teste
                results.push({
                    publicationNumber: 'TEST-001',
                    title: `Search performed for: ${medicine}`,
                    abstract: 'PatentScope search completed but no results found or page structure changed',
                    note: 'This is a test response - PatentScope may have changed their website structure'
                });
            } else {
                results.push(...patents);
            }
            
            console.log(`Found ${results.length} patents`);
            
        } catch (error) {
            console.error('Error during patent search:', error);
            // Retornar um resultado de erro informativo
            results.push({
                publicationNumber: 'ERROR',
                title: 'Search failed',
                abstract: error.message,
                note: 'PatentScope website may be unavailable or changed'
            });
        }
        
        return results;
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

module.exports = PatentScopeCrawler;
