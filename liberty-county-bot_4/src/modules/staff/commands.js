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
  return new ContainerBuilder().setAccentColor(brand.color).addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}\n${body}`));
}

const promoteCommand = {
  data: new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Promote a staff member to a new rank.')
    .addUserOption((o) => o.setName('target').setDescription('Member to promote').setRequired(true))
    .addRoleOption((o) => o.setName('new-rank').setDescription('The rank role to promote them to').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason for the promotion').setRequired(false))
    .setDMPermission(false),
  async execute(interaction) {
    const target = interaction.options.getUser('target');
    const newRank = interaction.options.getRole('new-rank');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    const guildConfig = configManager.getConfig(interaction.guildId);
    const brand = getBrand(guildConfig);
    const hierarchy = guildConfig.modules.staff?.hierarchy || [];

    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) {
      return interaction.reply({ content: 'Could not find that member in this server.', flags: MessageFlags.Ephemeral });
    }

    // If a hierarchy ladder is configured, swap out any other ladder rank
    // the member holds so they only ever hold one rank at a time. If no
    // ladder is configured, the new rank is just added — nothing is
    // removed, since we'd be guessing at roles that aren't ours to touch.
    let oldRankName = null;
    if (hierarchy.length) {
      const currentLadderRole = member.roles.cache.find((r) => hierarchy.includes(r.id) && r.id !== newRank.id);
      if (currentLadderRole) {
        oldRankName = currentLadderRole.name;
        await member.roles.remove(currentLadderRole).catch((err) => console.error('[staff] role remove failed:', err.message));
      }
    }
    await member.roles.add(newRank).catch((err) => console.error('[staff] role add failed:', err.message));

    const modCase = createCase({ guildId: interaction.guildId, targetId: target.id, moderatorId: interaction.user.id, action: 'promotion', reason });

    await interaction.reply({
      components: [
        caseContainer(
          brand,
          `Case #${modCase.case_number} — Promotion`,
          `**Member:** <@${target.id}>\n${oldRankName ? `**From:** ${oldRankName}\n` : ''}**To:** ${newRank}\n**By:** <@${interaction.user.id}>\n**Reason:** ${reason}`
        ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    webhookEngine
      .sendEvent(interaction.client, interaction.guildId, 'staff.promotion', {
        member: `<@${target.id}>`,
        old_rank: oldRankName || 'N/A',
        new_rank: newRank.name,
        moderator: `<@${interaction.user.id}>`,
        reason,
      })
      .catch((err) => console.error('[webhookEngine] staff.promotion failed:', err));
  },
};

const INFRACTION_TYPES = [
  { name: 'Warning', value: 'warning' },
  { name: 'Activity Warning', value: 'activity_warning' },
  { name: 'Under Investigation', value: 'investigation' },
  { name: 'Termination', value: 'termination' },
];

const infractionCommand = {
  data: new SlashCommandBuilder()
    .setName('infraction')
    .setDescription('Log a staff infraction, warning, investigation, or termination.')
    .addUserOption((o) => o.setName('target').setDescription('Staff member').setRequired(true))
    .addStringOption((o) => o.setName('type').setDescription('Infraction type').setRequired(true).addChoices(...INFRACTION_TYPES))
    .addStringOption((o) => o.setName('reason').setDescription('Reason').setRequired(true))
    .setDMPermission(false),
  async execute(interaction) {
    const target = interaction.options.getUser('target');
    const type = interaction.options.getString('type');
    const reason = interaction.options.getString('reason');

    const guildConfig = configManager.getConfig(interaction.guildId);
    const brand = getBrand(guildConfig);
    const moduleConfig = guildConfig.modules.staff || {};

    let removedRoles = [];
    if (type === 'termination' && moduleConfig.terminationRemovesRoles && moduleConfig.staffRoleIds?.length) {
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (member) {
        const toRemove = member.roles.cache.filter((r) => moduleConfig.staffRoleIds.includes(r.id));
        removedRoles = [...toRemove.values()].map((r) => r.name);
        if (toRemove.size) await member.roles.remove(toRemove).catch((err) => console.error('[staff] termination role removal failed:', err.message));
      }
    }

    const modCase = createCase({ guildId: interaction.guildId, targetId: target.id, moderatorId: interaction.user.id, action: type, reason });
    const label = INFRACTION_TYPES.find((t) => t.value === type)?.name || type;

    await interaction.reply({
      components: [
        caseContainer(
          brand,
          `Case #${modCase.case_number} — ${label}`,
          [
            `**Member:** <@${target.id}>`,
            `**By:** <@${interaction.user.id}>`,
            `**Reason:** ${reason}`,
            removedRoles.length ? `**Roles removed:** ${removedRoles.join(', ')}` : null,
          ]
            .filter(Boolean)
            .join('\n')
        ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    webhookEngine
      .sendEvent(interaction.client, interaction.guildId, type === 'termination' ? 'staff.termination' : 'staff.infraction', {
        member: `<@${target.id}>`,
        type: label,
        moderator: `<@${interaction.user.id}>`,
        reason,
      })
      .catch((err) => console.error('[webhookEngine] staff infraction event failed:', err));
  },
};

const staffHistoryCommand = {
  data: new SlashCommandBuilder()
    .setName('staff-history')
    .setDescription("View a staff member's promotion/infraction history.")
    .addUserOption((o) => o.setName('target').setDescription('Staff member').setRequired(true))
    .setDMPermission(false),
  async execute(interaction) {
    const target = interaction.options.getUser('target');
    const guildConfig = configManager.getConfig(interaction.guildId);
    const brand = getBrand(guildConfig);
    const staffActions = new Set(['promotion', 'warning', 'activity_warning', 'investigation', 'termination']);
    const cases = getCaseHistory(interaction.guildId, target.id).filter((c) => staffActions.has(c.action));

    const body = cases.length
      ? cases.slice(0, 15).map((c) => `**#${c.case_number}** — ${c.action} by <@${c.moderator_id}> — ${c.reason}`).join('\n')
      : '_No staff record on file._';

    await interaction.reply({
      components: [caseContainer(brand, `Staff History — ${target.tag}`, body)],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },
};

module.exports = { promoteCommand, infractionCommand, staffHistoryCommand };
