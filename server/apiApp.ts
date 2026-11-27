import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const BUNDLED_DATA_DIR = path.resolve(process.cwd(), 'data');
const WRITABLE_DATA_DIR = process.env.VERCEL ? '/tmp/mullahmax-data' : BUNDLED_DATA_DIR;
const BUNDLED_STREAMS_STORE_PATH = path.join(BUNDLED_DATA_DIR, 'streams-library.json');
const STREAMS_STORE_PATH = path.join(WRITABLE_DATA_DIR, 'streams-library.json');

export interface TMDBConfigurationPayload {
  images: {
    base_url: string;
    secure_base_url: string;
    backdrop_sizes: string[];
    logo_sizes: string[];
    poster_sizes: string[];
    profile_sizes: string[];
    still_sizes: string[];
  };
  change_keys: string[];
}

const TMDB_DEFAULT_CONFIGURATION: TMDBConfigurationPayload = {
  images: {
    base_url: 'http://image.tmdb.org/t/p/',
    secure_base_url: 'https://image.tmdb.org/t/p/',
    backdrop_sizes: ['w300', 'w780', 'w1280', 'original'],
    logo_sizes: ['w45', 'w92', 'w154', 'w185', 'w300', 'w500', 'original'],
    poster_sizes: ['w92', 'w154', 'w185', 'w342', 'w500', 'w780', 'original'],
    profile_sizes: ['w45', 'w185', 'h632', 'original'],
    still_sizes: ['w92', 'w185', 'w300', 'original'],
  },
  change_keys: [
    'adult', 'air_date', 'also_known_as', 'alternative_titles', 'biography', 'birthday',
    'budget', 'cast', 'certifications', 'character_names', 'created_by', 'crew',
    'deathday', 'episode', 'episode_number', 'episode_run_time', 'freebase_id', 'freebase_mid',
    'general', 'genres', 'guest_stars', 'homepage', 'images', 'imdb_id', 'languages', 'name',
    'network', 'origin_country', 'original_name', 'original_title', 'overview', 'parts',
    'place_of_birth', 'plot_keywords', 'production_code', 'production_companies',
    'production_countries', 'releases', 'revenue', 'runtime', 'season', 'season_number',
    'season_regular', 'spoken_languages', 'status', 'tagline', 'title', 'translations',
    'tvdb_id', 'tvrage_id', 'type', 'video', 'videos',
  ],
};

function getTMDBAuthCredentials(): {
  bearerToken: string;
  apiKey: string;
  authMode: 'bearer' | 'api_key' | 'fallback';
} {
  const bearerToken = (process.env.TMDB_READ_ACCESS_TOKEN || '').trim();
  const apiKey = (process.env.TMDB_API_KEY || '').trim();
  const authMode: 'bearer' | 'api_key' | 'fallback' = bearerToken
    ? 'bearer'
    : apiKey
    ? 'api_key'
    : 'fallback';
  return { bearerToken, apiKey, authMode };
}

async function fetchTMDB<T = Record<string, unknown>>(
  tmdbPath: string,
  params: Record<string, string | number | boolean> = {},
  timeoutMs = 6000
): Promise<T | null> {
  const { bearerToken, apiKey } = getTMDBAuthCredentials();
  if (!bearerToken && !apiKey) {
    return null;
  }

  const cleanPath = tmdbPath.replace(/^\/+/, '');
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k !== 'api_key' && v !== undefined && v !== null) {
      qs.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    accept: 'application/json',
  };
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  } else if (apiKey) {
    qs.set('api_key', apiKey);
  }

  const queryStr = qs.toString();
  const url = queryStr ? `${TMDB_BASE_URL}/${cleanPath}?${queryStr}` : `${TMDB_BASE_URL}/${cleanPath}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface VixSrcEntry {
  tmdb_id: number;
  imdb_id?: string;
}

interface VixSrcIndexStore {
  data: VixSrcEntry[];
  tmdbSet: Set<number>;
  imdbSet: Set<string>;
  fetchedAt: number;
}

interface PrimeSrcHost {
  name: string;
  file_name: string | null;
  file_size: string | null;
  key: string;
  quality: string | null;
  audio_language: string | null;
  audio_type: string | null;
}

interface SavedStreamEntry {
  url: string;
  title?: string;
  subtitleUrl?: string;
  subtitleLabel?: string;
  referer?: string;
  updatedAt: string;
}

type DirectStreamCodec = 'h264' | 'hevc' | 'mp4' | 'hls';

interface DirectMediaResolution {
  url: string;
  subtitleUrl?: string;
  subtitleLabel?: string;
  referer?: string;
  needsProxy?: boolean;
  codec?: DirectStreamCodec;
}

interface DirectMediaBundle {
  primary: DirectMediaResolution;
  fallbacks: DirectMediaResolution[];
}

const vixsrcIndexCache = new Map<string, VixSrcIndexStore>();
const tmdbMetadataCache = new Map<string, { data: Record<string, unknown>; fetchedAt: number }>();
const tmdbProxyCache = new Map<string, { data: unknown; fetchedAt: number }>();
const externalIdCache = new Map<string, { imdbId: string | null; fetchedAt: number }>();
const searchCache = new Map<string, { results: Record<string, unknown>[]; fetchedAt: number }>();
const malIdCache = new Map<string, { malId: number | null; fetchedAt: number }>();
const cinemetaChunkCache = new Map<string, { metas: CinemetaItem[]; fetchedAt: number }>();
const sourcesResponseCache = new Map<
  string,
  { data: Record<string, unknown>; fetchedAt: number; ttlMs: number }
>();
const playlistProxyCache = new Map<string, { body: string; fetchedAt: number }>();
let tmdbConfigCache: { data: TMDBConfigurationPayload; fetchedAt: number } | null = null;
let publicDirectCooldownUntil = 0;

const INDEX_CACHE_TTL_MS = 30 * 60 * 1000;
const TMDB_CACHE_TTL_MS = 60 * 60 * 1000;
const TMDB_CONFIG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TMDB_PROXY_CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const CINEMETA_CHUNK_CACHE_TTL_MS = 5 * 60 * 1000;
const SOURCES_CACHE_TTL_MS = 5 * 60 * 1000;
const SOURCES_NEGATIVE_CACHE_TTL_MS = 15 * 1000;
const PUBLIC_DIRECT_COOLDOWN_MS = 45 * 1000;
const PLAYLIST_PROXY_CACHE_TTL_MS = 60 * 1000;
const PLAYLIST_PROXY_CACHE_MAX = 60;

let streamsStoreCache: Record<string, SavedStreamEntry> | null = null;

export async function readStreamsStore(): Promise<Record<string, SavedStreamEntry>> {
  if (streamsStoreCache) return streamsStoreCache;
  for (const candidatePath of [STREAMS_STORE_PATH, BUNDLED_STREAMS_STORE_PATH]) {
    try {
      const raw = await fs.readFile(candidatePath, 'utf8');
      const parsed = JSON.parse(raw) as Record<string, SavedStreamEntry>;
      if (parsed && typeof parsed === 'object') {
        streamsStoreCache = parsed;
        return streamsStoreCache;
      }
    } catch {
      // Try next candidate path
    }
  }
  streamsStoreCache = {};
  return streamsStoreCache;
}

async function writeStreamsStore(store: Record<string, SavedStreamEntry>): Promise<void> {
  streamsStoreCache = store;
  try {
    await fs.mkdir(WRITABLE_DATA_DIR, { recursive: true });
    await fs.writeFile(STREAMS_STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.warn('[streams-store] Unable to persist store to disk:', err);
  }
}

function makeStreamKey(type: 'movie' | 'tv', id: string, season = 1, episode = 1): string {
  return type === 'tv' ? `tv:${id}:s${season}e${episode}` : `movie:${id}`;
}

export async function getVixSrcIndexStore(type: 'movie' | 'tv', lang?: string): Promise<VixSrcIndexStore> {
  const cleanLang = typeof lang === 'string' && /^[a-z]{2,5}$/i.test(lang.trim()) ? lang.trim().toLowerCase() : '';
  const cacheKey = cleanLang ? `${type}:${cleanLang}` : type;
  const cached = vixsrcIndexCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < INDEX_CACHE_TTL_MS) {
    return cached;
  }

  try {
    const apiUrl = cleanLang
      ? `https://vixsrc.to/api/list/${type}?lang=${encodeURIComponent(cleanLang)}`
      : `https://vixsrc.to/api/list/${type}`;
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const json = (await res.json()) as VixSrcEntry[];
      if (Array.isArray(json) && json.length > 0) {
        const tmdbSet = new Set<number>();
        const imdbSet = new Set<string>();
        for (const entry of json) {
          if (entry?.tmdb_id) tmdbSet.add(entry.tmdb_id);
          if (entry?.imdb_id) imdbSet.add(entry.imdb_id);
        }
        const store: VixSrcIndexStore = {
          data: json,
          tmdbSet,
          imdbSet,
          fetchedAt: Date.now(),
        };
        vixsrcIndexCache.set(cacheKey, store);
        return store;
      }
    }
  } catch (err) {
    console.warn(`[servers/catalog] Failed to fetch vixsrc ${cacheKey} list:`, err);
  }

  return (
    cached || {
      data: [],
      tmdbSet: new Set<number>(),
      imdbSet: new Set<string>(),
      fetchedAt: 0,
    }
  );
}

async function fetchTMDBItemMetadata(
  type: 'movie' | 'tv',
  tmdbId: number,
  imdbId?: string
): Promise<Record<string, unknown> | null> {
  const cacheKey = `${type}-${tmdbId}`;
  const cached = tmdbMetadataCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < TMDB_CACHE_TTL_MS) {
    return cached.data;
  }

  const data = await fetchTMDB<Record<string, unknown>>(`${type}/${tmdbId}`, {
    append_to_response: 'credits,images,watch/providers,external_ids',
  });
  if (!data || (!data.title && !data.name)) return null;
  if (!data.poster_path && !data.backdrop_path) return null;

  const extIds = data.external_ids as { imdb_id?: string } | undefined;
  const resolvedImdb =
    imdbId || extIds?.imdb_id || (typeof data.imdb_id === 'string' ? data.imdb_id : '');
  if (resolvedImdb) {
    data.imdb_id = resolvedImdb;
    externalIdCache.set(cacheKey, { imdbId: resolvedImdb, fetchedAt: Date.now() });
  }
  tmdbMetadataCache.set(cacheKey, { data, fetchedAt: Date.now() });
  return data;
}

async function resolveImdbIdFromTMDB(type: 'movie' | 'tv', tmdbId: number): Promise<string | null> {
  if (!tmdbId || tmdbId <= 0) return null;
  const cacheKey = `${type}-${tmdbId}`;
  const cached = externalIdCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < TMDB_CACHE_TTL_MS) {
    return cached.imdbId;
  }

  const data = await fetchTMDB<{ imdb_id?: string | null }>(`${type}/${tmdbId}/external_ids`, {}, 3500);
  if (!data) return null;
  const imdbId = data.imdb_id ? data.imdb_id.trim() : null;
  externalIdCache.set(cacheKey, { imdbId, fetchedAt: Date.now() });
  return imdbId;
}

async function resolveMalIdByTitle(title: string): Promise<number | null> {
  const cleanTitle = title.trim();
  if (!cleanTitle) return null;
  const cacheKey = cleanTitle.toLowerCase();
  const cached = malIdCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < TMDB_CACHE_TTL_MS) {
    return cached.malId;
  }

  try {
    const aniRes = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'query($q:String){Media(search:$q,type:ANIME){idMal}}',
        variables: { q: cleanTitle },
      }),
      signal: AbortSignal.timeout(3500),
    });
    if (aniRes.ok) {
      const aniJson = (await aniRes.json()) as {
        data?: { Media?: { idMal?: number | null } | null };
      };
      const malId =
        aniJson?.data?.Media?.idMal && aniJson.data.Media.idMal > 0
          ? aniJson.data.Media.idMal
          : null;
      if (malId) {
        malIdCache.set(cacheKey, { malId, fetchedAt: Date.now() });
        return malId;
      }
    }
  } catch {}

  try {
    const res = await fetch(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(cleanTitle)}&limit=1`,
      { signal: AbortSignal.timeout(3500) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ mal_id?: number }> };
    const malId = data?.data?.[0]?.mal_id && data.data[0].mal_id > 0 ? data.data[0].mal_id : null;
    malIdCache.set(cacheKey, { malId, fetchedAt: Date.now() });
    return malId;
  } catch {
    return null;
  }
}

interface CinemetaItem {
  id: string;
  imdb_id?: string;
  moviedb_id?: number;
  type?: 'movie' | 'series';
  name?: string;
  poster?: string;
  background?: string;
  description?: string;
  releaseInfo?: string;
  imdbRating?: string;
  genres?: string[];
  cast?: string[];
  director?: string[];
}

function mapCinemetaToTMDBShape(
  meta: CinemetaItem,
  fallbackType: 'movie' | 'tv'
): Record<string, unknown> {
  const isTv = meta.type === 'series' || fallbackType === 'tv';
  const yearMatch = (meta.releaseInfo || '').match(/\d{4}/);
  const yearStr = yearMatch ? `${yearMatch[0]}-01-01` : '2024-01-01';
  const tmdbNumeric = meta.moviedb_id && meta.moviedb_id > 0 ? meta.moviedb_id : 0;
  const parsedRating = parseFloat(meta.imdbRating || '');

  return {
    id: tmdbNumeric,
    moviedb_id: tmdbNumeric || undefined,
    imdb_id: meta.imdb_id || meta.id,
    media_type: isTv ? 'tv' : 'movie',
    title: !isTv ? meta.name : undefined,
    name: isTv ? meta.name : undefined,
    poster_path: meta.poster || null,
    backdrop_path: meta.background || meta.poster || null,
    release_date: !isTv ? yearStr : undefined,
    first_air_date: isTv ? yearStr : undefined,
    overview: meta.description || '',
    vote_average: Number.isFinite(parsedRating) && parsedRating > 0 ? parsedRating : 0,
    genres: (meta.genres || []).map((g, i) => ({ id: i + 1, name: g })),
    credits: {
      cast: (meta.cast || []).slice(0, 4).map((name) => ({ name })),
      crew: (meta.director || []).slice(0, 1).map((name) => ({ name, job: 'Director' })),
    },
  };
}

async function fetchCinemetaMeta(
  type: 'movie' | 'tv',
  imdbId: string
): Promise<CinemetaItem | null> {
  if (!imdbId || !imdbId.startsWith('tt')) return null;
  const cmType = type === 'tv' ? 'series' : 'movie';
  try {
    const res = await fetch(`https://v3-cinemeta.strem.io/meta/${cmType}/${imdbId}.json`, {
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { meta?: CinemetaItem };
    return data?.meta || null;
  } catch {
    return null;
  }
}

async function searchCinemeta(
  query: string,
  targetType: 'all' | 'movie' | 'tv' = 'all'
): Promise<Record<string, unknown>[]> {
  const typesToFetch: Array<'movie' | 'tv'> =
    targetType === 'all' ? ['movie', 'tv'] : [targetType];

  const rawLists = await Promise.all(
    typesToFetch.map(async (t) => {
      const cmType = t === 'tv' ? 'series' : 'movie';
      try {
        const res = await fetch(
          `https://v3-cinemeta.strem.io/catalog/${cmType}/top/search=${encodeURIComponent(query)}.json`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (!res.ok) return [];
        const data = (await res.json()) as { metas?: CinemetaItem[] };
        const metas = (data?.metas || []).slice(0, 8);
        const hydrated = await Promise.all(
          metas.map(async (m) => {
            const full = await fetchCinemetaMeta(t, m.imdb_id || m.id);
            return mapCinemetaToTMDBShape(full ? { ...m, ...full } : m, t);
          })
        );
        return hydrated;
      } catch {
        return [];
      }
    })
  );

  return rawLists.flat();
}

const CINEMETA_GENRE_NAMES: Record<number, string> = {
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
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
  10759: 'Action',
  10765: 'Sci-Fi',
};

function buildCinemetaCatalogUrl(
  cmType: 'movie' | 'series',
  tmdbSubpath: string,
  params: Record<string, string>,
  skip: number
): string {
  const firstGenreId = parseInt(String(params.with_genres || '').split(',')[0] || '0', 10);
  const genreName = CINEMETA_GENRE_NAMES[firstGenreId];
  const sortBy = params.sort_by || '';

  if (genreName) {
    const encodedGenre = encodeURIComponent(genreName);
    return skip > 0
      ? `https://cinemeta-catalogs.strem.io/top/catalog/${cmType}/top/genre=${encodedGenre}&skip=${skip}.json`
      : `https://cinemeta-catalogs.strem.io/top/catalog/${cmType}/top/genre=${encodedGenre}.json`;
  }
  if (tmdbSubpath.includes('top_rated') || sortBy.includes('vote_average')) {
    return skip > 0
      ? `https://cinemeta-catalogs.strem.io/imdbRating/catalog/${cmType}/imdbRating/skip=${skip}.json`
      : `https://cinemeta-catalogs.strem.io/imdbRating/catalog/${cmType}/imdbRating.json`;
  }
  if (
    tmdbSubpath.includes('now_playing') ||
    tmdbSubpath.includes('upcoming') ||
    tmdbSubpath.includes('on_the_air') ||
    sortBy.includes('release_date')
  ) {
    return skip > 0
      ? `https://cinemeta-catalogs.strem.io/year/catalog/${cmType}/year/skip=${skip}.json`
      : `https://cinemeta-catalogs.strem.io/year/catalog/${cmType}/year.json`;
  }
  return skip > 0
    ? `https://cinemeta-catalogs.strem.io/top/catalog/${cmType}/top/skip=${skip}.json`
    : `https://cinemeta-catalogs.strem.io/top/catalog/${cmType}/top.json`;
}

async function fetchCinemetaChunk(url: string): Promise<CinemetaItem[]> {
  const cached = cinemetaChunkCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < CINEMETA_CHUNK_CACHE_TTL_MS) {
    return cached.metas;
  }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { metas?: CinemetaItem[] };
    const metas = Array.isArray(data?.metas) ? data.metas : [];
    if (metas.length > 0) {
      cinemetaChunkCache.set(url, { metas, fetchedAt: Date.now() });
    }
    return metas;
  } catch {
    return [];
  }
}

async function fetchCinemetaWindow(
  type: 'movie' | 'tv',
  tmdbSubpath: string,
  params: Record<string, string>,
  startOffset: number,
  count: number
): Promise<Record<string, unknown>[]> {
  const cmType = type === 'tv' ? 'series' : 'movie';
  const skip = Math.floor(startOffset / 50) * 50;
  const sliceStart = startOffset % 50;
  const url1 = buildCinemetaCatalogUrl(cmType, tmdbSubpath, params, skip);

  const needsSecondChunk = sliceStart + count > 50;
  const url2 = needsSecondChunk
    ? buildCinemetaCatalogUrl(cmType, tmdbSubpath, params, skip + 50)
    : '';

  const [chunk1, chunk2] = await Promise.all([
    fetchCinemetaChunk(url1),
    url2 ? fetchCinemetaChunk(url2) : Promise.resolve([]),
  ]);

  let metas = chunk1.slice(sliceStart, sliceStart + count);
  if (metas.length < count && chunk2.length > 0) {
    metas = [...metas, ...chunk2.slice(0, count - metas.length)];
  }
  return metas.map((m) => mapCinemetaToTMDBShape(m, type));
}

async function fetchCinemetaCatalogFallback(
  type: 'movie' | 'tv',
  tmdbSubpath: string,
  params: Record<string, string> = {}
): Promise<{ results: Record<string, unknown>[]; total_pages: number; total_results: number }> {
  const page = Math.max(1, parseInt(params.page || '1', 10) || 1);
  const firstGenreId = parseInt(String(params.with_genres || '').split(',')[0] || '0', 10);
  const isWeekTrending = tmdbSubpath.includes('trending') && tmdbSubpath.includes('week') && !firstGenreId;

  if (tmdbSubpath.startsWith('trending/all')) {
    const startOffset = (page - 1) * 10 + (isWeekTrending ? 10 : 0);
    const [movies, series] = await Promise.all([
      fetchCinemetaWindow('movie', tmdbSubpath, params, startOffset, 10),
      fetchCinemetaWindow('tv', tmdbSubpath, params, startOffset, 10),
    ]);
    const interleaved: Record<string, unknown>[] = [];
    const maxLen = Math.max(movies.length, series.length);
    for (let i = 0; i < maxLen; i++) {
      if (movies[i]) interleaved.push(movies[i]);
      if (series[i]) interleaved.push(series[i]);
    }
    return {
      results: interleaved,
      total_pages: interleaved.length > 0 ? Math.max(page + 1, 250) : page,
      total_results: interleaved.length > 0 ? 5000 : 0,
    };
  }

  const startOffset = (page - 1) * 20 + (isWeekTrending ? 20 : 0);
  const results = await fetchCinemetaWindow(type, tmdbSubpath, params, startOffset, 20);
  return {
    results,
    total_pages: results.length > 0 ? Math.max(page + 1, 250) : page,
    total_results: results.length > 0 ? 5000 : 0,
  };
}

function sanitizeDownloadFilename(rawName: string): string {
  const cleaned = rawName
    .replace(/\.mp4$/i, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);
  return `${cleaned || 'MullahMax_Movie'}.mp4`;
}

function isAllowedRemoteUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.startsWith('127.') ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '::' ||
      host === 'metadata.google.internal' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.startsWith('169.254.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.startsWith('::ffff:') ||
      host.startsWith('fe80:') ||
      host.startsWith('fc') ||
      host.startsWith('fd')
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function fetchWithValidatedRedirects(
  initialUrl: URL,
  headers: Record<string, string>,
  timeoutMs = 15000
): Promise<{ response: globalThis.Response; finalUrl: URL } | null> {
  let currentUrl = initialUrl;
  for (let hop = 0; hop < 4; hop++) {
    const candidate = await fetch(currentUrl.toString(), {
      method: 'GET',
      redirect: 'manual',
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (candidate.status >= 300 && candidate.status < 400) {
      const location = candidate.headers.get('location');
      if (!location) break;
      const nextUrl = isAllowedRemoteUrl(new URL(location, currentUrl).toString());
      if (!nextUrl) return null;
      currentUrl = nextUrl;
      continue;
    }

    return { response: candidate, finalUrl: currentUrl };
  }
  return null;
}

function rewriteHlsPlaylistForProxy(
  playlistText: string,
  baseUrl: URL,
  proxyPathPrefix: string,
  extraQuerySuffix = ''
): string {
  const toProxiedUrl = (rawUri: string): string => {
    try {
      const abs = new URL(rawUri.trim(), baseUrl).toString();
      if (!isAllowedRemoteUrl(abs)) return rawUri;
      return `${proxyPathPrefix}?url=${encodeURIComponent(abs)}${extraQuerySuffix}`;
    } catch {
      return rawUri;
    }
  };

  return playlistText
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/gi, (_full, uri: string) => `URI="${toProxiedUrl(uri)}"`);
      }
      return toProxiedUrl(trimmed);
    })
    .join('\n');
}

function convertSrtToWebVtt(rawText: string): string {
  const normalized = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (normalized.trimStart().startsWith('WEBVTT')) {
    return normalized;
  }
  const vttBody = normalized.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    '$1.$2 --> $3.$4'
  );
  return `WEBVTT\n\n${vttBody}`;
}

async function resolveDirectMediaSource(
  type: 'movie' | 'tv',
  tmdbId: number,
  imdbId: string | undefined,
  season: number,
  episode: number,
  savedEntry?: SavedStreamEntry
): Promise<DirectMediaBundle | null> {
  if (savedEntry?.url && isAllowedRemoteUrl(savedEntry.url)) {
    return {
      primary: {
        url: savedEntry.url,
        subtitleUrl: savedEntry.subtitleUrl,
        subtitleLabel: savedEntry.subtitleLabel,
        referer: savedEntry.referer,
        needsProxy: Boolean(savedEntry.referer),
        codec: /\.mp4(\?|$)/i.test(savedEntry.url) ? 'mp4' : 'hls',
      },
      fallbacks: [],
    };
  }

  const jellyfinBaseRaw = (process.env.JELLYFIN_URL || '').trim().replace(/\/+$/, '');
  const jellyfinKey = (process.env.JELLYFIN_API_KEY || '').trim();
  const jellyfinBase = jellyfinBaseRaw ? isAllowedRemoteUrl(jellyfinBaseRaw) : null;

  if (jellyfinBase && jellyfinKey && tmdbId > 0) {
    try {
      const providerFilter = `tmdb.${tmdbId}`;
      if (type === 'movie') {
        const res = await fetch(
          `${jellyfinBase.origin}/Items?AnyProviderIdEquals=${encodeURIComponent(providerFilter)}&IncludeItemTypes=Movie&Recursive=true`,
          {
            headers: { 'X-Emby-Token': jellyfinKey, Accept: 'application/json' },
            signal: AbortSignal.timeout(2500),
          }
        );
        if (res.ok) {
          const data = (await res.json()) as { Items?: Array<{ Id?: string }> };
          const itemId = data.Items?.[0]?.Id;
          if (itemId && /^[a-zA-Z0-9_-]+$/.test(itemId)) {
            return {
              primary: {
                url: `/api/jellyfin-stream/${encodeURIComponent(itemId)}/master.m3u8`,
                needsProxy: false,
                codec: 'hls',
              },
              fallbacks: [],
            };
          }
        }
      } else {
        const seriesRes = await fetch(
          `${jellyfinBase.origin}/Items?AnyProviderIdEquals=${encodeURIComponent(providerFilter)}&IncludeItemTypes=Series&Recursive=true`,
          {
            headers: { 'X-Emby-Token': jellyfinKey, Accept: 'application/json' },
            signal: AbortSignal.timeout(2500),
          }
        );
        if (seriesRes.ok) {
          const seriesData = (await seriesRes.json()) as { Items?: Array<{ Id?: string }> };
          const seriesId = seriesData.Items?.[0]?.Id;
          if (seriesId && /^[a-zA-Z0-9_-]+$/.test(seriesId)) {
            const epRes = await fetch(
              `${jellyfinBase.origin}/Shows/${encodeURIComponent(seriesId)}/Episodes?Season=${season}`,
              {
                headers: { 'X-Emby-Token': jellyfinKey, Accept: 'application/json' },
                signal: AbortSignal.timeout(2500),
              }
            );
            if (epRes.ok) {
              const epData = (await epRes.json()) as {
                Items?: Array<{ Id?: string; IndexNumber?: number }>;
              };
              const matchedEp = epData.Items?.find((ep) => ep.IndexNumber === episode);
              if (matchedEp?.Id && /^[a-zA-Z0-9_-]+$/.test(matchedEp.Id)) {
                return {
                  primary: {
                    url: `/api/jellyfin-stream/${encodeURIComponent(matchedEp.Id)}/master.m3u8`,
                    needsProxy: false,
                    codec: 'hls',
                  },
                  fallbacks: [],
                };
              }
            }
          }
        }
      }
    } catch {
      // Optional Jellyfin server unreachable; fall through cleanly
    }
  }

  const cdnBaseRaw = (process.env.MEDIA_CDN_BASE_URL || '').trim().replace(/\/+$/, '');
  const cdnBase = cdnBaseRaw ? isAllowedRemoteUrl(cdnBaseRaw) : null;
  if (cdnBase && (tmdbId > 0 || imdbId)) {
    const idSlug = tmdbId > 0 ? String(tmdbId) : String(imdbId);
    const candidates =
      type === 'tv'
        ? [
            `${cdnBase.toString().replace(/\/+$/, '')}/tv/${idSlug}/s${season}e${episode}/master.m3u8`,
            `${cdnBase.toString().replace(/\/+$/, '')}/tv/${idSlug}/s${season}e${episode}.mp4`,
            `${cdnBase.toString().replace(/\/+$/, '')}/tv/${idSlug}/${season}/${episode}/master.m3u8`,
            `${cdnBase.toString().replace(/\/+$/, '')}/tv/${idSlug}/${season}/${episode}.mp4`,
          ]
        : [
            `${cdnBase.toString().replace(/\/+$/, '')}/movie/${idSlug}/master.m3u8`,
            `${cdnBase.toString().replace(/\/+$/, '')}/movie/${idSlug}.mp4`,
            `${cdnBase.toString().replace(/\/+$/, '')}/${idSlug}/master.m3u8`,
            `${cdnBase.toString().replace(/\/+$/, '')}/${idSlug}.mp4`,
          ];

    const probeResults = await Promise.allSettled(
      candidates.map(async (candidate) => {
        const probe = await fetch(candidate, {
          method: 'HEAD',
          signal: AbortSignal.timeout(1100),
        });
        const ct = (probe.headers.get('content-type') || '').toLowerCase();
        if (probe.ok && !ct.includes('text/html')) {
          const acao = (probe.headers.get('access-control-allow-origin') || '').trim();
          return {
            url: candidate,
            needsProxy: acao !== '*',
            codec: (/\.mp4(\?|$)/i.test(candidate) ? 'mp4' : 'hls') as DirectStreamCodec,
          };
        }
        throw new Error('not playable');
      })
    );
    const workingCdn: DirectMediaResolution[] = [];
    for (const r of probeResults) {
      if (r.status === 'fulfilled' && r.value) {
        workingCdn.push(r.value);
      }
    }
    if (workingCdn.length > 0) {
      return {
        primary: workingCdn[0],
        fallbacks: workingCdn.slice(1),
      };
    }
  }

  if (tmdbId > 0) {
    const publicDirect = await resolvePublicDirectStream(type, tmdbId, season, episode);
    if (publicDirect) {
      return publicDirect;
    }
  }

  return null;
}

const STREAM_ENVELOPE_BASE = 'https://new.vidnest.fun';
const STREAM_ENVELOPE_REFERER = 'https://vidnest.fun/';
const STREAM_ENVELOPE_KEY = 'K3p8vQ2mX9rL5wZ0fN7bG1sH4tJ6dC9_y8S3wM1nQ5pL2';
const ONEHD_WORKER_BASE = 'https://vidrift-cf.money-2.workers.dev';

function appendStreamNonce(rawUrl: string): string {
  const token = crypto
    .randomBytes(16)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}_n=${encodeURIComponent(token)}`;
}

async function decodeStreamEnvelope(payload: unknown): Promise<Record<string, unknown> | null> {
  if (!payload || typeof payload !== 'object') return null;
  const envelope = payload as { v?: number; d?: string; n?: string };
  if (envelope.v !== 2 || typeof envelope.d !== 'string' || typeof envelope.n !== 'string') {
    return payload as Record<string, unknown>;
  }

  const keyDigest = crypto
    .createHash('sha256')
    .update(`${envelope.n}|${STREAM_ENVELOPE_KEY}`)
    .digest();
  let b64 = envelope.d.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  const raw = Buffer.from(b64, 'base64');
  if (raw.length < 28) return null;
  const iv = raw.subarray(0, 12);
  const cipherAndTag = raw.subarray(12);
  const tag = cipherAndTag.subarray(cipherAndTag.length - 16);
  const cipherText = cipherAndTag.subarray(0, cipherAndTag.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyDigest, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(cipherText), decipher.final()]).toString('utf8');
  return JSON.parse(plain) as Record<string, unknown>;
}

async function resolvePublicDirectStream(
  type: 'movie' | 'tv',
  tmdbId: number,
  season: number,
  episode: number
): Promise<DirectMediaBundle | null> {
  if (Date.now() < publicDirectCooldownUntil) {
    return null;
  }

  const pathSuffix =
    type === 'tv' ? `tv/${tmdbId}/${season}/${episode}` : `movie/${tmdbId}`;

  const candidates: Array<{
    id: string;
    endpoint: string;
    baseWorker?: string;
    defaultReferer: string;
  }> = [
    {
      id: 'flixhq',
      endpoint: `${STREAM_ENVELOPE_BASE}/flixhq/${pathSuffix}`,
      defaultReferer: STREAM_ENVELOPE_REFERER,
    },
    {
      id: 'rogflix',
      endpoint: `${STREAM_ENVELOPE_BASE}/rogflix/${pathSuffix}`,
      defaultReferer: STREAM_ENVELOPE_REFERER,
    },
    {
      id: 'onehd',
      endpoint: `${STREAM_ENVELOPE_BASE}/onehd/${pathSuffix}`,
      baseWorker: ONEHD_WORKER_BASE,
      defaultReferer: STREAM_ENVELOPE_REFERER,
    },
  ];

  const probeSource = async (
    candidate: (typeof candidates)[number]
  ): Promise<{ rank: number; resolution: DirectMediaResolution } | null> => {
    try {
      const apiRes = await fetch(appendStreamNonce(candidate.endpoint), {
        headers: {
          Origin: 'https://vidnest.fun',
          Referer: STREAM_ENVELOPE_REFERER,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(2200),
      });
      if (!apiRes.ok) return null;
      const rawJson = await apiRes.json().catch(() => null);
      const data = await decodeStreamEnvelope(rawJson);
      if (!data) return null;

      let streamUrl = typeof data.url === 'string' ? data.url.trim() : '';
      let customRef = candidate.defaultReferer;
      let explicitRefererNeeded = false;
      if (!streamUrl && Array.isArray(data.streams)) {
        const firstValid = data.streams.find(
          (s): s is { url?: string; headers?: { Referer?: string } } =>
            Boolean(s && typeof s === 'object' && typeof (s as { url?: unknown }).url === 'string')
        );
        if (firstValid?.url) {
          streamUrl = firstValid.url.trim();
          if (firstValid.headers?.Referer) {
            customRef = firstValid.headers.Referer;
            explicitRefererNeeded = true;
          }
        }
      }
      if (!streamUrl) return null;
      if (streamUrl.startsWith('/') && candidate.baseWorker) {
        streamUrl = `${candidate.baseWorker}${streamUrl}`;
      }

      const validStream = isAllowedRemoteUrl(streamUrl);
      const validRef = isAllowedRemoteUrl(customRef);
      if (!validStream) return null;

      const isMp4 = /\.mp4(\?|$)/i.test(validStream.pathname);
      const verifyRes = await fetch(validStream.toString(), {
        method: isMp4 ? 'HEAD' : 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Referer: validRef ? validRef.toString() : STREAM_ENVELOPE_REFERER,
          Origin: validRef ? validRef.origin : 'https://vidnest.fun',
        },
        signal: AbortSignal.timeout(2200),
      });
      if (!verifyRes.ok && verifyRes.status !== 206) return null;
      const ct = (verifyRes.headers.get('content-type') || '').toLowerCase();
      if (ct.includes('text/html') || ct.includes('application/xhtml+xml')) return null;

      const acao = (verifyRes.headers.get('access-control-allow-origin') || '').trim();
      const vary = (verifyRes.headers.get('vary') || '').toLowerCase();
      const needsProxy = explicitRefererNeeded || acao !== '*' || vary.includes('origin');

      let detectedCodec: DirectStreamCodec = isMp4 ? 'mp4' : 'hls';
      if (!isMp4) {
        const snippet = (await verifyRes.text()).trimStart();
        if (!snippet.startsWith('#EXTM3U')) return null;
        const hasAvc = /avc1/i.test(snippet);
        const hasHevc = /(hvc1|hev1)/i.test(snippet);
        if (hasAvc) {
          detectedCodec = 'h264';
        } else if (hasHevc) {
          detectedCodec = 'hevc';
        }
      }

      let subtitleUrl: string | undefined;
      let subtitleLabel: string | undefined;
      if (Array.isArray(data.subtitles)) {
        const subs = data.subtitles.filter(
          (s): s is { url?: string; lang?: string; label?: string } =>
            Boolean(s && typeof s === 'object' && typeof (s as { url?: unknown }).url === 'string')
        );
        const engSub =
          subs.find((s) => /\b(eng|english)\b/i.test(`${s.lang || ''} ${s.label || ''}`)) ||
          subs[0];
        if (engSub?.url) {
          const fullSub =
            engSub.url.startsWith('/') && candidate.baseWorker
              ? `${candidate.baseWorker}${engSub.url}`
              : engSub.url;
          const validSub = isAllowedRemoteUrl(fullSub);
          if (validSub) {
            subtitleUrl = validSub.toString();
            subtitleLabel = engSub.label || engSub.lang || 'English';
          }
        }
      }

      const codecWeight =
        detectedCodec === 'h264' ? 0 : detectedCodec === 'mp4' || detectedCodec === 'hls' ? 2 : 10;
      const hostWeight = candidate.id === 'flixhq' ? 0 : candidate.id === 'rogflix' ? 1 : 2;
      const directBonus = needsProxy ? 0 : -1;
      const rank = codecWeight + hostWeight + directBonus;

      return {
        rank,
        resolution: {
          url: validStream.toString(),
          subtitleUrl,
          subtitleLabel,
          referer: validRef ? validRef.toString() : STREAM_ENVELOPE_REFERER,
          needsProxy,
          codec: detectedCodec,
        },
      };
    } catch {
      return null;
    }
  };

  const settled = await Promise.allSettled(candidates.map((c) => probeSource(c)));
  const validResults = settled
    .map((r) => (r.status === 'fulfilled' ? r.value : null))
    .filter((v): v is { rank: number; resolution: DirectMediaResolution } => v !== null)
    .sort((a, b) => a.rank - b.rank);

  if (validResults.length === 0) {
    publicDirectCooldownUntil = Date.now() + PUBLIC_DIRECT_COOLDOWN_MS;
    return null;
  }

  publicDirectCooldownUntil = 0;
  return {
    primary: validResults[0].resolution,
    fallbacks: validResults.slice(1).map((v) => v.resolution),
  };
}

const EMBED_SHIELD_ALLOWED_HOSTS = new Set([
  '2embed.cc',
  'www.2embed.cc',
  'vidsrc.to',
  'www.vidsrc.to',
  'vidsrc.su',
  'www.vidsrc.su',
  'vidsrc.sh',
  'www.vidsrc.sh',
  'vidsrc.me',
  'www.vidsrc.me',
  'player.autoembed.me',
  'vidnest.fun',
  'vidsrc.wtf',
  'vixsrc.to',
  'www.vixsrc.to',
]);

function isAllowedEmbedShieldUrl(rawUrl: string): URL | null {
  const parsed = isAllowedRemoteUrl(rawUrl);
  if (!parsed) return null;
  const host = parsed.hostname.toLowerCase();
  return EMBED_SHIELD_ALLOWED_HOSTS.has(host) ? parsed : null;
}

const INFRAME_SHIELD_SCRIPT = `<script id="mullahmax-frame-js-shield">(function(){
  if(window.__MULLAHMAX_FRAME_SHIELD__)return;
  window.__MULLAHMAX_FRAME_SHIELD__=true;
  var AD_RE=/popads|popcash|propeller|adsterra|monetag|exoclick|juicyads|hilltopads|acscdn|onmarshtomorrow|onclickalgo|onclkds|doubleclick|googlesyndication|histats|ad-maven|bidvertiser|trafficjunky|clksite|clickadu|realsrv|trackwill|tsyndicate|createlouisville|tagivi|adserver/i;
  try{Object.defineProperty(window,'open',{configurable:false,writable:false,value:function(){return null;}});}catch(e){window.open=function(){return null;};}
  try{
    var origAClick=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(){
      var href=this.getAttribute('href')||'';
      if(this.target==='_blank'||AD_RE.test(href)||/^https?:\\/\\//i.test(href))return;
      return origAClick.apply(this,arguments);
    };
  }catch(e){}
  try{
    var origCreate=document.createElement.bind(document);
    document.createElement=function(tag,opts){
      var el=origCreate(tag,opts);
      var low=String(tag).toLowerCase();
      if(low==='script'||low==='iframe'){
        var origSet=el.setAttribute.bind(el);
        el.setAttribute=function(k,v){
          if(k==='src'&&AD_RE.test(String(v)))return;
          return origSet(k,v);
        };
      }
      return el;
    };
  }catch(e){}
  function cleanOverlays(){
    try{
      document.querySelectorAll('a[target="_blank"],a[href*="pop"],a[href*="click"]').forEach(function(a){
        var h=a.getAttribute('href')||'';
        if(AD_RE.test(h)||(a.target==='_blank'&&!a.closest('.vjs-control-bar'))){
          a.removeAttribute('href');
          a.removeAttribute('target');
          a.style.pointerEvents='none';
        }
      });
      document.querySelectorAll('div,section,span').forEach(function(el){
        if(el.querySelector('video,iframe'))return;
        var cs=window.getComputedStyle(el);
        if((cs.position==='fixed'||cs.position==='absolute')&&parseInt(cs.zIndex||'0',10)>999&&cs.opacity==='0'){
          el.style.pointerEvents='none';
          el.style.display='none';
        }
      });
    }catch(e){}
  }
  document.addEventListener('click',function(e){
    var a=e.target&&e.target.closest?e.target.closest('a'):null;
    if(a&&(a.target==='_blank'||AD_RE.test(a.href||''))){
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  },true);
  document.addEventListener('auxclick',function(e){
    var a=e.target&&e.target.closest?e.target.closest('a'):null;
    if(a){e.preventDefault();e.stopImmediatePropagation();}
  },true);
  if(document.documentElement&&typeof MutationObserver!=='undefined'){
    new MutationObserver(cleanOverlays).observe(document.documentElement,{childList:true,subtree:true});
  }
  document.addEventListener('DOMContentLoaded',cleanOverlays);
})();</script>`;

export function createApiApp(existingApp?: express.Express): express.Express {
  const app = existingApp || express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/streams', async (req, res) => {
    const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
    const imdbId = typeof req.query.imdbId === 'string' ? req.query.imdbId.trim() : '';
    const type = req.query.type === 'series' || req.query.type === 'tv' ? 'tv' : 'movie';
    const season = Math.max(1, parseInt(String(req.query.season || '1'), 10) || 1);
    const episode = Math.max(1, parseInt(String(req.query.episode || '1'), 10) || 1);
    const store = await readStreamsStore();

    if (!id && !imdbId) {
      res.json({ streams: store, count: Object.keys(store).length });
      return;
    }

    const entry =
      (id ? store[makeStreamKey(type, id, season, episode)] : undefined) ||
      (imdbId ? store[makeStreamKey(type, imdbId, season, episode)] : undefined) ||
      null;
    res.json({ entry });
  });

  app.post('/api/streams', async (req, res) => {
    const {
      id,
      type,
      season = 1,
      episode = 1,
      url,
      title,
      subtitleUrl,
      subtitleLabel,
      referer,
    } = (req.body || {}) as {
      id?: string | number;
      type?: string;
      season?: number;
      episode?: number;
      url?: string;
      title?: string;
      subtitleUrl?: string;
      subtitleLabel?: string;
      referer?: string;
    };

    const targetId = String(id || '').trim();
    const mediaType: 'movie' | 'tv' = type === 'series' || type === 'tv' ? 'tv' : 'movie';
    const cleanUrl = typeof url === 'string' ? url.trim() : '';
    const cleanSubUrl = typeof subtitleUrl === 'string' ? subtitleUrl.trim() : '';
    const cleanReferer = typeof referer === 'string' ? referer.trim() : '';

    if (!targetId || !isAllowedRemoteUrl(cleanUrl)) {
      res.status(400).json({ error: 'Valid id and public http(s) stream URL are required.' });
      return;
    }

    if (cleanSubUrl && !isAllowedRemoteUrl(cleanSubUrl)) {
      res.status(400).json({ error: 'Subtitle URL must be a valid public http(s) .vtt link.' });
      return;
    }

    if (cleanReferer && !isAllowedRemoteUrl(cleanReferer)) {
      res.status(400).json({ error: 'Referer URL must be a valid public http(s) origin.' });
      return;
    }

    const store = await readStreamsStore();
    const key = makeStreamKey(
      mediaType,
      targetId,
      Math.max(1, Number(season) || 1),
      Math.max(1, Number(episode) || 1)
    );
    const entry: SavedStreamEntry = {
      url: cleanUrl,
      title: typeof title === 'string' ? title.slice(0, 140) : undefined,
      subtitleUrl: cleanSubUrl || undefined,
      subtitleLabel:
        typeof subtitleLabel === 'string' && subtitleLabel.trim()
          ? subtitleLabel.trim().slice(0, 60)
          : undefined,
      referer: cleanReferer || undefined,
      updatedAt: new Date().toISOString(),
    };
    store[key] = entry;
    await writeStreamsStore(store);
    sourcesResponseCache.clear();
    res.json({ ok: true, key, entry });
  });

  app.delete('/api/streams', async (req, res) => {
    const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
    const type = req.query.type === 'series' || req.query.type === 'tv' ? 'tv' : 'movie';
    const season = Math.max(1, parseInt(String(req.query.season || '1'), 10) || 1);
    const episode = Math.max(1, parseInt(String(req.query.episode || '1'), 10) || 1);

    if (!id) {
      res.status(400).json({ error: 'id is required' });
      return;
    }
    const store = await readStreamsStore();
    const key = makeStreamKey(type, id, season, episode);
    delete store[key];
    await writeStreamsStore(store);
    sourcesResponseCache.clear();
    res.json({ ok: true });
  });

  app.get('/api/tmdb/configuration', async (_req, res) => {
    const { bearerToken, apiKey, authMode } = getTMDBAuthCredentials();
    const authConfigured = Boolean(bearerToken || apiKey);

    if (tmdbConfigCache && Date.now() - tmdbConfigCache.fetchedAt < TMDB_CONFIG_CACHE_TTL_MS) {
      res.json({
        ...tmdbConfigCache.data,
        authConfigured,
        authMode,
      });
      return;
    }

    if (authConfigured) {
      const liveConfig = await fetchTMDB<TMDBConfigurationPayload>('configuration', {}, 5500);
      if (liveConfig?.images?.secure_base_url && Array.isArray(liveConfig.change_keys)) {
        tmdbConfigCache = { data: liveConfig, fetchedAt: Date.now() };
        res.json({
          ...liveConfig,
          authConfigured: true,
          authMode,
        });
        return;
      }
    }

    res.json({
      ...TMDB_DEFAULT_CONFIGURATION,
      authConfigured,
      authMode,
    });
  });

  app.get('/api/tmdb/*', async (req, res) => {
    const tmdbSubpath = req.path.replace(/^\/api\/tmdb\/?/, '').replace(/^\/+/, '');
    if (!tmdbSubpath || tmdbSubpath.includes('..') || !/^[a-zA-Z0-9/_,.-]+$/.test(tmdbSubpath)) {
      res.status(400).json({ error: 'Invalid TMDB path' });
      return;
    }

    const incomingParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.query)) {
      if (typeof v === 'string' && k !== 'api_key') {
        incomingParams[k] = v;
      }
    }

    const cacheKey = `${tmdbSubpath}?${new URLSearchParams(incomingParams).toString()}`;
    const cached = tmdbProxyCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < TMDB_PROXY_CACHE_TTL_MS) {
      res.json(cached.data);
      return;
    }

    const data = await fetchTMDB(tmdbSubpath, incomingParams, 6500);
    if (data) {
      tmdbProxyCache.set(cacheKey, { data, fetchedAt: Date.now() });
      res.json(data);
      return;
    }

    const isTv = tmdbSubpath.includes('tv');
    const queryParam = typeof req.query.query === 'string' ? req.query.query.trim() : '';
    if (queryParam) {
      const results = await searchCinemeta(queryParam, isTv ? 'tv' : 'movie');
      res.json({ results, total_pages: 1, total_results: results.length });
      return;
    }
    const fallback = await fetchCinemetaCatalogFallback(
      isTv ? 'tv' : 'movie',
      tmdbSubpath,
      incomingParams
    );
    res.json(fallback);
  });

  app.get('/api/search', async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);

    if (!query) {
      res.json({ results: [] });
      return;
    }

    const cacheKey = `${query.toLowerCase()}:${page}`;
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < SEARCH_CACHE_TTL_MS) {
      res.json({ results: cached.results });
      return;
    }

    const tmdbData = await fetchTMDB<{ results?: Record<string, unknown>[] }>(
      'search/multi',
      { query, page, include_adult: false },
      5500
    );
    if (tmdbData?.results) {
      const filtered = tmdbData.results.filter(
        (item) => item.media_type === 'movie' || item.media_type === 'tv'
      );
      if (filtered.length > 0) {
        searchCache.set(cacheKey, { results: filtered, fetchedAt: Date.now() });
        res.json({ results: filtered });
        return;
      }
    }

    const cmResults = await searchCinemeta(query, 'all');
    if (cmResults.length > 0) {
      searchCache.set(cacheKey, { results: cmResults, fetchedAt: Date.now() });
    }
    res.json({ results: cmResults });
  });

  app.get('/api/servers/catalog', async (req, res) => {
    const rawType = req.query.type === 'tv' ? 'tv' : 'movie';
    const lang = typeof req.query.lang === 'string' && req.query.lang !== 'all' ? req.query.lang.trim() : '';
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const pageSize = 20;

    try {
      const store = await getVixSrcIndexStore(rawType, lang || undefined);
      const index = store.data;
      if (index.length === 0) {
        const cm = await fetchCinemetaCatalogFallback(rawType, rawType === 'tv' ? 'tv/popular' : 'movie/popular', {
          page: String(page),
        });
        res.json({
          items: cm.results,
          page,
          totalPages: cm.total_pages,
          totalResults: cm.total_results,
        });
        return;
      }

      const totalResults = index.length;
      const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
      const reversedOffset = (page - 1) * pageSize;
      const slice: VixSrcEntry[] = [];

      for (let i = 0; i < pageSize * 2 && slice.length < pageSize; i++) {
        const idx = totalResults - 1 - (reversedOffset + i);
        if (idx < 0) break;
        const entry = index[idx];
        if (entry && entry.tmdb_id) {
          slice.push(entry);
        }
      }

      const hydrated = await Promise.all(
        slice.map(async (entry) => {
          const fromTmdb = await fetchTMDBItemMetadata(rawType, entry.tmdb_id, entry.imdb_id);
          if (fromTmdb) return fromTmdb;
          if (entry.imdb_id) {
            const cm = await fetchCinemetaMeta(rawType, entry.imdb_id);
            if (cm) return mapCinemetaToTMDBShape({ ...cm, moviedb_id: entry.tmdb_id }, rawType);
          }
          return null;
        })
      );

      let items = hydrated.filter((item): item is Record<string, unknown> => item !== null);
      if (items.length === 0) {
        const cm = await fetchCinemetaCatalogFallback(rawType, rawType === 'tv' ? 'tv/popular' : 'movie/popular', {
          page: String(page),
        });
        items = cm.results;
      }

      res.json({
        items,
        page,
        totalPages: items.length > 0 ? Math.max(totalPages, page + 1) : totalPages,
        totalResults,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Server catalog error';
      res.status(502).json({ error: msg, items: [], page, totalPages: 1, totalResults: 0 });
    }
  });

  app.get('/api/servers/sources', async (req, res) => {
    const rawTmdbId = parseInt(String(req.query.tmdbId || '0'), 10);
    const initialImdbId = typeof req.query.imdbId === 'string' ? req.query.imdbId.trim() : '';
    const titleHint = typeof req.query.title === 'string' ? req.query.title.trim() : '';
    const isAnimeHint = req.query.isAnime === '1';
    const isFastMode = req.query.fast === '1';
    const type = req.query.type === 'series' || req.query.type === 'tv' ? 'tv' : 'movie';
    const season = Math.max(1, parseInt(String(req.query.season || '1'), 10) || 1);
    const episode = Math.max(1, parseInt(String(req.query.episode || '1'), 10) || 1);

    if (!rawTmdbId && !initialImdbId) {
      res.status(400).json({ error: 'tmdbId or imdbId is required' });
      return;
    }

    const sourceCacheKey = `${type}:${rawTmdbId || initialImdbId}:s${season}e${episode}:${isFastMode ? 'fast' : 'full'}`;
    const cachedSources = sourcesResponseCache.get(sourceCacheKey);
    if (cachedSources && Date.now() - cachedSources.fetchedAt < cachedSources.ttlMs) {
      res.json(cachedSources.data);
      return;
    }

    try {
      const vixStore = vixsrcIndexCache.get(type);
      if (!vixStore) {
        void getVixSrcIndexStore(type);
      }

      let tmdbId = rawTmdbId;

      if (!tmdbId && initialImdbId.startsWith('tt')) {
        const vixMatch = vixStore?.data.find((entry) => entry.imdb_id === initialImdbId && entry.tmdb_id > 0);
        if (vixMatch) {
          tmdbId = vixMatch.tmdb_id;
        }
      }

      if (!tmdbId && initialImdbId.startsWith('tt')) {
        const findData = await fetchTMDB<{
          movie_results?: Array<{ id: number }>;
          tv_results?: Array<{ id: number }>;
        }>(`find/${encodeURIComponent(initialImdbId)}`, { external_source: 'imdb_id' }, 1400);
        if (findData) {
          const list = type === 'tv' ? findData.tv_results : findData.movie_results;
          if (list && list[0]?.id > 0) {
            tmdbId = list[0].id;
          }
        }
      }

      if (!tmdbId && initialImdbId.startsWith('tt')) {
        const cm = await fetchCinemetaMeta(type, initialImdbId);
        if (cm?.moviedb_id && cm.moviedb_id > 0) {
          tmdbId = cm.moviedb_id;
        }
      }

      const targetId = tmdbId > 0 ? String(tmdbId) : initialImdbId;
      const targetParam = tmdbId > 0 ? `tmdb=${tmdbId}` : `imdb=${encodeURIComponent(initialImdbId)}`;
      const primeUrl =
        type === 'tv'
          ? `https://primesrc.me/api/v1/s?${targetParam}&season=${season}&episode=${episode}&type=tv`
          : `https://primesrc.me/api/v1/s?${targetParam}&type=movie`;
      const vidlinkUrl =
        type === 'tv'
          ? `https://vidlink.pro/tv/${targetId}/${season}/${episode}`
          : `https://vidlink.pro/movie/${targetId}`;
      const vixEmbedUrl =
        type === 'tv'
          ? `https://vixsrc.to/tv/${targetId}/${season}/${episode}`
          : `https://vixsrc.to/movie/${targetId}`;

      const streamsStore = await readStreamsStore();
      const savedDirectEntry =
        streamsStore[makeStreamKey(type, targetId, season, episode)] ||
        (initialImdbId ? streamsStore[makeStreamKey(type, initialImdbId, season, episode)] : undefined);

      const [directResolution, primeResult, vidlinkOk, vixEmbedOk, resolvedImdb, resolvedMalId] =
        await Promise.all([
          resolveDirectMediaSource(
            type,
            tmdbId,
            initialImdbId || undefined,
            season,
            episode,
            savedDirectEntry
          ),
          !isFastMode
            ? fetch(primeUrl, {
                headers: {
                  Referer:
                    type === 'tv'
                      ? `https://primesrc.me/embed/tv?${targetParam}&season=${season}&episode=${episode}`
                      : `https://primesrc.me/embed/movie?${targetParam}`,
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                },
                signal: AbortSignal.timeout(2000),
              })
                .then((r) => (r.ok ? r.json() : null))
                .catch(() => null)
            : Promise.resolve(null),
          !isFastMode && tmdbId > 0
            ? fetch(vidlinkUrl, {
                method: 'HEAD',
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                },
                signal: AbortSignal.timeout(1500),
              })
                .then((r) => r.status === 200)
                .catch(() => false)
            : Promise.resolve(tmdbId > 0),
          !isFastMode && tmdbId > 0
            ? fetch(vixEmbedUrl, {
                method: 'HEAD',
                headers: {
                  'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                },
                signal: AbortSignal.timeout(1500),
              })
                .then((r) => r.status === 200)
                .catch(() => false)
            : Promise.resolve(false),
          !isFastMode && !initialImdbId && tmdbId > 0
            ? resolveImdbIdFromTMDB(type, tmdbId)
            : Promise.resolve(initialImdbId || null),
          isAnimeHint && titleHint ? resolveMalIdByTitle(titleHint) : Promise.resolve(null),
        ]);

      let primeSrcHosts: PrimeSrcHost[] = [];
      let primeInfo: Record<string, unknown> | null = null;
      if (primeResult && typeof primeResult === 'object') {
        const data = primeResult as {
          servers?: PrimeSrcHost[];
          info?: Record<string, unknown>;
        };
        if (Array.isArray(data.servers)) {
          primeSrcHosts = data.servers;
        }
        if (data.info) {
          primeInfo = data.info;
        }
      }

      const finalImdbId = resolvedImdb || initialImdbId || undefined;
      const inVixCatalog =
        Boolean(vixStore && ((tmdbId > 0 && vixStore.tmdbSet.has(tmdbId)) ||
        (finalImdbId && vixStore.imdbSet.has(finalImdbId))));
      const vixsrcAvailable = inVixCatalog && vixEmbedOk;

      const availableServers: Array<
        'vidsrc_sh' | 'vidlink' | 'vidnest' | 'vidsrc_su' | 'vixsrc'
      > = ['vidsrc_sh', 'vidlink', 'vidnest', 'vidsrc_su'];
      if (vixsrcAvailable) availableServers.push('vixsrc');

      const recommendedServer: 'vidsrc_sh' | 'vixsrc' | 'vidlink' = 'vidsrc_sh';

      const payload = {
        directStreamUrl: directResolution?.primary.url,
        directStreamSubtitleUrl: directResolution?.primary.subtitleUrl,
        directStreamSubtitleLabel: directResolution?.primary.subtitleLabel,
        directStreamReferer: directResolution?.primary.referer,
        directStreamNeedsProxy: directResolution?.primary.needsProxy,
        directStreamCodec: directResolution?.primary.codec,
        directStreamFallbacks: directResolution?.fallbacks || [],
        vidlinkAvailable: vidlinkOk,
        vidfastAvailable: false,
        vixsrcAvailable,
        availableServers,
        primeSrcHosts,
        resolvedTmdbId: tmdbId > 0 ? tmdbId : undefined,
        resolvedImdbId: finalImdbId,
        resolvedMalId: resolvedMalId || undefined,
        recommendedServer,
        info: primeInfo,
      };

      sourcesResponseCache.set(sourceCacheKey, {
        data: payload,
        fetchedAt: Date.now(),
        ttlMs: directResolution ? SOURCES_CACHE_TTL_MS : SOURCES_NEGATIVE_CACHE_TTL_MS,
      });
      res.json(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to probe server sources';
      res.status(502).json({
        error: msg,
        vidlinkAvailable: true,
        vixsrcAvailable: false,
        recommendedServer: 'vidsrc_sh',
        availableServers: ['vidsrc_sh', 'vidlink', 'vidnest', 'vidsrc_su'],
        primeSrcHosts: [],
      });
    }
  });

  app.options('/api/stream-proxy', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, If-Range');
    res.status(204).end();
  });

  app.get('/api/stream-proxy', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const rawRef = typeof req.query.ref === 'string' ? req.query.ref.trim() : '';
    const parsedUrl = isAllowedRemoteUrl(rawUrl);
    const parsedRef = rawRef ? isAllowedRemoteUrl(rawRef) : null;

    if (!parsedUrl || (rawRef && !parsedRef)) {
      res.status(400).json({ error: 'Valid public http(s) media URL is required.' });
      return;
    }

    const playlistCacheKey = `${parsedUrl.toString()}|${parsedRef ? parsedRef.toString() : ''}`;
    const rangeHeader = req.headers.range;
    const hasRangeHeader =
      typeof rangeHeader === 'string' && /^bytes=\d*-\d*(,\s*\d*-\d*)*$/i.test(rangeHeader);

    if (!hasRangeHeader) {
      const cachedPlaylist = playlistProxyCache.get(playlistCacheKey);
      if (cachedPlaylist && Date.now() - cachedPlaylist.fetchedAt < PLAYLIST_PROXY_CACHE_TTL_MS) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
        res.status(200);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=30');
        res.send(cachedPlaylist.body);
        return;
      }
    }

    const reqHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Referer: parsedRef ? parsedRef.toString() : `${parsedUrl.origin}/`,
      Origin: parsedRef ? parsedRef.origin : parsedUrl.origin,
      Connection: 'keep-alive',
    };
    if (hasRangeHeader && typeof rangeHeader === 'string') {
      reqHeaders.Range = rangeHeader;
    }
    if (typeof req.headers['if-range'] === 'string') {
      reqHeaders['If-Range'] = req.headers['if-range'];
    }

    try {
      const result = await fetchWithValidatedRedirects(parsedUrl, reqHeaders, 15000);
      if (!result) {
        res.status(400).json({ error: 'Blocked redirect to unapproved destination.' });
        return;
      }

      const { response: upstream, finalUrl } = result;
      if (!upstream.ok && upstream.status !== 206) {
        res.status(upstream.status).json({ error: `Media upstream returned HTTP ${upstream.status}.` });
        return;
      }

      const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
        res.status(422).json({
          error: 'Upstream URL returned an HTML webpage instead of a playable media or playlist stream.',
        });
        return;
      }

      const pathPlusSearch = finalUrl.pathname + finalUrl.search;
      const isLikelyPlaylist =
        contentType.includes('mpegurl') ||
        contentType.includes('vnd.apple.mpegurl') ||
        /\.m3u8(\?|$)/i.test(pathPlusSearch);

      const isLikelySubtitle =
        contentType.includes('text/vtt') ||
        contentType.includes('subrip') ||
        /\.(vtt|srt)(\?|$)/i.test(pathPlusSearch);

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

      if (isLikelyPlaylist) {
        const playlistText = await upstream.text();
        if (playlistText.trimStart().startsWith('#EXTM3U')) {
          const refSuffix = parsedRef ? `&ref=${encodeURIComponent(parsedRef.toString())}` : '';
          const rewritten = rewriteHlsPlaylistForProxy(
            playlistText,
            finalUrl,
            '/api/stream-proxy',
            refSuffix
          );
          if (!hasRangeHeader) {
            if (playlistProxyCache.size >= PLAYLIST_PROXY_CACHE_MAX) {
              const oldestKey = playlistProxyCache.keys().next().value;
              if (oldestKey) playlistProxyCache.delete(oldestKey);
            }
            playlistProxyCache.set(playlistCacheKey, { body: rewritten, fetchedAt: Date.now() });
          }
          res.status(200);
          res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
          res.setHeader('Cache-Control', 'public, max-age=30');
          res.send(rewritten);
          return;
        }
        const normalizedSub =
          /\.srt(\?|$)/i.test(pathPlusSearch) || /^\s*\d+\r?\n\d{2}:\d{2}:\d{2},\d{3}\s*-->/.test(playlistText)
            ? convertSrtToWebVtt(playlistText)
            : playlistText;
        res.status(upstream.status);
        res.setHeader(
          'Content-Type',
          normalizedSub.trimStart().startsWith('WEBVTT')
            ? 'text/vtt; charset=utf-8'
            : contentType || 'text/plain; charset=utf-8'
        );
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(normalizedSub);
        return;
      }

      if (isLikelySubtitle) {
        const rawSub = await upstream.text();
        const isSrt =
          /\.srt(\?|$)/i.test(pathPlusSearch) ||
          /^\s*\d+\r?\n\d{2}:\d{2}:\d{2},\d{3}\s*-->/.test(rawSub);
        const body = isSrt ? convertSrtToWebVtt(rawSub) : rawSub;
        res.status(200);
        res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.send(body);
        return;
      }

      if (!upstream.body) {
        res.status(502).json({ error: 'Empty upstream media response body.' });
        return;
      }

      res.status(upstream.status);
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      } else {
        res.setHeader('Content-Type', 'application/octet-stream');
      }

      const contentLength = upstream.headers.get('content-length');
      const contentRange = upstream.headers.get('content-range');
      const acceptRanges = upstream.headers.get('accept-ranges') || 'bytes';
      if (contentLength) res.setHeader('Content-Length', contentLength);
      if (contentRange) res.setHeader('Content-Range', contentRange);
      res.setHeader('Accept-Ranges', acceptRanges);
      res.setHeader(
        'Cache-Control',
        upstream.status === 200 || /\.(ts|m4s|aac|mp4)(\?|$)/i.test(pathPlusSearch)
          ? 'public, max-age=3600'
          : 'no-store'
      );

      const nodeStream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
      req.on('close', () => nodeStream.destroy());
      nodeStream.pipe(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to proxy media stream';
      if (!res.headersSent) {
        res.status(502).json({ error: msg });
      }
    }
  });

  app.get('/api/jellyfin-stream/:itemId/*', async (req, res) => {
    const jellyfinBaseRaw = (process.env.JELLYFIN_URL || '').trim().replace(/\/+$/, '');
    const jellyfinKey = (process.env.JELLYFIN_API_KEY || '').trim();
    const jellyfinBase = jellyfinBaseRaw ? isAllowedRemoteUrl(jellyfinBaseRaw) : null;
    const itemId = typeof req.params.itemId === 'string' ? req.params.itemId.trim() : '';
    const wildcardParams = req.params as Record<string, string>;
    const subpath = (wildcardParams['0'] || 'master.m3u8').replace(/^\/+/, '');

    if (!jellyfinBase || !jellyfinKey) {
      res.status(503).json({ error: 'Jellyfin server is not configured.' });
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(itemId) || !subpath || subpath.includes('..')) {
      res.status(400).json({ error: 'Invalid Jellyfin item or path.' });
      return;
    }

    const targetUrl = new URL(`${jellyfinBase.origin}/Videos/${itemId}/${subpath}`);
    for (const [k, v] of Object.entries(req.query)) {
      if (typeof v === 'string' && k.toLowerCase() !== 'api_key') {
        targetUrl.searchParams.set(k, v);
      }
    }
    if (subpath.endsWith('master.m3u8') && !targetUrl.searchParams.has('MediaSourceId')) {
      targetUrl.searchParams.set('MediaSourceId', itemId);
    }

    const reqHeaders: Record<string, string> = {
      'X-Emby-Token': jellyfinKey,
    };
    if (typeof req.headers.range === 'string') {
      reqHeaders.Range = req.headers.range;
    }

    try {
      const upstream = await fetch(targetUrl.toString(), {
        headers: reqHeaders,
        signal: AbortSignal.timeout(15000),
      });
      if (!upstream.ok && upstream.status !== 206) {
        res.status(upstream.status).json({ error: `Jellyfin returned HTTP ${upstream.status}` });
        return;
      }

      const ct = (upstream.headers.get('content-type') || '').toLowerCase();
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (ct.includes('mpegurl') || subpath.endsWith('.m3u8')) {
        const playlist = await upstream.text();
        const rewritten = playlist
          .split(/\r?\n/)
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) return line;
            try {
              const resolved = new URL(trimmed, targetUrl);
              if (resolved.origin !== jellyfinBase.origin) return line;
              const prefix = `/Videos/${itemId}/`;
              const rel = resolved.pathname.startsWith(prefix)
                ? resolved.pathname.slice(prefix.length)
                : resolved.pathname.replace(/^\/+/, '');
              return `/api/jellyfin-stream/${encodeURIComponent(itemId)}/${rel}${resolved.search}`;
            } catch {
              return line;
            }
          })
          .join('\n');
        res.status(200);
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.send(rewritten);
        return;
      }

      if (!upstream.body) {
        res.status(502).end();
        return;
      }
      res.status(upstream.status);
      if (ct) res.setHeader('Content-Type', ct);
      const cl = upstream.headers.get('content-length');
      const cr = upstream.headers.get('content-range');
      if (cl) res.setHeader('Content-Length', cl);
      if (cr) res.setHeader('Content-Range', cr);
      res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');

      const nodeStream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
      req.on('close', () => nodeStream.destroy());
      nodeStream.pipe(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Jellyfin proxy error';
      if (!res.headersSent) res.status(502).json({ error: msg });
    }
  });

  app.get('/api/download-stream', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    const rawFilename =
      typeof req.query.filename === 'string' ? req.query.filename : 'MullahMax_Video.mp4';
    const isCheckOnly = req.query.check === '1';

    const parsedUrl = isAllowedRemoteUrl(rawUrl);
    if (!parsedUrl) {
      res.status(400).json({ error: 'Please provide a valid public http(s) video stream URL.' });
      return;
    }

    const safeFilename = sanitizeDownloadFilename(rawFilename);
    const isHlsPlaylist = /\.m3u8(\?|$)/i.test(parsedUrl.toString());

    try {
      const probeRes = await fetch(parsedUrl.toString(), {
        method: isHlsPlaylist ? 'GET' : 'HEAD',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Referer: `${parsedUrl.origin}/`,
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!probeRes.ok) {
        const fallbackProbe = await fetch(parsedUrl.toString(), {
          method: 'GET',
          headers: {
            Range: 'bytes=0-1',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            Referer: `${parsedUrl.origin}/`,
          },
          signal: AbortSignal.timeout(12000),
        });

        if (!fallbackProbe.ok) {
          res.status(422).json({
            error: `Stream server returned HTTP ${fallbackProbe.status} for this link.`,
          });
          return;
        }
      }

      const contentType = (probeRes.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('text/html')) {
        res.status(422).json({
          error:
            'This URL points to a webpage rather than a direct .mp4 or .m3u8 stream file.',
        });
        return;
      }

      const detectedHls =
        isHlsPlaylist ||
        contentType.includes('mpegurl') ||
        contentType.includes('vnd.apple.mpegurl');

      if (isCheckOnly) {
        res.json({ ok: true, mode: detectedHls ? 'hls' : 'direct', filename: safeFilename });
        return;
      }

      if (detectedHls) {
        const ffmpeg = spawn('ffmpeg', [
          '-loglevel',
          'error',
          '-y',
          '-headers',
          `Referer: ${parsedUrl.origin}/\r\nUser-Agent: Mozilla/5.0\r\n`,
          '-i',
          parsedUrl.toString(),
          '-c',
          'copy',
          '-bsf:a',
          'aac_adtstoasc',
          '-f',
          'mp4',
          '-movflags',
          'frag_keyframe+empty_moov',
          'pipe:1',
        ]);

        let downloadHeadersSet = false;
        const ensureDownloadHeaders = () => {
          if (downloadHeadersSet || res.headersSent) return;
          downloadHeadersSet = true;
          res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
          res.setHeader('Content-Type', 'video/mp4');
          res.setHeader('Cache-Control', 'no-store');
        };

        req.on('close', () => {
          if (!ffmpeg.killed) {
            ffmpeg.kill('SIGTERM');
          }
        });

        ffmpeg.stderr.on('data', (chunk) => {
          console.warn('[ffmpeg download-stream]', String(chunk).trim());
        });

        ffmpeg.on('error', (err) => {
          console.error('[ffmpeg spawn error]', err);
          if (!res.headersSent) {
            res.status(501).json({ error: 'HLS remuxing is unavailable in this environment.' });
          }
        });

        ffmpeg.stdout.once('data', () => {
          ensureDownloadHeaders();
        });
        ffmpeg.stdout.pipe(res);
        return;
      }

      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Cache-Control', 'no-store');

      const upstream = await fetch(parsedUrl.toString(), {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Referer: `${parsedUrl.origin}/`,
        },
      });

      if (!upstream.ok || !upstream.body) {
        res.status(422).json({ error: `Unable to fetch stream (HTTP ${upstream.status}).` });
        return;
      }

      const contentLength = upstream.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      const nodeStream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
      req.on('close', () => {
        nodeStream.destroy();
      });
      nodeStream.pipe(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download stream error';
      if (!res.headersSent) {
        res.status(502).json({ error: msg });
      }
    }
  });

  app.get('/api/embed-shield', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    let currentUrl = isAllowedEmbedShieldUrl(rawUrl);
    if (!currentUrl) {
      res.status(400).send('Invalid or unapproved embed URL.');
      return;
    }

    try {
      let upstream: globalThis.Response | null = null;
      for (let hop = 0; hop < 4; hop++) {
        const candidate = await fetch(currentUrl.toString(), {
          redirect: 'manual',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            Referer: `${currentUrl.origin}/`,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          signal: AbortSignal.timeout(10000),
        });

        if (candidate.status >= 300 && candidate.status < 400) {
          const location = candidate.headers.get('location');
          if (!location) break;
          const nextUrl = isAllowedEmbedShieldUrl(new URL(location, currentUrl).toString());
          if (!nextUrl) {
            res.status(400).send('Blocked redirect to unapproved origin.');
            return;
          }
          currentUrl = nextUrl;
          continue;
        }

        upstream = candidate;
        break;
      }

      if (!upstream) {
        res.status(502).send('Too many redirects from embed upstream.');
        return;
      }

      const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('text/html') && !contentType.includes('xhtml')) {
        res.status(upstream.status).type(contentType || 'text/plain').send(await upstream.text());
        return;
      }

      const baseUrl: URL = currentUrl;
      let html = await upstream.text();

      html = html.replace(
        /<script\b[^>]*\bsrc\s*=\s*["'][^"']*(?:popads|popcash|propeller|adsterra|monetag|exoclick|juicyads|hilltopads|acscdn|onmarshtomorrow|onclickalgo|onclkds|doubleclick|googlesyndication|histats|ad-maven|bidvertiser|trafficjunky|clksite|clickadu|realsrv|trackwill|tsyndicate|createlouisville|tagivi|disable-devtool|adserver)[^"']*["'][^>]*>[\s\S]*?<\/script>/gi,
        ''
      );
      html = html.replace(
        /<script\b[^>]*>[\s\S]*?(?:Histats|popunder|onclickalgo|onmarshtomorrow|disable-devtool)[\s\S]*?<\/script>/gi,
        ''
      );
      html = html.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '');

      html = html.replace(
        /(<iframe\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'][^>]*>)/gi,
        (full, prefix: string, srcVal: string, suffix: string) => {
          try {
            const absUrl = new URL(srcVal, baseUrl).toString();
            const parsedNested = isAllowedEmbedShieldUrl(absUrl);
            if (parsedNested && !parsedNested.hostname.includes('vidsrc.sh')) {
              return `${prefix}/api/embed-shield?url=${encodeURIComponent(absUrl)}${suffix}`;
            }
          } catch {
            // Keep original attribute if malformed
          }
          return full;
        }
      );

      const safeOriginAttr = baseUrl.origin.replace(/["'<>]/g, '');
      const injectedHeadPayload = `<base href="${safeOriginAttr}/">\n${INFRAME_SHIELD_SCRIPT}`;

      if (/<head\b[^>]*>/i.test(html)) {
        html = html.replace(/<head\b[^>]*>/i, (match) => `${match}\n${injectedHeadPayload}`);
      } else {
        html = `${injectedHeadPayload}\n${html}`;
      }

      res.status(upstream.status);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(html);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to shield embed frame';
      res.status(502).send(msg);
    }
  });

  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });

  return app;
}
