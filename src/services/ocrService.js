const { spawn } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const config = require('./config');

function parseGeminiJson(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return {};

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw error;
    return JSON.parse(match[0]);
  }
}

function mimeTypeForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function normalizeGeminiLines(payload) {
  const rawLines = Array.isArray(payload.lines)
    ? payload.lines
    : String(payload.text || '')
      .split(/\r?\n/)
      .map((line) => ({ text: line.trim() }))
      .filter((line) => line.text);

  return rawLines
    .map((line, index) => {
      const text = typeof line === 'string' ? line : line.text;
      if (!text || !String(text).trim()) return null;
      const y = index * 28;
      const confidence = typeof line.confidence === 'number' ? line.confidence : 0;
      return {
        text: String(text).trim(),
        confidence,
        box: [[0, y], [1, y], [1, y + 1], [0, y + 1]],
        bounds: { x: 0, y, width: 1, height: 1 }
      };
    })
    .filter(Boolean);
}

async function runGeminiOcr(imagePaths) {
  if (!config.ai.geminiApiKey) {
    throw new Error('PaddleOCR is unavailable on this deployment and GEMINI_API_KEY is not configured for OCR fallback.');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.ai.visionModel)}:generateContent?key=${encodeURIComponent(config.ai.geminiApiKey)}`;

  return Promise.all(imagePaths.map(async (imagePath) => {
    const data = await fs.readFile(imagePath);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [
            {
              text: 'Perform OCR on this packaged commodity image. Return JSON only: {"text":"all detected text in reading order","lines":[{"text":"one detected line","confidence":0.0}]}. Do not invent text. If no text is readable, return empty text and an empty lines array.'
            },
            {
              inlineData: {
                mimeType: mimeTypeForFile(imagePath),
                data: data.toString('base64')
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json'
        }
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = result.error?.message || `Gemini OCR failed with status ${response.status}`;
      throw new Error(message);
    }

    const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || '';
    const payload = parseGeminiJson(text);
    const lines = normalizeGeminiLines(payload);
    const confidenceValues = lines.map((line) => line.confidence).filter((value) => value > 0);

    return {
      path: imagePath,
      engine: 'gemini-vision-fallback',
      text: String(payload.text || lines.map((line) => line.text).join('\n') || '').trim(),
      averageConfidence: confidenceValues.length
        ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
        : 0,
      lines
    };
  }));
}

function runPaddleOcrOnly(imagePaths) {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, '..', '..', 'scripts', 'paddle_ocr.py');
    const child = spawn(config.ocr.python, [script, ...imagePaths], {
      cwd: path.join(__dirname, '..', '..')
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      let parsed = null;
      try {
        const jsonLine = stdout
          .trim()
          .split('\n')
          .reverse()
          .find((line) => line.trim().startsWith('{'));
        parsed = JSON.parse(jsonLine || stdout.trim());
      } catch (error) {
        return reject(new Error(stderr || stdout || `PaddleOCR exited with code ${code}`));
      }

      if (code !== 0 || !parsed.ok) {
        return reject(new Error(parsed.error || stderr || `PaddleOCR exited with code ${code}`));
      }

      return resolve(parsed.images);
    });
  });
}

async function runPaddleOcr(imagePaths) {
  if (process.env.VERCEL) {
    return runGeminiOcr(imagePaths);
  }

  try {
    return await runPaddleOcrOnly(imagePaths);
  } catch (error) {
    if (error && (error.code === 'ENOENT' || /ENOENT|python/i.test(error.message || ''))) {
      return runGeminiOcr(imagePaths);
    }
    throw error;
  }
}

module.exports = {
  runPaddleOcr
};
