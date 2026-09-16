const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const OpenAI = require('openai');
const db = require('./database');
const config = require('./config');

const legalDocsDir = path.join(__dirname, '..', '..', 'legal-documents');

function inferSourceType(fileName) {
  const name = fileName.toLowerCase();
  if (name.includes('packaged') || name.includes('commodit')) return 'PACKAGED_COMMODITIES_RULES';
  if (name.includes('standard')) return 'STANDARDS';
  if (name.includes('act')) return 'ACT';
  return 'UNKNOWN';
}

function detectSection(text) {
  const rule = text.match(/\bRule\s+(\d+[A-Z]?)\b/i);
  if (rule) return { rule: `Rule ${rule[1]}`, section: null };

  const section = text.match(/\bSection\s+(\d+[A-Z]?)\b/i);
  if (section) return { rule: null, section: `Section ${section[1]}` };

  const numbered = text.match(/^\s*(\d+[A-Z]?)\.\s+([^\n]{3,120})/i);
  if (numbered) return { rule: `Rule ${numbered[1]}`, section: null };

  return { rule: null, section: null };
}

function detectTopic(text) {
  const value = text.toLowerCase();
  const topics = [
    ['mrp', ['retail sale price', 'mrp', 'maximum retail price']],
    ['net_quantity', ['net quantity', 'quantity']],
    ['manufacturer_packer_importer', ['manufacturer', 'packer', 'importer']],
    ['country_of_origin', ['country of origin', 'origin']],
    ['date_declaration', ['month and year', 'manufacture', 'packing', 'import']],
    ['consumer_care', ['consumer', 'complaint', 'telephone', 'email']],
    ['legibility', ['legible', 'prominent', 'contrast', 'readable']],
    ['principal_display_panel', ['principal display panel', 'display panel']],
    ['unit_sale_price', ['unit sale price', 'unit price']],
    ['standard_units', ['standard unit', 'metric', 'kilogram', 'metre', 'litre']]
  ];

  const matched = topics.find(([, terms]) => terms.some((term) => value.includes(term)));
  return matched ? matched[0] : 'general';
}

function chunkPage(pageText, maxChars = 1800) {
  const paragraphs = pageText
    .split(/\n{2,}|(?=\n\s*(?:Rule|Section)\s+\d+)/i)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const chunks = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if (`${current} ${paragraph}`.trim().length > maxChars && current) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current = `${current} ${paragraph}`.trim();
    }
  }

  if (current) chunks.push(current.trim());
  return chunks;
}

function extractPdf(pdfPath) {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, '..', '..', 'scripts', 'extract_pdf_text.py');
    const child = execFile(config.ocr.python, [script, pdfPath]);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr || stdout || `PDF extraction failed with code ${code}`));
      const parsed = JSON.parse(stdout.trim());
      if (!parsed.ok) return reject(new Error(parsed.error || 'PDF extraction failed.'));
      return resolve(parsed);
    });
  });
}

async function embedText(text) {
  if (!config.ai.openaiApiKey) {
    return { embedding: null, provider: null, status: 'OpenAI embedding provider not configured.' };
  }

  const client = new OpenAI({ apiKey: config.ai.openaiApiKey });
  const response = await client.embeddings.create({
    model: config.ai.embeddingModel,
    input: text.slice(0, 7000)
  });

  return {
    embedding: response.data[0].embedding,
    provider: config.ai.embeddingModel,
    status: 'embedded'
  };
}

async function ingestLegalDocuments({ directory = legalDocsDir, actor = null } = {}) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  const files = fs
    .readdirSync(directory)
    .filter((file) => /\.(pdf|txt|md)$/i.test(file))
    .map((file) => path.join(directory, file));

  if (!files.length) {
    return {
      ok: false,
      message: `No legal source documents found in ${directory}. Add the three Legal Metrology source PDFs and run npm run ingest:legal.`,
      documents: 0,
      chunks: 0
    };
  }

  const existingVersions = await db.list('rule_versions');
  for (const existing of existingVersions.filter((item) => item.status === 'ACTIVE')) {
    await db.update('rule_versions', existing.id, { status: 'INACTIVE' });
  }

  const version = await db.insert('rule_versions', {
    version: `legal-${new Date().toISOString()}`,
    source: 'legal-documents',
    status: 'ACTIVE',
    effective_date: new Date().toISOString().slice(0, 10)
  });

  let chunkCount = 0;
  const documents = [];

  for (const filePath of files) {
    const fileName = path.basename(filePath);
    const sourceType = inferSourceType(fileName);
    const pages = /\.pdf$/i.test(fileName)
      ? (await extractPdf(filePath)).pages
      : [{ page: 1, text: fs.readFileSync(filePath, 'utf8') }];

    documents.push(fileName);

    for (const page of pages) {
      for (const text of chunkPage(page.text)) {
        const { rule, section } = detectSection(text);
        const topic = detectTopic(text);
        const embedding = await embedText(text);
        await db.insert('rule_chunks', {
          rule_version_id: version.id,
          document_name: fileName,
          source: sourceType,
          section,
          rule,
          topic,
          page: page.page,
          version: version.version,
          effective_date: version.effective_date,
          text,
          embedding: embedding.embedding,
          embedding_provider: embedding.provider,
          embedding_status: embedding.status
        });
        chunkCount += 1;
      }
    }
  }

  await db.audit('legal_documents.ingested', actor, {
    rule_version_id: version.id,
    documents,
    chunks: chunkCount
  });

  return {
    ok: true,
    ruleVersion: version.version,
    documents: documents.length,
    chunks: chunkCount,
    embeddings: config.ai.openaiApiKey ? 'created' : 'skipped - OpenAI embedding provider not configured'
  };
}

module.exports = {
  legalDocsDir,
  ingestLegalDocuments
};
