const { REST, Routes } = require('discord.js');
const configManager = require('./configManager');
const moduleRegistry = require('./moduleRegistry');

/**
 * Implements requirement #3 / #25: on first install, only /config should be
 * visible. Once the founder finishes setup, the commands belonging to each
 * *enabled* module become available. This re-syncs a single guild's command
 * list, so it's called on join and whenever /config changes module state.
 */
async function deployCommandsForGuild(client, guildId) {
  const configCmd = require('../commands/config');
  const commandsToRegister = [configCmd.data.toJSON()];

  if (configManager.isConfigured(guildId)) {
    const guildConfig = configManager.getConfig(guildId);
    for (const mod of moduleRegistry.getModules()) {
      if (!guildConfig.modules[mod.id]?.enabled) continue;
      for (const cmd of mod.commands || []) {
        commandsToRegister.push(cmd.data.toJSON());
      }
    }
  }

  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), {
    body: commandsToRegister,
  });
}

async function deployAllGuilds(client) {
  for (const [guildId] of client.guilds.cache) {
    try {
      await deployCommandsForGuild(client, guildId);
    } catch (err) {
      console.error(`[commands] Failed to deploy for guild ${guildId}:`, err);
    }
  }
}

module.exports = { deployCommandsForGuild, deployAllGuilds };
