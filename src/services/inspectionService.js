const path = require('path');
const db = require('./database');
const { extractDeclarations } = require('./aiExtractionService');
const { retrieveLegalContext } = require('./legalKnowledgeService');
const { runPaddleOcr } = require('./ocrService');
const { runRuleEngine } = require('./ruleEngine');

function publicImagePath(file) {
  return `/uploads/${path.basename(file.path)}`;
}

async function createInspection({ officer, files, imageTypes }) {
  const inspection = await db.insert('inspections', {
    officer_user_id: officer.id,
    status: 'UPLOADED',
    current_step: 'Uploading',
    result_status: null,
    finalized_at: null
  });

  const imageRows = [];
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    imageRows.push(await db.insert('product_images', {
      inspection_id: inspection.id,
      role: imageTypes[index] || 'other',
      original_name: file.originalname,
      mime_type: file.mimetype,
      storage_path: file.path,
      public_path: publicImagePath(file)
    }));
  }

  await db.audit('inspection.created', officer, {
    inspection_id: inspection.id,
    image_count: imageRows.length
  });

  return { inspection, images: imageRows };
}

async function analyzeInspection(inspectionId, officer) {
  await runOcrStage(inspectionId);
  await runExtractionStage(inspectionId);
  await runLegalRetrievalStage(inspectionId);
  await runRuleValidationStage(inspectionId);
  await runEvidenceStage(inspectionId);

  await db.audit('inspection.analyzed', officer, {
    inspection_id: inspectionId,
    result_status: (await getInspectionDetail(inspectionId))?.inspection?.result_status
  });

  return getInspectionDetail(inspectionId);
}

async function runOcrStage(inspectionId) {
  const existing = (await db.list('ocr_results')).find((row) => row.inspection_id === inspectionId);
  if (existing) return existing;

  const images = (await db.list('product_images')).filter((row) => row.inspection_id === inspectionId);
  if (!images.length) throw new Error('No images uploaded for this inspection.');

  await db.update('inspections', inspectionId, { status: 'PROCESSING', current_step: 'OCR' });
  const ocrImages = await runPaddleOcr(images.map((image) => image.storage_path));

  return db.insert('ocr_results', {
    inspection_id: inspectionId,
    engine: 'PaddleOCR',
    images: ocrImages,
    combined_text: ocrImages.map((image) => image.text).join('\n\n')
  });
}

async function runExtractionStage(inspectionId) {
  const existing = (await db.list('extracted_declarations')).find((row) => row.inspection_id === inspectionId);
  if (existing) return existing;

  const ocrRecord = (await db.list('ocr_results')).find((row) => row.inspection_id === inspectionId) || await runOcrStage(inspectionId);
  await db.update('inspections', inspectionId, { status: 'PROCESSING', current_step: 'EXTRACTION' });

  const extraction = await extractDeclarations(ocrRecord.images || []);
  return db.insert('extracted_declarations', {
    inspection_id: inspectionId,
    ocr_result_id: ocrRecord.id,
    source: extraction.source,
    warning: extraction.warning,
    declarations: extraction.declarations,
    officer_corrections: {}
  });
}

async function runLegalRetrievalStage(inspectionId) {
  const declarationRecord = (await db.list('extracted_declarations')).find((row) => row.inspection_id === inspectionId) || await runExtractionStage(inspectionId);
  await db.update('inspections', inspectionId, { status: 'PROCESSING', current_step: 'LEGAL_RETRIEVAL' });

  const legalContext = await retrieveLegalContext(declarationRecord.declarations || {});
  const patch = {};
  if (legalContext.ruleVersion?.id) patch.rule_version_id = legalContext.ruleVersion.id;
  if (Object.keys(patch).length) await db.update('inspections', inspectionId, patch);
  return legalContext;
}

async function runRuleValidationStage(inspectionId) {
  const existingChecks = (await db.list('compliance_checks')).filter((row) => row.inspection_id === inspectionId);
  if (existingChecks.length) return existingChecks;

  const [ocrRecord, declarationRecord, inspection] = await Promise.all([
    db.findOne('ocr_results', (row) => row.inspection_id === inspectionId),
    db.findOne('extracted_declarations', (row) => row.inspection_id === inspectionId),
    db.findOne('inspections', (row) => row.id === inspectionId)
  ]);

  if (!ocrRecord) throw new Error('OCR result is missing.');
  if (!declarationRecord) throw new Error('Extracted declarations are missing.');

  await db.update('inspections', inspectionId, { status: 'PROCESSING', current_step: 'RULE_VALIDATION' });
  const legalContext = inspection?.legal_context || await runLegalRetrievalStage(inspectionId);
  const compliance = runRuleEngine({
    declarations: declarationRecord.declarations || {},
    ocrImages: ocrRecord.images || [],
    legalContext
  });

  const checkRows = [];
  for (const check of compliance.checks) {
    checkRows.push(await db.insert('compliance_checks', {
      inspection_id: inspectionId,
      declaration_id: declarationRecord.id,
      field: check.field,
      label: check.label,
      status: check.status,
      what: check.what,
      why: check.why,
      rule: check.rule,
      source: check.source,
      page: check.page,
      legal_source_text: check.legal_source_text,
      applicability_reason: check.applicability_reason,
      confidence: check.confidence,
      evidence: check.evidence,
      officer_status: null,
      officer_remark: null
    }));
  }

  await db.update('inspections', inspectionId, {
    result_status: compliance.overallStatus
  });
  return checkRows;
}

async function runEvidenceStage(inspectionId) {
  const existingEvidence = (await db.list('evidence')).filter((row) => row.inspection_id === inspectionId);
  if (existingEvidence.length) {
    await db.update('inspections', inspectionId, {
      status: 'ANALYZED',
      current_step: 'Complete'
    });
    return existingEvidence;
  }

  await db.update('inspections', inspectionId, { status: 'PROCESSING', current_step: 'EVIDENCE' });
  const checks = (await db.list('compliance_checks')).filter((row) => row.inspection_id === inspectionId);
  const evidenceRows = [];

  for (const check of checks) {
    const item = check.evidence;
    if (!item) continue;
    evidenceRows.push(await db.insert('evidence', {
      inspection_id: inspectionId,
      field: item.field,
      image_path: item.imagePath,
      public_path: publicImagePath({ path: item.imagePath }),
      text: item.text,
      confidence: item.confidence,
      box: item.box,
      bounds: item.bounds
    }));
  }

  await db.update('inspections', inspectionId, {
    status: 'ANALYZED',
    current_step: 'Complete'
  });
  return evidenceRows;
}

async function getOfficerInspections(officerId) {
  const inspections = await db.list('inspections');
  return inspections
    .filter((inspection) => inspection.officer_user_id === officerId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function getInspectionDetail(inspectionId) {
  const inspection = await db.findOne('inspections', (row) => row.id === inspectionId);
  if (!inspection) return null;

  const [images, ocrResults, declarations, checks, evidence] = await Promise.all([
    db.list('product_images'),
    db.list('ocr_results'),
    db.list('extracted_declarations'),
    db.list('compliance_checks'),
    db.list('evidence')
  ]);

  return {
    inspection,
    images: images.filter((row) => row.inspection_id === inspectionId),
    ocr: ocrResults.find((row) => row.inspection_id === inspectionId) || null,
    declaration: declarations.find((row) => row.inspection_id === inspectionId) || null,
    checks: checks.filter((row) => row.inspection_id === inspectionId),
    evidence: evidence.filter((row) => row.inspection_id === inspectionId)
  };
}

async function verifyCheck({ checkId, officer, status, correctedValue, remark }) {
  const existing = await db.findOne('compliance_checks', (row) => row.id === checkId);
  if (!existing) {
    throw new Error('Inspection check not found. Reopen the inspection and try again.');
  }

  const officerStatus = status || 'needs_verification';
  const updatedCheck = await db.update('compliance_checks', checkId, {
    officer_status: officerStatus,
    officer_corrected_value: correctedValue || null,
    officer_remark: remark || null,
    officer_user_id: officer?.id || null,
    officer_timestamp: new Date().toISOString()
  });

  const check = updatedCheck || {
    ...existing,
    officer_status: officerStatus,
    officer_corrected_value: correctedValue || null,
    officer_remark: remark || null,
    officer_user_id: officer?.id || null,
    officer_timestamp: new Date().toISOString()
  };

  await db.audit('inspection.check_verified', officer, {
    check_id: checkId,
    inspection_id: check.inspection_id,
    officer_status: officerStatus
  });

  return check;
}

async function finalizeInspection(inspectionId, officer) {
  const detail = await getInspectionDetail(inspectionId);
  if (!detail) throw new Error('Inspection not found.');

  await db.insert('reports', {
    inspection_id: inspectionId,
    officer_user_id: officer.id,
    result_status: detail.inspection.result_status,
    generated_at: new Date().toISOString(),
    summary: {
      checks: detail.checks.length,
      passed: detail.checks.filter((check) => check.status === 'passed').length,
      issues: detail.checks.filter((check) => check.status === 'potential_non_compliance').length,
      needsVerification: detail.checks.filter((check) => check.status === 'needs_verification').length
    }
  });

  const inspection = await db.update('inspections', inspectionId, {
    status: 'FINALIZED',
    finalized_at: new Date().toISOString()
  });

  await db.audit('inspection.finalized', officer, { inspection_id: inspectionId });
  return inspection;
}

async function markInspectionError(inspectionId, error) {
  return db.update('inspections', inspectionId, {
    status: 'ERROR',
    current_step: 'Failed',
    error_message: error.message || String(error)
  });
}

module.exports = {
  createInspection,
  analyzeInspection,
  getOfficerInspections,
  getInspectionDetail,
  verifyCheck,
  finalizeInspection,
  runOcrStage,
  runExtractionStage,
  runLegalRetrievalStage,
  runRuleValidationStage,
  runEvidenceStage,
  markInspectionError
};
