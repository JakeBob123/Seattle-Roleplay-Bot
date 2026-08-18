const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  MessageFlags,
} = require('discord.js');
const configManager = require('../../core/configManager');
const { getBrand } = require('../../core/branding');
const { createCase, getCaseHistory } = require('../../core/audit');
const webhookEngine = require('../webhooks/engine');

function caseContainer(brand, title, body) {
  return new ContainerBuilder()
    .setAccentColor(brand.color)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}\n${body}`));
}

async function replyCase(interaction, action, target, reason) {
  const guildConfig = configManager.getConfig(interaction.guildId);
  const brand = getBrand(guildConfig);
  const modCase = createCase({
    guildId: interaction.guildId,
    targetId: target.id,
    moderatorId: interaction.user.id,
    action,
    reason: reason || 'No reason provided',
  });

  await interaction.reply({
    components: [
      caseContainer(
        brand,
        `Case #${modCase.case_number} — ${action[0].toUpperCase()}${action.slice(1)}`,
        `**Target:** <@${target.id}>\n**Moderator:** <@${interaction.user.id}>\n**Reason:** ${modCase.reason}`
      ),
    ],
    flags: MessageFlags.IsComponentsV2,
  });

  webhookEngine
    .sendEvent(interaction.client, interaction.guildId, 'moderation.case_created', {
      case_id: modCase.case_number,
      action,
      user: `<@${target.id}>`,
      moderator: `<@${interaction.user.id}>`,
      reason: modCase.reason,
    })
    .catch((err) => console.error('[webhookEngine] case_created failed:', err));

  return modCase;
}

const warn = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a warning to a member.')
    .addUserOption((o) => o.setName('target').setDescription('Member to warn').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the warning').setRequired(false))
    .setDMPermission(false),
  async execute(interaction) {
    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason');
    await replyCase(interaction, 'warn', target, reason);
  },
};

const kick = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server.')
    .addUserOption((o) => o.setName('target').setDescription('Member to kick').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the kick').setRequired(false))
    .setDMPermission(false),
  async execute(interaction) {
    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason');
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (member) await member.kick(reason || 'No reason provided').catch(() => null);
    await replyCase(interaction, 'kick', target, reason);
  },
};

const ban = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server.')
    .addUserOption((o) => o.setName('target').setDescription('Member to ban').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the ban').setRequired(false))
    .setDMPermission(false),
  async execute(interaction) {
    const target = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason');
    await interaction.guild.members.ban(target.id, { reason: reason || 'No reason provided' }).catch(() => null);
    await replyCase(interaction, 'ban', target, reason);
  },
};

const timeout = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a member.')
    .addUserOption((o) => o.setName('target').setDescription('Member to timeout').setRequired(true))
    .addIntegerOption((o) => o.setName('minutes').setDescription('Duration in minutes').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the timeout').setRequired(false))
    .setDMPermission(false),
  async execute(interaction) {
    const target = interaction.options.getUser('target');
    const minutes = interaction.options.getInteger('minutes');
    const reason = interaction.options.getString('reason');
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (member) await member.timeout(minutes * 60 * 1000, reason || 'No reason provided').catch(() => null);
    await replyCase(interaction, 'timeout', target, `${reason || 'No reason provided'} (${minutes}m)`);
  },
};

const history = {
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription("View a member's moderation history.")
    .addUserOption((o) => o.setName('target').setDescription('Member to look up').setRequired(true))
    .setDMPermission(false),
  async execute(interaction) {
    const target = interaction.options.getUser('target');
    const guildConfig = configManager.getConfig(interaction.guildId);
    const brand = getBrand(guildConfig);
    const cases = getCaseHistory(interaction.guildId, target.id);

    const body = cases.length
      ? cases
          .slice(0, 15)
          .map((c) => `**#${c.case_number}** — ${c.action} by <@${c.moderator_id}> — ${c.reason}`)
          .join('\n')
      : '_No moderation history on record._';

    await interaction.reply({
      components: [caseContainer(brand, `History — ${target.tag}`, body)],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },
};

module.exports = { warn, kick, ban, timeout, history };
