const { warn, kick, ban, timeout, history } = require('./commands');

module.exports = {
  id: 'moderation',
  name: 'Moderation',
  description: 'Warn, kick, ban, timeout, and full case history logging.',
  defaultConfig: {
    logChannelId: null,
  },
  commands: [warn, kick, ban, timeout, history],
};
