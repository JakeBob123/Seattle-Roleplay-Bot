const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
const configManager = require('../../core/configManager');
const { getBrand } = require('../../core/branding');

async function render(interaction) {
  const guildConfig = configManager.getConfig(interaction.guildId);
  const brand = getBrand(guildConfig);
  const g = guildConfig.general;

  const container = new ContainerBuilder().setAccentColor(brand.color);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `## Branding`,
        `**Name:** ${g.botName}`,
        `**Footer:** ${g.footer}`,
        `**Primary:** ${g.color}  **Success:** ${g.successColor}  **Warning:** ${g.warningColor}  **Error:** ${g.errorColor}`,
        `\nThese values are used everywhere the bot sends a message — no module hard-codes its own colors or footer.`,
      ].join('\n')
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('config:branding:edit').setLabel('Edit Branding').setStyle(ButtonStyle.Primary)
  );
  container.addActionRowComponents(row);

  const respond = interaction.deferred || interaction.replied ? 'editReply' : 'update';
  await interaction[respond]({
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

async function handleComponent(interaction) {
  if (interaction.customId === 'config:branding:edit') {
    const guildConfig = configManager.getConfig(interaction.guildId);
    const modal = new ModalBuilder().setCustomId('config:branding:modal').setTitle('Edit Branding');

    const nameInput = new TextInputBuilder()
      .setCustomId('botName')
      .setLabel('Bot / Platform Name')
      .setStyle(TextInputStyle.Short)
      .setValue(guildConfig.general.botName)
      .setRequired(true);

    const footerInput = new TextInputBuilder()
      .setCustomId('footer')
      .setLabel('Footer Text')
      .setStyle(TextInputStyle.Short)
      .setValue(guildConfig.general.footer)
      .setRequired(true);

    const colorInput = new TextInputBuilder()
      .setCustomId('color')
      .setLabel('Primary Color (hex, e.g. #5865F2)')
      .setStyle(TextInputStyle.Short)
      .setValue(guildConfig.general.color)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(footerInput),
      new ActionRowBuilder().addComponents(colorInput)
    );

    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit && interaction.isModalSubmit() && interaction.customId === 'config:branding:modal') {
    const botName = interaction.fields.getTextInputValue('botName');
    const footer = interaction.fields.getTextInputValue('footer');
    const color = interaction.fields.getTextInputValue('color');

    const hexOk = /^#([0-9A-Fa-f]{6})$/.test(color);
    if (!hexOk) {
      return interaction.reply({ content: 'Color must be a hex code like `#5865F2`.', flags: MessageFlags.Ephemeral });
    }

    configManager.updateConfig(interaction.guildId, (cfg) => {
      cfg.general.botName = botName;
      cfg.general.footer = footer;
      cfg.general.color = color;
      return cfg;
    });

    await interaction.deferUpdate();
    return render(interaction);
  }
}

module.exports = { render, handleComponent };
