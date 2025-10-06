  async extractResultsFromCurrentPage() {
    console.log('Extracting visible results from current page...');

    const patents = await this.page.evaluate(() => {
      const clean = (txt) => txt.replace(/\s+/g, ' ').trim();

      const rows = Array.from(document.querySelectorAll('table.resultTable tr')).filter(tr =>
        tr.innerText.match(/(WO|US|EP|CN|JP|KR|BR|CA|AU|IN)\s*\d{4,}/i)
      );

      const results = [];
      const seen = new Set();

      for (const tr of rows) {
        const text = clean(tr.innerText);
        const match = text.match(/(WO|US|EP|CN|JP|KR|BR|CA|AU|IN)\s*[\d/]+/i);
        if (!match) continue;

        const publicationNumber = match[0].replace(/\s+/g, '');
        if (seen.has(publicationNumber)) continue;
        seen.add(publicationNumber);

        const titleMatch = text.split(/\n| {2,}/)[0].trim();
        const title = clean(titleMatch || '');
        const abstract = clean(text.substring(0, 600));

        results.push({
          publicationNumber,
          title: title || 'Untitled patent',
          abstract,
          source: 'PatentScope'
        });
      }

      // fallback se tabela não for detectada
      if (results.length === 0) {
        const blocks = Array.from(document.querySelectorAll('div, td')).map(el => el.innerText);
        for (const block of blocks) {
          const match = block.match(/\b(WO|US|EP|CN|JP|KR|BR|CA|AU|IN)\s*\d{4,}[\/\s]?\d*/i);
          if (!match) continue;
          const number = match[0].replace(/\s+/g, '');
          if (seen.has(number)) continue;
          seen.add(number);
          results.push({
            publicationNumber: number,
            title: clean(block.split('\n')[0] || ''),
            abstract: clean(block.substring(0, 600)),
            source: 'PatentScope'
          });
        }
      }

      return results;
    });

    console.log(`Extracted ${patents.length} patents from current page`);
    return patents;
  }

  async goToNextPage() {
    console.log('Trying to go to next page...');
    try {
      // Os botões do PatentScope variam, então testamos múltiplos padrões
      const nextButtonSelectors = [
        'a[id*="nextPageLink"]',
        'a[title*="Next"]',
        '.ui-paginator-next',
        'input[value*="Next"]'
      ];

      let nextButton = null;
      for (const sel of nextButtonSelectors) {
        nextButton = await this.page.$(sel);
        if (nextButton) break;
      }

      if (!nextButton) {
        console.log('⚠️ No next button found — probably last page.');
        return false;
      }

      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 }),
        nextButton.click()
      ]);

      await this.page.waitForTimeout(4000);
      console.log('✅ Moved to next page');
      return true;
    } catch (e) {
      console.log('⚠️ Failed to go to next page:', e.message);
      return false;
    }
  }

  async extractResults(maxPages = 5) {
    console.log(`Extracting results from up to ${maxPages} pages...`);

    let allPatents = [];
    let currentPage = 1;

    while (currentPage <= maxPages) {
      console.log(`📄 Page ${currentPage}...`);
      const pagePatents = await this.extractResultsFromCurrentPage();

      if (pagePatents.length === 0 && currentPage === 1) {
        console.log('⚠️ No results found on first page — aborting.');
        break;
      }

      allPatents = allPatents.concat(pagePatents);

      console.log(`✅ Found ${pagePatents.length} results on page ${currentPage}`);

      const hasNext = await this.goToNextPage();
      if (!hasNext) break;

      currentPage++;
      await this.page.waitForTimeout(3000);
    }

    // Deduplicar
    const unique = Array.from(new Map(allPatents.map(p => [p.publicationNumber, p])).values());

    if (unique.length === 0) {
      console.log('⚠️ No unique patents found after pagination.');
      return [{
        publicationNumber: 'NO_RESULTS',
        title: 'No patents found',
        abstract: 'PatentScope returned no results',
        source: 'PatentScope'
      }];
    }

    console.log(`✅ Total unique patents extracted: ${unique.length}`);
    return unique;
  }
