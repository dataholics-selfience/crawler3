async searchPatents(medicine) {
    console.log('🔍 Starting INPI patent search for:', medicine);
    const page = await this.browser.newPage();
    
    // Timeout global para toda a operação
    const timeout = setTimeout(() => {
      console.log('⏱️ Global timeout reached - closing page');
      page.close().catch(() => {});
    }, 45000); // 45 segundos no máximo
    
    try {
      // Desabilitar imagens e recursos desnecessários para acelerar
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if(['image', 'stylesheet', 'font'].includes(req.resourceType())){
          req.abort();
        } else {
          req.continue();
        }
      });
      
      const searchUrl = 'https://busca.inpi.gov.br/pePI/jsp/patentes/PatenteSearchBasico.jsp';
      console.log('📡 Navigating to INPI...');
      
      await page.goto(searchUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      });
      
      console.log('✅ Page loaded:', page.url());
      await page.waitForTimeout(2000);
      
      // Verificar se é página de login
      const content = await page.content();
      if (content.includes('Login:') && content.includes('Senha:')) {
        console.log('❌ Login page detected');
        throw new Error('INPI requires authentication');
      }
      
      // Buscar campo de entrada de forma simples
      console.log('🔍 Looking for search input...');
      const inputFound = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
        const searchInput = inputs.find(input => {
          const name = (input.name || '').toLowerCase();
          const id = (input.id || '').toLowerCase();
          return !name.includes('login') && !name.includes('senha') && !name.includes('password');
        });
        
        if (searchInput) {
          searchInput.focus();
          return true;
        }
        return false;
      });
      
      if (!inputFound) {
        throw new Error('Search input not found');
      }
      
      console.log('⌨️ Typing search term...');
      await page.keyboard.type(medicine, { delay: 50 });
      await page.waitForTimeout(500);
      
      console.log('🔘 Looking for submit button...');
      const buttonClicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('input[type="submit"], button[type="submit"]'));
        const searchButton = buttons.find(btn => {
          const value = (btn.value || btn.textContent || '').toLowerCase();
          return !value.includes('entrar') && !value.includes('login');
        });
        
        if (searchButton) {
          searchButton.click();
          return true;
        }
        return false;
      });
      
      if (!buttonClicked) {
        throw new Error('Submit button not found');
      }
      
      console.log('⏳ Waiting for results...');
      await page.waitForNavigation({ 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      }).catch(() => console.log('Navigation timeout - continuing anyway'));
      
      await page.waitForTimeout(2000);
      
      console.log('📊 Extracting results...');
      const patents = await page.evaluate(() => {
        const results = [];
        const rows = document.querySelectorAll('table tr');
        
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 3) {
            const text = row.innerText || '';
            if (!text.includes('Login:') && !text.includes('Senha:') && text.trim()) {
              results.push({
                processNumber: cells[0]?.innerText?.trim() || '',
                title: cells[1]?.innerText?.trim() || '',
                depositDate: cells[2]?.innerText?.trim() || '',
                fullText: text.trim()
              });
            }
          }
        });
        
        return results;
      });
      
      console.log('✅ Found', patents.length, 'patents');
      clearTimeout(timeout);
      
      return patents.map(p => ({
        ...p,
        source: 'INPI'
      }));
      
    } catch (error) {
      clearTimeout(timeout);
      console.error('❌ INPI search error:', error.message);
      throw error;
    } finally {
      await page.close().catch(() => {});
      console.log('🔒 Page closed');
    }
  }
