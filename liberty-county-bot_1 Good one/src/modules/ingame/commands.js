const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const configManager = require('../../core/configManager');
const { getBrand } = require('../../core/branding');
const erlcClient = require('./erlcClient');
const credentialStore = require('./credentialStore');
const { buildDashboardContainer } = require('./dashboard');
const db = require('../../database/db');
const { logAudit } = require('../../core/audit');

const insertCmdLog = db.prepare(`
  INSERT INTO erlc_command_log (guild_id, executor_id, command, result, response_message) VALUES (?, ?, ?, ?, ?)
`);

// Commands that meaningfully change server/player state and therefore need
// a confirmation click before firing, per spec requirement #26 "confirmation
// for potentially destructive actions". Matched by the command's leading
// verb (case-insensitive, ':' prefix optional).
const DESTRUCTIVE_PREFIXES = [':ban', ':kick', ':unban', ':mod', ':admin', ':wipe', ':jail'];

function isDestructive(command) {
  const normalized = command.trim().toLowerCase();
  return DESTRUCTIVE_PREFIXES.some((p) => normalized.startsWith(p));
}

// Simple in-process cooldown mirroring ER:LC's documented command bucket
// (1 request / 5s per server-key) so we fail fast with a friendly message
// instead of burning a 429 against the real API.
const lastCommandAt = new Map(); // guildId -> epoch ms
const COOLDOWN_MS = 5000;

const serverInfoCommand = {
  data: new SlashCommandBuilder()
    .setName('server-info')
    .setDescription('Show live ER:LC server status.')
    .setDMPermission(false),
  async execute(interaction) {
    const serverKey = credentialStore.getKey(interaction.guildId);
    const guildConfig = configManager.getConfig(interaction.guildId);
    const brand = getBrand(guildConfig);

    if (!serverKey) {
      return interaction.reply({
        content: 'ER:LC is not connected yet. An admin can set it up in `/config` -> In-Game Integration.',
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply();
    try {
      const { data } = await erlcClient.getServerInfo(serverKey, { Staff: true, EmergencyCalls: true });
      credentialStore.setStatus(interaction.guildId, { connected: true, serverName: data.Name });
      await interaction.editReply({ components: [buildDashboardContainer(brand, data)], flags: MessageFlags.IsComponentsV2 });
    } catch (err) {
      credentialStore.setStatus(interaction.guildId, { connected: false, error: err.message });
      await interaction.editReply({ content: `Couldn't reach the ER:LC server: ${err.message}` });
    }
  },
};

const erlcCommandCommand = {
  data: new SlashCommandBuilder()
    .setName('erlc-command')
    .setDescription('Run a command on the ER:LC private server as virtual server management.')
    .addStringOption((o) => o.setName('command').setDescription('e.g. ":h Hello everyone!"').setRequired(true))
    .setDMPermission(false),
  async execute(interaction) {
    const command = interaction.options.getString('command');
    const serverKey = credentialStore.getKey(interaction.guildId);

    if (!serverKey) {
      return interaction.reply({ content: 'ER:LC is not connected. Configure it in `/config` first.', flags: MessageFlags.Ephemeral });
    }

    if (isDestructive(command)) {
      const guildConfig = configManager.getConfig(interaction.guildId);
      const brand = getBrand(guildConfig);
      const container = new ContainerBuilder().setAccentColor(brand.warning);
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`## Confirm Command\nThis command may affect a player or the server:\n\`${command}\``)
      );
      container.addSeparatorComponents(new SeparatorBuilder());
      container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`ingame:confirm-command:${Buffer.from(command).toString('base64url')}`)
            .setLabel('Run Command')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('ingame:cancel-command').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        )
      );
      return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }

    return executeErlcCommand(interaction, command);
  },
};

async function executeErlcCommand(interaction, command) {
  const guildId = interaction.guildId;
  const now = Date.now();
  const last = lastCommandAt.get(guildId) || 0;
  if (now - last < COOLDOWN_MS) {
    const waitSec = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
    return interaction.reply({
      content: `The ER:LC command endpoint allows 1 request per 5 seconds. Try again in ${waitSec}s.`,
      flags: MessageFlags.Ephemeral,
    });
  }
  lastCommandAt.set(guildId, now);

  const serverKey = credentialStore.getKey(guildId);
  const deferred = interaction.deferred || interaction.replied;
  if (!deferred) await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const { data } = await erlcClient.runCommand(serverKey, command);
    insertCmdLog.run(guildId, interaction.user.id, command, 'success', data?.message || null);
    logAudit({ guildId, actorId: interaction.user.id, eventType: 'erlc.command', targetId: null, after: { command, result: data?.message } });
    await interaction.editReply({ content: `Command sent: ${data?.message || 'executed.'}` });
  } catch (err) {
    insertCmdLog.run(guildId, interaction.user.id, command, 'error', err.message);
    logAudit({ guildId, actorId: interaction.user.id, eventType: 'erlc.command_failed', targetId: null, after: { command, error: err.message } });
    await interaction.editReply({ content: `Command failed: ${err.message}` });
  }
}

module.exports = { serverInfoCommand, erlcCommandCommand, executeErlcCommand, isDestructive };
