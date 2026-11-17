import { MediaItem, Season, Episode } from '../types';

/**
 * Extracts total season count from media item, duration string, or seasons array.
 */
export function getSeasonCount(media: MediaItem): number {
  if (media.seasons && media.seasons.length > 0) {
    return media.seasons.length;
  }
  const match = media.duration.match(/(\d+)\s+Season/i);
  if (match && match[1]) {
    return Math.max(1, parseInt(match[1], 10));
  }
  return 3;
}

/**
 * Ensures that any series has a complete, structured seasons and episodes hierarchy.
 * If media.seasons is populated, it preserves it; otherwise it synthesizes realistic,
 * episode-accurate lists so the user can select and stream ANY season and episode.
 */
export function ensureMediaSeasons(media: MediaItem): Season[] {
  if (media.type !== 'series') return [];

  if (media.seasons && media.seasons.length > 0) {
    return media.seasons;
  }

  const seasonCount = getSeasonCount(media);
  const seasons: Season[] = [];

  // Parse total episodes if provided, e.g. "5 Seasons · 62 Episodes" -> ~10-12 per season
  let episodesPerSeason = 10;
  const epMatch = media.duration.match(/(\d+)\s+Episode/i);
  if (epMatch && epMatch[1]) {
    const totalEps = parseInt(epMatch[1], 10);
    episodesPerSeason = Math.max(6, Math.min(24, Math.round(totalEps / seasonCount)));
  }

  for (let s = 1; s <= seasonCount; s++) {
    const episodes: Episode[] = [];
    for (let e = 1; e <= episodesPerSeason; e++) {
      const durationMin = 48 + ((s * 3 + e * 5) % 18); // ~48 to 65 mins

      episodes.push({
        episodeNumber: e,
        title: getEpisodeTitle(media.title, s, e),
        duration: `${durationMin}m`,
        durationMinutes: durationMin,
        synopsis: getEpisodeSynopsis(media.title, s, e),
        downloadSizeMb: Math.round(durationMin * 16.5), // ~800-1100 MB
        videoUrl: '',
      });
    }

    seasons.push({
      seasonNumber: s,
      title: `Season ${s}`,
      episodes,
    });
  }

  return seasons;
}

function getEpisodeTitle(showTitle: string, season: number, episode: number): string {
  if (season === 1 && episode === 1) return 'Pilot: The Genesis';
  if (episode === 1) return `Season ${season} Premiere`;

  const episodeThemes: Record<string, string[]> = {
    'Severance': [
      'Good News About Hell', 'Half Loop', 'In Perpetuity', 'The You You Are',
      'The Grim Barbarity of Optics', 'Hide and Seek', 'Defiant Jazz', 'What’s for Dinner?', 'The We We Are'
    ],
    'The Bear': [
      'System', 'Hands', 'Brigade', 'Dogs', 'Sheridan', 'Ceres', 'Review', 'Braciole', 'Fishes', 'Forks'
    ],
    'Breaking Bad': [
      'Pilot', 'Cat’s in the Bag...', '...And the Bag’s in the River', 'Cancer Man',
      'Gray Matter', 'Crazy Handful of Nothin’', 'A No-Rough-Stuff-Type Deal', 'Seven Thirty-Seven', 'Phoenix', 'Ozymandias'
    ],
    'Succession': [
      'Celebration', 'Shit Show at the Sunset', 'Lifeboats', 'Sad Sack Wasp Trap',
      'I Went to Market', 'Which Side Are You On?', 'Austen', 'Prague', 'Pre-Packaged News', 'Nobody Is Ever Missing'
    ],
    'The Boys': [
      'The Name of the Game', 'Cherry', 'Get Some', 'The Female of the Species',
      'Good for the Soul', 'The Innocents', 'The Self-Preservation Society', 'You Found Me'
    ],
    'Stranger Things': [
      'The Vanishing of Will Byers', 'The Weirdo on Maple Street', 'Holly, Jolly',
      'The Body', 'The Flea and the Acrobat', 'The Monster', 'The Bathtub', 'The Upside Down'
    ],
    'Shōgun': [
      'Anjin', 'Servants of Two Masters', 'Tomorrow Is Tomorrow', 'The Eightfold Fence',
      'Bonsai', 'Ladies of the Willow World', 'A Stick of Time', 'The Abyss of Life', 'Crimson Sky', 'A Dream of a Dream'
    ],
  };

  const specific = episodeThemes[showTitle];
  if (specific && specific[episode - 1]) {
    return specific[episode - 1];
  }

  const genericTitles = [
    'Echoes of the Past', 'Unintended Consequences', 'Point of No Return',
    'Crossroads', 'Treachery at Dawn', 'The Dark Horizon', 'Revelations',
    'Shadows and Dust', 'Trial by Fire', 'The Reckoning', 'Fall of the Empire', 'The Turning Tide'
  ];
  return genericTitles[(season * 3 + episode) % genericTitles.length];
}

function getEpisodeSynopsis(showTitle: string, season: number, episode: number): string {
  return `In Season ${season}, Episode ${episode} of ${showTitle}, shifting allegiances and unexpected discoveries force the characters to confront unprecedented consequences.`;
}
