const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');
const configManager = require('../core/configManager');
const moduleRegistry = require('../core/moduleRegistry');
const { getBrand } = require('../core/branding');

const CATEGORIES = [
  { id: 'general', label: 'General', description: 'Identity, branding, logging, timezone', emoji: '⚙️' },
  { id: 'modules', label: 'Modules', description: 'Enable or disable each platform module', emoji: '🧩' },
  { id: 'permissions', label: 'Roles & Permissions', description: 'Command and module access control', emoji: '🔐' },
  { id: 'operations', label: 'Support & Review Routing', description: 'Ticket category, staff role, review channels', emoji: '🗂️' },
  { id: 'staff', label: 'Staff Management', description: 'Rank hierarchy, termination role removal', emoji: '🎖️' },
  { id: 'branding', label: 'Branding', description: 'Colors, footer, bot identity', emoji: '🎨' },
  { id: 'ingame', label: 'In-Game Integration', description: 'ER:LC API key, dashboard, event routing', emoji: '🚓' },
  { id: 'emoji', label: 'Emoji & Assets', description: 'Smart Emoji Engine — installed icons, regenerate, optimize', emoji: '🧩' },
];

function buildHomeContainer(interaction, guildConfig) {
  const brand = getBrand(guildConfig);
  const configured = configManager.isConfigured(interaction.guildId);

  const container = new ContainerBuilder().setAccentColor(brand.color);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## ${brand.name} — Control Panel\n${
        configured
          ? 'Select a category below to configure this server.'
          : '**First-time setup detected.** Configure at least General and Modules before other commands become available.'
      }`
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  const select = new StringSelectMenuBuilder()
    .setCustomId('config:category')
    .setPlaceholder('Choose a category to configure')
    .addOptions(
      CATEGORIES.map((c) => ({
        label: c.label,
        value: c.id,
        description: c.description,
        emoji: c.emoji,
      }))
    );

  const row = new ActionRowBuilder().addComponents(select);
  container.addActionRowComponents(row);

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ${brand.footer} • Modules loaded: ${moduleRegistry.getModules().length}`)
  );

  return container;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Open the platform control panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    const guildConfig = configManager.getConfig(interaction.guildId);
    const container = buildHomeContainer(interaction, guildConfig);

    await interaction.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },

  // Called from the central interaction handler when this command's select
  // menus / buttons are used, so all /config routing lives in one place.
  async handleComponent(interaction) {
    if (interaction.isStringSelectMenu() && interaction.customId === 'config:category') {
      const categoryId = interaction.values[0];
      const handler = require(`./configCategories/${categoryId}`);
      return handler.render(interaction);
    }

    // Delegate anything with a namespaced customId (e.g. "config:modules:toggle:support")
    const [, category] = interaction.customId.split(':');
    if (category) {
      const handler = require(`./configCategories/${category}`);
      if (handler.handleComponent) return handler.handleComponent(interaction);
    }
  },
};

module.exports.buildHomeContainer = buildHomeContainer;
