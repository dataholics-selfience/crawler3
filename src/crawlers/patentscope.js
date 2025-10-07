const puppeteer = require("puppeteer");
const Tesseract = require("tesseract.js");

async function searchPatents(medicine) {
  console.log(`🔍 Searching PatentScope for: ${medicine}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  const page = await browser.newPage();
  const url = `https://patentscope.wipo.int/search/en/result.jsf?query=${encodeURIComponent(
    medicine
  )}`;

  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForTimeout(5000);

  let patents = [];
  try {
    patents = await page.evaluate(() => {
      const results = Array.from(document.querySelectorAll(".result-item"));
      return results.slice(0, 15).map((item) => ({
        title:
          item.querySelector(".title")?.innerText.trim() ||
          "No title available",
        link:
          item.querySelector("a")?.href ||
          "https://patentscope.wipo.int/search/en/",
        publication:
          item.querySelector(".pubNumber")?.innerText.trim() || "N/A",
        applicant:
          item.querySelector(".applicant")?.innerText.trim() || "N/A",
        date:
          item.querySelector(".pubDate")?.innerText.trim() || "N/A",
      }));
    });
  } catch (err) {
    console.error("⚠️ Could not extract structured data:", err.message);
  }

  // Fallback via OCR se não achou nada
  if (!patents || patents.length === 0) {
    console.log("📸 Using OCR fallback...");
    const screenshot = "/tmp/patentscope.png";
    await page.screenshot({ path: screenshot, fullPage: true });

    const ocr = await Tesseract.recognize(screenshot, "eng");
    const text = ocr.data.text;
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
  console.log(`✅ Found ${patents.length} results from PatentScope`);
  return patents;
}

module.exports = { search: searchPatents };



