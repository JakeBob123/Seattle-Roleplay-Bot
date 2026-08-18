const { serverInfoCommand, erlcCommandCommand, executeErlcCommand } = require('./commands');
const credentialStore = require('./credentialStore');
const { startPolling, stopPolling } = require('./dashboard');
const { createWebhookRouter } = require('./webhookServer');
const httpServer = require('../../core/httpServer');
const configManager = require('../../core/configManager');
const webhookEngine = require('../webhooks/engine');

let webhookRouterMounted = false;

/** Routes a verified ER:LC webhook event to the configured Discord channel. */
async function routeWebhookEvent(client, { guildId, eventType, payload }) {
  const guildConfig = configManager.getConfig(guildId);
  const moduleConfig = guildConfig.modules.ingame || {};
  if (!moduleConfig.enabled) return;

  if (eventType === 'emergency_call') {
    await webhookEngine
      .sendEvent(client, guildId, 'ingame.emergency_call', {
        team: payload.Team || 'Unknown',
        description: payload.Description || '',
        position_descriptor: payload.PositionDescriptor ? `Near ${payload.PositionDescriptor}` : '',
      })
      .catch((err) => console.error('[webhookEngine] emergency_call failed:', err));
  }

  if (eventType === 'ingame_command' && moduleConfig.eventChannels?.commandLog) {
    const channel = await client.channels.fetch(moduleConfig.eventChannels.commandLog).catch(() => null);
    if (channel) await channel.send(`In-game command: \`${payload.Message}\``).catch(() => {});
  }
}

/** Mounts the ER:LC webhook route exactly once, regardless of how many
 * guilds enable the module or in what order onEnable/bootstrap fire. */
function ensureWebhookRouter(client) {
  if (webhookRouterMounted) return;
  httpServer.getApp().use(createWebhookRouter((evt) => routeWebhookEvent(client, evt)));
  webhookRouterMounted = true;
}

module.exports = {
  id: 'ingame',
  name: 'In-Game Integration (ER:LC)',
  description: 'Official ER:LC Private Server API -- live dashboard, commands, and event webhooks.',
  defaultConfig: {
    dashboardChannelId: null,
    pollingIntervalSec: 60,
    eventChannels: {
      joinLeave: null,
      emergencyCalls: null,
      commandLog: null,
    },
  },
  requiredEmojis: ['ingame.detection', 'ingame.punishment', 'ingame.vehicle', 'ingame.emergency'],
  commands: [serverInfoCommand, erlcCommandCommand],

  async onEnable(guild) {
    ensureWebhookRouter(guild.client);
    if (credentialStore.getKey(guild.id)) startPolling(guild.client, guild.id);
  },

  async onDisable(guild) {
    stopPolling(guild.id);
  },

  // Called once from src/index.js on 'ready' so polling resumes
  // automatically after a restart for every guild that already had this
  // module enabled and connected -- not just guilds toggled on this session.
  async bootstrap(client) {
    ensureWebhookRouter(client);
    for (const [guildId] of client.guilds.cache) {
      const guildConfig = configManager.getConfig(guildId);
      if (guildConfig.modules.ingame?.enabled && credentialStore.getKey(guildId)) {
        startPolling(client, guildId);
      }
    }
  },

  async handleComponent(interaction) {
    if (interaction.isButton() && interaction.customId.startsWith('ingame:confirm-command:')) {
      const encoded = interaction.customId.split(':')[2];
      const command = Buffer.from(encoded, 'base64url').toString('utf8');
      await interaction.deferUpdate();
      return executeErlcCommand(interaction, command);
    }
    if (interaction.isButton() && interaction.customId === 'ingame:cancel-command') {
      return interaction.update({ content: 'Cancelled.', components: [] });
    }
  },
};
