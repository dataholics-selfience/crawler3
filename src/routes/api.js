const express = require("express");
const router = express.Router();
const PatentScopeCrawler = require("./crawlers/patentscope");

// Criar **uma instância global de crawler**
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

module.exports = router;
