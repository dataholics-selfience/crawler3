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
      console.log(`Searching PatentScope for: ${medicine}`);

      await page.goto("https://patentscope.wipo.int/search/en/search.jsf", {
        waitUntil: "networkidle2",
      });

      // digita o termo e clica em buscar
      await page.type('input[name="query"]', medicine);
      await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForNavigation({ waitUntil: "networkidle2" }),
      ]);

      // Espera o container de resultados
      await page.waitForSelector(".resultItem, #resultList", { timeout: 10000 });

      // 🔹 Extrai o HTML bruto da página de resultados (não OCR)
      const html = await page.content();

      // 🔹 (opcional) Pega também o link da primeira patente, se quiser analisar depois
      const firstLink = await page.evaluate(() => {
        const a = document.querySelector(".resultItem a, a.resultTitle");
        return a ? a.href : null;
      });

      return {
        html,
        firstLink,
        source: "patentscope",
      };
    } catch (err) {
      console.error("PatentScope crawler error:", err);
      return { error: err.message, source: "patentscope" };
    } finally {
      await page.close();
    }
  }
}

module.exports = new PatentScopeCrawler();
