const db = require('../database/db');
const { PermissionFlagsBits } = require('discord.js');

// The hard-coded default founder. This user has full override access on any
// guild until the guild's own founder/admins configure permissions via
// /config -> Roles & Permissions. This is a bootstrap safety net, not the
// permanent permission model.
const DEFAULT_FOUNDER_ID = '1398704599396782210';

const grantStmt = db.prepare(`
  INSERT OR IGNORE INTO permissions (guild_id, scope_type, scope_id, target_type, target_id)
  VALUES (?, ?, ?, ?, ?)
`);
const revokeStmt = db.prepare(`
  DELETE FROM permissions WHERE guild_id = ? AND scope_type = ? AND scope_id = ? AND target_type = ? AND target_id = ?
`);
const listStmt = db.prepare(`
  SELECT * FROM permissions WHERE guild_id = ? AND scope_type = ? AND scope_id = ?
`);

function grant(guildId, scopeType, scopeId, targetType, targetId) {
  grantStmt.run(guildId, scopeType, scopeId, targetType, targetId);
}

function revoke(guildId, scopeType, scopeId, targetType, targetId) {
  revokeStmt.run(guildId, scopeType, scopeId, targetType, targetId);
}

function listGrants(guildId, scopeType, scopeId) {
  return listStmt.all(guildId, scopeType, scopeId);
}

/**
 * Checks whether a guild member is allowed to use a given command or module.
 * Order of precedence:
 *   1. Hard-coded default founder (bootstrap only)
 *   2. Guild's configured founder_id
 *   3. Server "Administrator" permission
 *   4. Explicit user-level grant
 *   5. Explicit role-level grant
 *   6. If no grants exist at all for that scope, default to false (fail closed)
 *      EXCEPT for scopes explicitly marked public (e.g. /role-request).
 */
function canUse(member, guildConfigRow, scopeType, scopeId, { publicByDefault = false } = {}) {
  if (!member) return false;
  if (member.id === DEFAULT_FOUNDER_ID) return true;
  if (guildConfigRow?.founder_id && member.id === guildConfigRow.founder_id) return true;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;

  const grants = listGrants(member.guild.id, scopeType, scopeId);
  if (grants.length === 0) return publicByDefault;

  for (const grant of grants) {
    if (grant.target_type === 'user' && grant.target_id === member.id) return true;
    if (grant.target_type === 'role' && member.roles.cache.has(grant.target_id)) return true;
  }
  return false;
}

module.exports = { DEFAULT_FOUNDER_ID, grant, revoke, listGrants, canUse };
