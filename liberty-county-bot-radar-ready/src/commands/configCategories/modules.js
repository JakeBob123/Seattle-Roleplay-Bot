const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');
const configManager = require('../../core/configManager');
const moduleRegistry = require('../../core/moduleRegistry');
const { getBrand } = require('../../core/branding');

async function render(interaction) {
  const guildConfig = configManager.getConfig(interaction.guildId);
  const brand = getBrand(guildConfig);
  const modules = moduleRegistry.getModules();

  const container = new ContainerBuilder().setAccentColor(brand.color);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `## Modules\nToggle which platform modules are active on this server. Disabled modules hide their commands entirely.`
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  const lines = modules.map((m) => {
    const enabled = guildConfig.modules[m.id]?.enabled;
    return `${enabled ? '🟢' : '⚪'} **${m.name}** — ${m.description}`;
  });
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n') || '_No modules loaded._'));

  if (modules.length) {
    const select = new StringSelectMenuBuilder()
      .setCustomId('config:modules:toggle')
      .setPlaceholder('Select a module to enable/disable')
      .addOptions(
        modules.map((m) => ({
          label: `${guildConfig.modules[m.id]?.enabled ? 'Disable' : 'Enable'}: ${m.name}`,
          value: m.id,
        }))
      );
    container.addActionRowComponents(new ActionRowBuilder().addComponents(select));
  }

  const respond = interaction.deferred || interaction.replied ? 'editReply' : 'update';
  await interaction[respond]({
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
  });
}

async function handleComponent(interaction) {
  if (interaction.customId === 'config:modules:toggle') {
    const moduleId = interaction.values[0];
    const mod = moduleRegistry.getModule(moduleId);
    const nextConfig = configManager.updateConfig(interaction.guildId, (cfg) => {
      const current = cfg.modules[moduleId]?.enabled;
      cfg.modules[moduleId].enabled = !current;
      return cfg;
    });

    const nowEnabled = nextConfig.modules[moduleId].enabled;
    if (nowEnabled && mod?.onEnable) await mod.onEnable(interaction.guild);
    if (!nowEnabled && mod?.onDisable) await mod.onDisable(interaction.guild);

    return render(interaction);
  }
}

module.exports = { render, handleComponent };
