const express = require("express");
const router = express.Router();
const InpiCrawler = require("../crawlers/inpi");
const PatentScopeCrawler = require("../crawlers/patentscope");

// INPI route
router.get("/inpi/patents", async (req, res) => {
  const { medicine } = req.query;
  console.log("📍 INPI route called");
  try {
    const crawler = new InpiCrawler();
    const results = await crawler.searchPatents(medicine);
    res.json({ success: true, results });
  } catch (error) {
    console.error("INPI error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PatentScope route
router.get("/patentscope/patents", async (req, res) => {
  const { medicine } = req.query;
  console.log("📍 PatentScope route called");
  try {
    const crawler = new PatentScopeCrawler();
    const results = await crawler.searchPatents(medicine);
    res.json({ success: true, results });
  } catch (error) {
    console.error("PatentScope error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch PatentScope patents" });
  }
});

module.exports = router;
