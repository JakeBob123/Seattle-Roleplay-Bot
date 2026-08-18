/**
 * Every event a module can send through the Webhook Engine. This is the
 * catalog /webhook reads from and the source of truth for which
 * placeholders are valid for which event (spec §14 — "only expose
 * variables that are valid for the specific event").
 *
 * IMPORTANT: this only lists events that a real, wired-up module actually
 * fires (see the `firedBy` comment on each). Staff promotions/infractions/
 * terminations and Sessions are NOT listed here yet because those modules
 * don't exist — adding webhook config for an event nothing ever sends
 * would be exactly the "fake feature" the build spec prohibits. When
 * Staff Management / Sessions get built, their events get added here in
 * the same shape.
 */
module.exports = {
  // ---- Support (fired by src/modules/support/tickets.js) ----
  'support.ticket_created': {
    label: 'Ticket Created',
    module: 'support',
    emojiKey: 'support.ticket',
    variables: ['user', 'user_id', 'category', 'ticket_channel'],
    defaultTemplate: {
      title: 'Ticket Created',
      description: '{user} opened a **{category}** ticket in {ticket_channel}.',
      color: 'color',
    },
  },
  'support.ticket_claimed': {
    label: 'Ticket Claimed',
    module: 'support',
    emojiKey: 'support.claim',
    variables: ['moderator', 'ticket_channel'],
    defaultTemplate: { title: 'Ticket Claimed', description: '{moderator} claimed {ticket_channel}.', color: 'color' },
  },
  'support.ticket_closed': {
    label: 'Ticket Closed',
    module: 'support',
    emojiKey: 'support.close',
    variables: ['moderator', 'ticket_channel'],
    defaultTemplate: { title: 'Ticket Closed', description: '{moderator} closed {ticket_channel}.', color: 'warning' },
  },

  // ---- Moderation (fired by src/modules/moderation/commands.js) ----
  'moderation.case_created': {
    label: 'Moderation Case',
    module: 'moderation',
    emojiKey: 'moderation.case',
    variables: ['case_id', 'action', 'user', 'moderator', 'reason'],
    defaultTemplate: { title: 'Case #{case_id} — {action}', description: '**Target:** {user}\n**Moderator:** {moderator}\n**Reason:** {reason}', color: 'color' },
  },

  // ---- Role Requests (fired by src/modules/roleRequest/index.js) ----
  'staff.role_request_created': {
    label: 'Role Request Submitted',
    module: 'roleRequest',
    emojiKey: 'staff.role_request',
    variables: ['user', 'department', 'current_rank', 'requested_rank', 'roles_requested', 'proof_url'],
    defaultTemplate: { title: 'Role Request', description: '**User:** {user}\n**Department:** {department}\n**{current_rank} -> {requested_rank}**\n**Role(s):** {roles_requested}', color: 'color' },
  },
  'staff.role_request_decided': {
    label: 'Role Request Decided',
    module: 'roleRequest',
    emojiKey: 'staff.role_request',
    variables: ['request_id', 'decision', 'reviewer'],
    defaultTemplate: { title: 'Role Request #{request_id} {decision}', description: 'Reviewed by {reviewer}.', color: 'color' },
  },

  // ---- In-Game (fired by src/modules/ingame/index.js) ----
  'ingame.emergency_call': {
    label: 'Emergency Call',
    module: 'ingame',
    emojiKey: 'ingame.emergency',
    variables: ['team', 'description', 'position_descriptor'],
    defaultTemplate: { title: 'Emergency Call', description: '**Team:** {team}\n{description}\n{position_descriptor}', color: 'error' },
  },

  // ---- Welcome (fired by src/modules/welcome/index.js) ----
  'welcome.member_join': {
    label: 'Member Welcome',
    module: 'welcome',
    emojiKey: 'system.welcome',
    variables: ['user', 'user_id', 'server', 'member_count'],
    defaultTemplate: { title: 'Welcome to {server}!', description: 'Welcome {user}, you\'re member #{member_count}.', color: 'success' },
  },

  // ---- Media (fired by src/modules/media/index.js) ----
  'media.request_submitted': {
    label: 'Media Submission',
    module: 'media',
    emojiKey: 'support.ticket',
    variables: ['user', 'in_game_username', 'attachment_url'],
    defaultTemplate: { title: 'Media Submission', description: '**Submitted by:** {user}\n**In-game username:** {in_game_username}', color: 'color' },
  },

  // ---- Staff Management (fired by src/modules/staff/commands.js) ----
  'staff.promotion': {
    label: 'Promotion',
    module: 'staff',
    emojiKey: 'staff.promotion',
    variables: ['member', 'old_rank', 'new_rank', 'moderator', 'reason'],
    defaultTemplate: { title: 'Promotion', description: '{member} was promoted from **{old_rank}** to **{new_rank}**.\n**By:** {moderator}\n**Reason:** {reason}', color: 'success' },
  },
  'staff.infraction': {
    label: 'Staff Infraction',
    module: 'staff',
    emojiKey: 'staff.infraction',
    variables: ['member', 'type', 'moderator', 'reason'],
    defaultTemplate: { title: '{type}', description: '**Member:** {member}\n**By:** {moderator}\n**Reason:** {reason}', color: 'warning' },
  },
  'staff.termination': {
    label: 'Termination',
    module: 'staff',
    emojiKey: 'staff.termination',
    variables: ['member', 'type', 'moderator', 'reason'],
    defaultTemplate: { title: 'Termination', description: '**Member:** {member}\n**By:** {moderator}\n**Reason:** {reason}', color: 'error' },
  },

  // ---- System (fired by src/commands/configCategories/modules.js) ----
  'system.module_toggled': {
    label: 'Module Enabled/Disabled',
    module: 'core',
    emojiKey: 'system.config',
    variables: ['module', 'state', 'actor'],
    defaultTemplate: { title: 'Module {state}', description: '**{module}** was {state} by {actor}.', color: 'color' },
  },
};
