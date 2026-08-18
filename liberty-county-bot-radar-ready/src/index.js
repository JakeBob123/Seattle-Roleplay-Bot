require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials } = require('discord.js');

const moduleRegistry = require('./core/moduleRegistry');
const commandRegistry = require('./core/commandRegistry');
const { deployAllGuilds } = require('./core/commandDeployer');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
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

client.once('ready', async () => {
  console.log(`[ready] Logged in as ${client.user.tag}`);
  await deployAllGuilds(client);
  console.log('[ready] Command sync complete for all guilds.');
});

client.login(process.env.DISCORD_TOKEN);

process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
