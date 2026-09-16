const OpenAI = require('openai');
const config = require('./config');
const db = require('./database');

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

function scoreChunk(chunk, question) {
  const terms = [...new Set(tokenize(question))];
  const haystack = `${chunk.rule || ''} ${chunk.topic || ''} ${chunk.section || ''} ${chunk.text || ''}`.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

async function getRuleContext(question, limit = 5) {
  const [versions, chunks] = await Promise.all([
    db.list('rule_versions'),
    db.list('rule_chunks')
  ]);

  const activeVersion = versions
    .filter((version) => version.status === 'ACTIVE')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;

  const usableChunks = activeVersion
    ? chunks.filter((chunk) => chunk.rule_version_id === activeVersion.id)
    : chunks;

  return usableChunks
    .map((chunk) => ({ ...chunk, score: scoreChunk(chunk, question) }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((chunk) => ({
      rule: chunk.rule || chunk.section || 'Legal source',
      topic: chunk.topic || 'Legal metrology context',
      source: chunk.source || chunk.document_name,
      page: chunk.page || null,
      text: String(chunk.text || '').slice(0, 900)
    }));
}

function buildPrompt({ question, user, page, contexts }) {
  return [
    'You are PackCheck AI, an in-app assistant for Legal Metrology officers.',
    'Help the user operate this LabelIQ/PackCheck app and understand packaged commodity compliance.',
    'Use the provided legal source context when answering legal questions.',
    'Do not invent legal rules, citations, product facts, inspection results, or database records.',
    'If the answer is not supported by the provided context, say that officer verification or source review is needed.',
    'Keep answers concise and practical. Mention relevant rule/source names when available.',
    '',
    `Current user role: ${user?.role || 'unknown'}`,
    `Current page: ${page || 'unknown'}`,
    '',
    'Relevant legal context:',
    contexts.length ? JSON.stringify(contexts, null, 2) : 'No matching legal context found.',
    '',
    `Question: ${question}`
  ].join('\n');
}

async function askGemini(prompt) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.ai.model)}:generateContent?key=${encodeURIComponent(config.ai.geminiApiKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  return result?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
}

async function askOpenAI(prompt) {
  const client = new OpenAI({ apiKey: config.ai.openaiApiKey });
  const response = await client.chat.completions.create({
    model: config.ai.model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: 'You are PackCheck AI, a concise in-app assistant for Legal Metrology compliance workflows.' },
      { role: 'user', content: prompt }
    ]
  });

  return response.choices[0]?.message?.content?.trim();
}

function fallbackAnswer(question, contexts) {
  if (!contexts.length) {
    return 'I could not find matching legal source context for that question. Please review the source documents or ask about MRP, net quantity, manufacturer/packer/importer declarations, dates, consumer care, unit sale price, evidence, or inspection workflow.';
  }

  const summary = contexts
    .slice(0, 3)
    .map((context) => `${context.rule}: ${context.topic}. ${context.text.slice(0, 180)}${context.text.length > 180 ? '...' : ''}`)
    .join('\n\n');

  return `I found relevant source context for "${question}".\n\n${summary}\n\nAI provider is not configured, so this is a source-context preview rather than a generated answer.`;
}

async function askAssistant({ question, user, page }) {
  const cleanQuestion = String(question || '').trim();
  if (!cleanQuestion) throw new Error('Please enter a question.');
  if (cleanQuestion.length > 1200) throw new Error('Please keep the question under 1200 characters.');

  const contexts = await getRuleContext(cleanQuestion);
  const prompt = buildPrompt({ question: cleanQuestion, user, page, contexts });

  let answer;
  let source = 'local-context';

  if (config.ai.provider === 'gemini' && config.ai.geminiApiKey) {
    answer = await askGemini(prompt);
    source = `gemini:${config.ai.model}`;
  } else if (config.ai.openaiApiKey) {
    answer = await askOpenAI(prompt);
    source = `openai:${config.ai.model}`;
  } else {
    answer = fallbackAnswer(cleanQuestion, contexts);
  }

  return {
    answer: answer || fallbackAnswer(cleanQuestion, contexts),
    source,
    contexts: contexts.map((context) => ({
      rule: context.rule,
      topic: context.topic,
      source: context.source,
      page: context.page
    }))
  };
}

module.exports = {
  askAssistant
};
