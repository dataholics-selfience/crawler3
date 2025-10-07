const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const logger = require('./utils/logger');

dotenv.config();

// Import dos crawlers
const InpiCrawler = require('./crawlers/inpiCrawler'); // volta a ser carregado
const PatentScopeCrawler = require('./crawlers/patentscope');

const app = express();

// Middlewares
app.use(cors());
app.use(helmet());
app.use(compression());
app.use(express.json());
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Rate limit
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 60
}));

// Health check
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// INPI patents route
app.get('/api/data/inpi/patents', async (req, res) => {
  const { medicine } = req.query;
  if (!medicine) return res.status(400).json({ success: false, message: 'Missing medicine parameter' });

  const crawler = new InpiCrawler();
  try {
    await crawler.initialize();
    const patents = await crawler.searchPatents(medicine);
    res.json({ success: true, data: patents });
  } catch (err) {
    logger.error('INPI crawler failed', err);
    res.status(500).json({ success: false, error: 'Failed to fetch INPI patents', message: err.message });
  } finally {
    await crawler.close();
  }
});

// PatentScope patents route
app.get('/api/data/patentscope/patents', async (req, res) => {
  const { medicine } = req.query;
  if (!medicine) return res.status(400).json({ success: false, message: 'Missing medicine parameter' });

  const crawler = new PatentScopeCrawler();
  try {
    await crawler.initialize();
    const patents = await crawler.searchPatents(medicine);
    res.json({ success: true, data: patents });
  } catch (err) {
    logger.error('PatentScope crawler failed', err);
    res.status(500).json({ success: false, error: 'Failed to fetch PatentS
