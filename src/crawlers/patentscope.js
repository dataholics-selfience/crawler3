const puppeteer = require("puppeteer");

class PatentScopeCrawler {
  constructor() {
    this.browser = null;
  }

  async initBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-gpu",
          "--disable-dev-shm-usage",
          "--no-zygote",
          "--single-process",
        ],
      });
    }
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  async search(medicine) {
    await this.initBrowser();
    const page = await this.browser.newPage();

    try {
      console.log(`Searching PatentScope patents for: ${medicine}`);
      await page.goto("https://patentscope.wipo.int/search/en/search.jsf", {
        waitUntil: "networkidle2",
      });

      // Digita o termo de busca
      await page.type('input[name="query"]', medicine);

      // Submete o formulário e espera a navegação
      await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForNavigation({ waitUntil: "networkidle2" }),
      ]);

      // Retorna o HTML da primeira página
      const htmlContent = await page.content();
      return { html: htmlContent };
    } catch (err) {
      console.error("PatentScope crawler error:", err);
      throw err;
    } finally {
      await page.close();
    }
  }
}

// Exporta uma instância única
module.exports = new PatentScopeCrawler();
