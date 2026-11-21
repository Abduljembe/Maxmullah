export type StreamingPlatform =
  | 'Netflix'
  | 'Max'
  | 'Disney+'
  | 'Apple TV+'
  | 'Prime Video'
  | 'Hulu'
  | 'Paramount+'
  | 'Peacock'
  | 'Criterion Channel'
  | 'Crunchyroll';

export type MediaType = 'movie' | 'series';

export interface Episode {
  episodeNumber: number;
  title: string;
  duration: string;
  durationMinutes: number;
  synopsis: string;
  downloadSizeMb: number;
  videoUrl: string;
  thumbnailUrl?: string;
}

export interface Season {
  seasonNumber: number;
  title: string;
  episodes: Episode[];
}

export interface TMDBImageConfig {
  base_url: string;
  secure_base_url: string;
  backdrop_sizes: string[];
  logo_sizes: string[];
  poster_sizes: string[];
  profile_sizes: string[];
  still_sizes: string[];
}

export interface TMDBConfiguration {
  images: TMDBImageConfig;
  change_keys: string[];
  authConfigured?: boolean;
  authMode?: 'bearer' | 'api_key' | 'fallback';
}

export interface CastMemberProfile {
  name: string;
  character?: string;
  profileUrl?: string;
}

export interface MediaItem {
  id: string;
  title: string;
  type: MediaType;
  year: number;
  releaseDate?: string;
  rating: string; // e.g. "TV-MA", "PG-13", "R"
  imdbScore: number;
  rottenTomatoesScore: number;
  metacriticScore?: number;
  duration: string; // e.g. "2h 46m" or "4 Seasons"
  durationMinutes?: number;
  genres: string[];
  platforms: StreamingPlatform[];
  primaryPlatform: StreamingPlatform;
  description: string;
  tagline: string;
  cast: string[];
  castProfiles?: CastMemberProfile[];
  director?: string;
  creator?: string;
  posterUrl: string;
  backdropUrl: string;
  logoUrl?: string;
  videoPreviewUrl: string;
  seasons?: Season[];
  audioTracks: string[];
  subtitles: string[];
  features: string[]; // ["4K UHD", "Dolby Vision", "Dolby Atmos", "HDR10+"]
  moodTags: string[];
  trendingRank?: number;
  awards?: string;
  trailerYoutubeId?: string;
  aliases?: string[];
  imdbId?: string;
  tmdbId?: number;
  malId?: number;
}

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  avatarColor: string;
  favoriteGenres: string[];
  preferredPlatforms: StreamingPlatform[];
  watchlist: string[]; // media item ids
  liked: string[];
  disliked: string[];
  watchHistory: {
    mediaId: string;
    watchedAt: number;
    progressPercentage: number;
    season?: number;
    episode?: number;
  }[];
}

export type DownloadQuality = '720p' | '1080p' | '4k';

export interface DownloadedItem {
  id: string; // unique download id
  mediaId: string;
  tmdbId?: number;
  imdbId?: string;
  trailerYoutubeId?: string;
  title: string;
  type: MediaType;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  posterUrl: string;
  backdropUrl: string;
  quality: DownloadQuality;
  sizeMb: number;
  downloadedAt: number;
  status: 'downloading' | 'paused' | 'completed' | 'error';
  progress: number; // 0 - 100
  audioTrack: string;
  subtitleTrack: string;
  videoUrl: string;
  expiresInDays?: number;
}

export interface RecommendationMatch {
  media: MediaItem;
  matchScore: number; // 0 to 100
  reasoning: string;
  matchingAttributes: string[];
}
