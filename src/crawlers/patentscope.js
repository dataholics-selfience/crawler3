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
                '--single-process',
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
            
            await this.page.goto(this.baseUrl, { 
                waitUntil: 'networkidle2',
                timeout: 60000 
            });
            
            await this.page.waitForSelector('#simpleSearchSearchForm\\:fpSearch', { timeout: 30000 });
            
            const searchInput = await this.page.$('#simpleSearchSearchForm\\:fpSearch');
            await searchInput.click({ clickCount: 3 });
            await searchInput.type(medicine);
            
            await this.page.click('#simpleSearchSearchForm\\:commandSimpleFPSearch');
            
            await this.page.waitForSelector('.searchResultRecord, .noResultsMessage', { timeout: 30000 });
            
            const noResults = await this.page.$('.noResultsMessage');
            if (noResults) {
                console.log('No results found for this search');
                return results;
            }
            
            await this.page.waitForTimeout(3000);
            
            const patents = await this.page.evaluate(() => {
                const patentElements = document.querySelectorAll('.searchResultRecord');
                const patentData = [];
                
                patentElements.forEach((element, index) => {
                    try {
                        const pubNumberElement = element.querySelector('.publicationNumber a');
                        const publicationNumber = pubNumberElement ? pubNumberElement.textContent.trim() : '';
                        
                        const titleElement = element.querySelector('.notranslate');
                        const title = titleElement ? titleElement.textContent.trim() : '';
                        
                        const applicantElement = element.querySelector('.fieldContent');
                        let applicant = '';
                        if (applicantElement) {
                            const applicantText = applicantElement.textContent;
                            const applicantMatch = applicantText.match(/Applicants?:\s*([^;]+)/);
                            applicant = applicantMatch ? applicantMatch[1].trim() : '';
                        }
                        
                        const dateElements = element.querySelectorAll('.fieldContent');
                        let publicationDate = '';
                        let applicationDate = '';
                        
                        dateElements.forEach(el => {
                            const text = el.textContent;
                            if (text.includes('Publication Date:')) {
                                publicationDate = text.replace('Publication Date:', '').trim();
                            }
                            if (text.includes('Application Date:')) {
                                applicationDate = text.replace('Application Date:', '').trim();
                            }
                        });
                        
                        const ipcElement = element.querySelector('.ipcField');
                        const ipcClassification = ipcElement ? ipcElement.textContent.trim() : '';
                        
                        const abstractElement = element.querySelector('.searchResultAbstract');
                        const abstract = abstractElement ? abstractElement.textContent.trim() : '';
                        
                        const link = pubNumberElement ? pubNumberElement.href : '';
                        
                        if (publicationNumber || title) {
                            patentData.push({
                                publicationNumber,
                                title,
                                applicant,
                                publicationDate,
                                applicationDate,
                                ipcClassification,
                                abstract: abstract.substring(0, 500) + (abstract.length > 500 ? '...' : ''),
                                link,
                                resultIndex: index + 1
                            });
                        }
                    } catch (err) {
                        console.error(`Error extracting patent at index ${index}:`, err);
                    }
                });
                
                return patentData;
            });
            
            results.push(...patents);
            console.log(`Found ${results.length} patents on first page`);
            
        } catch (error) {
            console.error('Error during patent search:', error);
            throw error;
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

