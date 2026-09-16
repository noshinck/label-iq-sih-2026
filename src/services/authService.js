const bcrypt = require('bcryptjs');
const db = require('./database');

function normalizeRole(role) {
  if (role === 'officer') return 'legal';
  if (role === 'public') return 'consumer';
  return ['consumer', 'business', 'legal', 'admin'].includes(role) ? role : 'consumer';
}

async function authenticate(username, password, requestedRole) {
  const role = normalizeRole(requestedRole);
  const user = await db.findOne('users', (row) => row.username === username);

  if (!user) return { ok: false, error: 'Invalid credentials.' };
  if (normalizeRole(user.role) !== role) return { ok: false, error: 'This account cannot access the selected portal.' };

  const passwordOk = await bcrypt.compare(password, user.passwordHash || user.password_hash || '');
  if (!passwordOk) return { ok: false, error: 'Invalid credentials.' };

  return {
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      role: normalizeRole(user.role),
      displayName: user.displayName || user.display_name || user.username
    }
  };
}

async function createUser({ username, password, role }) {
  const targetRole = normalizeRole(role);
  const existing = await db.findOne('users', (row) => row.username === username);
  if (existing) return { ok: false, error: 'Username already exists.' };

  const passwordHash = await bcrypt.hash(password, 10);
  const record = db.hasSupabase
    ? { username, password_hash: passwordHash, role: targetRole, display_name: username }
    : { username, passwordHash, role: targetRole, displayName: username };

  const user = await db.insert('users', record);

  return {
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      role: normalizeRole(user.role),
      displayName: user.displayName || user.display_name || user.username
    }
  };
}

async function demoPublicUser() {
  return {
    id: 'user-public-demo',
    username: 'demo_public',
    role: 'consumer',
    displayName: 'Public Demo'
  };
}

module.exports = {
  authenticate,
  createUser,
  demoPublicUser,
  normalizeRole
};
