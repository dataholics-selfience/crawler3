const express = require("express");
const router = express.Router();
const inpiCrawler = require("../crawlers/inpi");
const patentscopeCrawler = require("../crawlers/patentscope");

// INPI route
router.get("/inpi/patents", async (req, res) => {
  const { medicine } = req.query;
  console.log("📍 INPI route called");
  try {
    const results = await inpiCrawler.searchPatents(medicine);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PatentScope route
router.get("/patentscope/patents", async (req, res) => {
  const { medicine } = req.query;
  console.log("📍 PatentScope route called");
  try {
    const results = await patentscopeCrawler.searchPatents(medicine);
    res.json({ success: true, results });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch PatentScope patents" });
  }
});

module.exports = router;
