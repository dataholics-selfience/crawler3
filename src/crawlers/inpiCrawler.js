// INPI Patents Search
  router.get('/inpi/patents', async (req, res) => {
    console.log('📍 ========================================');
    console.log('📍 INPI route called');
    console.log('📍 Query params:', req.query);
    console.log('📍 ========================================');
    
    const { medicine } = req.query;
    
    if (!medicine) {
      return res.status(400).json({ 
        success: false, 
        error: 'Medicine parameter is required' 
      });
    }

    let crawler = null;

    try {
      console.log('🔍 Initializing INPI crawler for:', medicine);
      
      // Pegar credenciais das variáveis de ambiente
      const credentials = {
        username: process.env.INPI_USERNAME,
        password: process.env.INPI_PASSWORD
      };
      
      if (!credentials.username || !credentials.password) {
        console.warn('⚠️ INPI credentials not found in environment variables');
        return res.status(401).json({
          success: false,
          error: 'INPI credentials not configured',
          message: 'Please set INPI_USERNAME and INPI_PASSWORD environment variables'
        });
      }
      
      console.log('🔐 Using INPI credentials from environment');
      
      crawler = new InpiCrawler(credentials);
      await crawler.initialize();
      console.log('✅ INPI crawler initialized');

      console.log('🔍 Searching INPI patents...');
      const patents = await crawler.searchPatents(medicine);
      console.log('✅ Found', patents.length, 'INPI patents');

      res.json({
        success: true,
        query: medicine,
        source: 'INPI Brazil',
        totalResults: patents.length,
        timestamp: new Date().toISOString(),
        patents
      });
    } catch (error) {
      console.error('❌ INPI crawler error:', error.message);
      console.error('   Stack:', error.stack);
      
      const isAuthError = error.message.includes('authentication') || error.message.includes('login');
      
      res.status(isAuthError ? 401 : 500).json({ 
        success: false, 
        error: 'Failed to fetch INPI patents',
        message: error.message
      });
    } finally {
      if (crawler) {
        await crawler.close();
      }
    }
  });
