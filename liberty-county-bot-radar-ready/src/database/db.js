const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'platform.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ---------------------------------------------------------------------------
// Core schema. Every table is namespaced by guild_id so the bot is fully
// multi-server safe. New modules should add their own tables here (or in a
// migration file) rather than reusing another module's table.
// ---------------------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS guild_config (
  guild_id TEXT PRIMARY KEY,
  configured INTEGER NOT NULL DEFAULT 0,
  founder_id TEXT,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS module_state (
  guild_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  config TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (guild_id, module_id)
);

CREATE TABLE IF NOT EXISTS permissions (
  guild_id TEXT NOT NULL,
  scope_type TEXT NOT NULL,      -- 'command' | 'module'
  scope_id TEXT NOT NULL,        -- command name or module id
  target_type TEXT NOT NULL,     -- 'role' | 'user'
  target_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, scope_type, scope_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  opener_id TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',   -- open | claimed | closed
  claimed_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,
  transcript_url TEXT
);

CREATE TABLE IF NOT EXISTS mod_cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  case_number INTEGER NOT NULL,
  target_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  action TEXT NOT NULL,          -- warn | kick | ban | timeout | infraction | promotion | termination
  reason TEXT,
  evidence TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(guild_id, case_number)
);

CREATE TABLE IF NOT EXISTS role_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  requester_id TEXT NOT NULL,
  department TEXT,
  current_rank TEXT,
  requested_rank TEXT,
  roles_requested TEXT,
  proof_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  reviewed_by TEXT,
  message_id TEXT,
  channel_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  target_id TEXT,
  before_value TEXT,
  after_value TEXT,
  case_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS custom_emojis (
  guild_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  emoji_key TEXT NOT NULL,
  emoji_id TEXT,
  emoji_name TEXT,
  animated INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, module_id, emoji_key)
);

CREATE TABLE IF NOT EXISTS webhooks_config (
  guild_id TEXT NOT NULL,
  event_key TEXT NOT NULL,       -- e.g. 'ticket_created', 'promotion', 'session_start'
  channel_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  template TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (guild_id, event_key)
);
`);

module.exports = db;
