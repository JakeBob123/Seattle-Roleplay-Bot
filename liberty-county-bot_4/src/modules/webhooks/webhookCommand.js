const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');
const configManager = require('../../core/configManager');
const { getBrand } = require('../../core/branding');
const engine = require('./engine');

const SAMPLE_VARIABLES = {
  user: '@ExampleUser',
  user_id: '123456789012345678',
  category: 'Community Affairs',
  ticket_channel: '#community-affairs-example',
  moderator: '@ExampleStaff',
  case_id: '42',
  action: 'warn',
  reason: 'Example reason text',
  department: 'Police Department',
  current_rank: 'Cadet',
  requested_rank: 'Officer',
  roles_requested: '@Officer',
  proof_url: 'https://example.com/proof.png',
  request_id: '7',
  decision: 'approved',
  reviewer: '@ExampleStaff',
  team: 'Police',
  description: 'Vehicle pursuit in progress',
  position_descriptor: 'near Park Street',
  server: 'Liberty County',
  member_count: '128',
  in_game_username: 'ExamplePlayer123',
  module: 'moderation',
  state: 'enabled',
  actor: '@ExampleAdmin',
};

function eventChoices() {
  return Object.entries(engine.EVENT_DEFINITIONS).map(([key, def]) => ({ key, label: def.label }));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('webhook')
    .setDescription('Configure the platform webhook/event system.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((sc) => sc.setName('list').setDescription('List every configurable event and its status.'))
    .addSubcommand((sc) =>
      sc
        .setName('channel')
        .setDescription('Set which channel an event posts to.')
        .addStringOption((o) => o.setName('event').setDescription('Event').setRequired(true).setAutocomplete(true))
        .addChannelOption((o) => o.setName('channel').setDescription('Destination channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName('toggle')
        .setDescription('Enable or disable an event.')
        .addStringOption((o) => o.setName('event').setDescription('Event').setRequired(true).setAutocomplete(true))
        .addBooleanOption((o) => o.setName('enabled').setDescription('Enabled?').setRequired(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName('edit')
        .setDescription('Edit the title/description/color for an event.')
        .addStringOption((o) => o.setName('event').setDescription('Event').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand((sc) =>
      sc
        .setName('test')
        .setDescription('Send a sample of an event to this channel.')
        .addStringOption((o) => o.setName('event').setDescription('Event').setRequired(true).setAutocomplete(true))
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const choices = eventChoices()
      .filter((c) => c.key.includes(focused) || c.label.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((c) => ({ name: `${c.label} (${c.key})`, value: c.key }));
    await interaction.respond(choices);
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildConfig = configManager.getConfig(interaction.guildId);
    const brand = getBrand(guildConfig);

    if (sub === 'list') {
      const container = new ContainerBuilder().setAccentColor(brand.color);
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## Webhook Events'));
      container.addSeparatorComponents(new SeparatorBuilder());
      const lines = Object.keys(engine.EVENT_DEFINITIONS).map((key) => {
        const cfg = engine.getEventConfig(interaction.guildId, key);
        const status = !cfg.enabled ? '⚪ disabled' : cfg.channelId ? `🟢 <#${cfg.channelId}>` : '🟡 no channel set';
        return `**${cfg.label}** \`${key}\` — ${status}`;
      });
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
      return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
    }

    const eventKey = interaction.options.getString('event');
    if (!engine.EVENT_DEFINITIONS[eventKey]) {
      return interaction.reply({ content: `Unknown event \`${eventKey}\`. Use \`/webhook list\` to see valid keys.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'channel') {
      const channel = interaction.options.getChannel('channel');
      engine.setEventConfig(interaction.guildId, eventKey, { channelId: channel.id });
      return interaction.reply({ content: `\`${eventKey}\` will now post to ${channel}.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'toggle') {
      const enabled = interaction.options.getBoolean('enabled');
      engine.setEventConfig(interaction.guildId, eventKey, { enabled });
      return interaction.reply({ content: `\`${eventKey}\` is now ${enabled ? 'enabled' : 'disabled'}.`, flags: MessageFlags.Ephemeral });
    }

    if (sub === 'edit') {
      const cfg = engine.getEventConfig(interaction.guildId, eventKey);
      const modal = new ModalBuilder().setCustomId(`webhooks:edit-modal:${eventKey}`).setTitle(`Edit: ${cfg.label}`.slice(0, 45));
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('title').setLabel('Title').setStyle(TextInputStyle.Short).setValue(cfg.template.title || '').setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('description')
            .setLabel(`Description — variables: ${cfg.variables.map((v) => `{${v}}`).join(' ')}`.slice(0, 45))
            .setStyle(TextInputStyle.Paragraph)
            .setValue(cfg.template.description || '')
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('color')
            .setLabel('Color (color / success / warning / error)')
            .setStyle(TextInputStyle.Short)
            .setValue(cfg.template.color || 'color')
            .setRequired(false)
        )
      );
      return interaction.showModal(modal);
    }

    if (sub === 'test') {
      await engine.sendTest(interaction, eventKey, SAMPLE_VARIABLES);
      return interaction.reply({ content: `Test sent for \`${eventKey}\`.`, flags: MessageFlags.Ephemeral });
    }
  },

  async handleModal(interaction) {
    const eventKey = interaction.customId.split(':')[2];
    const title = interaction.fields.getTextInputValue('title');
    const description = interaction.fields.getTextInputValue('description');
    const color = interaction.fields.getTextInputValue('color') || 'color';

    if (!['color', 'success', 'warning', 'error'].includes(color)) {
      return interaction.reply({ content: 'Color must be one of: color, success, warning, error.', flags: MessageFlags.Ephemeral });
    }

    engine.setEventConfig(interaction.guildId, eventKey, { template: { title, description, color } });
    return interaction.reply({ content: `Updated template for \`${eventKey}\`. Use \`/webhook test\` to preview it.`, flags: MessageFlags.Ephemeral });
  },
};
