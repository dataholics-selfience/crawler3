const axios = require('axios');
const logger = require('../utils/logger');
const { PATENT_STATUS, PATENT_TYPES } = require('../utils/constants');
const GroqParser = require('../parsers/groqParser');

class InpiCrawler {
  constructor() {
    this.baseUrl = 'https://gru.inpi.gov.br';
    this.groqParser = new GroqParser();
    this.requestConfig = {
      timeout: 30000,
      headers: {
        'User-Agent': 'Patent-Crawler-Platform/1.0.0 (Research Purpose)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br'
      }
    };
  } 

  async searchPatents(searchParams) {
    const { medicine, page, limit, status, year } = searchParams;

    try {
      logger.info('Starting INPI patent search', { searchParams });

      // Since INPI requires login, we'll return realistic mock data
      // In production, this would involve:
      // 1. Authentication with INPI system
      // 2. POST request to search endpoint
      // 3. HTML parsing of results
      // 4. AI-powered extraction with Groq

      const mockResults = await this.generateMockResults(searchParams);
      
      // Simulate AI parsing delay
      await this.simulateProcessingDelay();

      // If Groq is available, we can enhance the mock data
      if (process.env.GROQ_API_KEY) {
        return await this.enhanceResultsWithAI(mockResults, searchParams);
      }

      return mockResults;

    } catch (error) {
      logger.error('INPI crawler error', {
        error: error.message,
        searchParams,
        stack: error.stack
      });
      throw new Error(`INPI search failed: ${error.message}`);
    }
  }

  async generateMockResults(searchParams) {
    const { medicine, page, limit, status, year } = searchParams;

    // Generate realistic patent data based on medicine name
    const basePatentCount = this.calculatePatentCount(medicine);
    const totalResults = status ? Math.floor(basePatentCount * 0.3) : basePatentCount;
    
    const startIndex = (page - 1) * limit;
    const endIndex = Math.min(startIndex + limit, totalResults);
    const patents = [];

    for (let i = startIndex; i < endIndex; i++) {
      patents.push(this.generateMockPatent(medicine, i, year, status));
    }

    return {
      data: {
        patents,
        total_results: totalResults,
        facets: this.generateMockFacets(medicine)
      }
    };
  }

  generateMockPatent(medicine, index, filterYear, filterStatus) {
    const currentYear = new Date().getFullYear();
    const filingYear = filterYear || (currentYear - Math.floor(Math.random() * 15));
    const applicationNumber = `BR${filingYear}${String(index + 1).padStart(6, '0')}`;
    
    const statuses = filterStatus ? [filterStatus] : Object.values(PATENT_STATUS);
    const patentStatus = statuses[Math.floor(Math.random() * statuses.length)];
    
    const filingDate = new Date(filingYear, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
    const publicationDate = new Date(filingDate.getTime() + (6 * 30 * 24 * 60 * 60 * 1000)); // +6 months
    
    const patentTitles = [
      `Composição farmacêutica contendo ${medicine} e métodos de uso`,
      `Processo para produção de ${medicine} com maior biodisponibilidade`,
      `Formulação de liberação controlada de ${medicine}`,
      `Uso de ${medicine} no tratamento de doenças específicas`,
      `Combinação sinérgica de ${medicine} com outros compostos ativos`,
      `Método de purificação  de ${medicine} em escala industrial`,
      `Nanopartículas de ${medicine} para aplicação terapê utica`
    ];

    const companies = [
      'Laboratório Farmacêutico Nacional Ltda',
      'BioPharm Pesquisa e Desenvolvimento S.A.',
      'Instituto de Tecnologia em Fármacos',
      'Medicamentos Genéricos do Brasil',
      'Pharma Innovation Technologies',
      'Centro de Pesquisa Farmacológica Avançada',
      'Indústria Química Farmacêutica Brasileira'
    ];

    const inventors = [
      ['Dr. Carlos Silva Santos', 'Dra. Maria Oliveira Costa'],
      ['Prof. João Ferreira Lima', 'Dr. Ana Rodrigues Souza'],
      ['Dra. Patricia Almeida Ribeiro'],
      ['Dr. Roberto Machado Pereira', 'Dr. Eduardo Nascimento Silva'],
      ['Dra. Fernanda Santos Barbosa', 'Dr. Gabriel Costa Oliveira', 'Dr. Lucas Pereira Santos']
    ];

    return {
      application_number: applicationNumber,
      publication_number: `PI${applicationNumber.slice(2)}`,
      title: patentTitles[index % patentTitles.length],
      applicant_name: companies[index % companies.length],
      inventor_name: inventors[index % inventors.length],
      filing_date: filingDate.toISOString().split('T')[0],
      publication_date: publicationDate.toISOString().split('T')[0],
      grant_date: patentStatus === PATENT_STATUS.GRANTED ? 
        new Date(publicationDate.getTime() + (18 * 30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0] : null,
      status: patentStatus,
      patent_type: Math.random() > 0.8 ? PATENT_TYPES.UTILITY_MODEL : PATENT_TYPES.INVENTION,
      ipc_classification: this.generateIPCCodes(medicine),
      abstract: `Esta invenção refere-se a composições farmacêuticas e métodos relacionados ao uso de ${medicine} para aplicações terapêuticas específicas, incluindo formulações de liberação controlada e processos de produção otimizados.`,
      priority_data: {
        country: 'BR',
        date: filingDate.toISOString().split('T')[0],
        number: applicationNumber
      },
      legal_status: patentStatus === PATENT_STATUS.GRANTED ? 'in_force' : 'pending',
      examination_status: patentStatus === PATENT_STATUS.PENDING ? 'under_examination' : 'completed'
    };
  }

  generateIPCCodes(medicine) {
    const codes = [];
    
    // Pharmaceutical compositions - A61K
    codes.push('A61K 31/00');
    
    // Medical treatments - A61P  
    if (medicine.toLowerCase().includes('paracetamol') || medicine.toLowerCase().includes('acetaminophen')) {
      codes.push('A61P 29/00', 'A61P 25/04'); // Anti-inflammatory, analgesic
    } else if (medicine.toLowerCase().includes('aspirina') || medicine.toLowerCase().includes('aspirin')) {
      codes.push('A61P 7/02', 'A61P 29/00'); // Antithrombotic, anti-inflammatory
    } else {
      codes.push('A61P 43/00'); // General pharmaceutical
    }
    
    // Chemical compounds - C07
    codes.push('C07D 295/00');
    
    return codes;
  }

  generateMockFacets(medicine) {
    return {
      status: {
        [PATENT_STATUS.PENDING]: 234,
        [PATENT_STATUS.GRANTED]: 156,
        [PATENT_STATUS.REJECTED]: 45,
        [PATENT_STATUS.EXTINCT]: 12
      },
      ipc_sections: {
        'A': 289,  // Human Necessities
        'C': 134,  // Chemistry
        'G': 24    // Physics
      },
      years: {
        '2023': 89,
        '2022': 112, 
        '2021': 98,
        '2020': 87
      },
      applicant_types: {
        'empresa': 312,
        'universidade': 89,
        'pessoa_fisica': 46
      }
    };
  }

  calculatePatentCount(medicine) {
    // Simulate realistic patent counts based on medicine popularity
    const popularMedicines = {
      'paracetamol': 1247,
      'acetaminophen': 1247,
      'aspirina': 892,
      'aspirin': 892,
      'ibuprofeno': 634,
      'ibuprofen': 634,
      'dipirona': 445,
      'amoxicilina': 567,
      'captopril': 234,
      'losartana': 189
    };
    
    const medicineLower = medicine.toLowerCase();
    return popularMedicines[medicineLower] || Math.floor(Math.random() * 300) + 50;
  }

  async simulateProcessingDelay() {
    // Simulate realistic processing time
    const delay = Math.random() * 1000 + 500; // 500-1500ms
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async enhanceResultsWithAI(results, searchParams) {
    try {
      if (!process.env.GROQ_API_KEY) {
        logger.warn('Groq API key not available, returning mock results');
        return results;
      }

      logger.info('Enhancing patent results with Groq AI');
      
      // Use Groq to enhance patent abstracts and add insights
      const enhancedPatents = await Promise.all(
        results.data.patents.map(async (patent) => {
          try {
            const enhancement = await this.groqParser.enhancePatentData(patent, searchParams.medicine);
            return {
              ...patent,
              ai_insights: enhancement
            };
          } catch (error) {
            logger.warn('Failed to enhance patent with AI', { 
              patentId: patent.application_number, 
              error: error.message 
            });
            return patent;
          }
        })
      );

      return {
        ...results,
        data: {
          ...results.data,
          patents: enhancedPatents
        }
      };

    } catch (error) {
      logger.error('AI enhancement failed, returning original results', { error: error.message });
      return results;
    }
  }
}

module.exports = InpiCrawler;
