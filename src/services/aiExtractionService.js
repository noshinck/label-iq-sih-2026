const OpenAI = require('openai');
const config = require('./config');

const declarationFields = [
  'product_name',
  'brand',
  'manufacturer',
  'packer',
  'importer',
  'address',
  'country_of_origin',
  'net_quantity',
  'mrp',
  'date_declaration',
  'consumer_care',
  'best_before',
  'use_by',
  'dimensions',
  'unit_sale_price',
  'other_declarations'
];

function emptyDeclarations() {
  return Object.fromEntries(declarationFields.map((field) => [field, null]));
}

function localExtract(ocrText) {
  const data = emptyDeclarations();
  const text = ocrText.replace(/\r/g, '');

  const patterns = {
    mrp: /(?:MRP|M\.R\.P|Maximum Retail Price)\s*[:\-]?\s*(?:Rs\.?|INR|₹)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    net_quantity: /(?:Net\s*(?:Qty|Quantity|Wt\.?|Weight)|Quantity)\s*[:\-]?\s*([0-9.]+\s*(?:g|gram|kg|ml|l|litre|pcs?|units?))/i,
    best_before: /(?:Best\s*Before)\s*[:\-]?\s*([^\n]+)/i,
    use_by: /(?:Use\s*By|Expiry|EXP)\s*[:\-]?\s*([^\n]+)/i,
    consumer_care: /(?:Consumer\s*Care|Customer\s*Care|For complaints|Contact)\s*[:\-]?\s*([^\n]+)/i,
    manufacturer: /(?:Manufactured\s*by|Mfg\.?\s*by|Manufacturer)\s*[:\-]?\s*([^\n]+)/i,
    packer: /(?:Packed\s*by|Packer)\s*[:\-]?\s*([^\n]+)/i,
    importer: /(?:Imported\s*by|Importer)\s*[:\-]?\s*([^\n]+)/i,
    country_of_origin: /(?:Country\s*of\s*Origin|Origin)\s*[:\-]?\s*([^\n]+)/i,
    date_declaration: /(?:Mfg\.?\s*Date|Manufactured\s*on|Packed\s*on|PKD|Date)\s*[:\-]?\s*([^\n]+)/i,
    unit_sale_price: /(?:Unit\s*Sale\s*Price|Unit\s*Price)\s*[:\-]?\s*([^\n]+)/i,
    dimensions: /(?:Dimensions?|Size)\s*[:\-]?\s*([^\n]+)/i
  };

  Object.entries(patterns).forEach(([field, pattern]) => {
    const match = text.match(pattern);
    if (match) data[field] = match[1].trim();
  });

  const firstStrongLine = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length >= 3 && !/mrp|net|mfg|best before|consumer/i.test(line));

  data.product_name = firstStrongLine || null;
  data.other_declarations = text ? text.split('\n').filter(Boolean).slice(0, 20) : [];

  return {
    declarations: data,
    source: 'local-pattern-extractor',
    warning: 'AI API key is not configured, so backend AI extraction could not run. Values were extracted only from OCR text patterns.'
  };
}

function normalizeDeclarations(parsed) {
  const declarations = emptyDeclarations();
  declarationFields.forEach((field) => {
    declarations[field] = Object.prototype.hasOwnProperty.call(parsed, field) ? parsed[field] : null;
  });
  return declarations;
}

async function extractWithOpenAI(ocrText) {
  const client = new OpenAI({ apiKey: config.ai.apiKey });
  const response = await client.chat.completions.create({
    model: config.ai.model,
    temperature: 0,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'Extract packaged commodity declarations from OCR text. Return JSON only. Never invent values. Use null when not detected.'
      },
      {
        role: 'user',
        content: JSON.stringify({
          required_fields: declarationFields,
          ocr_text: ocrText
        })
      }
    ]
  });

  const parsed = JSON.parse(response.choices[0].message.content);

  return {
    declarations: normalizeDeclarations(parsed),
    source: `openai:${config.ai.model}`,
    warning: null
  };
}

async function extractWithGemini(ocrText) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.ai.model)}:generateContent?key=${encodeURIComponent(config.ai.geminiApiKey)}`;
  const prompt = JSON.stringify({
    instruction: 'Extract packaged commodity declarations from OCR text. Return JSON only. Never invent values. Use null when not detected.',
    required_fields: declarationFields,
    ocr_text: ocrText
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  const text = result?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
  if (!text) throw new Error('Gemini API returned no extraction text.');

  const parsed = JSON.parse(text);
  return {
    declarations: normalizeDeclarations(parsed),
    source: `gemini:${config.ai.model}`,
    warning: null
  };
}

async function extractDeclarations(ocrImages) {
  const ocrText = ocrImages.map((image, index) => `IMAGE ${index + 1}\n${image.text}`).join('\n\n');

  if (!config.ai.apiKey && !config.ai.geminiApiKey) {
    return localExtract(ocrText);
  }

  if (config.ai.provider === 'gemini') {
    return extractWithGemini(ocrText);
  }

  return extractWithOpenAI(ocrText);
}

module.exports = {
  declarationFields,
  extractDeclarations
};
