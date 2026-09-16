const express = require('express');
const checkPortalAuth = require('../middleware/checkPortalAuth');
const { businessData, consumerData, legalData } = require('../data/portalData');
const db = require('../services/database');
const inspectionService = require('../services/inspectionService');

const router = express.Router();

const legalSections = new Set(['complaints', 'case-queue', 'inspections', 'rules', 'audit']);

function formatDate(value) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString();
}

function statusStyle(status) {
  if (status === 'COMPLETED' || status === 'FINALIZED' || status === 'COMPLIANT') return 'bg-[#ecfdf5] text-[#059669]';
  if (status === 'POTENTIAL NON-COMPLIANCE' || status === 'FAILED' || status === 'ERROR') return 'bg-[#fef2f2] text-[#dc2626]';
  if (status === 'PROCESSING' || status === 'ANALYZED' || status === 'NEEDS VERIFICATION') return 'bg-[#fffbeb] text-[#b45309]';
  return 'bg-[#eef2ff] text-[#4f46e5]';
}

function getDeclarationTitle(declarations, inspectionId) {
  return declarations?.product_name || declarations?.brand || `Inspection ${String(inspectionId).slice(0, 8)}`;
}

async function buildLegalDashboardData(user, sectionName) {
  const activeSection = legalSections.has(sectionName) ? sectionName : 'complaints';
  const [inspections, allDeclarations, allChecks, complaints, ruleChunks, auditLogs] = await Promise.all([
    inspectionService.getOfficerInspections(user.id),
    db.list('extracted_declarations'),
    db.list('compliance_checks'),
    db.list('complaints'),
    db.list('rule_chunks'),
    db.list('audit_logs')
  ]);

  const declarationByInspection = new Map(allDeclarations.map((item) => [item.inspection_id, item]));
  const checksByInspection = allChecks.reduce((acc, check) => {
    acc[check.inspection_id] = acc[check.inspection_id] || [];
    acc[check.inspection_id].push(check);
    return acc;
  }, {});

  const enrichedInspections = inspections.map((inspection) => {
    const declaration = declarationByInspection.get(inspection.id)?.declarations || {};
    const checks = checksByInspection[inspection.id] || [];
    const issue = checks.find((check) => check.status === 'potential_non_compliance') || checks.find((check) => check.status === 'needs_verification') || checks[0];
    return {
      ...inspection,
      title: getDeclarationTitle(declaration, inspection.id),
      manufacturer: declaration.manufacturer || declaration.packer || declaration.importer || 'Not detected',
      issue: issue?.what || issue?.label || 'Awaiting rule checks',
      issueField: issue?.field || null,
      priority: checks.some((check) => check.status === 'potential_non_compliance') ? 'HIGH' : (checks.some((check) => check.status === 'needs_verification') ? 'MEDIUM' : 'LOW'),
      checkCount: checks.length,
      failedCount: checks.filter((check) => check.status === 'potential_non_compliance').length,
      needsVerificationCount: checks.filter((check) => check.status === 'needs_verification').length,
      displayDate: formatDate(inspection.created_at),
      statusStyle: statusStyle(inspection.result_status || inspection.status)
    };
  });

  const queue = enrichedInspections.filter((item) => (
    item.status !== 'FINALIZED' && (
      item.failedCount > 0 ||
      item.needsVerificationCount > 0 ||
      item.status === 'ERROR' ||
      item.status === 'UPLOADED' ||
      item.status === 'PROCESSING'
    )
  ));

  const rulesByRule = Array.from(
    ruleChunks.reduce((acc, chunk) => {
      const key = chunk.rule || chunk.section || chunk.topic || chunk.id;
      if (!acc.has(key)) {
        acc.set(key, {
          rule: key,
          topic: chunk.topic || 'Legal metrology context',
          source: chunk.source || chunk.document_name,
          page: chunk.page,
          text: chunk.text,
          chunkCount: 0
        });
      }
      acc.get(key).chunkCount += 1;
      return acc;
    }, new Map()).values()
  ).sort((a, b) => String(a.rule).localeCompare(String(b.rule), undefined, { numeric: true })).slice(0, 80);

  const totalCases = enrichedInspections.length + complaints.length;
  const awaitingAction = queue.filter((item) => ['UPLOADED', 'ERROR'].includes(item.status) || item.failedCount > 0).length + complaints.filter((item) => item.status === 'SUBMITTED').length;
  const investigating = enrichedInspections.filter((item) => ['PROCESSING', 'ANALYZED'].includes(item.status)).length;
  const verifiedViolations = enrichedInspections.filter((item) => item.status === 'FINALIZED' && item.result_status === 'POTENTIAL NON-COMPLIANCE').length;

  return {
    ...legalData,
    currentUser: user.username,
    activeSection,
    navCounts: {
      complaints: complaints.length,
      queue: queue.length,
      inspections: enrichedInspections.length,
      rules: rulesByRule.length,
      audit: auditLogs.length
    },
    metrics: { totalCases, awaitingAction, investigating, verifiedViolations },
    inspections: enrichedInspections,
    queue,
    complaints: complaints
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((item) => ({ ...item, displayDate: formatDate(item.created_at), statusStyle: statusStyle(item.status) })),
    rules: rulesByRule,
    auditLogs: auditLogs
      .sort((a, b) => new Date(b.timestamp || b.created_at) - new Date(a.timestamp || a.created_at))
      .slice(0, 100)
      .map((item) => ({ ...item, displayDate: formatDate(item.timestamp || item.created_at) })),
    databaseMode: db.hasSupabase ? 'Supabase' : 'Local development store'
  };
}

router.get('/', (req, res) => {
  res.render('landing', {
    data: {
      brandName: 'PackCheck AI'
    }
  });
});

router.get('/public', checkPortalAuth('consumer'), (req, res) => {
  res.render('index', {
    data: {
      ...consumerData,
      currentUser: req.session.user.username
    }
  });
});

router.get('/business', checkPortalAuth('business'), (req, res) => {
  res.render('business', {
    data: {
      ...businessData,
      currentUser: req.session.user.username
    }
  });
});

router.get('/legal', checkPortalAuth('legal'), async (req, res) => {
  res.render('legal', {
    data: await buildLegalDashboardData(req.session.user, req.query.section),
    error: null
  });
});

router.get('/legal/rules', checkPortalAuth('legal'), async (req, res) => {
  res.render('legal', {
    data: await buildLegalDashboardData(req.session.user, 'rules'),
    error: null
  });
});

module.exports = router;
