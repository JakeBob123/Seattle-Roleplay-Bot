const { MessageFlags } = require('discord.js');
const configManager = require('../core/configManager');
const permissionManager = require('../core/permissionManager');
const commandRegistry = require('../core/commandRegistry');

async function safeErrorReply(interaction, message) {
  const payload = { content: message, flags: MessageFlags.Ephemeral };
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch {
    // interaction already expired / unrecoverable — nothing more we can do
  }
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    try {
      // ---- /config and other config-panel components ----------------
      if (interaction.customId?.startsWith('config:')) {
        const configCmd = require('../commands/config');
        return configCmd.handleComponent(interaction);
      }

      // ---- Autocomplete ----
      if (interaction.isAutocomplete()) {
        const entry = commandRegistry.get(interaction.commandName);
        if (entry?.command.autocomplete) return entry.command.autocomplete(interaction);
        return interaction.respond([]);
      }

      // ---- Slash commands ---------------------------------------------
      if (interaction.isChatInputCommand()) {
        const entry = commandRegistry.get(interaction.commandName);
        if (!entry) {
          return safeErrorReply(interaction, 'This command is not currently available.');
        }

        // /config is always administrator-gated at the Discord API level
        // via setDefaultMemberPermissions; everything else goes through
        // the granular permission manager so it stays fully configurable.
        if (entry.moduleId !== 'core') {
          const guildConfigRow = configManager.ensureGuild(interaction.guildId);
          const allowed = permissionManager.canUse(
            interaction.member,
            guildConfigRow,
            'command',
            interaction.commandName,
            { publicByDefault: entry.command.publicByDefault }
          );
          if (!allowed) {
            return safeErrorReply(interaction, "You don't have permission to use this command.");
          }
        }

        return entry.command.execute(interaction);
      }

      // ---- Module-owned component/modal interactions -------------------
      // Modules namespace their customIds as "<moduleId>:...".
      if (interaction.customId) {
        const moduleId = interaction.customId.split(':')[0];
        const moduleRegistry = require('../core/moduleRegistry');
        const mod = moduleRegistry.getModule(moduleId);
        if (mod?.handleComponent) return mod.handleComponent(interaction);
      }
    } catch (err) {
      console.error('[interactionCreate] Unhandled error:', err);
      return safeErrorReply(interaction, 'Something went wrong handling that. The error has been logged.');
    }
  },
};
