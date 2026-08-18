const { promoteCommand, infractionCommand, staffHistoryCommand } = require('./commands');

module.exports = {
  id: 'staff',
  name: 'Staff Management',
  description: 'Promotions and infractions with a configurable rank hierarchy and termination role removal.',
  defaultConfig: {
    hierarchy: [], // ordered array of role IDs, lowest rank first
    staffRoleIds: [], // roles a termination can strip
    terminationRemovesRoles: true,
  },
  requiredEmojis: ['staff.staff', 'staff.promotion', 'staff.infraction', 'staff.termination', 'staff.investigation'],
  commands: [promoteCommand, infractionCommand, staffHistoryCommand],
};
