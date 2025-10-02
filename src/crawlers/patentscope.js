// src/crawlers/patentscope.js
const BaseCrawler = require('./baseCrawler');

class PatentScopeCrawler extends BaseCrawler {
    constructor() {
        super();
        this.baseUrl = 'https://patentscope.wipo.int/search/en/search.jsf';
    }

    async searchPatents(medicine) {
        console.log('🔍 ========================================');
        console.log('🔍 PatentScope Crawler - Starting search');
        console.log(`🔍 Medicine: ${medicine}`);
        console.log('🔍 ========================================');

        try {
            console.log('🌐 Navigating to PatentScope...');
            await this.page.goto(this.baseUrl, { 
                waitUntil: 'networkidle2',
                timeout: 60000 
            });
            console.log('✅ Page loaded successfully');

            // Wait for page to be fully interactive
            await this.page.waitForTimeout(2000);

            // Try multiple selectors as PatentScope might have variations
            const searchSelectors = [
                '#simpleSearchSearchForm\\:fpSearch',
                'input[name*="fpSearch"]',
                'input[type="text"][class*="search"]'
            ];

            let searchInput = null;
            console.log('🔍 Looking for search input field...');
            
            for (const selector of searchSelectors) {
                try {
                    console.log(`   Trying selector: ${selector}`);
                    searchInput = await this.page.waitForSelector(selector, { 
                        timeout: 10000,
                        visible: true 
                    });
                    if (searchInput) {
                        console.log(`✅ Found search input with selector: ${selector}`);
                        break;
                    }
                } catch (err) {
                    console.log(`   ⚠️ Selector not found: ${selector}`);
                    continue;
                }
            }

            if (!searchInput) {
                console.error('❌ Could not find search input field with any selector');
                
                // Take a screenshot for debugging
                await this.page.screenshot({ 
                    path: '/tmp/patentscope-error.png',
                    fullPage: true 
                });
                console.log('📸 Screenshot saved to /tmp/patentscope-error.png');
                
                throw new Error('Search input field not found on PatentScope');
            }

            console.log('⌨️  Typing search query...');
            await searchInput.click();
            await this.page.keyboard.type(medicine, { delay: 100 });
            console.log('✅ Query typed successfully');

            // Try multiple search button selectors
            const buttonSelectors = [
                '#simpleSearchSearchForm\\:commandExeSearch',
                'button[id*="commandExeSearch"]',
                'input[type="submit"][value*="Search"]',
                'button[type="submit"]'
            ];

            let searchButton = null;
            console.log('🔍 Looking for search button...');
            
            for (const selector of buttonSelectors) {
                try {
                    console.log(`   Trying selector: ${selector}`);
                    searchButton = await this.page.$(selector);
                    if (searchButton) {
                        console.log(`✅ Found search button with selector: ${selector}`);
                        break;
                    }
                } catch (err) {
                    console.log(`   ⚠️ Selector not found: ${selector}`);
                    continue;
                }
            }

            if (!searchButton) {
                console.error('❌ Could not find search button');
                throw new Error('Search button not found on PatentScope');
            }

            console.log('🖱️  Clicking search button...');
            await Promise.all([
                searchButton.click(),
                this.page.waitForNavigation({ 
                    waitUntil: 'networkidle2',
                    timeout: 60000 
                }).catch(err => {
                    console.log('⚠️ Navigation timeout (might be ok):', err.message);
                })
            ]);
            console.log('✅ Search submitted');

            // Wait for results to load
            console.log('⏳ Waiting for results...');
            await this.page.waitForTimeout(3000);

            console.log('📊 Extracting patent data...');
            const patents = await this.extractPatentData();
            
            console.log('🔍 ========================================');
            console.log(`✅ PatentScope search complete: ${patents.length} patents found`);
            console.log('🔍 ========================================');

            return patents;

        } catch (error) {
            console.error('🔍 ========================================');
            console.error('❌ PatentScope Crawler Error');
            console.error('❌ Error:', error.message);
            console.error('❌ Stack:', error.stack);
            console.error('🔍 ========================================');
            
            // Take screenshot on error
            try {
                await this.page.screenshot({ 
                    path: '/tmp/patentscope-error.png',
                    fullPage: true 
                });
                console.log('📸 Error screenshot saved');
            } catch (screenshotErr) {
                console.log('⚠️ Could not save screenshot');
            }
            
            throw new Error(`Error during patent search: ${error.message}`);
        }
    }

    async extractPatentData() {
        try {
            const patents = await this.page.evaluate(() => {
                const results = [];
                
                // Try multiple result selectors
                const resultSelectors = [
                    '.result',
                    '.patent-result',
                    'tr[class*="result"]',
                    'div[class*="patent"]'
                ];

                let resultElements = [];
                for (const selector of resultSelectors) {
                    resultElements = document.querySelectorAll(selector);
                    if (resultElements.length > 0) {
                        break;
                    }
                }

                if (resultElements.length === 0) {
                    console.log('No results found with standard selectors');
                    return [];
                }

                resultElements.forEach((element, index) => {
                    try {
                        // Extract title
                        const titleElement = element.querySelector('a, .title, [class*="title"]');
                        const title = titleElement ? titleElement.textContent.trim() : 'N/A';

                        // Extract application number
                        const appNumElement = element.querySelector('[class*="application"], [class*="number"]');
                        const applicationNumber = appNumElement ? appNumElement.textContent.trim() : 'N/A';

                        // Extract date
                        const dateElement = element.querySelector('[class*="date"]');
                        const date = dateElement ? dateElement.textContent.trim() : 'N/A';

                        // Extract applicant
                        const applicantElement = element.querySelector('[class*="applicant"], [class*="owner"]');
                        const applicant = applicantElement ? applicantElement.textContent.trim() : 'N/A';

                        // Extract link
                        const linkElement = element.querySelector('a[href]');
                        const link = linkElement ? linkElement.href : 'N/A';

                        if (title !== 'N/A' || applicationNumber !== 'N/A') {
                            results.push({
                                title,
                                applicationNumber,
                                date,
                                applicant,
                                link,
                                source: 'PatentScope (WIPO)'
                            });
                        }
                    } catch (err) {
                        console.log(`Error extracting patent ${index}:`, err.message);
                    }
                });

                return results;
            });

            console.log(`📊 Extracted ${patents.length} patents from page`);
            return patents;

        } catch (error) {
            console.error('❌ Error extracting patent data:', error.message);
            return [];
        }
    }
}

module.exports = PatentScopeCrawler;
