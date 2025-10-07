const puppeteer = require("puppeteer");
const Tesseract = require("tesseract.js");

class PatentScopeCrawler {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    this.page = await this.browser.newPage();
    this.page.setDefaultNavigationTimeout(60000); // timeout de 60s
  }

  async close() {
    if (this.page) await this.page.close();
    if (this.browser) await this.browser.close();
  }

  async searchPatents(medicine) {
    try {
      await this.init();

      // URL de pesquisa no PatentScope
      const searchUrl = `https://patentscope.wipo.int/search/en/search.jsf`;

      await this.page.goto(searchUrl, { waitUntil: "networkidle2" });

      // Preencher campo de busca
      await this.page.type("#query", medicine);
      await Promise.all([
        this.page.click("input[type='submit']"),
        this.page.waitForNavigation({ waitUntil: "networkidle2" }),
      ]);

      // Extrair resultados da página
      const results = await this.page.evaluate(() => {
        const patents = [];
        const items = document.querySelectorAll(".resultItem");
        items.forEach((item) => {
          const title = item.querySelector(".title")?.innerText || "";
          const link = item.querySelector("a")?.href || "";
          const abstract = item.querySelector(".abstract")?.innerText || "";
          patents.push({ title, abstract, link });
        });
        return patents;
      });

      // Se nenhum resultado textual, tenta OCR
      if (results.length === 0) {
        console.log("📄 No textual results found, trying OCR...");
        const screenshot = await this.page.screenshot();
        const ocrResult = await Tesseract.recognize(screenshot, "eng");
        return [{ title: medicine, abstract: ocrResult.data.text, link: "" }];
      }

      return results;
    } catch (err) {
      console.error("PatentScope crawler error:", err.message);
      throw err;
    } finally {
      await this.close();
    }
  }
}

module.exports = PatentScopeCrawler;
