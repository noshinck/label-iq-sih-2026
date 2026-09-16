const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

const localDbPath = path.join(__dirname, '..', '..', 'data', 'local-db.json');

const initialData = {
  users: [
    {
      id: 'user-officer-demo',
      username: 'inspector',
      passwordHash: bcrypt.hashSync('admin123', 10),
      role: 'legal',
      displayName: 'Insp. R. K. Sharma'
    },
    {
      id: 'user-business-demo',
      username: 'business_user',
      passwordHash: bcrypt.hashSync('admin123', 10),
      role: 'business',
      displayName: 'SunJoy Foods'
    },
    {
      id: 'user-public-demo',
      username: 'admin',
      passwordHash: bcrypt.hashSync('admin123', 10),
      role: 'consumer',
      displayName: 'Public Demo'
    }
  ],
  businesses: [],
  products: [],
  product_versions: [],
  product_images: [],
  inspections: [],
  ocr_results: [],
  extracted_declarations: [],
  rules: [],
  rule_versions: [],
  rule_chunks: [],
  compliance_checks: [],
  violations: [],
  evidence: [],
  reports: [],
  complaints: [],
  complaint_updates: [],
  analysis_jobs: [],
  audit_logs: [],
  sync_queue: []
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureLocalDb() {
  if (!fs.existsSync(localDbPath)) {
    fs.mkdirSync(path.dirname(localDbPath), { recursive: true });
    fs.writeFileSync(localDbPath, JSON.stringify(initialData, null, 2));
    return;
  }

  const current = JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
  let changed = false;
  Object.entries(initialData).forEach(([table, value]) => {
    if (!Object.prototype.hasOwnProperty.call(current, table)) {
      current[table] = Array.isArray(value) ? [] : value;
      changed = true;
    }
  });
  if (changed) {
    fs.writeFileSync(localDbPath, JSON.stringify(current, null, 2));
  }
}

function readLocalDb() {
  ensureLocalDb();
  return JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
}

function writeLocalDb(data) {
  fs.writeFileSync(localDbPath, JSON.stringify(data, null, 2));
}

const hasSupabase = Boolean(config.supabase.url && config.supabase.serviceRoleKey);
const supabase = hasSupabase
  ? createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false }
    })
  : null;

async function list(table) {
  if (supabase) {
    const { data, error } = await supabase.from(table).select('*');
    if (error) throw error;
    return data;
  }

  return clone(readLocalDb()[table] || []);
}

async function findOne(table, predicate) {
  const rows = await list(table);
  return rows.find(predicate) || null;
}

async function insert(table, record) {
  const row = {
    id: record.id || crypto.randomUUID(),
    created_at: record.created_at || new Date().toISOString(),
    ...record
  };

  if (supabase) {
    const { data, error } = await supabase.from(table).insert(row).select('*').single();
    if (error) throw error;
    return data;
  }

  const db = readLocalDb();
  db[table] = db[table] || [];
  db[table].push(row);
  writeLocalDb(db);
  return clone(row);
}

async function update(table, id, patch) {
  const updated = {
    ...patch,
    updated_at: new Date().toISOString()
  };

  if (supabase) {
    const { data, error } = await supabase.from(table).update(updated).eq('id', id).select('*').single();
    if (error) throw error;
    return data;
  }

  const db = readLocalDb();
  const index = (db[table] || []).findIndex((row) => row.id === id);
  if (index === -1) return null;
  db[table][index] = { ...db[table][index], ...updated };
  writeLocalDb(db);
  return clone(db[table][index]);
}

async function removeWhere(table, predicate) {
  if (supabase) {
    throw new Error('removeWhere is only available for the local development database.');
  }

  const data = readLocalDb();
  const rows = data[table] || [];
  const kept = rows.filter((row) => !predicate(row));
  const removed = rows.length - kept.length;
  data[table] = kept;
  writeLocalDb(data);
  return removed;
}

async function audit(action, actor, details = {}) {
  return insert('audit_logs', {
    action,
    actor_user_id: actor?.id || null,
    actor_role: actor?.role || null,
    details,
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  hasSupabase,
  list,
  findOne,
  insert,
  update,
  removeWhere,
  audit
};
