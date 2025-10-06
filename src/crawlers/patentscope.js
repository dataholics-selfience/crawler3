import express from 'express';
import puppeteer from 'puppeteer';
import Groq from 'groq-js';

const app = express();
const PORT = process.env.PORT || 3000;

// Configuração de retries e delays
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Função principal de extração
async function fetchPatentscope(query = '') {
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    let browser;
    try {
      browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(60000);

      const searchUrl = `https://patentscope.wipo.int/search/en/search.jsf?query=${encodeURIComponent(query)}`;
      console.log(`Tentando acessar: ${searchUrl} (tentativa ${attempt + 1})`);

      await page.goto(searchUrl, { waitUntil: 'networkidle2' });

      // Espera pelos resultados
      await page.waitForSelector('.result-item', { timeout: 15000 });

      // Extrai os dados usando Groq
      const rawResults = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.result-item')).map(item => ({
          title: item.querySelector('.title')?.innerText || null,
          link: item.querySelector('.title a')?.href || null,
          applicants: item.querySelector('.applicants')?.innerText || null,
          inventors: item.querySelector('.inventors')?.innerText || null,
        }));
      });

      // Processamento Groq (exemplo: só patentes com título)
      const results = Groq.query('*[title != null]', { data: rawResults });

      return results;

    } catch (err) {
      console.error(`Erro na tentativa ${attempt + 1}:`, err.message);
      attempt++;
      const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
      console.log(`Aguardando ${Math.round(delay)}ms antes da próxima tentativa...`);
      await sleep(delay);
    } finally {
      if (browser) await browser.close();
    }
  }

  console.warn('Falha ao extrair dados do Patentscope após várias tentativas.');
  return [];
}

app.get('/patentscope', async (req, res) => {
  const { query } = req.query;

  try {
    const data = await fetchPatentscope(query || '');
    res.json(data);
  } catch (err) {
    console.error('Erro ao processar crawler:', err.message);
    res.status(500).json({ error: 'Falha ao processar crawler Patentscope' });
  }
});

app.listen(PORT, () => console.log(`Crawler Patentscope rodando em ${PORT}`));
