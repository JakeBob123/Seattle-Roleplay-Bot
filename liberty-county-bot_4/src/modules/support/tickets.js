const {
  ChannelType,
  PermissionFlagsBits,
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
const { CATEGORIES } = require('./supportCommand');
const webhookEngine = require('../webhooks/engine');

// Categories the AI is permitted to assist in. Everything else (IA, HR,
// partnerships) is human-only per the platform's AI safety rules.
const AI_ELIGIBLE_CATEGORIES = new Set(['community_affairs']);

const insertTicket = db.prepare(`
  INSERT INTO tickets (guild_id, channel_id, opener_id, category) VALUES (?, ?, ?, ?)
`);
const getTicket = db.prepare(`SELECT * FROM tickets WHERE channel_id = ?`);
const setClaimed = db.prepare(`UPDATE tickets SET status = 'claimed', claimed_by = ? WHERE channel_id = ?`);
const setClosed = db.prepare(`UPDATE tickets SET status = 'closed', closed_at = datetime('now') WHERE channel_id = ?`);

async function openTicket(interaction, categoryId) {
  const category = CATEGORIES.find((c) => c.id === categoryId);
  if (!category) return;

  const guildConfig = configManager.getConfig(interaction.guildId);
  const moduleConfig = guildConfig.modules.support || {};
  const supportRoleIds = moduleConfig.reviewerRoles?.[categoryId] || [];

  const overwrites = [
    { id: interaction.guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: interaction.user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
    ...supportRoleIds.map((roleId) => ({
      id: roleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    })),
  ];

  const channel = await interaction.guild.channels.create({
    name: `${category.id.replace('_', '-')}-${interaction.user.username}`.slice(0, 90),
    type: ChannelType.GuildText,
    parent: moduleConfig.ticketCategoryId || undefined,
    permissionOverwrites: overwrites,
    topic: `Ticket opened by ${interaction.user.id} • Category: ${category.label}`,
  });

  insertTicket.run(interaction.guildId, channel.id, interaction.user.id, categoryId);
  logAudit({ guildId: interaction.guildId, actorId: interaction.user.id, eventType: 'ticket.created', targetId: channel.id });

  const brand = getBrand(guildConfig);
  const container = new ContainerBuilder().setAccentColor(brand.color);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `## ${category.label}`,
        `Opened by <@${interaction.user.id}>.`,
        AI_ELIGIBLE_CATEGORIES.has(categoryId)
          ? '_The AI assistant may help answer general questions here. Say "staff" any time to escalate to a human._'
          : '_This category is human-staff only — the AI assistant does not participate in these tickets._',
        supportRoleIds.length ? supportRoleIds.map((r) => `<@&${r}>`).join(' ') : '_No reviewer role configured yet for this category._',
      ].join('\n')
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('support:claim').setLabel('Claim').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('support:close').setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
    )
  );

  await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });

  webhookEngine
    .sendEvent(interaction.client, interaction.guildId, 'support.ticket_created', {
      user: `<@${interaction.user.id}>`,
      user_id: interaction.user.id,
      category: category.label,
      ticket_channel: `<#${channel.id}>`,
    })
    .catch((err) => console.error('[webhookEngine] ticket_created failed:', err));

  await interaction.update({
    components: [new ContainerBuilder().setAccentColor(brand.success).addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`✅ Your ticket has been created: <#${channel.id}>`)
    )],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

async function claimTicket(interaction) {
  const ticket = getTicket.get(interaction.channelId);
  if (!ticket) return interaction.reply({ content: 'This channel is not an active ticket.', flags: MessageFlags.Ephemeral });

  setClaimed.run(interaction.user.id, interaction.channelId);
  logAudit({ guildId: interaction.guildId, actorId: interaction.user.id, eventType: 'ticket.claimed', targetId: interaction.channelId });

  webhookEngine
    .sendEvent(interaction.client, interaction.guildId, 'support.ticket_claimed', {
      moderator: `<@${interaction.user.id}>`,
      ticket_channel: `<#${interaction.channelId}>`,
    })
    .catch((err) => console.error('[webhookEngine] ticket_claimed failed:', err));

  await interaction.reply({ content: `🎟️ Claimed by <@${interaction.user.id}>.` });
}

async function closeTicket(interaction) {
  const ticket = getTicket.get(interaction.channelId);
  if (!ticket) return interaction.reply({ content: 'This channel is not an active ticket.', flags: MessageFlags.Ephemeral });

  setClosed.run(interaction.channelId);
  logAudit({ guildId: interaction.guildId, actorId: interaction.user.id, eventType: 'ticket.closed', targetId: interaction.channelId });

  await webhookEngine
    .sendEvent(interaction.client, interaction.guildId, 'support.ticket_closed', {
      moderator: `<@${interaction.user.id}>`,
      ticket_channel: `<#${interaction.channelId}>`,
    })
    .catch((err) => console.error('[webhookEngine] ticket_closed failed:', err));

  await interaction.reply({ content: 'Closing this ticket in 5 seconds…' });
  setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
}

module.exports = { openTicket, claimTicket, closeTicket, AI_ELIGIBLE_CATEGORIES };
