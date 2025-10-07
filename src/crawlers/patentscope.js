const puppeteer = require("puppeteer");
const Tesseract = require("tesseract.js");

async function searchPatents(medicine) {
  console.log(`🔍 Searching PatentScope for: ${medicine}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();
  const url = `https://patentscope.wipo.int/search/en/result.jsf?query=${encodeURIComponent(
    medicine
  )}`;
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

  // Aguarda resultados principais
  await page.waitForTimeout(5000);

  let patents = [];
  try {
    patents = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll(".result-item"));
      return rows.slice(0, 15).map((row) => ({
        title:
          row.querySelector(".title")?.innerText.trim() ||
          "No title available",
        link:
          row.querySelector("a")?.href ||
          "https://patentscope.wipo.int/search/en/",
        publication:
          row.querySelector(".pubNumber")?.innerText.trim() ||
          "N/A",
        applicant:
          row.querySelector(".applicant")?.innerText.trim() ||
          "N/A",
        date:
          row.querySelector(".pubDate")?.innerText.trim() ||
          "N/A",
      }));
    });
  } catch (err) {
    console.error("⚠️ Could not extract text normally:", err.message);
  }

  // Se não encontrou nada, tenta OCR
  if (!patents || patents.length === 0) {
    console.log("📸 No structured data found, using OCR fallback...");
    const screenshot = "/tmp/patentscope.png";
    await page.screenshot({ path: screenshot, fullPage: true });

    const ocrResult = await Tesseract.recognize(screenshot, "eng");
    const text = ocrResult.data.text;
    const lines = text.split("\n").filter((l) => l.trim().length > 10);

    patents = lines.slice(0, 15).map((line) => ({
      title: line.trim(),
      link: url,
      publication: "OCR Extracted",
      applicant: "OCR Extracted",
      date: "OCR Extracted",
    }));
  }

  await browser.close();
  console.log(`✅ Found ${patents.length} patents on PatentScope`);
  return patents;
}

module.exports = { searchPatents };
