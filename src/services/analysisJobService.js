const db = require('./database');
const inspectionService = require('./inspectionService');

const STAGES = [
  'UPLOADING',
  'PREPROCESSING',
  'OCR',
  'EXTRACTION',
  'LEGAL_RETRIEVAL',
  'RULE_VALIDATION',
  'EVIDENCE',
  'COMPLETED'
];

const stageMessages = {
  UPLOADING: 'Uploading product images',
  PREPROCESSING: 'Preparing package images',
  OCR: 'Extracting text from package images',
  EXTRACTION: 'Extracting declarations',
  LEGAL_RETRIEVAL: 'Retrieving legal context',
  RULE_VALIDATION: 'Running deterministic checks',
  EVIDENCE: 'Generating evidence links',
  COMPLETED: 'Analysis complete',
  FAILED: 'Analysis could not complete',
  CANCELLED: 'Analysis cancelled'
};

const runningJobs = new Set();

function isTerminal(job) {
  return ['COMPLETED', 'FAILED', 'CANCELLED'].includes(job?.status);
}

function emptyStages() {
  return Object.fromEntries(
    STAGES.map((stage) => [
      stage,
      {
        status: 'PENDING',
        started_at: null,
        completed_at: null,
        error: null
      }
    ])
  );
}

function progressFor(stage, status) {
  if (status === 'COMPLETED') return 100;
  if (status === 'FAILED' || status === 'CANCELLED') return 100;
  const index = Math.max(0, STAGES.indexOf(stage));
  return Math.min(95, Math.round((index / (STAGES.length - 1)) * 100));
}

async function createJob({ actor, files, imageTypes, portal }) {
  const created = await inspectionService.createInspection({
    officer: actor,
    files,
    imageTypes
  });

  const job = await db.insert('analysis_jobs', {
    inspection_id: created.inspection.id,
    actor_user_id: actor.id,
    actor_role: actor.role,
    portal,
    status: 'QUEUED',
    current_stage: 'UPLOADING',
    progress: 0,
    message: 'Queued for analysis',
    stages: emptyStages(),
    timings: {},
    error: null,
    cancelled_at: null
  });

  process.nextTick(() => runJob(job.id));
  return { job, inspection: created.inspection };
}

async function getJob(jobId) {
  const job = await db.findOne('analysis_jobs', (item) => item.id === jobId);
  if (job && !isTerminal(job) && !runningJobs.has(job.id)) {
    process.nextTick(() => runJob(job.id));
  }
  return job;
}

async function patchJob(jobId, patch) {
  return db.update('analysis_jobs', jobId, patch);
}

async function markStage(job, stage, status, error = null) {
  const stages = job.stages || emptyStages();
  const now = new Date().toISOString();
  stages[stage] = stages[stage] || {
    status: 'PENDING',
    started_at: null,
    completed_at: null,
    error: null
  };

  if (status === 'RUNNING') stages[stage].started_at = stages[stage].started_at || now;
  if (status === 'COMPLETED' || status === 'FAILED') stages[stage].completed_at = now;
  stages[stage].status = status;
  stages[stage].error = error ? String(error.message || error) : null;

  return patchJob(job.id, {
    stages,
    current_stage: stage,
    status: status === 'FAILED' ? 'FAILED' : stage,
    progress: progressFor(stage, status),
    message: error ? `${stageMessages.FAILED}: ${stages[stage].error}` : stageMessages[stage]
  });
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function timed(job, stage, timeoutMs, fn) {
  let current = await getJob(job.id);
  if (current.cancelled_at) throw new Error('Analysis was cancelled.');
  current = await markStage(current, stage, 'RUNNING');
  const started = Date.now();
  try {
    const value = await withTimeout(fn(), timeoutMs, stage);
    const durationMs = Date.now() - started;
    const timings = { ...(current.timings || {}), [stage]: durationMs };
    current = await markStage({ ...current, timings }, stage, 'COMPLETED');
    await patchJob(job.id, { timings });
    console.log(`[${stage}] ${(durationMs / 1000).toFixed(1)}s`);
    return value;
  } catch (error) {
    await markStage(current, stage, 'FAILED', error);
    throw error;
  }
}

async function runJob(jobId) {
  if (runningJobs.has(jobId)) return;
  runningJobs.add(jobId);
  const totalStarted = Date.now();

  try {
    const job = await getJob(jobId);
    if (!job) return;

    await timed(job, 'UPLOADING', 10_000, async () => true);
    await timed(job, 'PREPROCESSING', 10_000, async () => true);
    await timed(job, 'OCR', 150_000, async () => inspectionService.runOcrStage(job.inspection_id));
    await timed(job, 'EXTRACTION', 60_000, async () => inspectionService.runExtractionStage(job.inspection_id));
    await timed(job, 'LEGAL_RETRIEVAL', 30_000, async () => inspectionService.runLegalRetrievalStage(job.inspection_id));
    await timed(job, 'RULE_VALIDATION', 30_000, async () => inspectionService.runRuleValidationStage(job.inspection_id));
    await timed(job, 'EVIDENCE', 20_000, async () => inspectionService.runEvidenceStage(job.inspection_id));

    const completed = await getJob(jobId);
    const stages = completed.stages || emptyStages();
    const now = new Date().toISOString();
    stages.COMPLETED = {
      status: 'COMPLETED',
      started_at: stages.COMPLETED?.started_at || now,
      completed_at: now,
      error: null
    };
    const totalMs = Date.now() - totalStarted;
    await patchJob(jobId, {
      status: 'COMPLETED',
      current_stage: 'COMPLETED',
      progress: 100,
      message: stageMessages.COMPLETED,
      stages,
      timings: { ...(completed.timings || {}), TOTAL: totalMs }
    });
    console.log(`[TOTAL] ${(totalMs / 1000).toFixed(1)}s`);
  } catch (error) {
    const current = await getJob(jobId);
    if (current?.cancelled_at) {
      await patchJob(jobId, {
        status: 'CANCELLED',
        progress: 100,
        message: stageMessages.CANCELLED
      });
    } else if (current) {
      await inspectionService.markInspectionError(current.inspection_id, error);
      await patchJob(jobId, {
        status: 'FAILED',
        progress: 100,
        message: 'Analysis could not complete.',
        error: error.message || String(error)
      });
    }
  } finally {
    runningJobs.delete(jobId);
  }
}

async function cancelJob(jobId) {
  return patchJob(jobId, {
    status: 'CANCELLED',
    cancelled_at: new Date().toISOString(),
    message: stageMessages.CANCELLED,
    progress: 100
  });
}

async function retryJob(jobId) {
  const job = await getJob(jobId);
  if (!job) throw new Error('Analysis job not found.');
  const reset = await patchJob(jobId, {
    status: 'QUEUED',
    current_stage: 'UPLOADING',
    progress: 0,
    message: 'Queued for retry',
    stages: emptyStages(),
    timings: {},
    error: null,
    cancelled_at: null
  });
  process.nextTick(() => runJob(jobId));
  return reset;
}

module.exports = {
  createJob,
  getJob,
  cancelJob,
  retryJob,
  runJob
};
