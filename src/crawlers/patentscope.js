const puppeteer = require("puppeteer");

class PatentScopeCrawler {
  constructor() {
    this.browser = null;
  }

  async initBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
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
      console.log(`🔍 Searching PatentScope patents for: ${medicine}`);
      await page.goto("https://patentscope.wipo.int/search/en/search.jsf", {
        waitUntil: "networkidle2",
      });

      await page.type('input[name="query"]', medicine);

      await Promise.all([
        page.click('button[type="submit"]'),
        page.waitForNavigation({ waitUntil: "networkidle2" }),
      ]);

      const results = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".resultItem")).map((item) => ({
          title: item.querySelector(".resultTitle")?.innerText || "",
          publicationNumber: item.querySelector(".publicationNumber")?.innerText || "",
          link: item.querySelector("a")?.href || "",
        }))
      );

      return results;
    } catch (err) {
      console.error("❌ PatentScope crawler error:", err);
      throw err;
    } finally {
      await page.close();
    }
  }
}

// ✅ Exporta já uma instância pronta
module.exports = new PatentScopeCrawler();
