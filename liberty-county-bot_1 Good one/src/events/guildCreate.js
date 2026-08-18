const { deployCommandsForGuild } = require('../core/commandDeployer');
const configManager = require('../core/configManager');
const { isAllowed } = require('../core/guildAllowlist');

module.exports = {
  name: 'guildCreate',
  async execute(guild) {
    if (!isAllowed(guild.id)) {
      console.warn(`[guildCreate] ${guild.name} (${guild.id}) is not on ALLOWED_GUILD_IDS -- leaving immediately.`);
      await guild.leave().catch((err) => console.error('[guildCreate] Failed to leave unauthorized guild:', err.message));
      return;
    }

    configManager.ensureGuild(guild.id);
    await deployCommandsForGuild(guild.client, guild.id);
    console.log(`[guildCreate] Joined ${guild.name} (${guild.id}) -- only /config registered.`);
  },
};
