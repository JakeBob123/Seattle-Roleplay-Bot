const db = require('../database/db');

/**
 * Default configuration skeleton. Modules extend this at boot via
 * registerDefaults() so config.js never needs to know about every module.
 */
let defaultConfig = {
  general: {
    botName: 'Liberty County Platform',
    color: '#5865F2',
    successColor: '#57F287',
    warningColor: '#FEE75C',
    errorColor: '#ED4245',
    footer: 'Liberty County',
    timezone: 'America/New_York',
    logChannelId: null,
  },
  modules: {}, // moduleId -> { enabled: bool, ...moduleConfig }
};

function registerModuleDefaults(moduleId, moduleDefaults) {
  defaultConfig.modules[moduleId] = { enabled: false, ...moduleDefaults };
}

function deepMerge(base, override) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const key of Object.keys(override || {})) {
    if (
      override[key] &&
      typeof override[key] === 'object' &&
      !Array.isArray(override[key]) &&
      base &&
      typeof base[key] === 'object'
    ) {
      out[key] = deepMerge(base[key], override[key]);
    } else {
      out[key] = override[key];
    }
  }
  return out;
}

const getRow = db.prepare('SELECT * FROM guild_config WHERE guild_id = ?');
const insertRow = db.prepare(
  `INSERT INTO guild_config (guild_id, configured, founder_id, data) VALUES (?, ?, ?, ?)`
);
const updateRow = db.prepare(
  `UPDATE guild_config SET configured = ?, founder_id = ?, data = ?, updated_at = datetime('now') WHERE guild_id = ?`
);

function ensureGuild(guildId, founderId = null) {
  const row = getRow.get(guildId);
  if (row) return row;
  insertRow.run(guildId, 0, founderId, JSON.stringify(defaultConfig));
  return getRow.get(guildId);
}

function getConfig(guildId) {
  const row = ensureGuild(guildId);
  const stored = JSON.parse(row.data);
  // Always merge stored config over current defaults so new modules /
  // new config keys added by an update show up automatically.
  return deepMerge(defaultConfig, stored);
}

function isConfigured(guildId) {
  const row = ensureGuild(guildId);
  return !!row.configured;
}

function setConfigured(guildId, founderId) {
  const row = ensureGuild(guildId, founderId);
  updateRow.run(1, row.founder_id || founderId, row.data, guildId);
}

function updateConfig(guildId, patchFn) {
  const row = ensureGuild(guildId);
  const current = deepMerge(defaultConfig, JSON.parse(row.data));
  const next = patchFn(current) || current;
  updateRow.run(row.configured, row.founder_id, JSON.stringify(next), guildId);
  return next;
}

function isModuleEnabled(guildId, moduleId) {
  const cfg = getConfig(guildId);
  return !!cfg.modules?.[moduleId]?.enabled;
}

module.exports = {
  registerModuleDefaults,
  getConfig,
  updateConfig,
  isConfigured,
  setConfigured,
  isModuleEnabled,
  ensureGuild,
};
