const crypto = require('crypto');

const COOKIE_NAME = 'packcheck_user';

function secret() {
  return process.env.SESSION_SECRET || 'labeliq-dev-secret';
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function serializeUser(user) {
  const payload = base64url(JSON.stringify({
    id: user.id,
    username: user.username,
    role: user.role,
    displayName: user.displayName || user.display_name || user.username
  }));
  return `${payload}.${sign(payload)}`;
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function readUser(req) {
  const token = parseCookies(req.headers.cookie || '')[COOKIE_NAME];
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || signature !== sign(payload)) return null;

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (error) {
    return null;
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production'),
    maxAge: 24 * 60 * 60 * 1000,
    path: '/'
  };
}

function setUser(res, user) {
  res.cookie(COOKIE_NAME, serializeUser(user), cookieOptions());
}

function clearUser(res) {
  res.clearCookie(COOKIE_NAME, {
    path: '/',
    sameSite: 'lax',
    secure: Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production')
  });
}

function hydrateSession(req, res, next) {
  if (!req.session?.user) {
    const user = readUser(req);
    if (user) req.session.user = user;
  }
  next();
}

module.exports = {
  setUser,
  clearUser,
  hydrateSession
};
