const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const db = require('./database');
const inspectionService = require('./inspectionService');
const config = require('./config');

const reportsDir = process.env.VERCEL
  ? path.join(os.tmpdir(), 'labeliq-reports')
  : path.join(__dirname, '..', '..', 'output', 'reports');
const tmpDir = process.env.VERCEL
  ? path.join(os.tmpdir(), 'labeliq-report-inputs')
  : path.join(__dirname, '..', '..', 'tmp', 'reports');

function generateFiles(detail, pdfPath, docxPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    fs.mkdirSync(tmpDir, { recursive: true });
    const inputPath = path.join(tmpDir, `${detail.inspection.id}.json`);
    fs.writeFileSync(inputPath, JSON.stringify(detail, null, 2));
    const script = path.join(__dirname, '..', '..', 'scripts', 'generate_report.py');
    execFile(config.ocr.python, [script, inputPath, pdfPath, docxPath], (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr || stdout || error.message));
      resolve(JSON.parse(stdout.trim()));
    });
  });
}

async function generateInspectionReport(inspectionId, officer) {
  const detail = await inspectionService.getInspectionDetail(inspectionId);
  if (!detail) throw new Error('Inspection not found.');

  const pdfPath = path.join(reportsDir, `${inspectionId}.pdf`);
  const docxPath = path.join(reportsDir, `${inspectionId}.docx`);
  await generateFiles(detail, pdfPath, docxPath);

  const report = await db.insert('reports', {
    inspection_id: inspectionId,
    officer_user_id: officer?.id || null,
    result_status: detail.inspection.result_status,
    generated_at: new Date().toISOString(),
    summary: {
      checks: detail.checks.length,
      passed: detail.checks.filter((check) => check.status === 'passed').length,
      issues: detail.checks.filter((check) => check.status === 'potential_non_compliance').length,
      needsVerification: detail.checks.filter((check) => check.status === 'needs_verification').length
    },
    pdf_path: pdfPath,
    docx_path: docxPath
  });

  await db.audit('report.generated', officer, { inspection_id: inspectionId, report_id: report.id });
  return { report, pdfPath, docxPath };
}

module.exports = {
  generateInspectionReport
};
