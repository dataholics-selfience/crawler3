async extractResults() {
  console.log('Extracting PatentScope results...');
  
  const patents = await this.page.evaluate(() => {
    const results = [];
    const allElements = document.querySelectorAll('div, span, td');
    const seenNumbers = new Map();
    
    for (const element of allElements) {
      const text = element.textContent || '';
      const patentMatch = text.match(/\b(WO|US|EP|CN|JP|KR|BR)\s*\d{4}[\/\s]\d+/i);
      
      if (patentMatch && text.length > 50 && text.length < 2000) {
        const number = patentMatch[0].trim();
        
        // Deduplica: só adiciona se não viu ou se texto é maior
        if (!seenNumbers.has(number) || text.length > seenNumbers.get(number).length) {
          const lines = text.split('\n').filter(line => line.trim().length > 10);
          
          if (lines.length > 0 && !text.includes('Download')) {
            seenNumbers.set(number, {
              publicationNumber: number,
              title: lines[0].substring(0, 200).trim(),
              abstract: text.substring(0, 500).trim(),
              source: 'PatentScope'
            });
          }
        }
      }
    }
    
    return Array.from(seenNumbers.values());
  });
  
  if (patents.length === 0) {
    return [{
      publicationNumber: 'NO_RESULTS',
      title: 'No patents found',
      abstract: 'PatentScope returned no results',
      source: 'PatentScope'
    }];
  }
  
  console.log(`Extracted ${patents.length} unique patents`);
  return patents;
}
