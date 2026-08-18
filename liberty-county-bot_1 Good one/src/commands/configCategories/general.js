const {
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

async function render(interaction) {
  const guildConfig = configManager.getConfig(interaction.guildId);
  const brand = getBrand(guildConfig);
  const configured = configManager.isConfigured(interaction.guildId);
  const g = guildConfig.general;

  const container = new ContainerBuilder().setAccentColor(brand.color);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `## General Settings`,
        `**Bot Name:** ${g.botName}`,
        `**Timezone:** ${g.timezone}`,
        `**Log Channel:** ${g.logChannelId ? `<#${g.logChannelId}>` : '_Not set_'}`,
        `**Status:** ${configured ? '✅ Configured' : '⚠️ Not yet configured — enable your modules, then finish setup below.'}`,
      ].join('\n')
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('config:general:set-log-channel')
      .setLabel('Set Log Channel to Here')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('config:general:finish-setup')
      .setLabel(configured ? 'Setup Already Complete' : 'Finish Setup')
      .setStyle(configured ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(configured)
  );
  container.addActionRowComponents(row);

  const respond = interaction.deferred || interaction.replied ? 'editReply' : 'update';
  await interaction[respond]({
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

async function handleComponent(interaction) {
  if (interaction.customId === 'config:general:set-log-channel') {
    configManager.updateConfig(interaction.guildId, (cfg) => {
      cfg.general.logChannelId = interaction.channelId;
      return cfg;
    });
    return render(interaction);
  }

  if (interaction.customId === 'config:general:finish-setup') {
    configManager.setConfigured(interaction.guildId, interaction.user.id);
    return render(interaction);
  }
}

module.exports = { render, handleComponent };
