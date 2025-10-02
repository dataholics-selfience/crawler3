async searchPatents(medicine) {
    console.log('Starting INPI patent search');
    const page = await this.browser.newPage();
    
    try {
      const searchUrl = 'https://busca.inpi.gov.br/pePI/jsp/patentes/PatenteSearchBasico.jsp';
      console.log('Navigating to:', searchUrl);
      
      // Interceptar logs do console da página
      page.on('console', msg => console.log('PAGE LOG:', msg.text()));
      
      await page.goto(searchUrl, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      console.log('Current URL after navigation:', page.url());
      
      // Verificar se há redirecionamento para login
      if (page.url().includes('login') || page.url().includes('Login')) {
        console.log('⚠️ Detected login page - attempting to bypass');
        // Tentar voltar para a página de busca
        await page.goto(searchUrl, { 
          waitUntil: 'networkidle2',
          timeout: 30000 
        });
      }
      
      // Aguardar o formulário de busca carregar
      await page.waitForTimeout(3000);
      
      // Verificar o HTML da página para debug
      const pageContent = await page.content();
      console.log('Page has login form?', pageContent.includes('Login:') || pageContent.includes('Senha:'));
      
      // Se ainda estiver na página de login, retornar erro específico
      if (pageContent.includes('Login:') && pageContent.includes('Senha:')) {
        throw new Error('INPI site requires authentication. Cannot proceed with search.');
      }
      
      // Tentar diferentes seletores para o campo de busca
      const selectors = [
        'input[name="palavra"]',
        'input[name="Palavra"]',
        'input[id*="palavra"]',
        'input[type="text"][name*="palavra"]',
        'input[type="text"]'
      ];
      
      let searchInput = null;
      let usedSelector = null;
      
      for (const selector of selectors) {
        console.log('Trying selector:', selector);
        searchInput = await page.$(selector);
        if (searchInput) {
          // Verificar se não é um campo de login
          const inputName = await page.evaluate(el => el.name || el.id, searchInput);
          if (!inputName.toLowerCase().includes('login') && 
              !inputName.toLowerCase().includes('senha') && 
              !inputName.toLowerCase().includes('password')) {
            usedSelector = selector;
            console.log('✅ Found search input with selector:', selector);
            break;
          }
        }
      }
      
      if (!searchInput) {
        throw new Error('Search input not found - page may require authentication');
      }
      
      await searchInput.type(medicine, { delay: 100 });
      console.log('Typed search term:', medicine);
      
      // Buscar botão de submit que não seja de login
      const submitButtons = await page.$$('input[type="submit"], button[type="submit"]');
      let searchButton = null;
      
      for (const button of submitButtons) {
        const buttonValue = await page.evaluate(el => 
          el.value || el.innerText || el.textContent, button
        );
        if (buttonValue && !buttonValue.toLowerCase().includes('entrar') && 
            !buttonValue.toLowerCase().includes('login')) {
          searchButton = button;
          console.log('Found search button:', buttonValue);
          break;
        }
      }
      
      if (!searchButton) {
        throw new Error('Search button not found');
      }
      
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        searchButton.click()
      ]);
      
      // Aguardar resultados
      await page.waitForTimeout(3000);
      
      // Verificar se ainda está em página de login após submit
      const finalUrl = page.url();
      console.log('Final URL after search:', finalUrl);
      
      if (finalUrl.includes('login') || finalUrl.includes('Login')) {
        throw new Error('Search redirected to login page - authentication required');
      }
      
      // Extrair resultados
      const patents = await page.evaluate(() => {
        const results = [];
        
        // Tentar diferentes estruturas de tabela
        const tables = document.querySelectorAll('table');
        
        tables.forEach(table => {
          const rows = table.querySelectorAll('tr');
          
          rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 3) {
              const text = row.innerText.trim();
              // Filtrar linhas que parecem ser de login
              if (!text.includes('Login:') && !text.includes('Senha:')) {
                results.push({
                  processNumber: cells[0]?.innerText?.trim() || '',
                  title: cells[1]?.innerText?.trim() || '',
                  depositDate: cells[2]?.innerText?.trim() || '',
                  fullText: text
                });
              }
            }
          });
        });
        
        return results;
      });
      
      console.log('INPI patent search completed. Found', patents.length, 'patents');
      
      return patents.map(p => ({
        ...p,
        source: 'INPI'
      }));
      
    } catch (error) {
      console.error('Error in INPI search:', error.message);
      throw error;
    } finally {
      await page.close();
    }
  }
