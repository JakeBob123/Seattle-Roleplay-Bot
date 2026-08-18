// Uses Node's built-in SQLite (node:sqlite, available without an experimental
// flag since Node 22.13+) instead
// of a third-party native module. This is a deliberate choice for
// deployability: better-sqlite3 has no prebuilt binaries for current Node
// versions and always needs to compile from source on install, which is
// exactly the kind of thing that breaks a Render (or any PaaS) build in
// ways that are painful to debug. node:sqlite ships inside Node itself --
// zero native compilation, zero install-time risk. The API below
// (prepare/run/get/all, named @params, PRAGMA via exec, multi-statement
// exec, ON CONFLICT upserts, lastInsertRowid) is a near-drop-in match for
// better-sqlite3's, all verified working before this migration was made.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'platform.sqlite'));
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

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
  emoji_key TEXT NOT NULL,        -- semantic key, e.g. 'moderation.ban'
  emoji_id TEXT,
  emoji_name TEXT,
  animated INTEGER NOT NULL DEFAULT 0,
  provider TEXT,                  -- which provider supplied the asset (e.g. 'twemoji')
  source_url TEXT,                -- original asset URL, for attribution/re-fetch
  asset_hash TEXT,                -- sha256 of the downloaded asset, for cache/dedup
  style_tag TEXT,                 -- coarse style descriptor, e.g. 'flat-color'
  installed_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (guild_id, module_id, emoji_key)
);

-- Tracks the server's chosen visual style so new emoji picks stay
-- consistent with what's already installed (Smart Emoji Engine §4).
CREATE TABLE IF NOT EXISTS emoji_style_profile (
  guild_id TEXT PRIMARY KEY,
  style_tag TEXT NOT NULL DEFAULT 'flat-color',
  animated_preference INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS webhooks_config (
  guild_id TEXT NOT NULL,
  event_key TEXT NOT NULL,       -- e.g. 'ticket_created', 'promotion', 'session_start'
  channel_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  template TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (guild_id, event_key)
);

-- ER:LC (Emergency Response: Liberty County) private-server API integration.
-- The server-key is stored encrypted (see src/core/crypto.js) -- never in
-- plaintext, never in guild_config JSON, never logged.
CREATE TABLE IF NOT EXISTS erlc_credentials (
  guild_id TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  tag TEXT NOT NULL,
  connected INTEGER NOT NULL DEFAULT 0,
  last_tested_at TEXT,
  last_error TEXT,
  server_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Dedup + audit trail for inbound ER:LC event webhooks (Ed25519-signed).
CREATE TABLE IF NOT EXISTS erlc_webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  event_hash TEXT NOT NULL UNIQUE,   -- hash of (timestamp + raw body), rejects replays
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Rolling snapshot of last-seen JoinLogs per guild, used to diff new
-- joins/leaves for Discord notifications without spamming the API.
CREATE TABLE IF NOT EXISTS erlc_join_state (
  guild_id TEXT PRIMARY KEY,
  last_timestamp INTEGER NOT NULL DEFAULT 0
);

-- Audit trail specifically for /erlc-command executions (in addition to
-- the general audit_log entry) so command abuse is easy to review.
CREATE TABLE IF NOT EXISTS erlc_command_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  executor_id TEXT NOT NULL,
  command TEXT NOT NULL,
  result TEXT NOT NULL,          -- 'success' | 'error'
  response_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Media Team submissions: username + required image attachment.
CREATE TABLE IF NOT EXISTS media_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  submitter_id TEXT NOT NULL,
  in_game_username TEXT NOT NULL,
  attachment_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  reviewed_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

module.exports = db;
