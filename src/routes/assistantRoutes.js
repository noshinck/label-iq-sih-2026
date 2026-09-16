const express = require('express');
const { askAssistant } = require('../services/assistantService');
const { languageCodes, readLocale } = require('../services/i18nService');

const router = express.Router();

router.get('/api/i18n/:locale', (req, res) => {
  return res.json(readLocale(req.params.locale));
});

router.post('/api/i18n/preference', (req, res) => {
  const language = languageCodes.has(req.body.language) ? req.body.language : 'en';
  if (req.session?.user) {
    req.session.user.preferredLanguage = language;
  }
  req.session.preferredLanguage = language;
  return res.json({ ok: true, language });
});

router.post('/api/assistant/chat', async (req, res) => {
  try {
    if (!req.session?.user) return res.status(401).json({ error: 'Sign in required.' });

    const result = await askAssistant({
      question: req.body.message,
      page: req.body.page,
      user: req.session.user
    });

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
