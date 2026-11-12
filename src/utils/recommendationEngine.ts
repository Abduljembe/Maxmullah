import { MediaItem, RecommendationMatch, StreamingPlatform, UserProfile } from '../types';

export function calculateMatchScore(
  item: MediaItem,
  profile: UserProfile,
  activeMood?: string
): { score: number; reasons: string[]; matchedAttributes: string[] } {
  let score = 65; // baseline score
  const reasons: string[] = [];
  const matchedAttributes: string[] = [];

  // 1. Dislike penalty
  if (profile.disliked.includes(item.id)) {
    return { score: 25, reasons: ['Marked not for you'], matchedAttributes: [] };
  }

  // 2. Genre Overlap
  const genreMatches = item.genres.filter((g) =>
    profile.favoriteGenres.some((fav) => fav.toLowerCase() === g.toLowerCase())
  );
  if (genreMatches.length > 0) {
    score += genreMatches.length * 9;
    matchedAttributes.push(...genreMatches);
    reasons.push(`Matches your passion for ${genreMatches.join(' & ')}`);
  }

  // 3. Platform Alignment
  const hasPreferredPlatform = item.platforms.some((p) =>
    profile.preferredPlatforms.includes(p)
  );
  if (hasPreferredPlatform) {
    score += 8;
    const commonPlatform = item.platforms.find((p) =>
      profile.preferredPlatforms.includes(p)
    );
    if (commonPlatform) {
      reasons.push(`Available on your favorite network ${commonPlatform}`);
    }
  }

  // 4. Critical acclaim bonus
  if (item.rottenTomatoesScore >= 92 || item.imdbScore >= 8.7) {
    score += 7;
    reasons.push(`Universal critical acclaim (${item.rottenTomatoesScore}% on RT)`);
  }

  // 5. User liked or watched similar items
  const likedSimilar = profile.liked.some((id) => id !== item.id);
  if (likedSimilar) {
    score += 5;
  }

  // 6. Active mood alignment
  if (activeMood && item.moodTags.some((m) => m.toLowerCase().includes(activeMood.toLowerCase()))) {
    score += 12;
    reasons.push(`Fits your current mood: "${activeMood}"`);
  }

  // Cap between 60 and 99
  const finalScore = Math.min(99, Math.max(58, Math.round(score)));

  // Generate primary catchy reasoning
  let primaryReasoning = reasons[0] || `Recommended for ${profile.name}'s viewing taste`;
  if (genreMatches.length >= 2) {
    primaryReasoning = `Top match for your ${genreMatches.join(' + ')} preferences`;
  }

  return {
    score: finalScore,
    reasons,
    matchedAttributes,
  };
}

export function getPersonalizedRecommendations(
  catalog: MediaItem[],
  profile: UserProfile,
  activeMood?: string
): RecommendationMatch[] {
  return catalog
    .map((media) => {
      const { score, reasons, matchedAttributes } = calculateMatchScore(
        media,
        profile,
        activeMood
      );
      return {
        media,
        matchScore: score,
        reasoning: reasons[0] || `Recommended for ${profile.name}`,
        matchingAttributes: matchedAttributes,
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}

export function getBecauseYouWatched(
  catalog: MediaItem[],
  profile: UserProfile
): { referenceItem: MediaItem; recommendations: MediaItem[] } | null {
  if (!profile.watchHistory.length) {
    // Fallback to first catalog item if history is fresh
    const fallbackRef = catalog[0];
    const recs = catalog
      .filter((m) => m.id !== fallbackRef.id && m.genres.some((g) => fallbackRef.genres.includes(g)))
      .slice(0, 6);
    return { referenceItem: fallbackRef, recommendations: recs };
  }

  const latestWatchedId = profile.watchHistory[profile.watchHistory.length - 1].mediaId;
  const refItem = catalog.find((m) => m.id === latestWatchedId) || catalog[0];

  const similar = catalog
    .filter((m) => m.id !== refItem.id)
    .map((m) => {
      let similarity = 0;
      m.genres.forEach((g) => {
        if (refItem.genres.includes(g)) similarity += 3;
      });
      if (m.type === refItem.type) similarity += 2;
      if (m.primaryPlatform === refItem.primaryPlatform) similarity += 1;
      return { item: m, similarity };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 6)
    .map((r) => r.item);

  return { referenceItem: refItem, recommendations: similar };
}
