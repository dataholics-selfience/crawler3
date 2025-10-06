// patentscope.js
const puppeteer = require('puppeteer');

class PatentScopeCrawler {
  constructor() {
    this.baseUrl = 'https://patentscope.wipo.int/search/en/result.jsf?query=FP:(';
    this.maxPages = 5; // limitar a 5 páginas por enquanto
  }

  async search(medicine) {
    console.log(`Starting PatentScope search for: ${medicine}`);
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const results = [];

    try {
      const url = `${this.baseUrl}${encodeURIComponent(medicine)})`;
      console.log(`Navigating to full-text URL: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

      for (let pageIndex = 1; pageIndex <= this.maxPages; pageIndex++) {
        console.log(`Processing page ${pageIndex}...`);
        try {
          // Espera o container de resultados
          await page.waitForSelector('div#resultDiv, div.results, table.resultList', { timeout: 15000 });

          // Extrai os dados
          const pageResults = await page.evaluate(() => {
            const rows = document.querySelectorAll('div.results > div.result-item, table.resultList tbody tr');
            return Array.from(rows).map(el => {
              const pub = el.querySelector('.pubNumber, td.pubNumber')?.innerText.trim() || '';
              const title = el.querySelector('.title, td.title')?.innerText.trim() || '';
              const abstract = el.querySelector('.abstract, td.abstract')?.innerText.trim() || '';
              const applicant = el.querySelector('.applicant, td.applicant')?.innerText.trim() || '';
              const inventor = el.querySelector('.inventor, td.inventor')?.innerText.trim() || '';
              return { publicationNumber: pub, title, abstract, applicant, inventor, source: 'PatentScope' };
            });
          });

          console.log(`Extracted ${pageResults.length} patents from current page`);
          results.push(...pageResults);

          // Tentar ir para a próxima página
          const nextButton = await page.$('a[title*="Next"], a.paginationNext');
          if (nextButton && pageIndex < this.maxPages) {
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
              nextButton.click()
            ]);
          } else {
            console.log('No more pages or reached maxPages limit.');
            break;
          }
        } catch (pageErr) {
          console.error(`Error processing page ${pageIndex}:`, pageErr.message);
          break;
        }
      }
    } catch (err) {
      console.error('PatentScope search error:', err.message);
    } finally {
      await browser.close();
      console.log(`PatentScope search completed: ${results.length} patents found`);
    }

    return results.length > 0 ? results : [{ publicationNumber: 'NO_RESULTS', title: 'No patents found', abstract: 'PatentScope returned no results', source: 'PatentScope' }];
  }
}

module.exports = PatentScopeCrawler;
