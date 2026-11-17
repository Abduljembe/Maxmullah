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
  genres?: { id: number; name: string }[];
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
  const releaseYear = (raw.release_date || raw.first_air_date || '2025').slice(0, 4);
  const year = parseInt(releaseYear, 10) || 2025;

  const genres: string[] = [];
  if (raw.genres) {
    genres.push(...raw.genres.map((g) => g.name));
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

  const posterUrl = raw.poster_path
    ? `${TMDB_IMAGE_BASE}/w500${raw.poster_path}`
    : 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=800&q=80';

  const backdropUrl = raw.backdrop_path
    ? `${TMDB_IMAGE_BASE}/original${raw.backdrop_path}`
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

  const imdbScore = Math.max(6.0, Math.min(9.5, Number((raw.vote_average || 7.5).toFixed(1))));
  const rottenTomatoesScore = Math.min(99, Math.max(60, Math.round(imdbScore * 10.5)));

  return {
    id: `tmdb-${type}-${raw.id}`,
    tmdbId: raw.id,
    imdbId: (raw as { imdb_id?: string }).imdb_id || undefined,
    title,
    type,
    year,
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
  const ratingAvg = show.rating?.average || 8.0;
  const imdbScore = Number(ratingAvg.toFixed(1));
  const rottenTomatoesScore = Math.min(99, Math.round(imdbScore * 10.8));

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
  const posterUrl =
    show.image?.original ||
    show.image?.medium ||
    'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=800&q=80';

  return {
    id: `tvm-${show.id}`,
    imdbId: show.externals?.imdb || undefined,
    tmdbId: show.externals?.thetvdb || undefined,
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
  query?: string;
  sortBy?: string;
}): Promise<FetchServerMoviesResult> {
  const { feed = 'popular', page = 1, genreId, query, sortBy = 'popularity.desc' } = options;
  const key = getTMDBApiKey();

  try {
    let url = '';
    if (query && query.trim()) {
      url = `${TMDB_BASE_URL}/search/movie?api_key=${key}&query=${encodeURIComponent(
        query.trim()
      )}&page=${page}&include_adult=false`;
    } else if (genreId && genreId > 0) {
      url = `${TMDB_BASE_URL}/discover/movie?api_key=${key}&with_genres=${genreId}&sort_by=${sortBy}&page=${page}&include_adult=false`;
    } else {
      switch (feed) {
        case 'trending':
          url = `${TMDB_BASE_URL}/trending/movie/week?api_key=${key}&page=${page}`;
          break;
        case 'top_rated':
          url = `${TMDB_BASE_URL}/movie/top_rated?api_key=${key}&page=${page}`;
          break;
        case 'now_playing':
          url = `${TMDB_BASE_URL}/movie/now_playing?api_key=${key}&page=${page}`;
          break;
        case 'popular':
        default:
          url = `${TMDB_BASE_URL}/movie/popular?api_key=${key}&page=${page}`;
          break;
      }
    }

    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const rawResults: RawTMDBItem[] = data.results || [];
      const items: MediaItem[] = rawResults
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
    console.warn('Error fetching server movies from TMDB:', err);
  }

  return { items: [], totalPages: 1, totalResults: 0, page };
}

/**
 * Loads an extensive multi-category batch of movies from the server simultaneously.
 * Merges and deduplicates popular, top_rated, trending, and now_playing feeds.
 */
export async function fetchAllServerMoviesMultiFeed(page = 1): Promise<MediaItem[]> {
  const key = getTMDBApiKey();
  const endpoints = [
    `${TMDB_BASE_URL}/movie/popular?api_key=${key}&page=${page}`,
    `${TMDB_BASE_URL}/trending/movie/week?api_key=${key}&page=${page}`,
    `${TMDB_BASE_URL}/movie/top_rated?api_key=${key}&page=${page}`,
    `${TMDB_BASE_URL}/movie/now_playing?api_key=${key}&page=${page}`,
  ];

  try {
    const responses = await Promise.allSettled(
      endpoints.map((url) => fetch(url).then((r) => (r.ok ? r.json() : null)))
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
  query?: string;
  sortBy?: string;
}): Promise<FetchServerMoviesResult> {
  const { feed = 'popular', page = 1, genreId, query, sortBy = 'popularity.desc' } = options;
  const key = getTMDBApiKey();

  try {
    let url = '';
    if (query && query.trim()) {
      url = `${TMDB_BASE_URL}/search/tv?api_key=${key}&query=${encodeURIComponent(
        query.trim()
      )}&page=${page}&include_adult=false`;
    } else if (genreId && genreId > 0) {
      url = `${TMDB_BASE_URL}/discover/tv?api_key=${key}&with_genres=${genreId}&sort_by=${sortBy}&page=${page}&include_adult=false`;
    } else {
      switch (feed) {
        case 'trending':
          url = `${TMDB_BASE_URL}/trending/tv/week?api_key=${key}&page=${page}`;
          break;
        case 'top_rated':
          url = `${TMDB_BASE_URL}/tv/top_rated?api_key=${key}&page=${page}`;
          break;
        case 'on_the_air':
          url = `${TMDB_BASE_URL}/tv/on_the_air?api_key=${key}&page=${page}`;
          break;
        case 'popular':
        default:
          url = `${TMDB_BASE_URL}/tv/popular?api_key=${key}&page=${page}`;
          break;
      }
    }

    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const rawResults: RawTMDBItem[] = data.results || [];
      const items: MediaItem[] = rawResults
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
    console.warn('Error fetching server series from TMDB:', err);
  }

  return { items: [], totalPages: 1, totalResults: 0, page };
}

export async function fetchAllServerSeriesMultiFeed(page = 1): Promise<MediaItem[]> {
  const key = getTMDBApiKey();
  const endpoints = [
    `${TMDB_BASE_URL}/tv/popular?api_key=${key}&page=${page}`,
    `${TMDB_BASE_URL}/trending/tv/week?api_key=${key}&page=${page}`,
    `${TMDB_BASE_URL}/tv/top_rated?api_key=${key}&page=${page}`,
    `${TMDB_BASE_URL}/tv/on_the_air?api_key=${key}&page=${page}`,
  ];

  try {
    const responses = await Promise.allSettled(
      endpoints.map((url) => fetch(url).then((r) => (r.ok ? r.json() : null)))
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
  page = 1
): Promise<FetchServerMoviesResult> {
  try {
    const res = await fetch(`/api/servers/catalog?type=${type}&page=${page}`);
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

// Safe live fetch: tries TMDB first (with default key), then falls back to free TVMaze
export async function fetchLiveTrending(
  type: 'all' | 'movie' | 'tv' = 'all',
  page = 1
): Promise<MediaItem[]> {
  const key = getTMDBApiKey();

  if (key) {
    try {
      if (type === 'all') {
        const [movieRes, tvRes] = await Promise.allSettled([
          fetch(`${TMDB_BASE_URL}/trending/movie/week?api_key=${key}&page=${page}`).then((r) =>
            r.ok ? r.json() : null
          ),
          fetch(`${TMDB_BASE_URL}/trending/tv/week?api_key=${key}&page=${page}`).then((r) =>
            r.ok ? r.json() : null
          ),
        ]);
        const items: MediaItem[] = [];
        if (movieRes.status === 'fulfilled' && movieRes.value?.results) {
          items.push(
            ...movieRes.value.results.map((r: RawTMDBItem) => normalizeTMDBItem(r, 'movie'))
          );
        }
        if (tvRes.status === 'fulfilled' && tvRes.value?.results) {
          items.push(...tvRes.value.results.map((r: RawTMDBItem) => normalizeTMDBItem(r, 'series')));
        }
        if (items.length > 0) return items;
      } else {
        const url = `${TMDB_BASE_URL}/trending/${type}/week?api_key=${key}&page=${page}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          return (data.results || []).map((item: RawTMDBItem) =>
            normalizeTMDBItem(item, type === 'movie' ? 'movie' : 'series')
          );
        }
      }
    } catch {}
  }

  // Graceful Zero-Key Live API Fallback via TVMaze
  try {
    const res = await fetch(`${TVMAZE_BASE_URL}/shows?page=0`);
    if (res.ok) {
      const shows: TVMazeShow[] = await res.json();
      return shows.slice(0, 18).map(normalizeTVMazeShow);
    }
  } catch (err) {
    console.warn('TVMaze live catalog fetch fallback', err);
  }

  return [];
}

// Live search: searches TMDB if key is valid; otherwise searches live TVMaze (100% free with no key required)
export async function searchTMDB(query: string, page = 1): Promise<MediaItem[]> {
  if (!query.trim()) return [];
  const key = getTMDBApiKey();

  // Try TMDB if key is set
  if (key) {
    try {
      const url = `${TMDB_BASE_URL}/search/multi?api_key=${key}&query=${encodeURIComponent(
        query.trim()
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

  // Instant Zero-Key Live Search via TVMaze
  try {
    const res = await fetch(
      `${TVMAZE_BASE_URL}/search/shows?q=${encodeURIComponent(query.trim())}`
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
