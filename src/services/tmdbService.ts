import { MediaItem, StreamingPlatform } from '../types';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
const TVMAZE_BASE_URL = 'https://api.tvmaze.com';

const STORAGE_KEY_API_KEY = 'mullahmax_tmdb_api_key';
export const DEFAULT_PUBLIC_TMDB_KEY = '1cf50e6248dc270629e802686245c2c8';

export function getTMDBApiKey(): string {
  if (typeof window === 'undefined') return DEFAULT_PUBLIC_TMDB_KEY;
  try {
    const userKey = localStorage.getItem(STORAGE_KEY_API_KEY);
    if (userKey && userKey.trim()) return userKey.trim();
  } catch {}
  return (import.meta.env.VITE_TMDB_API_KEY as string) || DEFAULT_PUBLIC_TMDB_KEY;
}

export function saveTMDBApiKey(key: string) {
  try {
    if (key.trim()) {
      localStorage.setItem(STORAGE_KEY_API_KEY, key.trim());
    } else {
      localStorage.removeItem(STORAGE_KEY_API_KEY);
    }
  } catch {}
}

/**
 * Fetches any TMDB v3 endpoint reliably via the backend /api/tmdb/* proxy first
 * (avoids browser CORS/ISP throttling and uses server TMDB_API_KEY), falling back to direct TMDB.
 */
async function tmdbFetchJson<T = Record<string, unknown>>(
  tmdbPath: string,
  paramsObj: Record<string, string | number | boolean> = {}
): Promise<T | null> {
  const key = getTMDBApiKey();
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(paramsObj)) {
    qs.set(k, String(v));
  }
  if (key && key !== DEFAULT_PUBLIC_TMDB_KEY) {
    qs.set('api_key', key);
  }

  try {
    const proxyRes = await fetch(`/api/tmdb/${tmdbPath}?${qs.toString()}`);
    if (proxyRes.ok) {
      return (await proxyRes.json()) as T;
    }
  } catch {}

  if (key) {
    try {
      qs.set('api_key', key);
      const directRes = await fetch(`${TMDB_BASE_URL}/${tmdbPath}?${qs.toString()}`);
      if (directRes.ok) {
        return (await directRes.json()) as T;
      }
    } catch {}
  }

  return null;
}

const TMDB_GENRES: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
  10759: 'Action & Adventure',
  10762: 'Kids',
  10763: 'News',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics',
};

function mapProviderNameToPlatform(providerName: string): StreamingPlatform | null {
  const norm = providerName.toLowerCase();
  if (norm.includes('netflix')) return 'Netflix';
  if (norm.includes('max') || norm.includes('hbo')) return 'Max';
  if (norm.includes('disney')) return 'Disney+';
  if (norm.includes('apple tv') || norm.includes('apple')) return 'Apple TV+';
  if (norm.includes('amazon') || norm.includes('prime')) return 'Prime Video';
  if (norm.includes('hulu')) return 'Hulu';
  if (norm.includes('paramount')) return 'Paramount+';
  if (norm.includes('peacock')) return 'Peacock';
  if (norm.includes('criterion')) return 'Criterion Channel';
  if (norm.includes('crunchyroll')) return 'Crunchyroll';
  return null;
}

interface RawTMDBItem {
  id: number;
  moviedb_id?: number;
  imdb_id?: string;
  title?: string;
  name?: string;
  media_type?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  vote_average: number;
  genre_ids?: number[];
  genres?: (string | { id: number; name: string })[];
  tagline?: string;
  credits?: {
    cast?: { name: string }[];
    crew?: { name: string; job: string }[];
  };
  'watch/providers'?: {
    results?: {
      US?: {
        flatrate?: { provider_name: string }[];
        rent?: { provider_name: string }[];
        buy?: { provider_name: string }[];
      };
    };
  };
}

export function normalizeTMDBItem(raw: RawTMDBItem, forcedType?: 'movie' | 'series'): MediaItem {
  const type: 'movie' | 'series' =
    forcedType || (raw.media_type === 'tv' || (!raw.title && !!raw.name) ? 'series' : 'movie');

  const title = raw.title || raw.name || 'Untitled Feature';
  const rawDate = raw.release_date || raw.first_air_date || '';
  const releaseYear = (rawDate || '2025').slice(0, 4);
  const year = parseInt(releaseYear, 10) || 2025;

  const genres: string[] = [];
  if (raw.genres) {
    genres.push(
      ...raw.genres
        .map((g) => (typeof g === 'string' ? g : g.name))
        .filter(Boolean)
    );
  } else if (raw.genre_ids) {
    raw.genre_ids.forEach((id) => {
      if (TMDB_GENRES[id]) genres.push(TMDB_GENRES[id]);
    });
  }
  if (genres.length === 0) genres.push('Drama');

  const platformsSet = new Set<StreamingPlatform>();
  const usProviders = raw['watch/providers']?.results?.US;
  if (usProviders) {
    const allProviders = [
      ...(usProviders.flatrate || []),
      ...(usProviders.rent || []),
      ...(usProviders.buy || []),
    ];
    allProviders.forEach((p) => {
      const plat = mapProviderNameToPlatform(p.provider_name);
      if (plat) platformsSet.add(plat);
    });
  }

  if (platformsSet.size === 0) {
    if (genres.includes('Animation')) {
      platformsSet.add('Disney+');
      platformsSet.add('Crunchyroll');
    } else if (genres.includes('Sci-Fi')) {
      platformsSet.add('Max');
      platformsSet.add('Apple TV+');
    } else if (genres.includes('Comedy')) {
      platformsSet.add('Hulu');
      platformsSet.add('Netflix');
    } else {
      platformsSet.add('Netflix');
      platformsSet.add('Prime Video');
    }
  }

  const platforms = Array.from(platformsSet);
  const primaryPlatform = platforms[0] || 'Netflix';

  const posterFallbackSvg =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600"><rect width="400" height="600" fill="#0e121b"/><rect x="150" y="250" width="100" height="100" rx="20" fill="#1e293b"/><polygon points="188,280 188,320 222,300" fill="#e11d48"/></svg>'
    );

  const posterUrl = raw.poster_path
    ? raw.poster_path.startsWith('http')
      ? raw.poster_path
      : `${TMDB_IMAGE_BASE}/w500${raw.poster_path}`
    : posterFallbackSvg;

  const backdropUrl = raw.backdrop_path
    ? raw.backdrop_path.startsWith('http')
      ? raw.backdrop_path
      : `${TMDB_IMAGE_BASE}/original${raw.backdrop_path}`
    : posterUrl;

  const cast: string[] = [];
  let director: string | undefined;

  if (raw.credits) {
    if (raw.credits.cast) {
      cast.push(...raw.credits.cast.slice(0, 4).map((c) => c.name));
    }
    if (raw.credits.crew) {
      const dir = raw.credits.crew.find((c) => c.job === 'Director');
      if (dir) director = dir.name;
    }
  }
  if (cast.length === 0) {
    cast.push('Ensemble Cast', 'International Performers');
  }

  const rawVote = typeof raw.vote_average === 'number' ? raw.vote_average : 0;
  const imdbScore = rawVote > 0 ? Number(rawVote.toFixed(1)) : 0;
  const rottenTomatoesScore = imdbScore > 0 ? Math.min(100, Math.round(imdbScore * 10)) : 0;

  const resolvedTmdbId =
    raw.moviedb_id && raw.moviedb_id > 0
      ? raw.moviedb_id
      : raw.id && raw.id > 0
      ? raw.id
      : undefined;
  const resolvedImdbId = raw.imdb_id || undefined;
  const itemId = resolvedTmdbId
    ? `tmdb-${type}-${resolvedTmdbId}`
    : resolvedImdbId || `media-${type}-${title.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

  return {
    id: itemId,
    tmdbId: resolvedTmdbId,
    imdbId: resolvedImdbId,
    title,
    type,
    year,
    releaseDate: rawDate || undefined,
    rating: type === 'series' ? 'TV-MA' : 'PG-13',
    imdbScore,
    rottenTomatoesScore,
    duration: type === 'movie' ? '2h 14m' : '3 Seasons · 24 Episodes',
    durationMinutes: type === 'movie' ? 134 : undefined,
    genres,
    platforms,
    primaryPlatform,
    tagline: raw.tagline || 'Streaming across major platforms in MullahMax.',
    description: raw.overview || 'Available in 4K HDR with offline viewing on MullahMax.',
    cast,
    director,
    posterUrl,
    backdropUrl,
    videoPreviewUrl: '',
    audioTracks: ['English (Dolby Atmos)', 'Spanish (5.1)', 'French (5.1)', 'German', 'Japanese'],
    subtitles: ['English [CC]', 'Spanish', 'French', 'German', 'Japanese'],
    features: ['4K Ultra HD', 'Dolby Vision', 'Dolby Atmos', 'HDR10+'],
    moodTags: ['Trending Worldwide', 'Critically Acclaimed', genres[0] || 'Drama'],
  };
}

// Normalize free TVMaze Live Results (Zero-key required!)
interface TVMazeShow {
  id: number;
  name: string;
  genres: string[];
  premiered?: string;
  rating?: { average: number | null };
  image?: { medium?: string; original?: string } | null;
  summary?: string;
  network?: { name: string } | null;
  webChannel?: { name: string } | null;
  externals?: {
    imdb?: string | null;
    thetvdb?: number | null;
  };
}

function normalizeTVMazeShow(show: TVMazeShow): MediaItem {
  const cleanSummary = (show.summary || '').replace(/<[^>]*>?/gm, '').trim();
  const year = show.premiered ? parseInt(show.premiered.slice(0, 4), 10) || 2024 : 2024;
  const ratingAvg =
    typeof show.rating?.average === 'number' && show.rating.average > 0 ? show.rating.average : 0;
  const imdbScore = ratingAvg > 0 ? Number(ratingAvg.toFixed(1)) : 0;
  const rottenTomatoesScore = imdbScore > 0 ? Math.min(100, Math.round(imdbScore * 10)) : 0;

  const platformsSet = new Set<StreamingPlatform>();
  const networkName = show.webChannel?.name || show.network?.name || '';
  const mapped = mapProviderNameToPlatform(networkName);
  if (mapped) platformsSet.add(mapped);

  if (platformsSet.size === 0) {
    if (show.genres.includes('Science-Fiction')) {
      platformsSet.add('Max');
      platformsSet.add('Apple TV+');
    } else if (show.genres.includes('Comedy')) {
      platformsSet.add('Hulu');
    } else {
      platformsSet.add('Netflix');
      platformsSet.add('Prime Video');
    }
  }

  const platforms = Array.from(platformsSet);
  const fallbackSvg =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600"><rect width="400" height="600" fill="#0e121b"/><rect x="150" y="250" width="100" height="100" rx="20" fill="#1e293b"/><polygon points="188,280 188,320 222,300" fill="#e11d48"/></svg>'
    );

  const posterUrl =
    show.image?.original ||
    show.image?.medium ||
    fallbackSvg;

  return {
    id: `tvm-${show.id}`,
    imdbId: show.externals?.imdb || undefined,
    title: show.name,
    type: 'series',
    year,
    rating: 'TV-MA',
    imdbScore,
    rottenTomatoesScore,
    duration: '3 Seasons · 28 Episodes',
    genres: show.genres.length > 0 ? show.genres : ['Drama'],
    platforms,
    primaryPlatform: platforms[0] || 'Netflix',
    tagline: `Now streaming on ${platforms.join(', ')}.`,
    description: cleanSummary || `${show.name} is streaming on MullahMax with offline download capabilities.`,
    cast: ['Leading Cast', 'Series Ensemble'],
    posterUrl,
    backdropUrl: posterUrl,
    videoPreviewUrl: '',
    audioTracks: ['English (Dolby Atmos)', 'Spanish (5.1)', 'French (5.1)'],
    subtitles: ['English [CC]', 'Spanish', 'French'],
    features: ['4K Ultra HD', 'Dolby Vision', 'Dolby Atmos'],
    moodTags: ['Live Network Hit', 'Binge-Worthy', show.genres[0] || 'Drama'],
  };
}

export const TMDB_WATCH_PROVIDER_IDS: Partial<Record<StreamingPlatform, number>> = {
  Netflix: 8,
  Max: 1899,
  'Disney+': 337,
  'Apple TV+': 350,
  'Prime Video': 9,
  Hulu: 15,
  'Paramount+': 531,
  Peacock: 386,
  'Criterion Channel': 258,
  Crunchyroll: 283,
};

export const MOVIE_GENRES_LIST = [
  { id: 0, name: 'All Genres' },
  { id: 28, name: 'Action' },
  { id: 878, name: 'Sci-Fi' },
  { id: 12, name: 'Adventure' },
  { id: 35, name: 'Comedy' },
  { id: 18, name: 'Drama' },
  { id: 27, name: 'Horror' },
  { id: 53, name: 'Thriller' },
  { id: 16, name: 'Animation' },
  { id: 14, name: 'Fantasy' },
  { id: 80, name: 'Crime' },
  { id: 10749, name: 'Romance' },
  { id: 9648, name: 'Mystery' },
  { id: 10751, name: 'Family' },
];

export type MovieFeedType = 'popular' | 'trending' | 'top_rated' | 'now_playing';

export interface FetchServerMoviesResult {
  items: MediaItem[];
  totalPages: number;
  totalResults: number;
  page: number;
}

export async function fetchServerMovies(options: {
  feed?: MovieFeedType;
  page?: number;
  genreId?: number;
  withoutGenres?: string;
  minVotes?: number;
  releasedOnly?: boolean;
  watchProviderId?: number;
  query?: string;
  sortBy?: string;
}): Promise<FetchServerMoviesResult> {
  const {
    feed = 'popular',
    page = 1,
    genreId,
    withoutGenres,
    minVotes,
    releasedOnly = false,
    watchProviderId,
    query,
    sortBy,
  } = options;

  try {
    let data: { results?: RawTMDBItem[]; total_pages?: number; total_results?: number } | null = null;
    if (query && query.trim()) {
      data = await tmdbFetchJson('search/movie', {
        query: query.trim(),
        page,
        include_adult: false,
      });
    } else if (
      (genreId && genreId > 0) ||
      (watchProviderId && watchProviderId > 0) ||
      releasedOnly
    ) {
      const resolvedSort =
        sortBy ||
        (feed === 'top_rated'
          ? 'vote_average.desc'
          : feed === 'now_playing'
          ? 'primary_release_date.desc'
          : 'popularity.desc');

      const discoverParams: Record<string, string | number | boolean> = {
        sort_by: resolvedSort,
        page,
        include_adult: false,
      };
      if (genreId && genreId > 0) {
        discoverParams.with_genres = genreId;
      }
      if (withoutGenres) {
        discoverParams.without_genres = withoutGenres;
      }
      if (watchProviderId && watchProviderId > 0) {
        discoverParams.with_watch_providers = watchProviderId;
        discoverParams.watch_region = 'US';
      }
      if (typeof minVotes === 'number' && minVotes > 0) {
        discoverParams['vote_count.gte'] = minVotes;
      } else if (feed === 'top_rated') {
        discoverParams['vote_count.gte'] = 200;
      } else if (genreId && genreId > 0) {
        discoverParams['vote_count.gte'] = 100;
      }
      if (releasedOnly || feed === 'now_playing' || (genreId && genreId > 0)) {
        discoverParams['primary_release_date.lte'] = new Date().toISOString().slice(0, 10);
      }
      data = await tmdbFetchJson('discover/movie', discoverParams);
    } else {
      const pathMap: Record<MovieFeedType, string> = {
        trending: 'trending/movie/week',
        top_rated: 'movie/top_rated',
        now_playing: 'movie/now_playing',
        popular: 'movie/popular',
      };
      data = await tmdbFetchJson(pathMap[feed] || 'movie/popular', { page });
    }

    if (data && Array.isArray(data.results)) {
      const items: MediaItem[] = data.results
        .filter((raw) => Boolean(raw.title && (raw.poster_path || raw.backdrop_path)))
        .map((raw) => normalizeTMDBItem(raw, 'movie'));

      return {
        items,
        totalPages: Math.min(data.total_pages || 1, 500),
        totalResults: data.total_results || items.length,
        page,
      };
    }
  } catch (err) {
    console.warn('Error fetching server movies:', err);
  }

  return { items: [], totalPages: 1, totalResults: 0, page };
}

/**
 * Loads an extensive multi-category batch of movies from the server simultaneously.
 * Merges and deduplicates popular, top_rated, trending, and now_playing feeds.
 */
export async function fetchAllServerMoviesMultiFeed(page = 1): Promise<MediaItem[]> {
  const paths = ['movie/popular', 'trending/movie/week', 'movie/top_rated', 'movie/now_playing'];

  try {
    const responses = await Promise.allSettled(
      paths.map((p) => tmdbFetchJson<{ results?: RawTMDBItem[] }>(p, { page }))
    );

    const map = new Map<number, MediaItem>();
    responses.forEach((res) => {
      if (res.status === 'fulfilled' && res.value && Array.isArray(res.value.results)) {
        res.value.results.forEach((raw: RawTMDBItem) => {
          if (raw.id && raw.title && !map.has(raw.id)) {
            map.set(raw.id, normalizeTMDBItem(raw, 'movie'));
          }
        });
      }
    });

    return Array.from(map.values());
  } catch (err) {
    console.warn('fetchAllServerMoviesMultiFeed error:', err);
    return [];
  }
}

export const SERIES_GENRES_LIST = [
  { id: 0, name: 'All Genres' },
  { id: 18, name: 'Drama' },
  { id: 10765, name: 'Sci-Fi & Fantasy' },
  { id: 10759, name: 'Action & Adventure' },
  { id: 35, name: 'Comedy' },
  { id: 80, name: 'Crime' },
  { id: 9648, name: 'Mystery' },
  { id: 16, name: 'Animation' },
  { id: 99, name: 'Documentary' },
  { id: 10751, name: 'Family' },
];

export type SeriesFeedType = 'popular' | 'trending' | 'top_rated' | 'on_the_air';

export async function fetchServerSeries(options: {
  feed?: SeriesFeedType;
  page?: number;
  genreId?: number;
  watchProviderId?: number;
  query?: string;
  sortBy?: string;
}): Promise<FetchServerMoviesResult> {
  const {
    feed = 'popular',
    page = 1,
    genreId,
    watchProviderId,
    query,
    sortBy,
  } = options;

  try {
    let data: { results?: RawTMDBItem[]; total_pages?: number; total_results?: number } | null = null;
    if (query && query.trim()) {
      data = await tmdbFetchJson('search/tv', {
        query: query.trim(),
        page,
        include_adult: false,
      });
    } else if ((genreId && genreId > 0) || (watchProviderId && watchProviderId > 0)) {
      const resolvedSort =
        sortBy || (feed === 'top_rated' ? 'vote_average.desc' : 'popularity.desc');
      const discoverParams: Record<string, string | number | boolean> = {
        sort_by: resolvedSort,
        page,
        include_adult: false,
      };
      if (genreId && genreId > 0) {
        discoverParams.with_genres = genreId;
      }
      if (watchProviderId && watchProviderId > 0) {
        discoverParams.with_watch_providers = watchProviderId;
        discoverParams.watch_region = 'US';
      }
      if (feed === 'top_rated') {
        discoverParams['vote_count.gte'] = 100;
      }
      data = await tmdbFetchJson('discover/tv', discoverParams);
    } else {
      const pathMap: Record<SeriesFeedType, string> = {
        trending: 'trending/tv/week',
        top_rated: 'tv/top_rated',
        on_the_air: 'tv/on_the_air',
        popular: 'tv/popular',
      };
      data = await tmdbFetchJson(pathMap[feed] || 'tv/popular', { page });
    }

    if (data && Array.isArray(data.results)) {
      const items: MediaItem[] = data.results
        .filter((raw) => Boolean(raw.name && (raw.poster_path || raw.backdrop_path)))
        .map((raw) => normalizeTMDBItem(raw, 'series'));

      return {
        items,
        totalPages: Math.min(data.total_pages || 1, 500),
        totalResults: data.total_results || items.length,
        page,
      };
    }
  } catch (err) {
    console.warn('Error fetching server series:', err);
  }

  return { items: [], totalPages: 1, totalResults: 0, page };
}

export async function fetchAllServerSeriesMultiFeed(page = 1): Promise<MediaItem[]> {
  const paths = ['tv/popular', 'trending/tv/week', 'tv/top_rated', 'tv/on_the_air'];

  try {
    const responses = await Promise.allSettled(
      paths.map((p) => tmdbFetchJson<{ results?: RawTMDBItem[] }>(p, { page }))
    );

    const map = new Map<number, MediaItem>();
    responses.forEach((res) => {
      if (res.status === 'fulfilled' && res.value && Array.isArray(res.value.results)) {
        res.value.results.forEach((raw: RawTMDBItem) => {
          if (raw.id && raw.name && !map.has(raw.id)) {
            map.set(raw.id, normalizeTMDBItem(raw, 'series'));
          }
        });
      }
    });

    return Array.from(map.values());
  } catch (err) {
    console.warn('fetchAllServerSeriesMultiFeed error:', err);
    return [];
  }
}

/**
 * Fetches movies or TV series directly from VixSrc & PrimeSrc indexed streaming servers (/api/servers/catalog).
 */
export async function fetchServerIndexedCatalog(
  type: 'movie' | 'tv' = 'movie',
  page = 1,
  lang?: string
): Promise<FetchServerMoviesResult> {
  try {
    const qs = new URLSearchParams({ type, page: String(page) });
    if (lang && lang !== 'all') {
      qs.set('lang', lang);
    }
    const res = await fetch(`/api/servers/catalog?${qs.toString()}`);
    if (res.ok) {
      const data = (await res.json()) as {
        items?: RawTMDBItem[];
        page?: number;
        totalPages?: number;
        totalResults?: number;
      };
      const rawItems = Array.isArray(data.items) ? data.items : [];
      const items = rawItems.map((raw) =>
        normalizeTMDBItem(raw, type === 'tv' ? 'series' : 'movie')
      );
      return {
        items,
        page: data.page || page,
        totalPages: data.totalPages || 1,
        totalResults: data.totalResults || items.length,
      };
    }
  } catch (err) {
    console.warn('fetchServerIndexedCatalog error:', err);
  }
  return { items: [], page, totalPages: 1, totalResults: 0 };
}

export async function fetchLiveTrendingPaged(
  type: 'all' | 'movie' | 'tv' = 'all',
  page = 1,
  timeWindow: 'day' | 'week' = 'week'
): Promise<FetchServerMoviesResult> {
  try {
    const data = await tmdbFetchJson<{
      results?: RawTMDBItem[];
      total_pages?: number;
      total_results?: number;
    }>(`trending/${type}/${timeWindow}`, { page });

    if (data?.results) {
      const items = data.results
        .filter((r) => {
          if (type === 'all') {
            return (
              (r.media_type === 'movie' || r.media_type === 'tv' || !r.media_type) &&
              Boolean(r.poster_path || r.backdrop_path)
            );
          }
          return Boolean(r.poster_path || r.backdrop_path);
        })
        .map((item) =>
          type === 'all'
            ? normalizeTMDBItem(item)
            : normalizeTMDBItem(item, type === 'movie' ? 'movie' : 'series')
        );

      return {
        items,
        page,
        totalPages: Math.min(data.total_pages || 1, 500),
        totalResults: data.total_results || items.length,
      };
    }
  } catch {}

  if (page === 1) {
    try {
      const res = await fetch(`${TVMAZE_BASE_URL}/shows?page=0`);
      if (res.ok) {
        const shows: TVMazeShow[] = await res.json();
        const items = shows.slice(0, 18).map(normalizeTVMazeShow);
        return { items, page: 1, totalPages: 1, totalResults: items.length };
      }
    } catch (err) {
      console.warn('TVMaze live catalog fetch fallback', err);
    }
  }

  return { items: [], page, totalPages: 1, totalResults: 0 };
}

// Safe live fetch: tries backend TMDB proxy first, then falls back to free TVMaze
export async function fetchLiveTrending(
  type: 'all' | 'movie' | 'tv' = 'all',
  page = 1,
  timeWindow: 'day' | 'week' = 'week'
): Promise<MediaItem[]> {
  const res = await fetchLiveTrendingPaged(type, page, timeWindow);
  return res.items;
}

export type NewReleaseFeedTab = 'now_playing' | 'upcoming' | 'popular' | 'on_tv';

export async function fetchNewReleasesFeedPaged(
  tab: NewReleaseFeedTab,
  page = 1
): Promise<FetchServerMoviesResult> {
  try {
    if (tab === 'on_tv') {
      const data = await tmdbFetchJson<{
        results?: RawTMDBItem[];
        total_pages?: number;
        total_results?: number;
      }>('tv/on_the_air', { page });
      if (data?.results) {
        const items = data.results
          .filter((raw) => Boolean(raw.name && (raw.poster_path || raw.backdrop_path)))
          .map((raw) => normalizeTMDBItem(raw, 'series'));
        return {
          items,
          page,
          totalPages: Math.min(data.total_pages || 1, 500),
          totalResults: data.total_results || items.length,
        };
      }
      return { items: [], page, totalPages: 1, totalResults: 0 };
    }

    const endpointMap: Record<Exclude<NewReleaseFeedTab, 'on_tv'>, string> = {
      now_playing: 'movie/now_playing',
      upcoming: 'movie/upcoming',
      popular: 'movie/popular',
    };
    const data = await tmdbFetchJson<{
      results?: RawTMDBItem[];
      total_pages?: number;
      total_results?: number;
    }>(endpointMap[tab], { page });
    if (data?.results) {
      const items = data.results
        .filter((raw) => Boolean(raw.title && (raw.poster_path || raw.backdrop_path)))
        .map((raw) => normalizeTMDBItem(raw, 'movie'));
      return {
        items,
        page,
        totalPages: Math.min(data.total_pages || 1, 500),
        totalResults: data.total_results || items.length,
      };
    }
  } catch (err) {
    console.warn('fetchNewReleasesFeedPaged error:', err);
  }
  return { items: [], page, totalPages: 1, totalResults: 0 };
}

export async function fetchNewReleasesFeed(tab: NewReleaseFeedTab, page = 1): Promise<MediaItem[]> {
  const res = await fetchNewReleasesFeedPaged(tab, page);
  return res.items;
}

// Live search: prefers reliable server-side /api/search proxy, then direct TMDB, then TVMaze
export async function searchTMDB(query: string, page = 1): Promise<MediaItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const key = getTMDBApiKey();

  // 1. Try Express backend /api/search proxy (avoids browser CORS/DNS blocks)
  try {
    const params = new URLSearchParams({ q: trimmed, page: String(page) });
    if (key && key !== DEFAULT_PUBLIC_TMDB_KEY) {
      params.set('apiKey', key);
    }
    const proxyRes = await fetch(`/api/search?${params.toString()}`);
    if (proxyRes.ok) {
      const data = (await proxyRes.json()) as { results?: RawTMDBItem[] };
      if (Array.isArray(data.results) && data.results.length > 0) {
        return data.results
          .filter((item) => item.media_type === 'movie' || item.media_type === 'tv')
          .map((item) => normalizeTMDBItem(item));
      }
    }
  } catch {}

  // 2. Fallback to direct TMDB query
  if (key) {
    try {
      const url = `${TMDB_BASE_URL}/search/multi?api_key=${key}&query=${encodeURIComponent(
        trimmed
      )}&page=${page}&include_adult=false`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        return (data.results || [])
          .filter((item: RawTMDBItem) => item.media_type === 'movie' || item.media_type === 'tv')
          .map((item: RawTMDBItem) => normalizeTMDBItem(item));
      }
    } catch {}
  }

  // 3. Instant Zero-Key Live Search Fallback via TVMaze
  try {
    const res = await fetch(
      `${TVMAZE_BASE_URL}/search/shows?q=${encodeURIComponent(trimmed)}`
    );
    if (res.ok) {
      const data: { show: TVMazeShow }[] = await res.json();
      return data.map((d) => normalizeTVMazeShow(d.show));
    }
  } catch (err) {
    console.warn('TVMaze live search fallback', err);
  }

  return [];
}
