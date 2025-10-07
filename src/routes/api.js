const express = require("express");
const router = express.Router();
const PatentScopeCrawler = require("./crawlers/patentscope");

// ✅ Cria a instância **uma vez**
const patentscopeCrawler = new PatentScopeCrawler();

router.get("/patentscope/patents", async (req, res) => {
  const { medicine } = req.query;
  console.log("📍 PatentScope API route called", { medicine });

  try {
    const results = await patentscopeCrawler.search(medicine);
    res.json({ success: true, results });
  } catch (error) {
    console.error("❌ Error fetching PatentScope patents:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch PatentScope patents",
      message: error.message,
    });
  }
});

// Fechamento do browser no shutdown
process.on("SIGINT", async () => {
  console.log("SIGINT received, closing browser...");
  await patentscopeCrawler.closeBrowser();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing browser...");
  await patentscopeCrawler.closeBrowser();
  process.exit(0);
});

module.exports = router;
