const puppeteer = require("puppeteer");
const Tesseract = require("tesseract.js");
const logger = require("../utils/logger");

async function searchPatents(medicine) {
  logger.info(`🔎 Searching PatentScope for: ${medicine}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.goto("https://patentscope.wipo.int/search/en/search.jsf", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // digita o termo e envia
    await page.type("#simpleSearchForm\\:simpleSearchText", medicine);
    await Promise.all([
      page.click("#simpleSearchForm\\:simpleSearchButton"),
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }),
    ]);

    // tenta extrair os títulos direto do DOM
    const titles = await page.$$eval(".resultTitle", els =>
      els.map(e => e.textContent.trim())
    );

    if (titles.length >= 10) {
      logger.info(`✅ Found ${titles.length} patents (DOM mode)`);
      return titles.slice(0, 15);
    }

    // fallback: captura screenshot e usa OCR
    logger.warn("⚠️ Few results found, falling back to OCR mode");
    const screenshot = await page.screenshot({ fullPage: true });

    const { data: { text } } = await Tesseract.recognize(screenshot, "eng", {
      logger: m => logger.info(`[OCR] ${m.status}: ${Math.round(m.progress * 100)}%`),
    });

    const matches = text
      .split("\n")
      .filter(line => line.trim().length > 10)
      .slice(0, 15);

    logger.info(`✅ Extracted ${matches.length} items via OCR`);
    return matches;
  } catch (error) {
    logger.error("PatentScope crawler failed:", error);
    throw new Error("Failed to fetch PatentScope patents");
  } finally {
    await browser.close();
    logger.info("PatentScope browser closed");
  }
}

module.exports = { searchPatents };
