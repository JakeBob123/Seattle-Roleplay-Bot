# Liberty County Platform Bot

A modular Discord management platform, built with discord.js v14 (Components V2),
Node's built-in SQLite (no native module, no build step), and a
module-registry architecture so new features drop in as
self-contained folders.

## What's actually implemented right now

### Core platform
- Persistent per-guild config, auto-migrating as new modules/keys are added
- Granular permission manager — per-command role/user grants, hard-coded
  bootstrap founder + configurable guild founder + Administrator override
- Module registry: every `src/modules/<id>/index.js` self-registers its
  commands, config defaults, events, and required emoji set
- Command deployer that hides everything but `/config` until the founder
  finishes setup, then registers each *enabled* module's commands
- Audit log + moderation case numbering
- AES-256-GCM secret encryption at rest (`src/core/crypto.js`) — used for
  the ER:LC server key today, reusable for any future credential

### `/config` — Components V2 control panel
General • Modules (enable/disable, auto-provisions emoji on enable) •
Roles & Permissions • Support & Review Routing (ticket category, staff
role, review channels) • Branding • In-Game Integration • Emoji & Assets

### Smart Emoji Engine (`src/core/emojiEngine/`)
Modules declare `requiredEmojis: [...]`; the engine searches, ranks,
downloads, and installs real Discord custom emoji automatically when a
module is enabled — no manual emoji hunting. Currently wired to **one**
provider, Twemoji (Twitter/X's CC-BY 4.0 licensed emoji set), and that's a
deliberate choice, not a shortcut: most icon/emoji search sites don't
grant a license to download-and-republish as a Discord server asset, and
a scraper built to do that anyway would be shipping infringement, not a
feature. Twemoji is explicitly licensed for this. Cross-module reuse,
asset-hash dedup, style-profile scoring, and graceful Unicode fallback at
Discord's emoji cap are all real and tested — see `/config -> Emoji &
Assets` (Regenerate / Optimize / remove).

### Webhook / Event Engine (`src/modules/webhooks/`)
One reusable service, not per-module copy-paste embeds. Every event has:
a channel, enabled/disabled, an editable title/description/color
template, and a declared `{variable}` allow-list. `/webhook list |
channel | toggle | edit | test` (with autocomplete) configures any of
them. Actually fires from real code, not just configurable in the
abstract:
- `support.ticket_created` / `ticket_claimed` / `ticket_closed`
- `moderation.case_created` (warn/kick/ban/timeout all route through this)
- `staff.role_request_created` / `role_request_decided`
- `ingame.emergency_call` (from the real ER:LC event webhook)
- `welcome.member_join`
- `media.request_submitted`
- `system.module_toggled`

Events for modules that don't exist yet (Staff promotions/infractions,
Sessions) are not in the catalog — adding webhook config for something
nothing ever sends would be exactly the fake feature the spec prohibits.

### Support module
`/support` — 4-category ticket picker, private channels, claim/close,
IA/HR/Partnership are enforced human-only at the code level (no AI is
wired in).

### Moderation module
`/warn /kick /ban /timeout /history` — real case records, auto-incrementing
per-guild case numbers, full audit trail.

### Role Request module
`/role-request` — modal form matching your reference image, validates
proof is a real image URL, posts Approve/Reject to a configured channel.

### Media Requests module
`/media-request` — real image attachment option (not a URL workaround)
plus in-game username. Access is controlled entirely by the existing
permission manager: grant `/media-request` to your actual Media Team /
Supervisor / Internal Affairs / Management roles in `/config -> Roles &
Permissions` — nothing is hard-coded to specific role names since those
are yours, not the bot's.

### Welcome module
Fires on real `guildMemberAdd`, routes through the Webhook Engine — so
the welcome message is configured exactly like every other event
(`/webhook channel welcome.member_join #general`, `/webhook edit
welcome.member_join`).

### In-Game Integration — ER:LC (Emergency Response: Liberty County)
Built against the official, current `api.erlc.gg` v2 API
(apidocs.erlc.gg), fetched and verified live while building this, not
guessed or copied from an old wrapper:
- `src/modules/ingame/erlcClient.js` — the entire real v2 surface:
  `GET /v2/server` (with `Players/Staff/JoinLogs/Queue/KillLogs/
  CommandLogs/ModCalls/EmergencyCalls/Vehicles` query flags) and
  `POST /v2/server/command`. Full official error-code table (2000-9999),
  429 handling that stops immediately and surfaces `Retry-After` instead
  of hammering the API, one automatic retry on genuine 5xx, request
  timeouts.
- `/config -> In-Game Integration` — enter/update/test/disconnect the
  server key (encrypted at rest, never logged, masked in the UI), live
  connection status, dashboard channel, join/leave channel.
- `/server-info` — live status card. `/erlc-command` — runs an in-game
  command with a confirmation step for destructive-looking commands
  (`:ban`, `:kick`, etc.) and a 5s cooldown matching ER:LC's documented
  command rate limit, all logged to `erlc_command_log` + the audit log.
- Dashboard poller — edits one persistent status message instead of
  spamming new ones, diffs `JoinLogs` for join/leave notifications.
- Real Ed25519-verified inbound event webhook receiver
  (`src/modules/ingame/webhookServer.js`) implementing ER:LC's exact
  documented scheme (`message = timestamp + raw_body`, SPKI public key).
  Tested end-to-end with a real generated keypair signing a real HTTP
  request through the actual Express route — verification, dedup, and
  event dispatch all confirmed working, not just unit-tested in
  isolation. Per the official docs, ER:LC currently only sends webhooks
  for two event types (`;`-prefixed in-game messages and Emergency
  Calls) — there's no formal payload schema published for either beyond
  the signing spec, so every event is logged raw regardless of how it's
  classified, and nothing is invented.

  You must generate your own unique webhook URL per guild (shown in
  `/config -> In-Game Integration`) since ER:LC's webhook setting doesn't
  include a server identifier in the payload — that URL is how this bot
  tells guilds apart.

## What's intentionally NOT built (scaffold only)

Per the spec's own "do not fake features" rule, these are documented as
the next step in `src/modules/MODULE_TEMPLATE.js` rather than shipped as
hollow commands:
- Staff Management (promotions, infractions, terminations, hierarchy)
- Sessions (start/vote/shutdown)
- AI assistant (server-knowledge base, ticket triage, in-game detection
  analysis/recommended punishment)
- Broader emoji providers beyond Twemoji (only if you can point me at a
  source with an actual reuse license — see the Smart Emoji Engine note
  above for why this isn't a "just add more scrapers" decision)

Tell me which to build next and I'll build it the same way as everything
above: real DB tables, real Discord side effects, real `/config` wiring.

## Setup

```bash
npm install
cp .env.example .env
# fill in .env -- see "Environment variables" below for every value and why it's needed
npm start
```

`npm start` validates your `.env` before doing anything else. A missing
`DISCORD_TOKEN` or a bad token exits immediately with a plain-English
message and a non-zero exit code -- it will never crash mid-run with a
confusing stack trace. A missing `ENCRYPTION_KEY` is a warning, not a
hard failure, since only the ER:LC integration needs it.

### Environment variables (everything `.env` needs, and why)

| Variable | Required? | What it's for |
|---|---|---|
| `DISCORD_TOKEN` | **Yes** | Bot login. From the Developer Portal (see Gateway setup below). |
| `ENCRYPTION_KEY` | Only for ER:LC | 64-char hex, encrypts the ER:LC server key at rest. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `ALLOWED_GUILD_IDS` | Recommended | Comma-separated guild IDs. Locks the bot to only your servers -- see below. |
| `WEBHOOK_PORT` | Local hosting only | Ignored on Render (it injects `PORT` itself). |
| `PUBLIC_WEBHOOK_BASE_URL` | Only for ER:LC | Your public URL, used to build the ER:LC event-webhook link shown in `/config`. |

### Restricting which servers the bot can join

Set `ALLOWED_GUILD_IDS` to a comma-separated list of the Discord server
IDs you actually run (right-click a server icon -> Copy Server ID, with
Developer Mode on in Discord's settings). Any server **not** on that list
gets left automatically:
- immediately, if someone tries to invite the bot into it (`guildCreate`)
- again on every restart (`enforceOnReady`), so removing a server from
  the list kicks the bot out of it next deploy too

Leave `ALLOWED_GUILD_IDS` empty only while you're testing and don't mind
the bot being installable anywhere -- the startup log will warn you every
time it's unset so you don't forget to lock it down before going live.

### Gateway / Discord Developer Portal setup

1. https://discord.com/developers/applications -> your application (or
   **New Application** if you haven't made one).
2. **Bot** tab -> **Reset Token** -> copy it into `DISCORD_TOKEN`.
3. Same **Bot** tab, under **Privileged Gateway Intents**, turn on:
   - **Server Members Intent** -- required for moderation and the welcome module
   - **Message Content Intent** -- not required by anything shipped today; only turn it on once the AI module is built
4. **OAuth2 -> URL Generator**: check the `bot` and `applications.commands`
   scopes. Under Bot Permissions, at minimum: Manage Roles, Manage
   Channels, Kick Members, Ban Members, Moderate Members, Manage Emojis
   and Stickers, Send Messages, Embed Links, Attach Files, Read Message
   History. Use the generated URL to invite the bot to a server that's on
   your `ALLOWED_GUILD_IDS` list.
5. That's the entire gateway setup -- this bot only uses the standard
   Discord gateway connection (`client.login`), not an HTTP Interactions
   Endpoint, so there's no separate "Interactions Endpoint URL" to
   configure in the portal.

### Hosting on Render

This is built to work as a Render **Web Service** (not Background
Worker) out of the box:
- **Build Command:** set this explicitly to `npm install` in your
  Render service's Settings, not `npm ci`. Render's default Node
  behavior can prefer `npm ci` when it sees a lockfile, and `npm ci` is
  strict about the lockfile being byte-for-byte in sync -- `npm install`
  isn't and is the safer choice here. If your build ever fails with npm
  dumping a wall of `npm error --omit / --include / --strict-peer-deps...`
  usage text instead of a real error message, that's `npm ci` complaining
  about the lockfile -- switching the Build Command to `npm install`
  fixes it.
- **Start Command:** `npm start` (already the `package.json` default).
- **Node version:** 22.13 or newer (set via Render's environment/runtime
  settings, or a `.node-version` file) -- this project uses Node's
  built-in `node:sqlite` instead of a compiled native module specifically
  so there's nothing to build on deploy. You'll see one harmless
  `ExperimentalWarning: SQLite is an experimental feature` line in the
  logs on every boot; that's expected and not an error.
- Render sets `PORT` automatically; `src/core/httpServer.js` binds to it
  and answers `GET /` with `200 {"status":"ok"}` the moment the process
  boots -- this is what keeps Render's health check green even before
  Discord finishes connecting, and even for guilds that never touch the
  In-Game Integration module.
- Add every variable from the table above as a Render environment
  variable (`WEBHOOK_PORT` and `PUBLIC_WEBHOOK_BASE_URL` aside -- for
  `PUBLIC_WEBHOOK_BASE_URL`, use your actual Render URL,
  `https://your-app-name.onrender.com`).
- `data/` (the SQLite file) is **not** persistent on Render's free tier
  across deploys/restarts unless you attach a persistent disk -- add one
  under your service's **Disks** settings mounted at `/opt/render/project/src/data`
  (or wherever your working directory resolves to) if you need config to
  survive redeploys, which you almost certainly do.

### Fixing duplicate files from a previous download

If you'd already extracted an earlier version of this project and then
extracted a newer zip on top of it, you may end up with two copies of
everything (an old flat `src/` next to a new one, or similar) --
that's a packaging inconsistency on my end between deliveries, not a bug
in the bot itself. **Delete your old extracted folder entirely and
extract this zip fresh** into an empty directory to clear that up. Going
forward, every zip from here has the same flat structure, so this
shouldn't recur.

On first join, only `/config` is visible. An admin: `/config` -> Modules
(enable what you want -- emoji provisioning happens automatically) ->
Support & Review Routing / In-Game Integration (fill in the specifics) ->
General -> Finish Setup. `/webhook` configures where every event posts.

If you're running the In-Game Integration module, you also need a public
HTTPS URL reaching your webhook port (see `.env.example` --
`PUBLIC_WEBHOOK_BASE_URL`) so ER:LC's event webhook can reach you; paste
the generated URL from `/config -> In-Game Integration` into your ER:LC
private server's Event Webhook setting.

## Architecture

```
src/
  index.js                 bot entry — loads modules, wires events, logs in
  database/db.js           schema: guild_config, module_state, permissions,
                            tickets, mod_cases, role_requests, audit_log,
                            custom_emojis, emoji_style_profile,
                            webhooks_config, erlc_credentials,
                            erlc_webhook_events, erlc_join_state,
                            erlc_command_log, media_requests
  core/
    configManager.js       per-guild config, deep-merged against live defaults
    permissionManager.js   grant/revoke/canUse — role or user, per command
    moduleRegistry.js      loads every src/modules/<id>/index.js
    commandDeployer.js     registers only /config until configured
    commandRegistry.js     flat name -> {command, moduleId} lookup
    branding.js            centralized colors/containers
    audit.js                audit log + moderation case numbering
    crypto.js               AES-256-GCM encryption for secrets at rest
    httpServer.js           shared Express instance for inbound webhooks
    emojiEngine/
      index.js               request/cache/dedupe/install — the module API
      ranking.js              candidate scoring against style profile
      keywordMap.js            semantic key -> Twemoji codepoint(s)
      providers/twemojiProvider.js
  commands/config.js        the /config panel + its category sub-handlers
  events/                   interactionCreate (routes + permission gate +
                            autocomplete), guildCreate
  modules/
    support/                tickets
    moderation/              warn/kick/ban/timeout/history
    roleRequest/             /role-request form + review workflow
    media/                   /media-request (username + image attachment)
    welcome/                 guildMemberAdd -> webhook engine
    webhooks/                the reusable event/message engine + /webhook
    ingame/                  ER:LC client, credential store, dashboard
                             poller, webhook receiver, /server-info,
                             /erlc-command
    MODULE_TEMPLATE.js       copy this to add staff/sessions/ai
```

Adding a module is: create `src/modules/<id>/index.js` following the
template, restart. Config defaults, command registration, permissions,
and emoji provisioning all pick it up through the registry — nothing
else in the codebase changes.

## Security notes already in place

- `.env` holds the bot token and encryption key; nothing else reads them.
- The ER:LC server key is AES-256-GCM encrypted at rest, masked in every
  UI (`****1a2b`), never logged, never placed in any embed/container.
- Every permission check happens server-side in `permissionManager.canUse`
  — buttons/selects never grant access on their own.
- Inbound ER:LC webhooks are Ed25519-verified against the raw request
  body before anything is processed; duplicate/replayed events are
  rejected via a persisted event-hash table.
- `/erlc-command` requires confirmation for destructive-looking commands,
  is rate-limited to match ER:LC's documented command bucket, and every
  call is logged to both the general audit log and a dedicated
  `erlc_command_log` table.
