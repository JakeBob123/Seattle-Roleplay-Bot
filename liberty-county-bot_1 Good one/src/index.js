require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials } = require('discord.js');

const moduleRegistry = require('./core/moduleRegistry');
const commandRegistry = require('./core/commandRegistry');
const { deployAllGuilds } = require('./core/commandDeployer');
const httpServer = require('./core/httpServer');
const { enforceOnReady, getAllowlist } = require('./core/guildAllowlist');

// ---------------------------------------------------------------------------
// Startup validation. Fails loudly and immediately for anything the bot
// genuinely cannot run without, instead of crashing later mid-interaction
// with a confusing stack trace. Non-fatal gaps (e.g. no encryption key yet)
// are warned about clearly so you know exactly what still needs setting up.
// ---------------------------------------------------------------------------
function validateEnv() {
  const problems = [];
  const warnings = [];

  if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_TOKEN.trim()) {
    problems.push('DISCORD_TOKEN is missing. Get it from https://discord.com/developers/applications -> your app -> Bot -> Reset Token.');
  }

  if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64) {
    warnings.push(
      'ENCRYPTION_KEY is missing or not a 64-char hex string. The bot will still start, but In-Game Integration (ER:LC) will fail as soon as anyone tries to save a server key. Generate one with:\n' +
        '    node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }

  const allowlist = getAllowlist();
  if (!allowlist) {
    warnings.push('ALLOWED_GUILD_IDS is not set -- the bot will accept an invite into ANY server. Set it to a comma-separated list of guild IDs to lock this down.');
  } else {
    console.log(`[startup] Guild allowlist active: ${[...allowlist].join(', ')}`);
  }

  if (problems.length) {
    console.error('\n=== STARTUP FAILED ===');
    for (const p of problems) console.error(`  - ${p}`);
    console.error('Fix the above in your .env file (see .env.example) and restart.\n');
    process.exit(1);
  }

  if (warnings.length) {
    console.warn('\n=== STARTUP WARNINGS (bot will still start) ===');
    for (const w of warnings) console.warn(`  - ${w}`);
    console.warn('');
  }
}

validateEnv();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// ---- Load feature modules (commands, config defaults) ---------------------
moduleRegistry.loadModules();
commandRegistry.build();

// ---- Load core + module-contributed client events -------------------------
const coreEventsDir = path.join(__dirname, 'events');
for (const file of fs.readdirSync(coreEventsDir)) {
  const event = require(path.join(coreEventsDir, file));
  client.on(event.name, (...args) => event.execute(...args));
}
for (const mod of moduleRegistry.getModules()) {
  for (const evt of mod.events || []) {
    client.on(evt.name, (...args) => evt.handler(...args, client));
  }
}

// Always bind the HTTP server, regardless of which modules are enabled --
// this is what keeps a Render Web Service (or any host that health-checks
// a port) from marking the process unhealthy and restart-looping it.
httpServer.start();

client.once('ready', async () => {
  console.log(`[ready] Logged in as ${client.user.tag}`);

  await enforceOnReady(client);
  await deployAllGuilds(client);
  console.log('[ready] Command sync complete for all allowed guilds.');

  const ingameModule = moduleRegistry.getModule('ingame');
  if (ingameModule?.bootstrap) await ingameModule.bootstrap(client);

  console.log('[ready] Startup complete -- no errors.');
});

client.on('error', (err) => console.error('[client error]', err));
client.on('warn', (message) => console.warn('[client warning]', message));
client.on('debug', (message) => console.log('[discord debug]', message));
client.on('shardError', (err) => console.error('[gateway error]', err));
client.on('shardDisconnect', (event, shardId) => {
  console.error(`[gateway disconnect] shard ${shardId} closed with code ${event.code}: ${event.reason || 'no reason provided'}`);
});
client.on('shardReconnecting', (shardId) => console.warn(`[gateway reconnecting] shard ${shardId}`));

console.log('[startup] Connecting to Discord Gateway...');
const loginTimeout = setTimeout(() => {
  console.error('\n=== LOGIN TIMEOUT ===');
  console.error('Discord did not complete the Gateway handshake within 30 seconds. Check DISCORD_TOKEN and Discord Gateway availability.\n');
  process.exit(1);
}, 30000);

client.login(process.env.DISCORD_TOKEN).then(() => clearTimeout(loginTimeout)).catch((err) => {
  clearTimeout(loginTimeout);
  console.error('\n=== LOGIN FAILED ===');
  console.error(`  ${err.message}`);
  console.error('This almost always means DISCORD_TOKEN in .env is wrong, expired, or was reset in the Developer Portal.\n');
  process.exit(1);
});

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
