const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');
const db = require('../../database/db');
const configManager = require('../../core/configManager');
const { getBrand } = require('../../core/branding');
const { logAudit } = require('../../core/audit');

const insertRequest = db.prepare(`
  INSERT INTO role_requests (guild_id, requester_id, department, current_rank, requested_rank, roles_requested, proof_url)
  VALUES (@guildId, @requesterId, @department, @currentRank, @requestedRank, @rolesRequested, @proofUrl)
`);
const setStatus = db.prepare(`UPDATE role_requests SET status = ?, reviewed_by = ? WHERE id = ?`);
const getRequest = db.prepare(`SELECT * FROM role_requests WHERE id = ?`);

const roleRequestCommand = {
  data: new SlashCommandBuilder()
    .setName('role-request')
    .setDescription('Request a department role or rank. Requires image proof.')
    .setDMPermission(false),
  publicByDefault: true,
  async execute(interaction) {
    const modal = new ModalBuilder().setCustomId('roleRequest:modal').setTitle('Role Request');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('department').setLabel('Department').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('currentRank').setLabel('Current Rank').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('requestedRank').setLabel('Rank Requested').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('rolesRequested').setLabel('Role(s) Needed').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('proofUrl')
          .setLabel('Proof — direct image URL (screenshot)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('https://.../screenshot.png')
          .setRequired(true)
      )
    );

    await interaction.showModal(modal);
  },
};

const IMAGE_URL_RE = /^https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i;

async function handleModalSubmit(interaction) {
  const department = interaction.fields.getTextInputValue('department');
  const currentRank = interaction.fields.getTextInputValue('currentRank');
  const requestedRank = interaction.fields.getTextInputValue('requestedRank');
  const rolesRequested = interaction.fields.getTextInputValue('rolesRequested');
  const proofUrl = interaction.fields.getTextInputValue('proofUrl').trim();

  if (!IMAGE_URL_RE.test(proofUrl)) {
    return interaction.reply({
      content: 'Proof must be a direct image link (png/jpg/jpeg/gif/webp) — e.g. an uploaded screenshot link. Please try again.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const guildConfig = configManager.getConfig(interaction.guildId);
  const brand = getBrand(guildConfig);
  const moduleConfig = guildConfig.modules.roleRequest || {};

  const result = insertRequest.run({
    guildId: interaction.guildId,
    requesterId: interaction.user.id,
    department,
    currentRank,
    requestedRank,
    rolesRequested,
    proofUrl,
  });
  logAudit({ guildId: interaction.guildId, actorId: interaction.user.id, eventType: 'role_request.created', targetId: String(result.lastInsertRowid) });

  const container = new ContainerBuilder().setAccentColor(brand.color);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `## Role Request`,
        `**User:** <@${interaction.user.id}>`,
        `**Department:** ${department}`,
        `**Current Rank:** ${currentRank}`,
        `**Requested Rank:** ${requestedRank}`,
        `**Role(s):** ${rolesRequested}`,
      ].join('\n')
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`Proof: ${proofUrl}`));
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`roleRequest:approve:${result.lastInsertRowid}`).setLabel('Approve').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`roleRequest:reject:${result.lastInsertRowid}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
    )
  );

  const reviewChannelId = moduleConfig.reviewChannelId;
  if (reviewChannelId) {
    const channel = await interaction.guild.channels.fetch(reviewChannelId).catch(() => null);
    if (channel) await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }

  await interaction.reply({
    content: reviewChannelId
      ? 'Your role request has been submitted for staff review.'
      : 'Your role request was recorded, but no review channel is configured yet — ask an admin to set one in `/config`.',
    flags: MessageFlags.Ephemeral,
  });
}

async function handleReviewButton(interaction) {
  const [, decision, idStr] = interaction.customId.split(':');
  const id = Number(idStr);
  const request = getRequest.get(id);
  if (!request) return interaction.reply({ content: 'This request no longer exists.', flags: MessageFlags.Ephemeral });

  setStatus.run(decision === 'approve' ? 'approved' : 'rejected', interaction.user.id, id);
  logAudit({
    guildId: interaction.guildId,
    actorId: interaction.user.id,
    eventType: `role_request.${decision}`,
    targetId: String(id),
  });

  await interaction.reply({
    content: `Request #${id} ${decision === 'approve' ? 'approved' : 'rejected'} by <@${interaction.user.id}>.`,
  });
}

module.exports = {
  id: 'roleRequest',
  name: 'Role Requests',
  description: 'Member-facing rank/role request form with required image proof and staff review.',
  defaultConfig: {
    reviewChannelId: null,
  },
  commands: [roleRequestCommand],

  async handleComponent(interaction) {
    if (interaction.isModalSubmit() && interaction.customId === 'roleRequest:modal') {
      return handleModalSubmit(interaction);
    }
    if (interaction.isButton() && interaction.customId.startsWith('roleRequest:approve:')) return handleReviewButton(interaction);
    if (interaction.isButton() && interaction.customId.startsWith('roleRequest:reject:')) return handleReviewButton(interaction);
  },
};
