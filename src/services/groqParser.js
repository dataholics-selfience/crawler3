const Groq = require('groq-sdk');

class GroqParser {
  constructor() {
    this.client = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });
  }

  async parsePatentHTML(html, searchTerm) {
    console.log('🤖 Using Groq to parse HTML intelligently...');
    
    try {
      const prompt = `You are an expert at parsing HTML from the INPI (Instituto Nacional da Propriedade Industrial) Brazilian patent database.

TASK: Extract patent information from the HTML provided below and return ONLY a valid JSON array.

SEARCH TERM: "${searchTerm}"

IMPORTANT INSTRUCTIONS:
1. Extract ALL patents found in the HTML
2. For each patent, extract:
   - processNumber (número do processo/pedido)
   - title (título da patente)
   - depositDate (data de depósito)
   - applicant (depositante/requerente)
   - ipc (classificação IPC se disponível)
   - abstract (resumo se disponível)
   
3. Return ONLY a JSON array, no markdown, no explanation
4. If a field is not found, use empty string ""
5. Filter out any login/authentication fields
6. Adapt to any HTML structure changes - be flexible

EXPECTED OUTPUT FORMAT:
[
  {
    "processNumber": "BR...",
    "title": "...",
    "depositDate": "DD/MM/YYYY",
    "applicant": "...",
    "ipc": "...",
    "abstract": "...",
    "source": "INPI"
  }
]

HTML CONTENT TO PARSE:
${html}

Remember: Return ONLY the JSON array, nothing else.`;

      const completion = await this.client.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a JSON extraction expert. You ONLY output valid JSON arrays, never markdown or explanations.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.1,
        max_tokens: 4000
      });

      const responseText = completion.choices[0]?.message?.content || '[]';
      console.log('📝 Groq response:', responseText.substring(0, 200) + '...');
      
      // Limpar possível markdown
      let cleanJson = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      // Tentar parsear
      const patents = JSON.parse(cleanJson);
      
      if (!Array.isArray(patents)) {
        throw new Error('Groq did not return an array');
      }
      
      console.log('✅ Groq parsed', patents.length, 'patents');
      return patents;
      
    } catch (error) {
      console.error('❌ Groq parsing error:', error.message);
      console.error('   Falling back to traditional parsing...');
      return null; // Retorna null para fallback
    }
  }

  async enhancePatentData(patents) {
    console.log('🤖 Using Groq to enhance patent data...');
    
    try {
      const prompt = `Analyze these patent records and enhance them with additional insights:

${JSON.stringify(patents, null, 2)}

For each patent:
1. Identify the main technology category
2. Extract key technical terms
3. Provide a brief relevance score (1-10) for pharmaceutical/medical applications
4. Identify if it's related to specific therapeutic areas

Return the same structure with additional fields:
- category: string
- keyTerms: string[]
- relevanceScore: number
- therapeuticArea: string

Return ONLY valid JSON array, no markdown.`;

      const completion = await this.client.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are a patent analysis expert. Return only valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3,
        max_tokens: 4000
      });

      const responseText = completion.choices[0]?.message?.content || '[]';
      
      let cleanJson = responseText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      const enhanced = JSON.parse(cleanJson);
      
      console.log('✅ Groq enhanced', enhanced.length, 'patents');
      return enhanced;
      
    } catch (error) {
      console.error('❌ Groq enhancement error:', error.message);
      return patents; // Retorna dados originais se falhar
    }
  }
}

module.exports = GroqParser;
