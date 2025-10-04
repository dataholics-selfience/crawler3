const Groq = require('groq-sdk');

class GroqParser {
  constructor() {
    this.client = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });
  }

  async askGroq(prompt, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const completion = await this.client.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: 'You are an expert at analyzing HTML and extracting structured data. You ONLY return valid JSON, never markdown or explanations. Be precise and accurate.'
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

        const response = completion.choices[0]?.message?.content || '';
        const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        // Validate JSON
        JSON.parse(cleaned);
        
        return cleaned;
      } catch (error) {
        console.error(`Groq attempt ${attempt + 1} failed:`, error.message);
        if (attempt === retries) {
          console.error('All Groq attempts failed');
          return null;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    return null;
  }

  async detectFields(html, pageType = 'unknown') {
    const prompt = `Analyze this HTML from INPI Brazilian patent office and identify ALL input fields.

HTML:
${html.substring(0, 3000)}

Identify these fields (use actual name/id attributes found in HTML):
1. Login/username field
2. Password field  
3. Search/keyword field (for patent search)
4. Submit button selector

Return ONLY this JSON structure:
{
  "loginField": "exact name attribute",
  "passwordField": "exact name attribute",
  "searchField": "exact name attribute for keyword search",
  "submitSelector": "CSS selector for submit button"
}

Common patterns to look for:
- Login: T_Login, login, usuario, user
- Password: T_Senha, senha, password, pwd
- Search: ExpressaoPesquisa, palavra, resumo, titulo
- Submit: input[type="submit"], button[type="submit"]

Return ONLY valid JSON, no explanations.`;

    try {
      const response = await this.askGroq(prompt);
      if (!response) return null;
      
      const fields = JSON.parse(response);
      
      // Validate fields are not empty
      if (!fields.loginField || !fields.passwordField || !fields.searchField) {
        console.error('Groq returned empty fields');
        return null;
      }
      
      console.log('Groq detected fields:', fields);
      return fields;
    } catch (error) {
      console.error('Groq field detection failed:', error.message);
      return null;
    }
  }

  async extractPatents(tableHtml) {
    const prompt = `Extract ALL patents from this INPI results table.

HTML Table:
${tableHtml.substring(0, 6000)}

Return JSON array with ALL visible patents (skip header row):
[{
  "processNumber": "BR number or empty",
  "title": "patent title/description",
  "depositDate": "deposit date DD/MM/YYYY",
  "applicant": "applicant name if visible",
  "source": "INPI"
}]

Rules:
- Extract EVERY patent row from table
- Skip header rows with words like "Pedido", "Depósito", "Título"
- If field not found use ""
- Return ONLY valid JSON array`;

    try {
      const response = await this.askGroq(prompt);
      if (!response) return null;
      
      const patents = JSON.parse(response);
      
      if (!Array.isArray(patents)) {
        console.error('Groq response is not an array');
        return null;
      }
      
      const filtered = patents.filter(p => 
        p.processNumber && 
        !p.processNumber.toLowerCase().includes('pedido') &&
        p.processNumber.trim() !== ''
      );
      
      console.log(`Groq extracted ${filtered.length} valid patents`);
      return filtered;
    } catch (error) {
      console.error('Groq patent extraction failed:', error.message);
      return null;
    }
  }
}

module.exports = GroqParser;
