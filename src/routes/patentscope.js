const express = require("express");
const router = express.Router();
const patentscopeCrawler = require("../crawlers/patentscope"); // já é instância

// Rota PatentScope
router.get("/patentscope/patents", async (req, res) => {
  const { medicine } = req.query;
  console.log("📍 PatentScope route called");
  try {
    const results = await patentscopeCrawler.search(medicine); // chama search da instância
    res.json({ success: true, results });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch PatentScope patents",
      message: error.message,
    });
  }
});

module.exports = router;
