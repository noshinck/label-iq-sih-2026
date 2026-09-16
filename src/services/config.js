require('dotenv').config();

const aiProvider = process.env.AI_PROVIDER || (process.env.GEMINI_API_KEY ? 'gemini' : 'openai');

module.exports = {
  ai: {
    provider: aiProvider,
    apiKey: aiProvider === 'gemini' ? process.env.GEMINI_API_KEY || '' : process.env.OPENAI_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
    model: aiProvider === 'gemini' ? process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite' : process.env.OPENAI_MODEL || 'gpt-4o-mini',
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '',
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || ''
  },
  ocr: {
    python: process.env.PYTHON_BIN || 'python3'
  }
};
