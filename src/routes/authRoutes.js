const express = require('express');
const authService = require('../services/authService');
const config = require('../services/config');
const sessionCookie = require('../services/sessionCookie');

const router = express.Router();

function getPortal(value) {
  if (value === 'officer') return 'legal';
  if (value === 'public') return 'consumer';
  return ['consumer', 'business', 'legal'].includes(value) ? value : 'consumer';
}

function redirectToPortal(res, role) {
  if (role === 'business') return res.redirect('/business');
  if (role === 'legal') return res.redirect('/legal');
  return res.redirect('/public');
}

function authViewData(req, portal, error = null) {
  return {
    error,
    portal,
    supabase: {
      url: config.supabase.url,
      publishableKey: config.supabase.publishableKey
    },
    oauthError: req.query.error || null
  };
}

router.get('/public/login', (req, res) => res.redirect('/signin?portal=consumer'));
router.get('/business/login', (req, res) => res.redirect('/signin?portal=business'));
router.get('/officer/login', (req, res) => res.redirect('/signin?portal=legal'));
router.get('/admin/login', (req, res) => res.redirect('/signin?portal=legal'));

router.get('/signin', (req, res) => {
  res.render('signin', authViewData(req, getPortal(req.query.portal)));
});

router.post('/signin', async (req, res) => {
  const { username, password } = req.body;
  const targetPortal = getPortal(req.body.targetPortal);
  const result = await authService.authenticate(username, password, targetPortal);

  if (!result.ok) {
    return res.render('signin', authViewData(req, targetPortal, result.error));
  }

  req.session.user = result.user;
  sessionCookie.setUser(res, result.user);

  return redirectToPortal(res, result.user.role);
});

router.get('/signup', (req, res) => {
  res.render('signup', authViewData(req, getPortal(req.query.portal)));
});

router.post('/signup', async (req, res) => {
  const { username, password, confirmPassword } = req.body;
  const portal = getPortal(req.body.portal);

  if (!username || !password || !confirmPassword) {
    return res.render('signup', authViewData(req, portal, 'All fields are required.'));
  }

  if (password !== confirmPassword) {
    return res.render('signup', authViewData(req, portal, 'Passwords do not match.'));
  }

  const result = await authService.createUser({ username, password, role: portal });
  if (!result.ok) return res.render('signup', authViewData(req, portal, result.error));

  req.session.user = result.user;
  sessionCookie.setUser(res, result.user);
  return redirectToPortal(res, result.user.role);
});

router.post('/auth/demo/public', async (req, res) => {
  req.session.user = await authService.demoPublicUser();
  sessionCookie.setUser(res, req.session.user);
  return res.redirect('/public');
});

router.get('/auth/callback', (req, res) => {
  res.render('auth-callback', {
    supabase: {
      url: config.supabase.url,
      publishableKey: config.supabase.publishableKey
    }
  });
});

router.post('/auth/supabase/session', async (req, res) => {
  const targetPortal = getPortal(req.body.targetPortal);
  const result = await authService.verifySupabaseOAuthSession({
    accessToken: req.body.accessToken,
    requestedRole: targetPortal
  });

  if (!result.ok) return res.status(401).json({ error: result.error });

  req.session.user = result.user;
  sessionCookie.setUser(res, result.user);

  return res.json({
    ok: true,
    user: result.user,
    redirectTo: result.user.role === 'business' ? '/business' : (result.user.role === 'legal' ? '/legal' : '/public')
  });
});

router.get('/signout', (req, res) => {
  const portal = getPortal(req.query.portal);
  sessionCookie.clearUser(res);

  req.session.destroy(() => {
    res.render('signout', {
      redirectTo: `/signin?portal=${portal}`,
      supabase: {
        url: config.supabase.url,
        publishableKey: config.supabase.publishableKey
      }
    });
  });
});

module.exports = router;
