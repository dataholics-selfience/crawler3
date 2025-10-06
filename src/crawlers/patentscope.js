const puppeteer = require("puppeteer");
const logger = require("../utils/logger");

async function fetchPatentScopePatents(query) {
  logger.info(`Initializing PatentScope browser...`);
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  logger.info("PatentScope browser initialized");

  try {
    logger.info(`Searching PatentScope patents for query: ${query}`);
    const searchUrl = `https://patentscope.wipo.int/search/en/result.jsf?query=FP:(${encodeURIComponent(query)})`;
    logger.info(`Navigating to: ${searchUrl}`);

    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Aguarda o corpo da página carregar
    await page.waitForSelector("body", { timeout: 15000 });

    // Captura o HTML bruto
    const htmlContent = await page.content();

    logger.info("PatentScope HTML captured successfully");

    // Retorna o HTML dentro de um formato padrão para tratamento posterior (ex: Groq ou n8n)
    return {
      success: true,
      query,
      source: "PatentScope (WIPO)",
      totalResults: 1,
      timestamp: new Date().toISOString(),
      patents: [
        {
          publicationNumber: "HTML_DUMP",
          title: "Raw HTML snapshot (to be parsed by AI)",
          abstract: htmlContent.slice(0, 5000) + "...", // reduz pra não enviar payload gigante
          source: "PatentScope",
        },
      ],
    };
  } catch (error) {
    logger.error("PatentScope crawler error:", error.message);
    return {
      success: false,
      error: error.message,
    };
  } finally {
    await browser.close();
    logger.info("PatentScope browser closed");
  }
}

module.exports = { fetchPatentScopePatents };
