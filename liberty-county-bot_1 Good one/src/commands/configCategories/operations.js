const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
  MessageFlags,
} = require('discord.js');
const configManager = require('../../core/configManager');
const { getBrand } = require('../../core/branding');

async function render(interaction) {
  const guildConfig = configManager.getConfig(interaction.guildId);
  const brand = getBrand(guildConfig);
  const support = guildConfig.modules.support || {};
  const roleRequest = guildConfig.modules.roleRequest || {};
  const media = guildConfig.modules.media || {};

  const staffRoles = new Set(Object.values(support.reviewerRoles || {}).flat());

  const container = new ContainerBuilder().setAccentColor(brand.color);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `## Support & Review Routing`,
        `**Ticket category (channel group):** ${support.ticketCategoryId ? `<#${support.ticketCategoryId}>` : '_Not set — tickets go to the server root_'}`,
        `**Support staff role(s):** ${staffRoles.size ? [...staffRoles].map((r) => `<@&${r}>`).join(' ') : '_Not set_'}`,
        `**Role request review channel:** ${roleRequest.reviewChannelId ? `<#${roleRequest.reviewChannelId}>` : '_Not set_'}`,
        `**Media review channel:** ${media.reviewChannelId ? `<#${media.reviewChannelId}>` : '_Not set_'}`,
      ].join('\n')
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**Ticket category** — new ticket channels are created under this category:'));
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('config:operations:set-ticket-category').setChannelTypes(ChannelType.GuildCategory).setPlaceholder('Select a category')
    )
  );

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**Support staff role** — pinged and given access in every new ticket, all categories:'));
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('config:operations:set-support-role').setPlaceholder('Select support staff role'))
  );

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**Role request review channel:**'));
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('config:operations:set-rolerequest-channel').setChannelTypes(ChannelType.GuildText).setPlaceholder('Select review channel')
    )
  );

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**Media review channel:**'));
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('config:operations:set-media-channel').setChannelTypes(ChannelType.GuildText).setPlaceholder('Select review channel')
    )
  );

  const respond = interaction.deferred || interaction.replied ? 'editReply' : 'update';
  await interaction[respond]({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}

async function handleComponent(interaction) {
  const id = interaction.customId;
  if (!interaction.isChannelSelectMenu?.() && !interaction.isRoleSelectMenu?.()) return;

  const value = interaction.values[0];

  if (id === 'config:operations:set-ticket-category') {
    configManager.updateConfig(interaction.guildId, (cfg) => {
      cfg.modules.support.ticketCategoryId = value;
      return cfg;
    });
  } else if (id === 'config:operations:set-support-role') {
    configManager.updateConfig(interaction.guildId, (cfg) => {
      for (const key of Object.keys(cfg.modules.support.reviewerRoles)) {
        cfg.modules.support.reviewerRoles[key] = [value];
      }
      return cfg;
    });
  } else if (id === 'config:operations:set-rolerequest-channel') {
    configManager.updateConfig(interaction.guildId, (cfg) => {
      cfg.modules.roleRequest.reviewChannelId = value;
      return cfg;
    });
  } else if (id === 'config:operations:set-media-channel') {
    configManager.updateConfig(interaction.guildId, (cfg) => {
      cfg.modules.media.reviewChannelId = value;
      return cfg;
    });
  } else {
    return;
  }

  await interaction.deferUpdate();
  return render(interaction);
}

module.exports = { render, handleComponent };
