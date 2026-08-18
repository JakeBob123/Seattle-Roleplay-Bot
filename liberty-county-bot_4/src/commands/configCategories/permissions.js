const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  RoleSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');
const configManager = require('../../core/configManager');
const permissionManager = require('../../core/permissionManager');
const moduleRegistry = require('../../core/moduleRegistry');
const { getBrand } = require('../../core/branding');

function commandChoices() {
  const choices = [];
  for (const mod of moduleRegistry.getModules()) {
    for (const cmd of mod.commands || []) {
      choices.push({ label: `/${cmd.data.name}`, value: `${mod.id}::${cmd.data.name}` });
    }
  }
  return choices;
}

async function render(interaction) {
  const guildConfig = configManager.getConfig(interaction.guildId);
  const brand = getBrand(guildConfig);

  const container = new ContainerBuilder().setAccentColor(brand.color);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `## Roles & Permissions`,
        `Choose a command below, then pick which role should be granted access to it.`,
        `Server Administrators and the configured founder always have full access regardless of these settings.`,
      ].join('\n')
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  const choices = commandChoices();
  if (choices.length) {
    const select = new StringSelectMenuBuilder()
      .setCustomId('config:permissions:pick-command')
      .setPlaceholder('Select a command')
      .addOptions(choices.slice(0, 25));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(select));
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('_No module commands are loaded yet._'));
  }

  const respond = interaction.deferred || interaction.replied ? 'editReply' : 'update';
  await interaction[respond]({
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

async function handleComponent(interaction) {
  if (interaction.customId === 'config:permissions:pick-command') {
    const [, commandName] = interaction.values[0].split('::');
    const guildConfig = configManager.getConfig(interaction.guildId);
    const brand = getBrand(guildConfig);

    const container = new ContainerBuilder().setAccentColor(brand.color);
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## Permissions for /${commandName}\nSelect a role to grant access.`)
    );
    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId(`config:permissions:grant-role:${commandName}`)
      .setPlaceholder('Select a role to grant');
    container.addActionRowComponents(new ActionRowBuilder().addComponents(roleSelect));

    return interaction.update({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  }

  if (interaction.customId.startsWith('config:permissions:grant-role:')) {
    const commandName = interaction.customId.split(':').pop();
    const roleId = interaction.values[0];
    permissionManager.grant(interaction.guildId, 'command', commandName, 'role', roleId);
    await interaction.reply({
      content: `Granted <@&${roleId}> access to \`/${commandName}\`.`,
      flags: MessageFlags.Ephemeral,
    });
    return render(interaction);
  }
}

module.exports = { render, handleComponent };
