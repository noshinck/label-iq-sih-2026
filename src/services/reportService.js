const fs = require('fs');
const path = require('path');
const os = require('os');
const db = require('./database');
const inspectionService = require('./inspectionService');

const reportsDir = process.env.VERCEL
  ? path.join(os.tmpdir(), 'labeliq-reports')
  : path.join(__dirname, '..', '..', 'output', 'reports');

function clean(value) {
  if (value === null || value === undefined || value === '') return 'Not Detected';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function pdfEscape(value) {
  return clean(value).replace(/[\\()]/g, '\\$&');
}

function xmlEscape(value) {
  return clean(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function reportLines(detail) {
  const inspection = detail.inspection || {};
  const declarations = detail.declaration?.declarations || {};
  const checks = detail.checks || [];
  const lines = [
    'LabelIQ Inspection Report',
    `Inspection ID: ${inspection.id || ''}`,
    `Status: ${inspection.status || ''}`,
    `Result: ${inspection.result_status || ''}`,
    '',
    'Extracted Declarations'
  ];

  Object.entries(declarations).forEach(([key, value]) => {
    lines.push(`${key.replaceAll('_', ' ')}: ${clean(value)}`);
  });

  lines.push('', 'Compliance Checks');
  checks.forEach((check, index) => {
    lines.push(`${index + 1}. ${check.what || check.label || check.field || 'Check'}`);
    lines.push(`   Status: ${check.status || 'needs_verification'}`);
    lines.push(`   Rule: ${check.rule || 'Source support unavailable'}`);
    lines.push(`   Source: ${check.source || 'Officer verification required'}`);
    lines.push(`   Confidence: ${Math.round((check.confidence || 0) * 100)}%`);
    if (check.officer_status) lines.push(`   Officer: ${check.officer_status} ${check.officer_remark || ''}`);
  });

  return lines;
}

function createPdfBuffer(detail) {
  const lines = reportLines(detail).slice(0, 58);
  const content = [
    'BT',
    '/F1 18 Tf',
    '54 744 Td',
    `(${pdfEscape(lines[0] || 'LabelIQ Inspection Report')}) Tj`,
    '/F1 10 Tf'
  ];

  lines.slice(1).forEach((line) => {
    content.push('0 -14 Td');
    content.push(`(${pdfEscape(line).slice(0, 110)}) Tj`);
  });
  content.push('ET');

  const stream = content.join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];

  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

function localHeader(name, content) {
  const nameBuffer = Buffer.from(name);
  const data = Buffer.from(content);
  const { time, date } = dosDateTime();
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(time, 10);
  header.writeUInt16LE(date, 12);
  header.writeUInt32LE(crc32(data), 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);
  return { chunk: Buffer.concat([header, nameBuffer, data]), crc: crc32(data), size: data.length, nameBuffer, time, date };
}

function centralHeader(entry, offset) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(entry.time, 12);
  header.writeUInt16LE(entry.date, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.size, 20);
  header.writeUInt32LE(entry.size, 24);
  header.writeUInt16LE(entry.nameBuffer.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(offset, 42);
  return Buffer.concat([header, entry.nameBuffer]);
}

function endCentralDirectory(count, size, offset) {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return end;
}

function createZip(files) {
  const localChunks = [];
  const entries = [];
  let offset = 0;
  Object.entries(files).forEach(([name, content]) => {
    const entry = localHeader(name, content);
    localChunks.push(entry.chunk);
    entries.push({ ...entry, offset });
    offset += entry.chunk.length;
  });
  const centralChunks = entries.map((entry) => centralHeader(entry, entry.offset));
  const central = Buffer.concat(centralChunks);
  return Buffer.concat([...localChunks, central, endCentralDirectory(entries.length, central.length, offset)]);
}

function createDocxBuffer(detail) {
  const paragraphs = reportLines(detail).map((line) => (
    `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line)}</w:t></w:r></w:p>`
  )).join('');

  return createZip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr/></w:body></w:document>`
  });
}

function generateFiles(detail, pdfPath, docxPath) {
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  fs.writeFileSync(pdfPath, createPdfBuffer(detail));
  fs.writeFileSync(docxPath, createDocxBuffer(detail));
}

async function generateInspectionReport(inspectionId, officer) {
  const detail = await inspectionService.getInspectionDetail(inspectionId);
  if (!detail) throw new Error('Inspection not found.');

  const pdfPath = path.join(reportsDir, `${inspectionId}.pdf`);
  const docxPath = path.join(reportsDir, `${inspectionId}.docx`);
  generateFiles(detail, pdfPath, docxPath);

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
