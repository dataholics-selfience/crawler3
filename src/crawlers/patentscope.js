import puppeteer from "puppeteer";
import winston from "winston";

const logger = winston.createLogger({
  level: "info",
  transports: [new winston.transports.Console()],
});

export async function fetchPatentScopePatents(medicine) {
  logger.info(`Initializing PatentScope crawler for: ${medicine}`);

  const url = `https://patentscope.wipo.int/search/en/result.jsf?query=FP:(${medicine})`;

  let browser;
  try {
    logger.info("Initializing PatentScope browser...");
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

    const page = await browser.newPage();

    // Define um user-agent realista para evitar bloqueio
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36"
    );

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    logger.info("Waiting for search results to load...");

    // Espera até que os resultados da lista apareçam
    // Pode ser 'div.result' ou 'table.resultTable' dependendo da estrutura
    try {
      await page.waitForSelector(".result, .result-item, table.resultTable", {
        timeout: 20000,
      });
    } catch (err) {
      logger.warn("⚠️ Results not fully rendered, returning fallback HTML...");
    }

    // Aguarda um pequeno delay extra para o JS do WIPO terminar
    await page.waitForTimeout(2000);

    const html = await page.content();

    logger.info("PatentScope HTML captured successfully.");

    return {
      success: true,
      query: medicine,
      source: "PatentScope (WIPO)",
      totalResults: "unknown",
      timestamp: new Date().toISOString(),
      patents: [
        {
          publicationNumber: "HTML_DUMP",
          title: "Raw HTML snapshot (ready for Groq parse)",
          abstract: html,
          source: "PatentScope",
        },
      ],
    };
  } catch (error) {
    logger.error("Error in PatentScope crawler:", error);
    return {
      success: false,
      query: medicine,
      source: "PatentScope (WIPO)",
      error: error.message,
    };
  } finally {
    if (browser) {
      await browser.close();
      logger.info("PatentScope browser closed");
    }
  }
}
