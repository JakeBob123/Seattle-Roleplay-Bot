const moduleRegistry = require('./moduleRegistry');

let byName = null;

function build() {
  byName = new Map();
  const configCmd = require('../commands/config');
  byName.set(configCmd.data.name, { command: configCmd, moduleId: 'core' });

  for (const mod of moduleRegistry.getModules()) {
    for (const cmd of mod.commands || []) {
      byName.set(cmd.data.name, { command: cmd, moduleId: mod.id });
    }
  }
  return byName;
}

function get(name) {
  if (!byName) build();
  return byName.get(name);
}

function rebuild() {
  build();
}

module.exports = { build, get, rebuild };
