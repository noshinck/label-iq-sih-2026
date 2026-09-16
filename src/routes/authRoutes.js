const express = require('express');
const authService = require('../services/authService');

const router = express.Router();

function getPortal(value) {
  if (value === 'officer') return 'legal';
  if (value === 'public') return 'consumer';
  return ['consumer', 'business', 'legal'].includes(value) ? value : 'consumer';
}

function redirectToPortal(res, role) {
  if (role === 'business') return res.redirect('/business');
  if (role === 'legal') return res.redirect('/legal');
  return res.redirect('/');
}

router.get('/signin', (req, res) => {
  res.render('signin', {
    error: null,
    portal: getPortal(req.query.portal)
  });
});

router.post('/signin', async (req, res) => {
  const { username, password } = req.body;
  const targetPortal = getPortal(req.body.targetPortal);
  const result = await authService.authenticate(username, password, targetPortal);

  if (!result.ok) {
    return res.render('signin', {
      error: result.error,
      portal: targetPortal
    });
  }

  req.session.user = result.user;

  return redirectToPortal(res, result.user.role);
});

router.get('/signup', (req, res) => {
  res.render('signup', {
    error: null,
    portal: getPortal(req.query.portal)
  });
});

router.post('/signup', async (req, res) => {
  const { username, password, confirmPassword } = req.body;
  const portal = getPortal(req.body.portal);

  if (!username || !password || !confirmPassword) {
    return res.render('signup', { error: 'All fields are required.', portal });
  }

  if (password !== confirmPassword) {
    return res.render('signup', { error: 'Passwords do not match.', portal });
  }

  const result = await authService.createUser({ username, password, role: portal });
  if (!result.ok) return res.render('signup', { error: result.error, portal });

  req.session.user = result.user;
  return redirectToPortal(res, result.user.role);
});

router.post('/auth/demo/public', async (req, res) => {
  req.session.user = await authService.demoPublicUser();
  return res.redirect('/');
});

router.get('/signout', (req, res) => {
  const portal = getPortal(req.query.portal);

  req.session.destroy(() => {
    res.redirect(`/signin?portal=${portal}`);
  });
});

module.exports = router;
