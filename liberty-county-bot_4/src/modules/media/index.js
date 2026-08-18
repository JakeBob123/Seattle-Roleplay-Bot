const { mediaRequestCommand, handleReviewButton } = require('./mediaCommand');

module.exports = {
  id: 'media',
  name: 'Media Requests',
  description: 'Username + required image submission form, restricted to whichever roles you grant in Roles & Permissions.',
  defaultConfig: {
    reviewChannelId: null,
  },
  requiredEmojis: [],
  commands: [mediaRequestCommand],

  async handleComponent(interaction) {
    if (interaction.isButton() && (interaction.customId.startsWith('media:approve:') || interaction.customId.startsWith('media:reject:'))) {
      return handleReviewButton(interaction);
    }
  },
};
