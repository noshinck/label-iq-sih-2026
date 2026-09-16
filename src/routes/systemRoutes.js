const express = require('express');
const db = require('../services/database');
const config = require('../services/config');

const router = express.Router();

router.get('/api/system/status', async (req, res) => {
  const [ruleChunks, ruleVersions, inspections, reports, jobs] = await Promise.all([
    db.list('rule_chunks'),
    db.list('rule_versions'),
    db.list('inspections'),
    db.list('reports'),
    db.list('analysis_jobs')
  ]);

  const activeRuleVersion = ruleVersions
    .filter((version) => version.status === 'ACTIVE')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
  const activeRuleChunks = activeRuleVersion
    ? ruleChunks.filter((chunk) => chunk.rule_version_id === activeRuleVersion.id)
    : [];

  res.json({
    database: {
      mode: db.hasSupabase ? 'supabase' : 'local-development',
      connected: true,
      supabase_url_configured: Boolean(config.supabase.url),
      service_role_configured: Boolean(config.supabase.serviceRoleKey)
    },
    ocr: {
      engine: 'PaddleOCR',
      configured: true
    },
    ai: {
      provider: config.ai.provider,
      configured: Boolean(config.ai.apiKey),
      model: config.ai.model,
      embedding_model: config.ai.embeddingModel
    },
    legal_documents: {
      ingested: activeRuleChunks.length > 0,
      chunks: activeRuleChunks.length,
      total_chunks_all_versions: ruleChunks.length
    },
    active_rule_version: activeRuleVersion
      ? {
          id: activeRuleVersion.id,
          version: activeRuleVersion.version,
          effective_date: activeRuleVersion.effective_date
        }
      : null,
    inspections: {
      total: inspections.length,
      analyzed: inspections.filter((item) => item.status === 'ANALYZED').length,
      finalized: inspections.filter((item) => item.status === 'FINALIZED').length
    },
    reports: {
      generated: reports.length
    },
    analysis_jobs: {
      total: jobs.length,
      running: jobs.filter((job) => !['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)).length,
      failed: jobs.filter((job) => job.status === 'FAILED').length
    },
    offline_cache: {
      implemented: false,
      message: 'Offline sync queue schema exists; browser IndexedDB workflow is not implemented yet.'
    }
  });
});

module.exports = router;
