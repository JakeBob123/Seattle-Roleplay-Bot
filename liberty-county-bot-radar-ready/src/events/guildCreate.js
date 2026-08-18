const { deployCommandsForGuild } = require('../core/commandDeployer');
const configManager = require('../core/configManager');

module.exports = {
  name: 'guildCreate',
  async execute(guild) {
    configManager.ensureGuild(guild.id);
    await deployCommandsForGuild(guild.client, guild.id);
    console.log(`[guildCreate] Joined ${guild.name} (${guild.id}) — only /config registered.`);
  },
};
