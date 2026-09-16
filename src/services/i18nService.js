const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, '..', '..', 'locales');

const languages = [
  { code: 'en', label: 'English', nativeLabel: 'English', dir: 'ltr' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', dir: 'ltr' },
  { code: 'ml', label: 'Malayalam', nativeLabel: 'മലയാളം', dir: 'ltr' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்', dir: 'ltr' },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ', dir: 'ltr' },
  { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు', dir: 'ltr' },
  { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी', dir: 'ltr' },
  { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা', dir: 'ltr' },
  { code: 'gu', label: 'Gujarati', nativeLabel: 'ગુજરાતી', dir: 'ltr' },
  { code: 'pa', label: 'Punjabi', nativeLabel: 'ਪੰਜਾਬੀ', dir: 'ltr' },
  { code: 'or', label: 'Odia', nativeLabel: 'ଓଡ଼ିଆ', dir: 'ltr' },
  { code: 'as', label: 'Assamese', nativeLabel: 'অসমীয়া', dir: 'ltr' }
];

const languageCodes = new Set(languages.map((language) => language.code));

function readLocale(code) {
  const safeCode = languageCodes.has(code) ? code : 'en';
  const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8'));
  if (safeCode === 'en') return en;
  const targetPath = path.join(localesDir, `${safeCode}.json`);
  const target = fs.existsSync(targetPath)
    ? JSON.parse(fs.readFileSync(targetPath, 'utf8'))
    : {};
  return { ...en, ...target };
}

module.exports = {
  languages,
  languageCodes,
  readLocale
};
