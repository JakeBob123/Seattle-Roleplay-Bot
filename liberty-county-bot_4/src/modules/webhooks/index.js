const webhookCommand = require('./webhookCommand');

module.exports = {
  id: 'webhooks',
  name: 'Webhook / Event Engine',
  description: 'Per-event configurable announcement messages with variables, templates, and test-send.',
  defaultConfig: {},
  requiredEmojis: [],
  commands: [webhookCommand],

  async handleComponent(interaction) {
    if (interaction.isModalSubmit() && interaction.customId.startsWith('webhooks:edit-modal:')) {
      return webhookCommand.handleModal(interaction);
    }
  },
};
