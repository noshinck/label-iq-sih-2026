const db = require('./database');

const fieldQueries = {
  product_name: 'common generic commodity name declaration packaged commodity',
  manufacturer: 'manufacturer packer importer name address declaration packaged commodity',
  packer: 'packer manufacturer importer name address declaration packaged commodity',
  importer: 'importer manufacturer packer name address declaration packaged commodity',
  address: 'manufacturer packer importer address declaration',
  country_of_origin: 'country of origin imported package declaration',
  net_quantity: 'net quantity quantity declaration standard unit',
  mrp: 'retail sale price mrp maximum retail price inclusive taxes declaration',
  date_declaration: 'month year manufacture packing import date declaration',
  best_before: 'best before use by expiry declaration',
  use_by: 'best before use by expiry declaration',
  consumer_care: 'consumer complaint care telephone email address declaration',
  dimensions: 'dimensions size declaration packaged commodity',
  unit_sale_price: 'unit sale price unit price declaration',
  readability: 'legibility prominence contrast readability declaration',
  placement: 'placement principal display panel declaration',
  standard_units: 'standard units weights measures national standards'
};

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
}

function scoreChunk(chunk, query) {
  const haystack = `${chunk.topic || ''} ${chunk.rule || ''} ${chunk.section || ''} ${chunk.text || ''}`.toLowerCase();
  const terms = [...new Set(tokenize(query))];
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

async function getActiveRuleVersion() {
  const versions = await db.list('rule_versions');
  return versions
    .filter((version) => version.status === 'ACTIVE')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
}

async function retrieveForField(field, declarations, limit = 3) {
  const activeVersion = await getActiveRuleVersion();
  const chunks = await db.list('rule_chunks');
  const usableChunks = activeVersion
    ? chunks.filter((chunk) => chunk.rule_version_id === activeVersion.id)
    : chunks;

  if (!usableChunks.length) {
    return {
      field,
      sourceAvailable: false,
      reason: 'Source support unavailable - officer verification required.',
      contexts: []
    };
  }

  const query = [
    fieldQueries[field] || field,
    declarations[field],
    declarations.product_name,
    declarations.brand,
    declarations.other_declarations
  ]
    .flat()
    .filter(Boolean)
    .join(' ');

  const contexts = usableChunks
    .map((chunk) => ({ ...chunk, score: scoreChunk(chunk, query) }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    field,
    sourceAvailable: contexts.length > 0,
    reason: contexts.length > 0 ? null : 'Source support unavailable - officer verification required.',
    contexts
  };
}

async function retrieveLegalContext(declarations, fields = Object.keys(fieldQueries)) {
  const activeVersion = await getActiveRuleVersion();
  const fieldContexts = {};

  for (const field of fields) {
    fieldContexts[field] = await retrieveForField(field, declarations);
  }

  const contexts = Object.values(fieldContexts)
    .flatMap((item) => item.contexts)
    .filter((context, index, array) => array.findIndex((item) => item.id === context.id) === index)
    .sort((a, b) => b.score - a.score);

  return {
    sourceDocumentsFound: contexts.length > 0,
    ruleVersion: activeVersion,
    fieldContexts,
    contexts
  };
}

module.exports = {
  retrieveLegalContext,
  retrieveForField
};
