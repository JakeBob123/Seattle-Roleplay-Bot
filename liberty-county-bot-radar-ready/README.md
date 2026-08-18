# Liberty County Platform Bot

A modular Discord management platform, built with discord.js v14 (Components V2),
better-sqlite3, and a module-registry architecture so new features drop in as
self-contained folders.

## What's actually implemented right now

- **Core platform**: config system (persistent, per-guild, auto-migrating
  defaults), granular permission manager (per-command, role or user grants,
  hard-coded bootstrap founder + configurable guild founder + Administrator
  override), module registry/loader, command deployer that hides everything
  but `/config` until the founder finishes setup, audit log, moderation
  case system.
- **`/config`**: Components V2 control panel — General, Modules (enable/
  disable), Branding (color/name/footer via modal), Roles & Permissions
  (grant a role access to any command).
- **Support module**: `/support` opens a category picker (Community Affairs
  / Internal Affairs / HR Affairs / Partnership), creates a private ticket
  channel, claim/close buttons, and enforces the AI-eligibility rule at the
  code level (IA/HR/Partnership are flagged human-only; no AI is wired in
  yet — see below).
- **Moderation module**: `/warn`, `/kick`, `/ban`, `/timeout`, `/history`,
  all writing real case records with auto-incrementing per-guild case
  numbers and full audit trail.
- **Role Request module**: `/role-request` opens a modal matching the exact
  form from your reference image, validates that proof is a real image URL,
  and posts an Approve/Reject card to your configured review channel.

## What's intentionally NOT built yet (scaffold only)

Per your own instruction #33 ("do not fake features"), these are **not**
shipped as hollow commands. They're documented as the next build step in
`src/modules/MODULE_TEMPLATE.js`, which is the exact pattern the three real
modules above follow:

- **Staff Management** (promotions, infractions, terminations, hierarchy)
- **Sessions** (start/vote/shutdown, player count webhook like your
  screenshot)
- **Webhooks manager** (per-event configurable announcement cards)
- **AI assistant** (server-knowledge base, ticket triage, in-game
  detection analysis)
- **In-Game Integration** (Liberty County API — needs your actual API
  base URL / auth shape / detection payload format before I can build it
  for real instead of guessing)
- **Automatic custom emoji system**

I did not build stubs for these because a fake `/promote` that doesn't
actually move roles is worse than no command at all — tell me which one
to build next (staff management and sessions are the most natural
follow-ups given what's already wired) and I'll build it the same way as
the modules above: real DB tables, real Discord side-effects, real config
in `/config`.

## Setup

```bash
npm install
cp .env.example .env   # paste your bot token into DISCORD_TOKEN
npm start
```

The bot needs these privileged gateway intents enabled in the Discord
Developer Portal: **Server Members Intent** and **Message Content Intent**
(Message Content is only needed once the AI/knowledge module is built —
safe to leave off until then).

On first join, only `/config` is visible. An admin runs `/config` →
**Modules** to enable Support / Moderation / Role Requests, then
**General** → *Finish Setup*. The rest of that module's commands appear
automatically (guild command sync runs on every module toggle and on
every bot restart).

## Architecture

```
src/
  index.js                 bot entry — loads modules, wires events, logs in
  database/db.js           better-sqlite3 schema (guild_config, module_state,
                            permissions, tickets, mod_cases, role_requests,
                            audit_log, custom_emojis, webhooks_config)
  core/
    configManager.js       per-guild config, deep-merged against live defaults
    permissionManager.js   grant/revoke/canUse — role or user, per command
    moduleRegistry.js      loads every src/modules/<id>/index.js
    commandDeployer.js     registers only /config until configured
    commandRegistry.js     flat name -> {command, moduleId} lookup
    branding.js            centralized colors/containers — no module
                            hard-codes its own styling
    audit.js                audit log + moderation case numbering
  commands/config.js        the /config panel + its category sub-handlers
  events/                   interactionCreate (routes + permission gate),
                            guildCreate (deploys /config on join)
  modules/
    support/                tickets
    moderation/              warn/kick/ban/timeout/history
    roleRequest/             /role-request form + review workflow
    MODULE_TEMPLATE.js       copy this to add staff/sessions/webhooks/ai/ingame
```

Adding a module is: create `src/modules/<id>/index.js` following the
template, restart. Nothing else in the codebase changes — config
defaults, command registration, and permissions all pick it up through
the registry.

## Security notes already in place

- `.env` holds the bot token; nothing reads it except `src/index.js`.
- Every permission check happens server-side in `permissionManager.canUse`
  — buttons/selects never grant access on their own, they just trigger a
  handler that re-checks.
- No secrets are ever put into an embed/container body.
