/**
 * Ranks candidates returned by one or more providers for a given emoji
 * request. With a single provider this mostly orders curated fallbacks,
 * but the interface is built for multiple providers: every candidate is
 * scored the same way regardless of source, so adding a provider later
 * is just "push more candidates into the array."
 */
function rankCandidates(candidates, styleProfile) {
  return [...candidates]
    .map((c) => {
      let score = c.score ?? 50;
      // Style-consistency bonus: prefer candidates matching the guild's
      // established look (see emoji_style_profile table).
      if (styleProfile?.style_tag && c.style === styleProfile.style_tag) score += 15;
      if (styleProfile?.animated_preference != null && !!c.animated === !!styleProfile.animated_preference) score += 5;
      return { ...c, _rank: score };
    })
    .sort((a, b) => b._rank - a._rank);
}

module.exports = { rankCandidates };
