const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const configManager = require('../../core/configManager');
const { getBrand } = require('../../core/branding');

const CATEGORIES = [
  { id: 'community_affairs', label: 'Community Affairs', description: 'Questions, concerns, and community matters', emoji: '💬' },
  { id: 'internal_affairs', label: 'Internal Affairs', description: 'Member reports, staff reports / IA', emoji: '🛡️' },
  { id: 'hr_affairs', label: 'HR Affairs', description: 'Staff concerns and HR-related issues', emoji: '🗂️' },
  { id: 'partnership', label: 'Partnership', description: 'Partnership inquiries', emoji: '🤝' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('support')
    .setDescription('Open the support hub: contact support, view regulations, or open a ticket.')
    .setDMPermission(false),
  publicByDefault: true,

  async execute(interaction) {
    const guildConfig = configManager.getConfig(interaction.guildId);
    const brand = getBrand(guildConfig);

    const container = new ContainerBuilder().setAccentColor(brand.color);
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${brand.name} Support\nChoose what you need help with. Reports and internal matters are routed straight to the right staff team — no AI involved.`
      )
    );
    container.addSeparatorComponents(new SeparatorBuilder());

    const select = new StringSelectMenuBuilder()
      .setCustomId('support:open-category')
      .setPlaceholder('Select a support category')
      .addOptions(CATEGORIES.map((c) => ({ label: c.label, value: c.id, description: c.description, emoji: c.emoji })));

    container.addActionRowComponents(new ActionRowBuilder().addComponents(select));

    const buttonRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('support:regulations').setLabel('View Our Regulations').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('support:contact').setLabel('Contact Support').setStyle(ButtonStyle.Secondary)
    );
    container.addActionRowComponents(buttonRow);

    await interaction.reply({
      components: [container],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    });
  },
};

module.exports.CATEGORIES = CATEGORIES;
