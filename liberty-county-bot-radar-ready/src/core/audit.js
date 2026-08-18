const db = require('../database/db');

const insertAudit = db.prepare(`
  INSERT INTO audit_log (guild_id, actor_id, event_type, target_id, before_value, after_value, case_id)
  VALUES (@guildId, @actorId, @eventType, @targetId, @beforeValue, @afterValue, @caseId)
`);

function logAudit({ guildId, actorId, eventType, targetId = null, before = null, after = null, caseId = null }) {
  insertAudit.run({
    guildId,
    actorId,
    eventType,
    targetId,
    beforeValue: before ? JSON.stringify(before) : null,
    afterValue: after ? JSON.stringify(after) : null,
    caseId,
  });
}

const nextCaseNumberStmt = db.prepare(
  `SELECT COALESCE(MAX(case_number), 0) + 1 AS next FROM mod_cases WHERE guild_id = ?`
);
const insertCaseStmt = db.prepare(`
  INSERT INTO mod_cases (guild_id, case_number, target_id, moderator_id, action, reason, evidence)
  VALUES (@guildId, @caseNumber, @targetId, @moderatorId, @action, @reason, @evidence)
`);
const getCasesForTargetStmt = db.prepare(
  `SELECT * FROM mod_cases WHERE guild_id = ? AND target_id = ? ORDER BY case_number DESC`
);
const getCaseStmt = db.prepare(
  `SELECT * FROM mod_cases WHERE guild_id = ? AND case_number = ?`
);

function createCase({ guildId, targetId, moderatorId, action, reason, evidence = null }) {
  const { next } = nextCaseNumberStmt.get(guildId);
  insertCaseStmt.run({ guildId, caseNumber: next, targetId, moderatorId, action, reason, evidence });
  logAudit({ guildId, actorId: moderatorId, eventType: `mod.${action}`, targetId, after: { reason }, caseId: next });
  return getCaseStmt.get(guildId, next);
}

function getCaseHistory(guildId, targetId) {
  return getCasesForTargetStmt.all(guildId, targetId);
}

module.exports = { logAudit, createCase, getCaseHistory };
