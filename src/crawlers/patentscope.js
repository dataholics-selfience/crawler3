const puppeteer = require("puppeteer");

class PatentScopeCrawler {
  constructor() {
    this.baseUrl = "https://patentscope.wipo.int/search/en/result.jsf";
    this.source = "PatentScope (WIPO)";
  }

  async search(medicine, { maxPages = 5 } = {}) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    const patents = [];

    try {
      const searchUrl = `${this.baseUrl}?query=FP:(${encodeURIComponent(medicine)})`;
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

      for (let pageIndex = 1; pageIndex <= maxPages; pageIndex++) {
        console.log(`Processing page ${pageIndex}...`);

        // aguardar pelo container principal de resultados
        await page.waitForSelector("div.resultsTable, table.resultList", { timeout: 10000 }).catch(() => {
          console.warn("Results container not found, stopping pagination.");
          break;
        });

        const resultsOnPage = await page.evaluate(()
