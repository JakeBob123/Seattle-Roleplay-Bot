/**
 * Maps a semantic emoji key (e.g. "moderation.ban") to one or more
 * candidate Twemoji codepoints, ranked best-first. This is the seed data
 * the ranking step in emojiEngine/index.js scores against.
 *
 * Twemoji (https://github.com/twitter/twemoji) is Twitter/X's open-source
 * emoji artwork, licensed CC-BY 4.0 — free to use, modify, and redistribute
 * with attribution, which is why it's the only provider wired up by
 * default (see providers/twemojiProvider.js for why arbitrary web-scraping
 * providers are NOT implemented). Attribution is preserved in the
 * custom_emojis.source_url column for every installed asset.
 *
 * Each entry: [primaryCodepoint, ...fallbackCodepoints]
 * A "codepoint" is the lowercase hex Unicode codepoint Twemoji's asset
 * filenames use, e.g. "1f528" for U+1F528 (hammer).
 */
module.exports = {
  // ---- Moderation ----
  'moderation.ban': ['1f528'], // 🔨 hammer
  'moderation.kick': ['1f462'], // 👢 boot
  'moderation.warn': ['26a0'], // ⚠️ warning
  'moderation.timeout': ['23f3'], // ⏳ hourglass
  'moderation.purge': ['1f9f9'], // 🧹 broom
  'moderation.case': ['1f4cb'], // 📋 clipboard
  'moderation.security': ['1f6e1'], // 🛡️ shield

  // ---- Support ----
  'support.support': ['1f6df'], // 🛟 ring buoy
  'support.ticket': ['1f3ab'], // 🎫 ticket
  'support.community': ['1f4ac'], // 💬 speech balloon
  'support.internal_affairs': ['1f575'], // 🕵️ detective
  'support.hr_affairs': ['1f4c1'], // 📁 folder
  'support.partnership': ['1f91d'], // 🤝 handshake
  'support.regulations': ['1f4d6'], // 📖 open book
  'support.contact': ['1f4e7'], // 📧 email
  'support.claim': ['2705'], // ✅ check
  'support.close': ['1f512'], // 🔒 lock

  // ---- Staff ----
  'staff.staff': ['1f465'], // 👥 people
  'staff.promotion': ['1f4c8'], // 📈 chart up
  'staff.infraction': ['1f6ab'], // 🚫 prohibited
  'staff.termination': ['274c'], // ❌ cross mark
  'staff.investigation': ['1f50d'], // 🔍 magnifying glass
  'staff.role_request': ['1f3f7'], // 🏷️ label

  // ---- Sessions ----
  'sessions.session': ['1f3ae'], // 🎮 controller
  'sessions.start': ['25b6'], // ▶️ play
  'sessions.vote': ['1f5f3'], // 🗳️ ballot box
  'sessions.shutdown': ['1f6d1'], // 🛑 stop sign
  'sessions.active': ['1f7e2'], // 🟢 green circle
  'sessions.inactive': ['1f534'], // 🔴 red circle

  // ---- In-Game ----
  'ingame.detection': ['1f6a8'], // 🚨 rotating light
  'ingame.punishment': ['2696'], // ⚖️ scales
  'ingame.vehicle': ['1f693'], // 🚓 police car
  'ingame.emergency': ['1f3e5'], // 🏥 hospital / emergency

  // ---- AI ----
  'ai.assistant': ['1f916'], // 🤖 robot
  'ai.alert': ['1f4e2'], // 📢 megaphone
  'ai.knowledge': ['1f4da'], // 📚 books

  // ---- System / config ----
  'system.config': ['2699'], // ⚙️ gear
  'system.error': ['26d4'], // ⛔ no entry
  'system.success': ['2705'], // ✅ check
  'system.welcome': ['1f44b'], // 👋 wave
};
