const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const config = require('./config');
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

async function verifySupabaseOAuthSession({ accessToken, requestedRole }) {
  const role = normalizeRole(requestedRole);
  if (!config.supabase.url || !config.supabase.publishableKey) {
    return { ok: false, error: 'Supabase URL and publishable key are required for Google OAuth.' };
  }

  if (!accessToken) return { ok: false, error: 'Missing Supabase access token.' };

  const supabase = createClient(config.supabase.url, config.supabase.publishableKey, {
    auth: { persistSession: false }
  });
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user) return { ok: false, error: error?.message || 'Google authentication failed.' };

  const supabaseUser = data.user;
  const email = supabaseUser.email || supabaseUser.user_metadata?.email || '';
  const displayName = supabaseUser.user_metadata?.full_name ||
    supabaseUser.user_metadata?.name ||
    email ||
    'Google User';

  const existing = await db.findOne('users', (row) => (
    row.supabase_user_id === supabaseUser.id ||
    row.supabaseUserId === supabaseUser.id ||
    (email && (row.email === email || row.username === email))
  ));

  if (existing) {
    const existingRole = normalizeRole(existing.role);
    if (existingRole !== role) {
      return { ok: false, error: `This Google account is registered for ${existingRole}, not ${role}.` };
    }
    return {
      ok: true,
      user: {
        id: existing.id,
        supabaseUserId: supabaseUser.id,
        username: existing.username || email,
        email,
        role: existingRole,
        displayName: existing.displayName || existing.display_name || displayName
      }
    };
  }

  if (role !== 'consumer') {
    return {
      ok: false,
      error: 'No approved business/officer profile exists for this Google account. Ask an admin to create the profile before using Google sign-in.'
    };
  }

  const user = await db.insert('users', {
    supabase_user_id: supabaseUser.id,
    email,
    username: email || supabaseUser.id,
    password_hash: '',
    passwordHash: '',
    role,
    display_name: displayName,
    displayName,
    auth_provider: 'google'
  });

  return {
    ok: true,
    user: {
      id: user.id,
      supabaseUserId: supabaseUser.id,
      username: user.username || email,
      email,
      role,
      displayName: user.displayName || user.display_name || displayName
    }
  };
}

module.exports = {
  authenticate,
  createUser,
  demoPublicUser,
  normalizeRole,
  verifySupabaseOAuthSession
};
