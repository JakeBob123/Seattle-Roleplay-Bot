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
const db = require('../../database/db');
const configManager = require('../../core/configManager');
const { getBrand } = require('../../core/branding');
const { logAudit } = require('../../core/audit');
const webhookEngine = require('../webhooks/engine');

const insertRequest = db.prepare(`
  INSERT INTO media_requests (guild_id, submitter_id, in_game_username, attachment_url) VALUES (?, ?, ?, ?)
`);
const setStatus = db.prepare(`UPDATE media_requests SET status = ?, reviewed_by = ? WHERE id = ?`);
const getRequest = db.prepare(`SELECT * FROM media_requests WHERE id = ?`);

// This command is access-controlled by the existing granular permission
// manager (see /config -> Roles & Permissions), NOT hard-coded role names
// -- the spec asked to restrict this to "Media Team, Supervisors, Internal
// Affairs, and Management," which are server-specific roles an admin picks
// from their own server. publicByDefault: false means nobody can use it
// until an admin explicitly grants those roles access to `/media-request`.
const mediaRequestCommand = {
  data: new SlashCommandBuilder()
    .setName('media-request')
    .setDescription('Submit a media/graphics request with an in-game username and image.')
    .addStringOption((o) => o.setName('username').setDescription('In-game username').setRequired(true))
    .addAttachmentOption((o) => o.setName('picture').setDescription('Reference image').setRequired(true))
    .setDMPermission(false),
  publicByDefault: false,

  async execute(interaction) {
    const username = interaction.options.getString('username');
    const attachment = interaction.options.getAttachment('picture');

    if (!attachment.contentType?.startsWith('image/')) {
      return interaction.reply({ content: 'The attachment must be an image file.', flags: MessageFlags.Ephemeral });
    }

    const guildConfig = configManager.getConfig(interaction.guildId);
    const brand = getBrand(guildConfig);
    const moduleConfig = guildConfig.modules.media || {};

    const result = insertRequest.run(interaction.guildId, interaction.user.id, username, attachment.url);
    logAudit({ guildId: interaction.guildId, actorId: interaction.user.id, eventType: 'media.submitted', targetId: String(result.lastInsertRowid) });

    const container = new ContainerBuilder().setAccentColor(brand.color);
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Media Submission\n**Submitted by:** <@${interaction.user.id}>\n**In-game username:** ${username}`)
    );
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`media:approve:${result.lastInsertRowid}`).setLabel('Approve').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`media:reject:${result.lastInsertRowid}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
      )
    );

    if (moduleConfig.reviewChannelId) {
      const channel = await interaction.guild.channels.fetch(moduleConfig.reviewChannelId).catch(() => null);
      if (channel) {
        await channel.send({
          content: attachment.url,
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        });
      }
    }

    await interaction.reply({
      content: moduleConfig.reviewChannelId
        ? 'Your media submission has been sent for review.'
        : 'Submission recorded, but no review channel is configured yet — ask an admin to set one in `/config`.',
      flags: MessageFlags.Ephemeral,
    });

    webhookEngine
      .sendEvent(interaction.client, interaction.guildId, 'media.request_submitted', {
        user: `<@${interaction.user.id}>`,
        in_game_username: username,
        attachment_url: attachment.url,
      })
      .catch((err) => console.error('[webhookEngine] media.request_submitted failed:', err));
  },
};

async function handleReviewButton(interaction) {
  const [, decision, idStr] = interaction.customId.split(':');
  const id = Number(idStr);
  const request = getRequest.get(id);
  if (!request) return interaction.reply({ content: 'This submission no longer exists.', flags: MessageFlags.Ephemeral });

  setStatus.run(decision === 'approve' ? 'approved' : 'rejected', interaction.user.id, id);
  logAudit({ guildId: interaction.guildId, actorId: interaction.user.id, eventType: `media.${decision}`, targetId: String(id) });

  await interaction.reply({ content: `Submission #${id} ${decision === 'approve' ? 'approved' : 'rejected'} by <@${interaction.user.id}>.` });
}

module.exports = { mediaRequestCommand, handleReviewButton };
