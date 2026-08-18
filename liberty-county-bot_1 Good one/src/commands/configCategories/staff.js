const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  RoleSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const configManager = require('../../core/configManager');
const { getBrand } = require('../../core/branding');

async function render(interaction) {
  const guildConfig = configManager.getConfig(interaction.guildId);
  const brand = getBrand(guildConfig);
  const staff = guildConfig.modules.staff || {};

  const container = new ContainerBuilder().setAccentColor(brand.color);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `## Staff Management`,
        `**Rank hierarchy (lowest -> highest):**`,
        staff.hierarchy?.length ? staff.hierarchy.map((r, i) => `${i + 1}. <@&${r}>`).join('\n') : '_Not set — /promote will add the new rank without removing any old one._',
        `\n**Roles removed on termination:** ${staff.staffRoleIds?.length ? staff.staffRoleIds.map((r) => `<@&${r}>`).join(' ') : '_Not set_'}`,
        `**Termination removes roles:** ${staff.terminationRemovesRoles ? 'Yes' : 'No'}`,
      ].join('\n')
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**Add a rank to the hierarchy** (appended as the new highest rank):'));
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('config:staff:add-rank').setPlaceholder('Select a rank role to add'))
  );

  if (staff.hierarchy?.length) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**Remove a rank from the hierarchy:**'));
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('config:staff:remove-rank').setPlaceholder('Select a rank role to remove'))
    );
  }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**Staff roles a termination can strip** (select all that apply):'));
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('config:staff:set-staff-roles').setPlaceholder('Select staff role(s)').setMinValues(1).setMaxValues(10)
    )
  );

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('config:staff:toggle-termination-removal')
        .setLabel(staff.terminationRemovesRoles ? 'Disable Role Removal on Termination' : 'Enable Role Removal on Termination')
        .setStyle(staff.terminationRemovesRoles ? ButtonStyle.Danger : ButtonStyle.Success)
    )
  );

  const respond = interaction.deferred || interaction.replied ? 'editReply' : 'update';
  await interaction[respond]({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}

async function handleComponent(interaction) {
  const id = interaction.customId;

  if (id === 'config:staff:add-rank') {
    const roleId = interaction.values[0];
    configManager.updateConfig(interaction.guildId, (cfg) => {
      if (!cfg.modules.staff.hierarchy.includes(roleId)) cfg.modules.staff.hierarchy.push(roleId);
      return cfg;
    });
    await interaction.deferUpdate();
    return render(interaction);
  }

  if (id === 'config:staff:remove-rank') {
    const roleId = interaction.values[0];
    configManager.updateConfig(interaction.guildId, (cfg) => {
      cfg.modules.staff.hierarchy = cfg.modules.staff.hierarchy.filter((r) => r !== roleId);
      return cfg;
    });
    await interaction.deferUpdate();
    return render(interaction);
  }

  if (id === 'config:staff:set-staff-roles') {
    configManager.updateConfig(interaction.guildId, (cfg) => {
      cfg.modules.staff.staffRoleIds = interaction.values;
      return cfg;
    });
    await interaction.deferUpdate();
    return render(interaction);
  }

  if (id === 'config:staff:toggle-termination-removal') {
    configManager.updateConfig(interaction.guildId, (cfg) => {
      cfg.modules.staff.terminationRemovesRoles = !cfg.modules.staff.terminationRemovesRoles;
      return cfg;
    });
    await interaction.deferUpdate();
    return render(interaction);
  }
}

module.exports = { render, handleComponent };
