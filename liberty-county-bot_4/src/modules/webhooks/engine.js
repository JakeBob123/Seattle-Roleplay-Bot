const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } = require('discord.js');
const db = require('../../database/db');
const configManager = require('../../core/configManager');
const { getBrand } = require('../../core/branding');
const emojiEngine = require('../../core/emojiEngine');
const EVENT_DEFINITIONS = require('./eventDefinitions');

const getRow = db.prepare(`SELECT * FROM webhooks_config WHERE guild_id = ? AND event_key = ?`);
const upsertRow = db.prepare(`
  INSERT INTO webhooks_config (guild_id, event_key, channel_id, enabled, template)
  VALUES (@guildId, @eventKey, @channelId, @enabled, @template)
  ON CONFLICT(guild_id, event_key) DO UPDATE SET
    channel_id = excluded.channel_id,
    enabled = excluded.enabled,
    template = excluded.template
`);

function getEventDef(eventKey) {
  const def = EVENT_DEFINITIONS[eventKey];
  if (!def) throw new Error(`Unknown webhook event: ${eventKey}`);
  return def;
}

/** Merged view: stored overrides layered on the event's default template. */
function getEventConfig(guildId, eventKey) {
  const def = getEventDef(eventKey);
  const row = getRow.get(guildId, eventKey);
  const storedTemplate = row?.template ? JSON.parse(row.template) : {};
  return {
    eventKey,
    label: def.label,
    module: def.module,
    variables: def.variables,
    channelId: row?.channel_id ?? null,
    enabled: row ? !!row.enabled : true,
    template: { ...def.defaultTemplate, ...storedTemplate },
  };
}

function setEventConfig(guildId, eventKey, { channelId, enabled, template }) {
  const current = getEventConfig(guildId, eventKey);
  upsertRow.run({
    guildId,
    eventKey,
    channelId: channelId !== undefined ? channelId : current.channelId,
    enabled: (enabled !== undefined ? enabled : current.enabled) ? 1 : 0,
    template: JSON.stringify(template !== undefined ? { ...current.template, ...template } : current.template),
  });
}

/** Replaces only {placeholders} that are declared valid for this event. */
function renderString(str, variables, allowedVars) {
  if (!str) return str;
  return str.replace(/\{(\w+)\}/g, (match, name) => {
    if (!allowedVars.includes(name)) return match; // leave unrecognized placeholders untouched
    const value = variables[name];
    return value === undefined || value === null ? '' : String(value);
  });
}

async function buildEventContainer(guild, eventKey, variables) {
  const def = getEventDef(eventKey);
  const cfg = getEventConfig(guild.id, eventKey);
  const guildConfig = configManager.getConfig(guild.id);
  const brand = getBrand(guildConfig);

  const colorMap = { color: brand.color, success: brand.success, warning: brand.warning, error: brand.error };
  const accentColor = colorMap[cfg.template.color] ?? brand.color;

  let icon = '';
  try {
    const mention = def.emojiKey ? await emojiEngine.requestEmoji(guild, def.module, def.emojiKey) : null;
    if (mention) icon = `${mention} `;
  } catch {
    // icon is cosmetic only — never block a webhook send on emoji provisioning
  }

  const title = renderString(cfg.template.title, variables, cfg.variables);
  const description = renderString(cfg.template.description, variables, cfg.variables);

  const container = new ContainerBuilder().setAccentColor(accentColor);
  if (title) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${icon}${title}`));
  if (description) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(description));
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${brand.footer}`));

  return container;
}

/**
 * Every module that fires an event calls this. Silently no-ops if the
 * event is disabled or has no channel configured yet — that's normal
 * pre-setup state, not an error.
 */
async function sendEvent(client, guildId, eventKey, variables = {}) {
  const cfg = getEventConfig(guildId, eventKey);
  if (!cfg.enabled || !cfg.channelId) return { sent: false, reason: !cfg.enabled ? 'disabled' : 'no_channel' };

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return { sent: false, reason: 'guild_unavailable' };

  const channel = await guild.channels.fetch(cfg.channelId).catch(() => null);
  if (!channel) return { sent: false, reason: 'channel_unavailable' };

  const container = await buildEventContainer(guild, eventKey, variables);
  await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
  return { sent: true };
}

/** Sends to whatever channel the interaction was run in, marked as a test. */
async function sendTest(interaction, eventKey, sampleVariables) {
  const container = await buildEventContainer(interaction.guild, eventKey, sampleVariables);
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# ⚠️ This is a test send — no real event occurred.'));
  await interaction.channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
}

module.exports = { EVENT_DEFINITIONS, getEventDef, getEventConfig, setEventConfig, renderString, sendEvent, sendTest, buildEventContainer };
