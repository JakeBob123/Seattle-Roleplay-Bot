const { MessageFlags } = require('discord.js');
const supportCommand = require('./supportCommand');
const tickets = require('./tickets');

module.exports = {
  id: 'support',
  name: 'Support & Tickets',
  description: 'Category-based ticketing with human-only escalation for IA/HR/partnerships.',
  defaultConfig: {
    ticketCategoryId: null,
    reviewerRoles: {
      community_affairs: [],
      internal_affairs: [],
      hr_affairs: [],
      partnership: [],
    },
  },
  commands: [supportCommand],

  async handleComponent(interaction) {
    const id = interaction.customId;

    if (interaction.isStringSelectMenu() && id === 'support:open-category') {
      return tickets.openTicket(interaction, interaction.values[0]);
    }
    if (interaction.isButton() && id === 'support:claim') return tickets.claimTicket(interaction);
    if (interaction.isButton() && id === 'support:close') return tickets.closeTicket(interaction);

    if (interaction.isButton() && id === 'support:regulations') {
      return interaction.reply({
        content: 'Regulations have not been configured for this server yet. Ask an administrator to add them in `/config`.',
        flags: MessageFlags.Ephemeral,
      });
    }
    if (interaction.isButton() && id === 'support:contact') {
      return interaction.reply({
        content: 'Use the category menu above to open a ticket — staff will follow up in the new channel.',
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};
