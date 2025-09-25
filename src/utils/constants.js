module.exports = {
  PATENT_STATUS: {
    PENDING: 'pending',
    GRANTED: 'granted',
    REJECTED: 'rejected',
    EXTINCT: 'extinct',
    SHELVED: 'shelved'
  },
  
  PATENT_TYPES: {
    INVENTION: 'invention',
    UTILITY_MODEL: 'utility_model'
  },
  
  IPC_SECTIONS: {
    A: 'Human Necessities',
    B: 'Performing Operations; Transporting', 
    C: 'Chemistry; Metallurgy',
    D: 'Textiles; Paper',
    E: 'Fixed Constructions',
    F: 'Mechanical Engineering; Lighting; Heating; Weapons; Blasting',
    G: 'Physics',
    H: 'Electricity'
  },
  
  API_RESPONSES: {
    SUCCESS: 'success',
    ERROR: 'error',
    TIMEOUT: 'timeout',
    RATE_LIMITED: 'rate_limited'
  },
  
  GROQ_MODELS: {
    STRUCTURED: 'llama-3.3-70b-versatile',
    TEXT_PROCESSING: 'llama-3.1-70b-versatile'
  }
};
