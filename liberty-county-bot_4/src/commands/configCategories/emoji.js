const {
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
const moduleRegistry = require('../../core/moduleRegistry');
const emojiEngine = require('../../core/emojiEngine');
const { getBrand } = require('../../core/branding');

async function render(interaction) {
  const guildConfig = configManager.getConfig(interaction.guildId);
  const brand = getBrand(guildConfig);
  const installed = emojiEngine.listInstalled(interaction.guildId);
  const optimizations = emojiEngine.findOptimizations(interaction.guildId);
  const styleProfile = emojiEngine.ensureStyleProfile(interaction.guildId);

  const container = new ContainerBuilder().setAccentColor(brand.color);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `## Emoji & Assets`,
        `Custom Discord emoji are provisioned automatically when a module is enabled — no manual searching required. Style profile: **${styleProfile.style_tag}**.`,
        `**Installed:** ${installed.length}`,
        optimizations.length ? `**⚠️ ${optimizations.length} duplicate asset group(s) found** — see Optimize below.` : '_No duplicate assets detected._',
      ].join('\n')
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());

  const preview = installed
    .slice(0, 20)
    .map((e) => `${e.emoji_id ? `<${e.animated ? 'a' : ''}:${e.emoji_name}:${e.emoji_id}>` : '❔'} \`${e.emoji_key}\` — ${e.module_id} _(via ${e.provider || 'unknown'})_`)
    .join('\n');
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(preview || '_No emojis installed yet — enable a module in /config → Modules._'));

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('config:emoji:regenerate').setLabel('Regenerate Module Emojis').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('config:emoji:optimize').setLabel('Optimize Emoji Collection').setStyle(ButtonStyle.Secondary).setDisabled(!optimizations.length)
    )
  );

  if (installed.length) {
    const removeSelect = new StringSelectMenuBuilder()
      .setCustomId('config:emoji:remove')
      .setPlaceholder('Remove an installed emoji (Unicode fallback resumes)')
      .addOptions(
        installed.slice(0, 25).map((e) => ({
          label: `${e.emoji_key} (${e.module_id})`,
          value: `${e.module_id}::${e.emoji_key}`,
        }))
      );
    container.addActionRowComponents(new ActionRowBuilder().addComponents(removeSelect));
  }

  const respond = interaction.deferred || interaction.replied ? 'editReply' : 'update';
  await interaction[respond]({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
}

async function handleComponent(interaction) {
  const id = interaction.customId;

  if (id === 'config:emoji:regenerate') {
    await interaction.deferUpdate();
    const guildConfig = configManager.getConfig(interaction.guildId);
    for (const mod of moduleRegistry.getModules()) {
      if (!guildConfig.modules[mod.id]?.enabled || !mod.requiredEmojis?.length) continue;
      await emojiEngine.requestEmojiSet(interaction.guild, mod.id, mod.requiredEmojis).catch((err) => console.error('[emoji] regenerate failed:', err));
    }
    return render(interaction);
  }

  if (id === 'config:emoji:optimize') {
    const groups = emojiEngine.findOptimizations(interaction.guildId);
    const guildConfig = configManager.getConfig(interaction.guildId);
    const brand = getBrand(guildConfig);
    const container = new ContainerBuilder().setAccentColor(brand.warning);
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        groups.length
          ? `## Optimization Report\n${groups
              .map((g) => `\`${g.map((r) => r.emoji_key).join('`, `')}\` share the same asset but different Discord emoji IDs.`)
              .join('\n')}\n\nRemove and use \`Regenerate Module Emojis\` to consolidate.`
          : '## Optimization Report\nNo duplicates found — your emoji collection is already consolidated.'
      )
    );
    return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
  }

  if (id === 'config:emoji:remove') {
    const [moduleId, emojiKey] = interaction.values[0].split('::');
    emojiEngine.removeInstalled(interaction.guildId, moduleId, emojiKey);
    await interaction.deferUpdate();
    return render(interaction);
  }
}

module.exports = { render, handleComponent };
