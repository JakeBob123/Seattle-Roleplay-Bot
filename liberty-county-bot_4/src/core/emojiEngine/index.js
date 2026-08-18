const crypto = require('crypto');
const db = require('../../database/db');
const { rankCandidates } = require('./ranking');

const PROVIDERS = [require('./providers/twemojiProvider')];

const getCached = db.prepare(`
  SELECT * FROM custom_emojis WHERE guild_id = ? AND module_id = ? AND emoji_key = ?
`);
const getAnyByEmojiKey = db.prepare(`
  SELECT * FROM custom_emojis WHERE guild_id = ? AND emoji_key = ? LIMIT 1
`);
const getByHash = db.prepare(`
  SELECT * FROM custom_emojis WHERE guild_id = ? AND asset_hash = ? LIMIT 1
`);
const insertEmoji = db.prepare(`
  INSERT OR REPLACE INTO custom_emojis
    (guild_id, module_id, emoji_key, emoji_id, emoji_name, animated, provider, source_url, asset_hash, style_tag, installed_at)
  VALUES (@guildId, @moduleId, @emojiKey, @emojiId, @emojiName, @animated, @provider, @sourceUrl, @assetHash, @styleTag, datetime('now'))
`);
const listForGuild = db.prepare(`SELECT * FROM custom_emojis WHERE guild_id = ? ORDER BY module_id, emoji_key`);
const deleteEmoji = db.prepare(`DELETE FROM custom_emojis WHERE guild_id = ? AND module_id = ? AND emoji_key = ?`);
const getStyleProfile = db.prepare(`SELECT * FROM emoji_style_profile WHERE guild_id = ?`);
const upsertStyleProfile = db.prepare(`
  INSERT INTO emoji_style_profile (guild_id, style_tag, animated_preference) VALUES (?, ?, ?)
  ON CONFLICT(guild_id) DO UPDATE SET style_tag = excluded.style_tag, animated_preference = excluded.animated_preference
`);

function ensureStyleProfile(guildId) {
  let profile = getStyleProfile.get(guildId);
  if (!profile) {
    upsertStyleProfile.run(guildId, 'flat-color', 0);
    profile = getStyleProfile.get(guildId);
  }
  return profile;
}

/**
 * The main entry point every module uses. Returns a ready-to-use emoji
 * string ("<:name:id>" if installed, or the Unicode fallback if not) —
 * callers never need to know whether installation happened this call,
 * came from cache, or fell back.
 *
 * @param {Guild} guild - discord.js Guild (needs ManageEmojisAndStickers)
 * @param {string} moduleId - requesting module, e.g. "moderation"
 * @param {string} semanticKey - key from keywordMap.js, e.g. "moderation.ban"
 */
async function requestEmoji(guild, moduleId, semanticKey) {
  // 1. Already installed for this exact module+key.
  const cached = getCached.get(guild.id, moduleId, semanticKey);
  if (cached?.emoji_id) return formatMention(cached);

  // 2. Another module in this guild already installed the same semantic
  //    key (e.g. "support.claim" reused by two ticket-like modules) —
  //    reuse the existing Discord emoji instead of creating a duplicate.
  const sharedByKey = getAnyByEmojiKey.get(guild.id, semanticKey);
  if (sharedByKey?.emoji_id) {
    insertEmoji.run({
      guildId: guild.id,
      moduleId,
      emojiKey: semanticKey,
      emojiId: sharedByKey.emoji_id,
      emojiName: sharedByKey.emoji_name,
      animated: sharedByKey.animated,
      provider: sharedByKey.provider,
      sourceUrl: sharedByKey.source_url,
      assetHash: sharedByKey.asset_hash,
      styleTag: sharedByKey.style_tag,
    });
    return formatMention(sharedByKey);
  }

  // 3. Search providers, rank, pick best candidate.
  const styleProfile = ensureStyleProfile(guild.id);
  let candidates = [];
  for (const provider of PROVIDERS) {
    try {
      candidates.push(...(await provider.search(semanticKey)));
    } catch (err) {
      console.error(`[emojiEngine] Provider ${provider.id} search failed for ${semanticKey}:`, err.message);
    }
  }
  if (!candidates.length) return null; // no known mapping -> caller should use its own Unicode fallback

  const ranked = rankCandidates(candidates, styleProfile);
  const best = ranked[0];

  // 4. Download + hash. Reuse an existing guild emoji if we've already
  //    installed this exact asset under a different key (true dedup, not
  //    just same semanticKey).
  const provider = PROVIDERS.find((p) => p.id === best.provider);
  let buffer;
  try {
    buffer = await provider.download(best);
  } catch (err) {
    console.error(`[emojiEngine] Download failed for ${semanticKey}:`, err.message);
    return null;
  }
  const assetHash = crypto.createHash('sha256').update(buffer).digest('hex');

  const existingByHash = getByHash.get(guild.id, assetHash);
  if (existingByHash?.emoji_id) {
    insertEmoji.run({
      guildId: guild.id,
      moduleId,
      emojiKey: semanticKey,
      emojiId: existingByHash.emoji_id,
      emojiName: existingByHash.emoji_name,
      animated: existingByHash.animated,
      provider: best.provider,
      sourceUrl: best.url,
      assetHash,
      styleTag: best.style,
    });
    return formatMention(existingByHash);
  }

  // 5. Respect Discord's per-guild emoji cap — fall back to Unicode
  //    instead of throwing, per spec ("gracefully fall back if Discord
  //    emoji limits or permissions prevent installation").
  const maxEmojis = guild.premiumTier === 3 ? 250 : guild.premiumTier === 2 ? 150 : guild.premiumTier === 1 ? 100 : 50;
  if (guild.emojis.cache.size >= maxEmojis) {
    console.warn(`[emojiEngine] Guild ${guild.id} is at its emoji cap — falling back to Unicode for ${semanticKey}.`);
    return best.unicode;
  }

  // 6. Install as a real Discord custom emoji.
  const name = semanticKey.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 32);
  let created;
  try {
    created = await guild.emojis.create({ attachment: buffer, name, reason: `Smart Emoji Engine: ${semanticKey}` });
  } catch (err) {
    console.error(`[emojiEngine] guild.emojis.create failed for ${semanticKey}:`, err.message);
    return best.unicode; // graceful fallback, never fake success
  }

  insertEmoji.run({
    guildId: guild.id,
    moduleId,
    emojiKey: semanticKey,
    emojiId: created.id,
    emojiName: created.name,
    animated: created.animated ? 1 : 0,
    provider: best.provider,
    sourceUrl: best.url,
    assetHash,
    styleTag: best.style,
  });

  return formatMention({ emoji_id: created.id, emoji_name: created.name, animated: created.animated ? 1 : 0 });
}

/** Batch helper — modules declare all their asset needs in one call. */
async function requestEmojiSet(guild, moduleId, semanticKeys) {
  const out = {};
  for (const key of semanticKeys) {
    out[key] = await requestEmoji(guild, moduleId, key);
  }
  return out;
}

function formatMention(row) {
  if (!row?.emoji_id) return null;
  return `<${row.animated ? 'a' : ''}:${row.emoji_name}:${row.emoji_id}>`;
}

function listInstalled(guildId) {
  return listForGuild.all(guildId);
}

function removeInstalled(guildId, moduleId, emojiKey) {
  deleteEmoji.run(guildId, moduleId, emojiKey);
}

/**
 * Finds duplicate installs (same asset_hash, different rows) so an admin
 * can consolidate. Does not delete anything automatically — recommends only.
 */
function findOptimizations(guildId) {
  const rows = listForGuild.all(guildId);
  const byHash = new Map();
  for (const row of rows) {
    if (!row.asset_hash) continue;
    if (!byHash.has(row.asset_hash)) byHash.set(row.asset_hash, []);
    byHash.get(row.asset_hash).push(row);
  }
  return [...byHash.values()].filter((group) => new Set(group.map((r) => r.emoji_id)).size > 1);
}

module.exports = {
  requestEmoji,
  requestEmojiSet,
  listInstalled,
  removeInstalled,
  findOptimizations,
  ensureStyleProfile,
  setStyleProfile: (guildId, styleTag, animatedPreference) => upsertStyleProfile.run(guildId, styleTag, animatedPreference ? 1 : 0),
};
