const configManager = require('../../core/configManager');
const webhookEngine = require('../webhooks/engine');

/**
 * Deliberately thin: the actual message (channel, title, description,
 * color) lives entirely in the Webhook Engine's `welcome.member_join`
 * event config (/webhook channel welcome.member_join #general, /webhook
 * edit welcome.member_join). This module's only job is to fire that event
 * at the right moment — reusing the same engine every other module uses,
 * per the "reusable services, not one-off code per module" requirement.
 */
async function onGuildMemberAdd(member) {
  const guildConfig = configManager.getConfig(member.guild.id);
  if (!guildConfig.modules.welcome?.enabled) return;

  await webhookEngine
    .sendEvent(member.client, member.guild.id, 'welcome.member_join', {
      user: `<@${member.id}>`,
      user_id: member.id,
      server: member.guild.name,
      member_count: member.guild.memberCount,
    })
    .catch((err) => console.error('[welcome] sendEvent failed:', err));
}

module.exports = {
  id: 'welcome',
  name: 'Welcome System',
  description: 'Greets new members via the Webhook Engine — configure the message with /webhook.',
  defaultConfig: {},
  requiredEmojis: ['system.welcome'],
  commands: [],
  events: [{ name: 'guildMemberAdd', handler: onGuildMemberAdd }],
};
