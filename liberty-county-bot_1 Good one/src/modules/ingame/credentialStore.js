const db = require('../../database/db');
const crypto = require('../../core/crypto');

const getRow = db.prepare(`SELECT * FROM erlc_credentials WHERE guild_id = ?`);
const upsertRow = db.prepare(`
  INSERT INTO erlc_credentials (guild_id, ciphertext, iv, tag, connected, last_tested_at, last_error, server_name)
  VALUES (@guildId, @ciphertext, @iv, @tag, @connected, @lastTestedAt, @lastError, @serverName)
  ON CONFLICT(guild_id) DO UPDATE SET
    ciphertext = excluded.ciphertext,
    iv = excluded.iv,
    tag = excluded.tag,
    connected = excluded.connected,
    last_tested_at = excluded.last_tested_at,
    last_error = excluded.last_error,
    server_name = excluded.server_name
`);
const setStatusStmt = db.prepare(`
  UPDATE erlc_credentials SET connected = ?, last_tested_at = datetime('now'), last_error = ?, server_name = ?
  WHERE guild_id = ?
`);
const deleteRow = db.prepare(`DELETE FROM erlc_credentials WHERE guild_id = ?`);

function saveKey(guildId, plaintextKey) {
  const { ciphertext, iv, tag } = crypto.encrypt(plaintextKey);
  upsertRow.run({
    guildId,
    ciphertext,
    iv,
    tag,
    connected: 0,
    lastTestedAt: null,
    lastError: null,
    serverName: null,
  });
}

function getKey(guildId) {
  const row = getRow.get(guildId);
  if (!row) return null;
  return crypto.decrypt({ ciphertext: row.ciphertext, iv: row.iv, tag: row.tag });
}

function getStatus(guildId) {
  const row = getRow.get(guildId);
  if (!row) return { configured: false };
  return {
    configured: true,
    connected: !!row.connected,
    lastTestedAt: row.last_tested_at,
    lastError: row.last_error,
    serverName: row.server_name,
    maskedKey: crypto.mask(crypto.decrypt({ ciphertext: row.ciphertext, iv: row.iv, tag: row.tag })),
  };
}

function setStatus(guildId, { connected, error = null, serverName = null }) {
  setStatusStmt.run(connected ? 1 : 0, error, serverName, guildId);
}

function removeKey(guildId) {
  deleteRow.run(guildId);
}

module.exports = { saveKey, getKey, getStatus, setStatus, removeKey };
