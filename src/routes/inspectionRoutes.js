const express = require('express');
const fs = require('fs');
const multer = require('multer');
const os = require('os');
const path = require('path');
const checkPortalAuth = require('../middleware/checkPortalAuth');
const analysisJobService = require('../services/analysisJobService');
const inspectionService = require('../services/inspectionService');
const reportService = require('../services/reportService');

const router = express.Router();
const uploadDir = process.env.VERCEL
  ? path.join(os.tmpdir(), 'labeliq-uploads')
  : path.join(__dirname, '..', '..', 'public', 'uploads');

fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename(req, file, cb) {
      const safeName = file.originalname.replace(/[^a-z0-9.\-_]/gi, '-').toLowerCase();
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`);
    }
  }),
  limits: {
    files: 6,
    fileSize: 25 * 1024 * 1024
  },
  fileFilter(req, file, cb) {
    if (!/^image\//.test(file.mimetype)) return cb(new Error('Only image uploads are supported for OCR.'));
    return cb(null, true);
  }
});

function runUpload(req, res, next) {
  upload.array('photos', 6)(req, res, (error) => {
    if (!error) return next();
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Image is too large. Use a compressed image under 4 MB on the deployed app.'
      : error.message;
    return res.status(400).json({ error: message });
  });
}

function wantsJson(req) {
  return req.xhr || (req.get('accept') || '').includes('application/json');
}

function backHrefForRole(role) {
  if (role === 'consumer') return '/scan';
  if (role === 'business') return '/business';
  return '/legal';
}

function renderInspectionDetail(req, res, { detail, error = null, status = 200 }) {
  return res.status(status).render('inspection-detail', {
    detail,
    error,
    backHref: backHrefForRole(req.session?.user?.role),
    currentPath: req.originalUrl
  });
}

function redirectWithError(res, fallback, message) {
  const separator = fallback.includes('?') ? '&' : '?';
  return res.redirect(`${fallback}${separator}error=${encodeURIComponent(message)}`);
}

router.post('/legal/inspections', checkPortalAuth('legal'), runUpload, async (req, res) => {
  try {
    if (!req.files?.length) throw new Error('Please upload at least one product photo.');
    const imageTypes = Array.isArray(req.body.imageTypes) ? req.body.imageTypes : [req.body.imageTypes].filter(Boolean);
    const result = await inspectionService.createInspection({
      officer: req.session.user,
      files: req.files,
      imageTypes
    });

    res.redirect(`/legal/inspections/${result.inspection.id}`);
  } catch (error) {
    renderInspectionDetail(req, res, {
      detail: null,
      error: error.message,
      status: 400
    });
  }
});

router.post('/legal/inspections/analyze-upload', checkPortalAuth('legal'), runUpload, async (req, res) => {
  let created = null;
  try {
    if (!req.files?.length) throw new Error('Please upload at least one product photo.');
    const imageTypes = Array.isArray(req.body.imageTypes) ? req.body.imageTypes : [req.body.imageTypes].filter(Boolean);
    created = await inspectionService.createInspection({
      officer: req.session.user,
      files: req.files,
      imageTypes
    });
    await inspectionService.analyzeInspection(created.inspection.id, req.session.user);
    res.redirect(`/legal/inspections/${created.inspection.id}`);
  } catch (error) {
    if (created?.inspection?.id) await inspectionService.markInspectionError(created.inspection.id, error);
    if (created?.inspection?.id) {
      return res.redirect(`/legal/inspections/${created.inspection.id}?error=${encodeURIComponent(error.message)}`);
    }
    return renderInspectionDetail(req, res, {
      detail: null,
      error: error.message,
      status: 400
    });
  }
});

router.post('/api/analysis/jobs', runUpload, async (req, res) => {
  try {
    if (!req.session?.user) return res.status(401).json({ error: 'Sign in required.' });
    if (!['legal', 'consumer', 'business'].includes(req.session.user.role)) return res.status(403).json({ error: 'Portal access denied.' });
    if (!req.files?.length) return res.status(400).json({ error: 'Please upload at least one product photo.' });

    const imageTypes = Array.isArray(req.body.imageTypes) ? req.body.imageTypes : [req.body.imageTypes].filter(Boolean);
    const { job, inspection } = await analysisJobService.createJob({
      actor: req.session.user,
      files: req.files,
      imageTypes,
      portal: req.session.user.role
    });

    return res.status(202).json({
      job_id: job.id,
      inspection_id: inspection.id,
      status: job.status,
      progress: job.progress,
      message: job.message
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/api/analysis/jobs/:id', async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Sign in required.' });
  const job = await analysisJobService.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Analysis job not found.' });
  if (job.actor_user_id !== req.session.user.id && req.session.user.role !== 'admin') return res.status(403).json({ error: 'Portal access denied.' });

  const resultBase = req.session.user.role === 'consumer'
    ? '/scan/inspections'
    : (req.session.user.role === 'business' ? '/business/inspections' : '/legal/inspections');
  return res.json({
    job_id: job.id,
    inspection_id: job.inspection_id,
    status: job.status,
    current_stage: job.current_stage,
    progress: job.progress,
    message: job.message,
    stages: job.stages,
    timings: job.timings,
    error: job.error,
    result_url: `${resultBase}/${job.inspection_id}`
  });
});

router.post('/api/analysis/jobs/:id/cancel', async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Sign in required.' });
  const job = await analysisJobService.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Analysis job not found.' });
  if (job.actor_user_id !== req.session.user.id && req.session.user.role !== 'admin') return res.status(403).json({ error: 'Portal access denied.' });
  const updated = await analysisJobService.cancelJob(req.params.id);
  return res.json({ job_id: updated.id, status: updated.status, message: updated.message });
});

router.post('/api/analysis/jobs/:id/retry', async (req, res) => {
  if (!req.session?.user) return res.status(401).json({ error: 'Sign in required.' });
  const job = await analysisJobService.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Analysis job not found.' });
  if (job.actor_user_id !== req.session.user.id && req.session.user.role !== 'admin') return res.status(403).json({ error: 'Portal access denied.' });
  const updated = await analysisJobService.retryJob(req.params.id);
  return res.json({ job_id: updated.id, status: updated.status, message: updated.message });
});

router.post('/scan/analyze-upload', checkPortalAuth('consumer'), runUpload, async (req, res) => {
  let created = null;
  try {
    if (!req.files?.length) throw new Error('Please upload at least one product photo.');
    created = await inspectionService.createInspection({
      officer: req.session.user,
      files: req.files,
      imageTypes: req.files.map(() => 'public-upload')
    });
    await inspectionService.analyzeInspection(created.inspection.id, req.session.user);
    res.redirect(`/scan/inspections/${created.inspection.id}`);
  } catch (error) {
    if (created?.inspection?.id) await inspectionService.markInspectionError(created.inspection.id, error);
    if (created?.inspection?.id) {
      return res.redirect(`/scan/inspections/${created.inspection.id}?error=${encodeURIComponent(error.message)}`);
    }
    return renderInspectionDetail(req, res, {
      detail: null,
      error: error.message,
      status: 400
    });
  }
});

router.get('/scan/inspections/:id', checkPortalAuth('consumer'), async (req, res) => {
  const detail = await inspectionService.getInspectionDetail(req.params.id);
  if (!detail) {
    return renderInspectionDetail(req, res, {
      detail: null,
      error: 'Inspection not found. Please return to the portal and open the result again.',
      status: 404
    });
  }
  return renderInspectionDetail(req, res, { detail, error: req.query.error || null });
});

router.get('/business/inspections/:id', checkPortalAuth('business'), async (req, res) => {
  const detail = await inspectionService.getInspectionDetail(req.params.id);
  if (!detail) {
    return renderInspectionDetail(req, res, {
      detail: null,
      error: 'Inspection not found. Please return to the portal and open the result again.',
      status: 404
    });
  }
  return renderInspectionDetail(req, res, { detail, error: req.query.error || null });
});

router.post('/legal/inspections/:id/analyze', checkPortalAuth('legal'), async (req, res) => {
  try {
    await inspectionService.analyzeInspection(req.params.id, req.session.user);
    res.redirect(`/legal/inspections/${req.params.id}`);
  } catch (error) {
    await inspectionService.markInspectionError(req.params.id, error);
    const detail = await inspectionService.getInspectionDetail(req.params.id);
    renderInspectionDetail(req, res, {
      detail,
      error: error.message,
      status: 500
    });
  }
});

router.get('/legal/inspections/:id', checkPortalAuth('legal'), async (req, res) => {
  const detail = await inspectionService.getInspectionDetail(req.params.id);
  if (!detail) {
    return renderInspectionDetail(req, res, {
      detail: null,
      error: 'Inspection not found. Please return to the officer portal and open the result again.',
      status: 404
    });
  }
  return renderInspectionDetail(req, res, { detail, error: req.query.error || null });
});

router.post('/legal/checks/:id/verify', checkPortalAuth('legal'), async (req, res) => {
  try {
    const check = await inspectionService.verifyCheck({
      checkId: req.params.id,
      officer: req.session.user,
      status: req.body.status,
      correctedValue: req.body.correctedValue,
      remark: req.body.remark
    });
    const redirectTo = req.body.returnTo || req.get('referer') || `/legal/inspections/${check.inspection_id}`;
    if (wantsJson(req)) {
      return res.json({
        ok: true,
        check,
        redirectTo
      });
    }
    return res.redirect(redirectTo);
  } catch (error) {
    if (wantsJson(req)) {
      return res.status(404).json({ error: error.message });
    }
    return redirectWithError(res, req.get('referer') || '/legal', error.message);
  }
});

router.post('/legal/inspections/:id/finalize', checkPortalAuth('legal'), async (req, res) => {
  try {
    await inspectionService.finalizeInspection(req.params.id, req.session.user);
    res.redirect(`/legal/inspections/${req.params.id}`);
  } catch (error) {
    const detail = await inspectionService.getInspectionDetail(req.params.id);
    if (detail) {
      return renderInspectionDetail(req, res, {
        detail,
        error: error.message,
        status: 400
      });
    }
    return redirectWithError(res, '/legal?section=case-queue', `${error.message} Please reopen the inspection from the portal.`);
  }
});

router.get('/legal/inspections/:id/report.pdf', checkPortalAuth('legal'), async (req, res) => {
  try {
    const { pdfPath } = await reportService.generateInspectionReport(req.params.id, req.session.user);
    return res.download(pdfPath);
  } catch (error) {
    return redirectWithError(res, `/legal/inspections/${req.params.id}`, `PDF download failed: ${error.message}`);
  }
});

router.get('/legal/inspections/:id/report.docx', checkPortalAuth('legal'), async (req, res) => {
  try {
    const { docxPath } = await reportService.generateInspectionReport(req.params.id, req.session.user);
    return res.download(docxPath);
  } catch (error) {
    return redirectWithError(res, `/legal/inspections/${req.params.id}`, `DOCX download failed: ${error.message}`);
  }
});

module.exports = router;
