/**
 * Twemoji provider — downloads openly-licensed (CC-BY 4.0) emoji artwork
 * from Twitter/X's open-source Twemoji repository.
 *
 * WHY THIS IS THE ONLY PROVIDER WIRED UP:
 * The correction spec asks for a multi-provider engine that searches
 * "legitimate emoji/asset sources" and skips anything where "automated
 * retrieval and reuse is [not] actually permitted." In practice, almost
 * every icon/emoji search site (Flaticon, IconFinder, Emoji.gg-style
 * community dumps, etc.) either requires a paid license for redistribution,
 * forbids scraping in its ToS, or has no clear reuse grant for "download
 * and re-host as a Discord server asset." Building a scraper against those
 * would mean shipping code whose actual job is bulk-downloading and
 * republishing other people's art without a license — that's a real
 * copyright/ToS problem, not a hypothetical one, so it isn't implemented
 * here. Twemoji is different: it's explicitly CC-BY 4.0 licensed for
 * exactly this kind of reuse, with attribution, which is why it's the
 * default (and currently only) provider.
 *
 * This module follows the Provider interface so more openly-licensed
 * sources (e.g. OpenMoji, also CC-BY-SA, or a set of icons YOU own/have
 * uploaded) can be added later as siblings of this file — see
 * emojiEngine/index.js for the interface every provider implements.
 */
const keywordMap = require('../keywordMap');

const ASSET_BASE = 'https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72';
const LICENSE_NOTE = 'Twemoji by Twitter/X, licensed CC-BY 4.0 (https://github.com/twitter/twemoji)';

/**
 * @param {string} semanticKey e.g. "moderation.ban"
 * @returns {Array<{provider, codepoint, url, unicode, style, animated, score}>}
 */
async function search(semanticKey) {
  const codepoints = keywordMap[semanticKey];
  if (!codepoints || !codepoints.length) return [];

  return codepoints.map((codepoint, i) => ({
    provider: 'twemoji',
    codepoint,
    url: `${ASSET_BASE}/${codepoint}.png`,
    unicode: String.fromCodePoint(...codepoint.split('-').map((h) => parseInt(h, 16))),
    style: 'flat-color',
    animated: false,
    license: LICENSE_NOTE,
    // First entry in the keyword map is the curated best match; score
    // decays for fallback candidates. This is the hook ranking.js sorts on.
    score: 100 - i * 10,
  }));
}

async function download(candidate) {
  const res = await fetch(candidate.url);
  if (!res.ok) throw new Error(`Failed to download Twemoji asset (${res.status}): ${candidate.url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer;
}

module.exports = { id: 'twemoji', search, download };
