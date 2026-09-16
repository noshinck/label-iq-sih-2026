const express = require('express');
const { askAssistant } = require('../services/assistantService');

const router = express.Router();

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
