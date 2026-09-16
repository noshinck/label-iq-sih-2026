const requiredChecks = [
  {
    field: 'product_name',
    label: 'Commodity name',
    rule: 'Legal Metrology (Packaged Commodities) Rules, 2011 - mandatory declaration screening',
    required: true
  },
  {
    field: 'manufacturer',
    label: 'Manufacturer / packer / importer declaration',
    rule: 'Legal Metrology (Packaged Commodities) Rules, 2011 - manufacturer/packer/importer declaration screening',
    required: true,
    anyOf: ['manufacturer', 'packer', 'importer']
  },
  {
    field: 'net_quantity',
    label: 'Net quantity',
    rule: 'Legal Metrology (Packaged Commodities) Rules, 2011 - quantity declaration screening',
    required: true
  },
  {
    field: 'mrp',
    label: 'MRP',
    rule: 'Legal Metrology (Packaged Commodities) Rules, 2011 - retail sale price declaration screening',
    required: true
  },
  {
    field: 'date_declaration',
    label: 'Date declaration',
    rule: 'Legal Metrology (Packaged Commodities) Rules, 2011 - manufacture/packing/import month-year declaration screening',
    required: true
  },
  {
    field: 'consumer_care',
    label: 'Consumer care',
    rule: 'Legal Metrology (Packaged Commodities) Rules, 2011 - consumer care declaration screening',
    required: true
  },
  {
    field: 'country_of_origin',
    label: 'Country of origin',
    rule: 'Legal Metrology (Packaged Commodities) Rules, 2011 - imported package declaration screening',
    required: false,
    applicableWhen: (declarations) => Boolean(declarations.importer)
  },
  {
    field: 'best_before',
    label: 'Best before / use by',
    rule: 'Legal Metrology (Packaged Commodities) Rules, 2011 - shelf-life declaration screening where applicable',
    required: false,
    applicableWhen: (declarations) => /food|edible|cream|medicine|medical|cosmetic/i.test(JSON.stringify(declarations))
  },
  {
    field: 'unit_sale_price',
    label: 'Unit sale price',
    rule: 'Legal Metrology (Packaged Commodities) Rules, 2011 - unit sale price screening where applicable',
    required: false,
    applicableWhen: (declarations) => Boolean(declarations.net_quantity && declarations.mrp)
  }
];

function findEvidenceForField(field, value, ocrImages) {
  if (!value || Array.isArray(value)) return null;
  const needle = String(value).toLowerCase();

  for (const image of ocrImages) {
    const line = image.lines.find((item) => {
      const text = item.text.toLowerCase();
      return text.includes(needle) || needle.includes(text);
    });

    if (line) {
      return {
        field,
        imagePath: image.path,
        text: line.text,
        confidence: line.confidence,
        box: line.box,
        bounds: line.bounds
      };
    }
  }

  return null;
}

function runRuleEngine({ declarations, ocrImages, legalContext }) {
  const checks = [];
  const evidence = [];

  for (const check of requiredChecks) {
    const applicable = check.applicableWhen ? check.applicableWhen(declarations) : true;
    if (!applicable) continue;
    const sourceContext = legalContext?.fieldContexts?.[check.field];
    const source = sourceContext?.contexts?.[0] || null;
    const hasSourceSupport = Boolean(source);
    const sourceUnavailable = 'Source support unavailable - officer verification required.';

    const value = check.anyOf
      ? check.anyOf.map((field) => declarations[field]).find(Boolean)
      : declarations[check.field];

    const matchedEvidence = findEvidenceForField(check.field, value, ocrImages);
    if (matchedEvidence) evidence.push(matchedEvidence);

    if (value) {
      checks.push({
        field: check.field,
        label: check.label,
        status: matchedEvidence && hasSourceSupport ? 'passed' : 'needs_verification',
        what: `${check.label} detected`,
        why: hasSourceSupport
          ? (matchedEvidence ? 'Detected in OCR text with image evidence and matched to ingested legal source context.' : 'Detected by extraction but OCR evidence line could not be matched exactly.')
          : sourceUnavailable,
        rule: source?.rule || source?.section || check.rule,
        source: source?.document_name || null,
        page: source?.page || null,
        legal_source_text: source?.text || null,
        applicability_reason: hasSourceSupport
          ? `Relevant legal context retrieved for ${check.label}.`
          : sourceUnavailable,
        confidence: matchedEvidence ? matchedEvidence.confidence : 0.55,
        evidence: matchedEvidence
      });
    } else {
      checks.push({
        field: check.field,
        label: check.label,
        status: check.required && hasSourceSupport ? 'potential_non_compliance' : 'needs_verification',
        what: `${check.label} not detected`,
        why: hasSourceSupport
          ? 'The declaration was not found in the combined OCR text from uploaded product images.'
          : sourceUnavailable,
        rule: source?.rule || source?.section || check.rule,
        source: source?.document_name || null,
        page: source?.page || null,
        legal_source_text: source?.text || null,
        applicability_reason: hasSourceSupport
          ? `Relevant legal context retrieved for ${check.label}.`
          : sourceUnavailable,
        confidence: 0.7,
        evidence: null
      });
    }
  }

  const readabilitySource = legalContext?.fieldContexts?.readability;
  const readabilityHasSource = Boolean(readabilitySource?.contexts?.length);
  checks.push({
    field: 'readability',
    label: 'Legibility / readability screening',
    status: readabilityHasSource && !ocrImages.some((image) => image.averageConfidence < 0.65) ? 'passed' : 'needs_verification',
    what: 'OCR confidence screening',
    why: readabilityHasSource
      ? 'OCR confidence is used as a screening signal. Physical letter size and contrast still require officer verification from the package or calibrated image.'
      : 'Source support unavailable - officer verification required.',
    rule: readabilitySource?.contexts?.[0]?.rule || readabilitySource?.contexts?.[0]?.section || 'Legal Metrology declaration legibility screening',
    source: readabilitySource?.contexts?.[0]?.document_name || null,
    page: readabilitySource?.contexts?.[0]?.page || null,
    legal_source_text: readabilitySource?.contexts?.[0]?.text || null,
    applicability_reason: readabilityHasSource
      ? 'Relevant legal context retrieved for legibility/readability screening.'
      : 'Source support unavailable - officer verification required.',
    confidence: ocrImages.length
      ? Math.min(...ocrImages.map((image) => image.averageConfidence || 0))
      : 0,
    evidence: null
  });

  const issueCount = checks.filter((check) => check.status === 'potential_non_compliance').length;
  const verificationCount = checks.filter((check) => check.status === 'needs_verification').length;
  const overallStatus = issueCount
    ? 'POTENTIAL NON-COMPLIANCE'
    : verificationCount
      ? 'NEEDS VERIFICATION'
      : 'COMPLIANT';

  return {
    overallStatus,
    checks,
    evidence,
    legalContext
  };
}

module.exports = {
  runRuleEngine
};
