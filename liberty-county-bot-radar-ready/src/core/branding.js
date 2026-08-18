const {
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  SeparatorBuilder,
  ThumbnailBuilder,
  MessageFlags,
} = require('discord.js');

/**
 * All visual output should route through here so nothing hard-codes colors,
 * footers, or copy. Pulls from the guild's configured branding, falling back
 * to sane defaults. This keeps every module's embeds/containers consistent
 * without each module reimplementing styling.
 */
function getBrand(guildConfig) {
  const g = guildConfig.general;
  return {
    name: g.botName,
    footer: g.footer,
    color: parseInt(g.color.replace('#', ''), 16),
    success: parseInt(g.successColor.replace('#', ''), 16),
    warning: parseInt(g.warningColor.replace('#', ''), 16),
    error: parseInt(g.errorColor.replace('#', ''), 16),
  };
}

/**
 * Builds a Components V2 container (the modern replacement for a plain
 * embed) with a title, body text, optional accent color, and optional
 * footer line. Callers can .addSectionComponents / .addActionRowComponents
 * on the returned builder before sending with flags: MessageFlags.IsComponentsV2.
 */
function buildContainer({ brand, title, description, accentColor, footer }) {
  const container = new ContainerBuilder().setAccentColor(
    accentColor ?? brand.color
  );

  if (title) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${title}`)
    );
  }
  if (description) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(description)
    );
  }
  if (footer !== false) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${footer ?? brand.footer}`)
    );
  }
  return container;
}

const SEND_V2 = { flags: MessageFlags.IsComponentsV2 };

module.exports = { getBrand, buildContainer, SEND_V2 };
