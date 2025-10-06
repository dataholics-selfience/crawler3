// src/crawlers/patentscope.js
const express = require('express');
const router = express.Router();
const { Groq } = require('groq-js'); // supondo que você esteja usando Groq

// Configurações do Groq
const groq = new Groq({
  timeout: 120000, // 2 minutos
  retries: 3,
  headless: true, // sem interface
});

async function fetchPatentScope(query) {
  try {
    // Busca a primeira página de resultados
    const results = await groq.query({
      url: 'https://patentscope.wipo.int/search/en/search.jsf',
      formData: {
        query: query || '',
        page: 1,
      },
      selectors: {
        title: 'h3.title a',
        link: 'h3.title a@href',
        applicants: '.applicants',
        inventors: '.inventors',
        publicationDate: '.pub-date',
        abstract: '.abstract',
      },
    });

    // Normaliza os dados
    const patents = results.map(r => ({
      title: r.title || '',
      link: r.link ? `https://patentscope.wipo.int${r.link}` : '',
      applicants: r.applicants || '',
      inventors: r.inventors || '',
      publicationDate: r.publicationDate || '',
      abstract: r.abstract || '',
    }));

    return patents;
  } catch (err) {
    console.error('PatentScopeCrawler error:', err);
    return [];
  }
}

// Rota principal do crawler
router.get('/patentscope/patents', async (req, res) => {
  const { q } = req.query;
  const data = await fetchPatentScope(q);
  res.json({ patents: data });
});

module.exports = router;
