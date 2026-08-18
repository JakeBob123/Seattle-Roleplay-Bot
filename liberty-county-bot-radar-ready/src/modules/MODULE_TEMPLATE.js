/**
 * MODULE TEMPLATE — copy this into src/modules/<yourModuleId>/index.js
 *
 * This is how every module in the platform is built: support, moderation,
 * and roleRequest all follow exactly this shape. Drop a new folder here and
 * restart the bot — nothing else in the codebase needs to change (module
 * loading, config merging, command registration, and permissions all pick
 * it up automatically via moduleRegistry.loadModules()).
 *
 * NOT YET BUILT as real modules (per spec §33 "do not fake features" —
 * these are intentionally left as this template rather than shipped as
 * hollow commands):
 *   - staff        (promotions, infractions, terminations, hierarchy)
 *   - sessions      (session start/vote/shutdown)
 *   - webhooks      (per-event configurable announcement messages)
 *   - ai            (server-knowledge assistant, ticket triage)
 *   - ingame        (Liberty County API integration, detection -> recommendation)
 *
 * Each needs real credentials/config decisions from you first:
 *   - ingame: the actual Liberty County API base URL + key + payload shape
 *   - ai: which LLM/provider, and where the knowledge base lives
 *   - webhooks: the exact event list you want live first
 * Once you tell me those, I'll build them the same way as the three
 * modules already wired up.
 */
const { SlashCommandBuilder } = require('discord.js');

const exampleCommand = {
  data: new SlashCommandBuilder().setName('example').setDescription('Replace me.'),
  // publicByDefault: true,  // uncomment if any member should be able to use this
  async execute(interaction) {
    await interaction.reply({ content: 'Replace this with real logic.', ephemeral: true });
  },
};

module.exports = {
  id: 'yourModuleId', // must match the folder name
  name: 'Human-Readable Name',
  description: 'Shown in /config -> Modules.',
  defaultConfig: {
    // merged into guildConfig.modules.yourModuleId
    someChannelId: null,
  },
  commands: [exampleCommand],

  // optional — called from /config -> Modules when toggled
  async onEnable(guild) {},
  async onDisable(guild) {},

  // optional — client events this module needs (e.g. messageCreate for AI)
  events: [
    // { name: 'messageCreate', handler: async (message, client) => { ... } },
  ],

  // optional — routes any interaction whose customId starts with "yourModuleId:"
  async handleComponent(interaction) {},
};
