const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
const configManager = require('../../core/configManager');
const { getBrand } = require('../../core/branding');
const credentialStore = require('../../modules/ingame/credentialStore');
const erlcClient = require('../../modules/ingame/erlcClient');
const { startPolling, stopPolling } = require('../../modules/ingame/dashboard');

function webhookUrlFor(guildId) {
  const base = process.env.PUBLIC_WEBHOOK_BASE_URL || `http://localhost:${process.env.WEBHOOK_PORT || 8787}`;
  return `${base}/webhooks/erlc/${guildId}`;
}

async function render(interaction) {
  const guildConfig = configManager.getConfig(interaction.guildId);
  const brand = getBrand(guildConfig);
  const status = credentialStore.getStatus(interaction.guildId);
  const moduleConfig = guildConfig.modules.ingame || {};

  const container = new ContainerBuilder().setAccentColor(status.connected ? brand.success : brand.color);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `## In-Game Integration — ER:LC`,
        status.configured
          ? `**Status:** ${status.connected ? '🟢 Connected' : '🔴 Disconnected'} ${status.serverName ? `(${status.serverName})` : ''}`
          : '**Status:** ⚪ Not configured',
        status.configured ? `**Key:** ${status.maskedKey}` : null,
        status.lastError ? `**Last error:** ${status.lastError}` : null,
        `**Dashboard channel:** ${moduleConfig.dashboardChannelId ? `<#${moduleConfig.dashboardChannelId}>` : '_Not set_'}`,
        `**Join/leave channel:** ${moduleConfig.eventChannels?.joinLeave ? `<#${moduleConfig.eventChannels.joinLeave}>` : '_Not set_'}`,
        `_Emergency call announcements are configured via \`/webhook channel ingame.emergency_call #channel\` — that's the same Webhook Engine every other module uses._`,
        `\n**Event webhook URL** (paste into your ER:LC private server settings -> Event Webhook):\n\`${webhookUrlFor(interaction.guildId)}\``,
      ]
        .filter(Boolean)
        .join('\n')
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('config:ingame:set-key').setLabel(status.configured ? 'Update API Key' : 'Set API Key').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('config:ingame:test').setLabel('Test Connection').setStyle(ButtonStyle.Secondary).setDisabled(!status.configured),
    new ButtonBuilder().setCustomId('config:ingame:disconnect').setLabel('Disconnect').setStyle(ButtonStyle.Danger).setDisabled(!status.configured)
  );
  container.addActionRowComponents(row1);

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**Dashboard channel** — where the live status card is posted and kept updated:'));
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('config:ingame:set-dashboard-channel').setChannelTypes(ChannelType.GuildText).setPlaceholder('Select dashboard channel')
    )
  );

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**Join/leave notifications channel:**'));
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('config:ingame:set-joinleave-channel').setChannelTypes(ChannelType.GuildText).setPlaceholder('Select join/leave channel')
    )
  );

  const respond = interaction.deferred || interaction.replied ? 'editReply' : 'update';
  await interaction[respond]({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}

async function handleComponent(interaction) {
  const id = interaction.customId;

  if (id === 'config:ingame:set-key') {
    const modal = new ModalBuilder().setCustomId('config:ingame:key-modal').setTitle('ER:LC Server Key');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('serverKey')
          .setLabel('Private server API key (from erlc.link/sk)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit?.() && id === 'config:ingame:key-modal') {
    const serverKey = interaction.fields.getTextInputValue('serverKey').trim();
    await interaction.deferUpdate();

    credentialStore.saveKey(interaction.guildId, serverKey);

    try {
      const info = await erlcClient.testConnection(serverKey);
      credentialStore.setStatus(interaction.guildId, { connected: true, serverName: info.Name });
      startPolling(interaction.client, interaction.guildId);
    } catch (err) {
      credentialStore.setStatus(interaction.guildId, { connected: false, error: err.message });
    }
    return render(interaction);
  }

  if (id === 'config:ingame:test') {
    await interaction.deferUpdate();
    const serverKey = credentialStore.getKey(interaction.guildId);
    try {
      const info = await erlcClient.testConnection(serverKey);
      credentialStore.setStatus(interaction.guildId, { connected: true, serverName: info.Name });
    } catch (err) {
      credentialStore.setStatus(interaction.guildId, { connected: false, error: err.message });
    }
    return render(interaction);
  }

  if (id === 'config:ingame:disconnect') {
    credentialStore.removeKey(interaction.guildId);
    stopPolling(interaction.guildId);
    await interaction.deferUpdate();
    return render(interaction);
  }

  if (interaction.isChannelSelectMenu?.()) {
    const channelId = interaction.values[0];
    if (id === 'config:ingame:set-dashboard-channel') {
      configManager.updateConfig(interaction.guildId, (cfg) => {
        cfg.modules.ingame.dashboardChannelId = channelId;
        return cfg;
      });
    } else if (id === 'config:ingame:set-joinleave-channel') {
      configManager.updateConfig(interaction.guildId, (cfg) => {
        cfg.modules.ingame.eventChannels.joinLeave = channelId;
        return cfg;
      });
    } else {
      return;
    }
    await interaction.deferUpdate();
    if (credentialStore.getKey(interaction.guildId)) startPolling(interaction.client, interaction.guildId);
    return render(interaction);
  }
}

module.exports = { render, handleComponent, webhookUrlFor };
