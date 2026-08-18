const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require('discord.js');
const db = require('../../database/db');
const erlcClient = require('./erlcClient');
const credentialStore = require('./credentialStore');
const configManager = require('../../core/configManager');
const { getBrand } = require('../../core/branding');

const getJoinState = db.prepare(`SELECT * FROM erlc_join_state WHERE guild_id = ?`);
const upsertJoinState = db.prepare(`
  INSERT INTO erlc_join_state (guild_id, last_timestamp) VALUES (?, ?)
  ON CONFLICT(guild_id) DO UPDATE SET last_timestamp = excluded.last_timestamp
`);

// guildId -> { intervalHandle, dashboardMessageId }
const activePollers = new Map();

function buildDashboardContainer(brand, info) {
  const container = new ContainerBuilder().setAccentColor(info ? brand.color : brand.error);

  if (!info) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Server Dashboard\n⚠️ Could not reach the ER:LC server. Check the connection in `/config`.')
    );
    return container;
  }

  const staffCount =
    (info.Staff ? Object.keys(info.Staff.Admins || {}).length + Object.keys(info.Staff.Mods || {}).length + Object.keys(info.Staff.Helpers || {}).length : null);

  const emergencyCount = info.EmergencyCalls?.length ?? null;

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        `## ${info.Name}`,
        `**Players:** ${info.CurrentPlayers}/${info.MaxPlayers}`,
        staffCount !== null ? `**Staff online:** ${staffCount}` : null,
        emergencyCount !== null ? `**Active emergency calls:** ${emergencyCount}` : null,
        `**Join key:** ${info.JoinKey}`,
        `**Account verification:** ${info.AccVerifiedReq}`,
      ]
        .filter(Boolean)
        .join('\n')
    )
  );
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Live from ER:LC API • updates automatically`)
  );
  return container;
}

async function pollOnce(client, guildId) {
  const guildConfig = configManager.getConfig(guildId);
  const moduleConfig = guildConfig.modules.ingame || {};
  const serverKey = credentialStore.getKey(guildId);
  if (!serverKey) return;

  const wantJoinDiff = !!moduleConfig.eventChannels?.joinLeave;

  let info = null;
  try {
    const { data } = await erlcClient.getServerInfo(serverKey, {
      Staff: true,
      EmergencyCalls: true,
      JoinLogs: wantJoinDiff,
    });
    info = data;
    credentialStore.setStatus(guildId, { connected: true, serverName: info.Name });
  } catch (err) {
    credentialStore.setStatus(guildId, { connected: false, error: err.message });
    console.error(`[ingame] Poll failed for guild ${guildId}:`, err.message);
  }

  // ---- Dashboard message ----
  if (moduleConfig.dashboardChannelId) {
    const brand = getBrand(guildConfig);
    const container = buildDashboardContainer(brand, info);
    const payload = { components: [container], flags: MessageFlags.IsComponentsV2 };

    try {
      const channel = await client.channels.fetch(moduleConfig.dashboardChannelId);
      const state = activePollers.get(guildId) || {};
      if (state.dashboardMessageId) {
        const msg = await channel.messages.fetch(state.dashboardMessageId).catch(() => null);
        if (msg) await msg.edit(payload);
        else {
          const sent = await channel.send(payload);
          activePollers.set(guildId, { ...state, dashboardMessageId: sent.id });
        }
      } else {
        const sent = await channel.send(payload);
        activePollers.set(guildId, { ...state, dashboardMessageId: sent.id });
      }
    } catch (err) {
      console.error(`[ingame] Dashboard update failed for guild ${guildId}:`, err.message);
    }
  }

  // ---- Join/leave diffing -> Discord notification ----
  if (info?.JoinLogs && wantJoinDiff) {
    const state = getJoinState.get(guildId) || { last_timestamp: 0 };
    const newEntries = info.JoinLogs.filter((e) => e.Timestamp > state.last_timestamp).sort((a, b) => a.Timestamp - b.Timestamp);

    if (newEntries.length) {
      const channel = await client.channels.fetch(moduleConfig.eventChannels.joinLeave).catch(() => null);
      if (channel) {
        for (const entry of newEntries.slice(-20)) {
          // cap burst on first-ever run
          const [name] = entry.Player.split(':');
          await channel
            .send(`${entry.Join ? '🟢 **Joined**' : '🔴 **Left**'} — ${name}`)
            .catch(() => {});
        }
      }
      upsertJoinState.run(guildId, newEntries[newEntries.length - 1].Timestamp);
    }
  }

  return info;
}

function startPolling(client, guildId) {
  stopPolling(guildId);
  const guildConfig = configManager.getConfig(guildId);
  const intervalSec = Math.max(30, guildConfig.modules.ingame?.pollingIntervalSec || 60);

  const handle = setInterval(() => pollOnce(client, guildId).catch((e) => console.error('[ingame] poll error', e)), intervalSec * 1000);
  activePollers.set(guildId, { ...(activePollers.get(guildId) || {}), intervalHandle: handle });
  pollOnce(client, guildId).catch((e) => console.error('[ingame] initial poll error', e));
}

function stopPolling(guildId) {
  const state = activePollers.get(guildId);
  if (state?.intervalHandle) clearInterval(state.intervalHandle);
  activePollers.delete(guildId);
}

module.exports = { startPolling, stopPolling, pollOnce, buildDashboardContainer };
