const Groq = require('groq-sdk');

class GroqParser {
  constructor() {
    this.client = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });
  }

  async askGroq(prompt) {
    try {
      const completion = await this.client.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: 'You are an expert at analyzing HTML and extracting structured data. You ONLY return valid JSON, never markdown or explanations.'
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

      return completion.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('Groq API error:', error.message);
      throw error;
    }
  }
}

module.exports = GroqParser;
