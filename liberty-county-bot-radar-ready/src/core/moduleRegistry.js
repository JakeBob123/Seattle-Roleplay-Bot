const fs = require('fs');
const path = require('path');
const configManager = require('./configManager');

/**
 * Every module lives in src/modules/<id>/index.js and exports:
 * {
 *   id: 'support',                 // unique module id, matches folder name
 *   name: 'Support & Tickets',     // human label shown in /config
 *   description: '...',            // shown in /config module list
 *   defaultConfig: { ... },        // merged into guild config under modules[id]
 *   commands: [ SlashCommandObj ], // each exports data + execute + (optional) guildOnly
 *   events: [ { name, handler } ], // discord.js client events this module listens to
 *   onEnable(guild) {},            // optional, called when admin enables the module
 *   onDisable(guild) {},           // optional
 * }
 *
 * This lets #28 (modular architecture) hold in practice: adding a new
 * module is "drop a folder in src/modules, restart" -- nothing else in the
 * codebase needs to change.
 */
const modules = new Map();

function loadModules() {
  const modulesDir = path.join(__dirname, '..', 'modules');
  const folders = fs.readdirSync(modulesDir).filter((f) =>
    fs.statSync(path.join(modulesDir, f)).isDirectory()
  );

  for (const folder of folders) {
    const entry = path.join(modulesDir, folder, 'index.js');
    if (!fs.existsSync(entry)) continue; // scaffold-only module, not wired up yet
    const mod = require(entry);
    if (!mod.id) throw new Error(`Module in ${folder} is missing an id`);
    modules.set(mod.id, mod);
    configManager.registerModuleDefaults(mod.id, mod.defaultConfig || {});
  }
  return modules;
}

function getModules() {
  return [...modules.values()];
}

function getModule(id) {
  return modules.get(id);
}

/** All slash commands from all loaded modules, plus core commands. */
function getAllCommands(coreCommands = []) {
  const all = [...coreCommands];
  for (const mod of modules.values()) {
    for (const cmd of mod.commands || []) all.push(cmd);
  }
  return all;
}

module.exports = { loadModules, getModules, getModule, getAllCommands };
