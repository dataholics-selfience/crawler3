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
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await this.page.setViewport({ width: 1366, height: 768 });
        await this.page.setDefaultTimeout(30000);
        
        // Interceptar e logar requisições para debug
        this.page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        this.page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    }

    async searchPatents(medicine) {
        const results = [];
        
        try {
            console.log('Starting INPI patent search');
            console.log(`Navigating to: ${this.baseUrl}`);
            
            // Navegar para a página de busca
            const response = await this.page.goto(this.baseUrl, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });
            
            console.log(`Page status: ${response.status()}`);
            
            // Aguardar um pouco para a página carregar completamente
            await this.page.waitForTimeout(3000);
            
            // Tirar screenshot para debug (opcional)
            // await this.page.screenshot({ path: 'inpi_page.png' });
            
            // Tentar múltiplos seletores para o campo de busca
            const searchSelectors = [
                'input[name="palavra"]',
                'input[name="Palavra"]',
                'input[type="text"][name*="palavra"]',
                'input[type="text"]',
                '#palavra',
                '.palavra',
                'input[placeholder*="palavra"]',
                'input[placeholder*="Palavra"]',
                'form input[type="text"]'
            ];
            
            let searchInput = null;
            let selectorFound = null;
            
            for (const selector of searchSelectors) {
                try {
                    console.log(`Trying selector: ${selector}`);
                    const element = await this.page.$(selector);
                    if (element) {
                        searchInput = element;
                        selectorFound = selector;
                        console.log(`✅ Found search input with selector: ${selector}`);
                        break;
                    }
                } catch (e) {
                    continue;
                }
            }
            
            if (!searchInput) {
                // Listar todos os inputs da página para debug
                const inputs = await this.page.evaluate(() => {
                    const allInputs = document.querySelectorAll('input');
                    return Array.from(allInputs).map(input => ({
                        type: input.type,
                        name: input.name,
                        id: input.id,
                        placeholder: input.placeholder,
                        className: input.className
                    }));
                });
                
                console.log('All inputs found on page:', JSON.stringify(inputs, null, 2));
                
                // Tentar busca alternativa via URL
                console.log('Trying alternative search via URL parameters');
                const searchUrl = `${this.baseUrl}?palavra=${encodeURIComponent(medicine)}`;
                await this.page.goto(searchUrl, { waitUntil: 'networkidle2' });
                await this.page.waitForTimeout(3000);
            } else {
                // Preencher o campo de busca
                await searchInput.click({ clickCount: 3 });
                await searchInput.type(medicine);
                console.log(`Typed search term: ${medicine}`);
                
                // Tentar múltiplos seletores para o botão de busca
                const buttonSelectors = [
                    'input[type="submit"][value="Pesquisar"]',
                    'input[type="submit"]',
                    'button[type="submit"]',
                    'input[value*="Pesquisar"]',
                    'input[value*="pesquisar"]',
                    'button:contains("Pesquisar")',
                    'input[type="button"][value*="Pesquisar"]',
                    'form input[type="submit"]',
                    'form button'
                ];
                
                let buttonClicked = false;
                
                for (const selector of buttonSelectors) {
                    try {
                        const button = await this.page.$(selector);
                        if (button) {
                            console.log(`Found submit button with selector: ${selector}`);
                            await button.click();
                            buttonClicked = true;
                            break;
                        }
                    } catch (e) {
                        continue;
                    }
                }
                
                if (!buttonClicked) {
                    // Tentar submeter o formulário diretamente
                    console.log('Trying to submit form directly');
                    await this.page.evaluate(() => {
                        const forms = document.querySelectorAll('form');
                        if (forms.length > 0) {
                            forms[0].submit();
                        }
                    });
                }
                
                // Aguardar navegação
                try {
                    await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
                } catch (e) {
                    console.log('Navigation timeout, continuing...');
                }
            }
            
            // Aguardar um pouco para resultados carregarem
            await this.page.waitForTimeout(3000);
            
            // Verificar se há resultados
            const pageContent = await this.page.content();
            
            // Extrair informações das patentes - tentar múltiplas estratégias
            const patents = await this.page.evaluate((searchTerm) => {
                const patentList = [];
                
                // Estratégia 1: Procurar por tabelas
                const tables = document.querySelectorAll('table');
                tables.forEach(table => {
                    const rows = table.querySelectorAll('tr');
                    rows.forEach((row, index) => {
                        if (index === 0) return; // Pular header
                        
                        const cells = row.querySelectorAll('td');
                        if (cells.length >= 2) {
                            const text = row.textContent || '';
                            if (text.length > 20) { // Filtrar linhas vazias
                                patentList.push({
                                    processNumber: cells[0]?.textContent?.trim() || '',
                                    title: cells[1]?.textContent?.trim() || text.substring(0, 100),
                                    depositDate: cells[2]?.textContent?.trim() || '',
                                    fullText: text.substring(0, 200),
                                    source: 'INPI'
                                });
                            }
                        }
                    });
                });
                
                // Estratégia 2: Se não encontrou em tabelas, procurar por divs ou listas
                if (patentList.length === 0) {
                    const possibleResults = document.querySelectorAll('div[class*="result"], li[class*="result"], div[class*="patent"], article');
                    possibleResults.forEach(element => {
                        const text = element.textContent || '';
                        if (text.length > 30 && (text.toLowerCase().includes(searchTerm.toLowerCase()) || text.includes('BR'))) {
                            patentList.push({
                                processNumber: 'N/A',
                                title: text.substring(0, 100),
                                depositDate: 'N/A',
                                fullText: text.substring(0, 200),
                                source: 'INPI'
                            });
                        }
                    });
                }
                
                // Estratégia 3: Buscar qualquer texto que pareça um resultado de patente
                if (patentList.length === 0) {
                    const bodyText = document.body.textContent || '';
                    // Procurar por padrões de número de processo brasileiro (BR...)
                    const patentPattern = /BR\s*\d{2}\s*\d{4}\s*\d+/g;
                    const matches = bodyText.match(patentPattern);
                    if (matches) {
                        matches.forEach(match => {
                            patentList.push({
                                processNumber: match,
                                title: 'Patent found - details on page',
                                depositDate: 'Check page',
                                fullText: match,
                                source: 'INPI'
                            });
                        });
                    }
                }
                
                return patentList;
            }, medicine);
            
            if (patents.length === 0) {
                console.log('No patents found with standard extraction');
                
                // Última tentativa: verificar se há mensagem de "sem resultados"
                const hasNoResults = await this.page.evaluate(() => {
                    const bodyText = document.body.textContent || '';
                    return bodyText.toLowerCase().includes('nenhum resultado') || 
                           bodyText.toLowerCase().includes('não encontrado') ||
                           bodyText.toLowerCase().includes('sem resultado');
                });
                
                if (hasNoResults) {
                    console.log('Page indicates no results found');
                } else {
                    console.log('Results might be present but extraction failed');
                    // Retornar um resultado indicativo
                    results.push({
                        processNumber: 'EXTRACTION_FAILED',
                        title: `Search performed for: ${medicine}`,
                        depositDate: new Date().toISOString(),
                        note: 'Results might be available but extraction failed. INPI website may have changed.',
                        source: 'INPI'
                    });
                }
            } else {
                results.push(...patents);
                console.log(`INPI patent search completed. Found ${patents.length} patents`);
            }
            
        } catch (error) {
            console.error('INPI search error:', error);
            
            // Retornar erro informativo ao invés de falhar completamente
            results.push({
                processNumber: 'ERROR',
                title: 'Search failed',
                depositDate: new Date().toISOString(),
                error: error.message,
                note: 'INPI website may be unavailable or changed',
                source: 'INPI'
            });
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
