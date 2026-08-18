/**
 * Restricts the bot to specific servers. Set ALLOWED_GUILD_IDS in .env to
 * a comma-separated list of guild IDs. If it's unset or empty, the bot
 * allows any server it's invited to (open mode) -- set it to lock the bot
 * down to only the servers you run, which is what "don't be loud in every
 * server" means in practice: any guild NOT on this list gets left
 * automatically, both on join and on every startup.
 */
function getAllowlist() {
  const raw = process.env.ALLOWED_GUILD_IDS;
  if (!raw || !raw.trim()) return null; // null = no restriction
  return new Set(
    raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

function isAllowed(guildId) {
  const allowlist = getAllowlist();
  if (!allowlist) return true;
  return allowlist.has(guildId);
}

/** Leaves any currently-joined guild that isn't on the allowlist. Call on
 * 'ready' so a guild removed from ALLOWED_GUILD_IDS gets cleaned up even
 * if the bot was already in it before the list was tightened. */
async function enforceOnReady(client) {
  const allowlist = getAllowlist();
  if (!allowlist) return;

  for (const [guildId, guild] of client.guilds.cache) {
    if (!allowlist.has(guildId)) {
      console.warn(`[allowlist] Leaving unauthorized guild: ${guild.name} (${guildId})`);
      await guild.leave().catch((err) => console.error(`[allowlist] Failed to leave ${guildId}:`, err.message));
    }
  }
}

module.exports = { getAllowlist, isAllowed, enforceOnReady };
