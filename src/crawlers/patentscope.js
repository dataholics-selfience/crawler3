const puppeteer = require("puppeteer");

class PatentScopeCrawler {
  constructor() {
    this.browser = null;
    this.isInitializing = false; // evita inicialização duplicada
  }

  async initBrowser() {
    if (this.browser) return;
    if (this.isInitializing) {
      // aguarda inicialização se já estiver em andamento
      await new Promise((resolve) => {
        const check = setInterval(() => {
          if (this.browser) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
      return;
    }

    this.isInitializing = true;
    try {
      console.log("Initializing PatentScope browser...");
      this.browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      console.log("PatentScope browser initialized ✅");
    } catch (err) {
      console.error("Failed to initialize PatentScope browser:", err);
      throw err;
    } finally {
      this.isInitializing = false;
    }
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      console.log("PatentScope browser closed");
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

      // Input de busca
      await page.type('input[name="query"]', medicine);

      // Submete o formulário
      await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForNavigation({ waitUntil: "networkidle2" }),
      ]);

      // Extração de resultados
      const results = await page.evaluate(() => {
        return Array.from(document.querySelectorAll(".resultItem")).map((item) => ({
          title: item.querySelector(".resultTitle")?.innerText || "",
          publicationNumber: item.querySelector(".publicationNumber")?.innerText || "",
          link: item.querySelector("a")?.href || "",
        }));
      });

      console.log(`PatentScope search completed: ${results.length} patents found`);
      return results;
    } catch (err) {
      console.error("PatentScope crawler error:", err);
      throw err;
    } finally {
      await page.close();
    }
  }
}

// Exporta **uma instância única** para todo o servidor
module.exports = new PatentScopeCrawler();
