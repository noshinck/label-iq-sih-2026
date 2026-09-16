const { spawn } = require('child_process');
const path = require('path');
const config = require('./config');

function runPaddleOcr(imagePaths) {
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

module.exports = {
  runPaddleOcr
};
