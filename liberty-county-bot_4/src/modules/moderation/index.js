const { warn, kick, ban, timeout, history } = require('./commands');

module.exports = {
  id: 'moderation',
  name: 'Moderation',
  description: 'Warn, kick, ban, timeout, and full case history logging.',
  defaultConfig: {
    logChannelId: null,
  },
  requiredEmojis: ['moderation.ban', 'moderation.kick', 'moderation.warn', 'moderation.timeout', 'moderation.purge', 'moderation.case', 'moderation.security'],
  commands: [warn, kick, ban, timeout, history],
};
