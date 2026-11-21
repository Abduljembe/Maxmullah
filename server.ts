import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const DATA_DIR = path.resolve(__dirname, 'data');
const STREAMS_STORE_PATH = path.join(DATA_DIR, 'streams-library.json');

interface TMDBConfigurationPayload {
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
  updatedAt: string;
}

const vixsrcIndexCache = new Map<string, VixSrcIndexStore>();
const tmdbMetadataCache = new Map<string, { data: Record<string, unknown>; fetchedAt: number }>();
const tmdbProxyCache = new Map<string, { data: unknown; fetchedAt: number }>();
const externalIdCache = new Map<string, { imdbId: string | null; fetchedAt: number }>();
const searchCache = new Map<string, { results: Record<string, unknown>[]; fetchedAt: number }>();
const malIdCache = new Map<string, { malId: number | null; fetchedAt: number }>();
const serverSourcesCache = new Map<string, { data: Record<string, unknown>; fetchedAt: number }>();
let tmdbConfigCache: { data: TMDBConfigurationPayload; fetchedAt: number } | null = null;

const INDEX_CACHE_TTL_MS = 30 * 60 * 1000;
const TMDB_CACHE_TTL_MS = 60 * 60 * 1000;
const TMDB_CONFIG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TMDB_PROXY_CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const SERVER_SOURCES_CACHE_TTL_MS = 10 * 60 * 1000;

let streamsStoreCache: Record<string, SavedStreamEntry> | null = null;

async function readStreamsStore(): Promise<Record<string, SavedStreamEntry>> {
  if (streamsStoreCache) return streamsStoreCache;
  try {
    const raw = await fs.readFile(STREAMS_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, SavedStreamEntry>;
    streamsStoreCache = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    streamsStoreCache = {};
  }
  return streamsStoreCache;
}

async function writeStreamsStore(store: Record<string, SavedStreamEntry>): Promise<void> {
  streamsStoreCache = store;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STREAMS_STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function makeStreamKey(type: 'movie' | 'tv', id: string, season = 1, episode = 1): string {
  return type === 'tv' ? `tv:${id}:s${season}e${episode}` : `movie:${id}`;
}

async function getVixSrcIndexStore(type: 'movie' | 'tv', lang?: string): Promise<VixSrcIndexStore> {
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

  // Primary: AniList GraphQL (fast & exposes verified MyAnimeList `idMal`)
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

  // Secondary fallback: Jikan / MyAnimeList public search
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
        // Hydrate moviedb_id in parallel for top hits so VidLink / VidFast / VixSrc work cleanly
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

async function fetchCinemetaCatalogFallback(
  type: 'movie' | 'tv',
  catalogName: 'top' | 'imdbRating' = 'top'
): Promise<{ results: Record<string, unknown>[]; total_pages: number; total_results: number }> {
  const cmType = type === 'tv' ? 'series' : 'movie';
  try {
    const res = await fetch(`https://v3-cinemeta.strem.io/catalog/${cmType}/${catalogName}.json`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { results: [], total_pages: 1, total_results: 0 };
    const data = (await res.json()) as { metas?: CinemetaItem[] };
    const metas = (data?.metas || []).slice(0, 20);
    const results = metas.map((m) => mapCinemetaToTMDBShape(m, type));
    return { results, total_pages: 1, total_results: results.length };
  } catch {
    return { results: [], total_pages: 1, total_results: 0 };
  }
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

const EMBED_SHIELD_ALLOWED_HOSTS = new Set([
  '2embed.cc',
  'www.2embed.cc',
  'vidsrc.to',
  'www.vidsrc.to',
  'vidsrc.sh',
  'www.vidsrc.sh',
  'vidsrc.me',
  'www.vidsrc.me',
  'vidsrc.xyz',
  'www.vidsrc.xyz',
  'multiembed.mov',
  'www.multiembed.mov',
  'player.videasy.net',
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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  /**
   * Persistent Custom / CDN Direct Stream Registry (supports Cloudflare R2, BunnyCDN, S3, .m3u8, .mp4).
   * Allows binding verified direct streams per TMDB/IMDb title so playback runs natively with 0 ads.
   */
  app.get('/api/streams', async (req, res) => {
    const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
    const type = req.query.type === 'series' || req.query.type === 'tv' ? 'tv' : 'movie';
    const season = Math.max(1, parseInt(String(req.query.season || '1'), 10) || 1);
    const episode = Math.max(1, parseInt(String(req.query.episode || '1'), 10) || 1);
    const store = await readStreamsStore();

    if (!id) {
      res.json({ streams: store });
      return;
    }

    const key = makeStreamKey(type, id, season, episode);
    res.json({ entry: store[key] || null });
  });

  app.post('/api/streams', async (req, res) => {
    const { id, type, season = 1, episode = 1, url, title } = (req.body || {}) as {
      id?: string | number;
      type?: string;
      season?: number;
      episode?: number;
      url?: string;
      title?: string;
    };

    const targetId = String(id || '').trim();
    const mediaType: 'movie' | 'tv' = type === 'series' || type === 'tv' ? 'tv' : 'movie';
    const cleanUrl = typeof url === 'string' ? url.trim() : '';

    if (!targetId || !isAllowedRemoteUrl(cleanUrl)) {
      res.status(400).json({ error: 'Valid id and public http(s) stream URL are required.' });
      return;
    }

    const store = await readStreamsStore();
    const key = makeStreamKey(mediaType, targetId, Math.max(1, Number(season) || 1), Math.max(1, Number(episode) || 1));
    const entry: SavedStreamEntry = {
      url: cleanUrl,
      title: typeof title === 'string' ? title.slice(0, 140) : undefined,
      updatedAt: new Date().toISOString(),
    };
    store[key] = entry;
    await writeStreamsStore(store);
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
    res.json({ ok: true });
  });

  /**
   * TMDB v3 /3/configuration endpoint (cached 24h, authenticated via Bearer token or API key).
   * Returns image CDN base URLs, supported size arrays, change_keys, and credential status.
   */
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

  /**
   * Universal Server-Side TMDB Proxy (/api/tmdb/*)
   * Uses server-side TMDB_READ_ACCESS_TOKEN (Bearer) or TMDB_API_KEY and
   * automatically falls back to zero-key Cinemeta catalog if TMDB is unconfigured or rate-limited.
   */
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

    // Zero-key Cinemeta fallback if TMDB credentials are not set or TMDB is unreachable
    const isTv = tmdbSubpath.includes('tv');
    const queryParam = typeof req.query.query === 'string' ? req.query.query.trim() : '';
    if (queryParam) {
      const results = await searchCinemeta(queryParam, isTv ? 'tv' : 'movie');
      res.json({ results, total_pages: 1, total_results: results.length });
      return;
    }
    const fallback = await fetchCinemetaCatalogFallback(
      isTv ? 'tv' : 'movie',
      tmdbSubpath.includes('top_rated') ? 'imdbRating' : 'top'
    );
    res.json(fallback);
  });

  /**
   * Reliable server-side search proxy across TMDB (Bearer/API Key) + Zero-Key Cinemeta fallback.
   */
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

    // Seamless Zero-Key Cinemeta Search Fallback
    const cmResults = await searchCinemeta(query, 'all');
    if (cmResults.length > 0) {
      searchCache.set(cacheKey, { results: cmResults, fetchedAt: Date.now() });
    }
    res.json({ results: cmResults });
  });

  /**
   * Fetches real indexed movies & TV series directly from VixSrc catalog servers
   * and hydrates them with metadata/posters from TMDB.
   */
  app.get('/api/servers/catalog', async (req, res) => {
    const rawType = req.query.type === 'tv' ? 'tv' : 'movie';
    const lang = typeof req.query.lang === 'string' && req.query.lang !== 'all' ? req.query.lang.trim() : '';
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const pageSize = 20;

    try {
      const store = await getVixSrcIndexStore(rawType, lang || undefined);
      const index = store.data;
      if (index.length === 0) {
        res.json({ items: [], page, totalPages: 1, totalResults: 0 });
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

      const items = hydrated.filter((item): item is Record<string, unknown> => item !== null);
      res.json({
        items,
        page,
        totalPages,
        totalResults,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Server catalog error';
      res.status(502).json({ error: msg, items: [], page, totalPages: 1, totalResults: 0 });
    }
  });

  /**
   * Smart Per-Title Availability & ID Resolver:
   * 1. Checks saved custom/CDN direct stream library first.
   * 2. Resolves missing TMDB ID from IMDb ID (via VixSrc index, TMDB /find, or Cinemeta) & missing IMDb ID via TMDB external_ids.
   * 3. Checks VixSrc (O(1) verified index), PrimeSrc (live hosts), and VidLink/VidFast in parallel.
   * 4. Returns `recommendedServer`, `resolvedTmdbId`, `resolvedImdbId`, and `directStreamUrl` so searched titles play reliably.
   */
  app.get('/api/servers/sources', async (req, res) => {
    const rawTmdbId = parseInt(String(req.query.tmdbId || '0'), 10);
    const initialImdbId = typeof req.query.imdbId === 'string' ? req.query.imdbId.trim() : '';
    const titleHint = typeof req.query.title === 'string' ? req.query.title.trim() : '';
    const isAnimeHint = req.query.isAnime === '1';
    const type = req.query.type === 'series' || req.query.type === 'tv' ? 'tv' : 'movie';
    const season = Math.max(1, parseInt(String(req.query.season || '1'), 10) || 1);
    const episode = Math.max(1, parseInt(String(req.query.episode || '1'), 10) || 1);

    if (!rawTmdbId && !initialImdbId) {
      res.status(400).json({ error: 'tmdbId or imdbId is required' });
      return;
    }

    try {
      const vixStore = await getVixSrcIndexStore(type);
      let tmdbId = rawTmdbId;

      if (!tmdbId && initialImdbId.startsWith('tt')) {
        const vixMatch = vixStore.data.find((entry) => entry.imdb_id === initialImdbId && entry.tmdb_id > 0);
        if (vixMatch) {
          tmdbId = vixMatch.tmdb_id;
        }
      }

      if (!tmdbId && initialImdbId.startsWith('tt')) {
        const findData = await fetchTMDB<{
          movie_results?: Array<{ id: number }>;
          tv_results?: Array<{ id: number }>;
        }>(`find/${encodeURIComponent(initialImdbId)}`, { external_source: 'imdb_id' }, 4000);
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

      const probeEmbedAvailability = async (url: string, timeoutMs = 2400): Promise<boolean> => {
        try {
          const r = await fetch(url, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
            },
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (r.status !== 200) return false;
          const html = await r.text();
          if (html.length < 400) return false;
          if (
            /attention required|you have been blocked|cf-error-details|just a moment|404 not found|page not found|media unavailable|no media found/i.test(
              html.slice(0, 4000)
            )
          ) {
            return false;
          }
          return true;
        } catch {
          return false;
        }
      };

      const targetId = tmdbId > 0 ? String(tmdbId) : initialImdbId;
      const cacheKey = `${type}:${targetId}:s${season}e${episode}:${isAnimeHint ? titleHint.toLowerCase() : ''}`;
      const cachedSources = serverSourcesCache.get(cacheKey);
      const streamsStore = await readStreamsStore();
      const savedDirectCheck =
        streamsStore[makeStreamKey(type, targetId, season, episode)] ||
        (initialImdbId ? streamsStore[makeStreamKey(type, initialImdbId, season, episode)] : undefined);

      if (cachedSources && Date.now() - cachedSources.fetchedAt < SERVER_SOURCES_CACHE_TTL_MS) {
        res.json({
          ...cachedSources.data,
          directStreamUrl: savedDirectCheck?.url || cachedSources.data.directStreamUrl,
        });
        return;
      }

      const targetParam = tmdbId > 0 ? `tmdb=${tmdbId}` : `imdb=${encodeURIComponent(initialImdbId)}`;
      const primeUrl =
        type === 'tv'
          ? `https://primesrc.me/api/v1/s?${targetParam}&season=${season}&episode=${episode}&type=tv`
          : `https://primesrc.me/api/v1/s?${targetParam}&type=movie`;
      const vidlinkUrl =
        type === 'tv'
          ? `https://vidlink.pro/tv/${targetId}/${season}/${episode}`
          : `https://vidlink.pro/movie/${targetId}`;
      const vidfastUrl =
        type === 'tv'
          ? `https://vidfast.pro/tv/${targetId}/${season}/${episode}`
          : `https://vidfast.pro/movie/${targetId}`;
      const videasyUrl =
        type === 'tv'
          ? `https://player.videasy.net/tv/${targetId}/${season}/${episode}`
          : `https://player.videasy.net/movie/${targetId}`;
      const vixEmbedUrl =
        type === 'tv'
          ? `https://vixsrc.to/tv/${targetId}/${season}/${episode}`
          : `https://vixsrc.to/movie/${targetId}`;
      const vidsrcShUrl =
        type === 'tv'
          ? `https://vidsrc.sh/embed/tv?tmdb=${targetId}&season=${season}&episode=${episode}`
          : `https://vidsrc.sh/embed/movie?tmdb=${targetId}`;
      const twoEmbedUrl =
        type === 'tv'
          ? `https://www.2embed.cc/embedtv/${targetId}&s=${season}&e=${episode}`
          : `https://www.2embed.cc/embed/${targetId}`;

      const [
        primeResult,
        vidlinkOk,
        vidfastOk,
        videasyOk,
        vixEmbedOk,
        vidsrcShOk,
        twoEmbedOk,
        resolvedImdb,
        resolvedMalId,
      ] = await Promise.all([
        fetch(primeUrl, {
          headers: {
            Referer:
              type === 'tv'
                ? `https://primesrc.me/embed/tv?${targetParam}&season=${season}&episode=${episode}`
                : `https://primesrc.me/embed/movie?${targetParam}`,
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(2400),
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        tmdbId > 0 ? probeEmbedAvailability(vidlinkUrl) : Promise.resolve(false),
        tmdbId > 0 ? probeEmbedAvailability(vidfastUrl) : Promise.resolve(false),
        tmdbId > 0 ? probeEmbedAvailability(videasyUrl) : Promise.resolve(false),
        tmdbId > 0 ? probeEmbedAvailability(vixEmbedUrl, 2000) : Promise.resolve(false),
        tmdbId > 0 ? probeEmbedAvailability(vidsrcShUrl) : Promise.resolve(false),
        tmdbId > 0 ? probeEmbedAvailability(twoEmbedUrl) : Promise.resolve(false),
        !initialImdbId && tmdbId > 0
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
      const savedDirectEntry =
        savedDirectCheck ||
        (finalImdbId ? streamsStore[makeStreamKey(type, finalImdbId, season, episode)] : undefined);

      const inVixCatalog =
        (tmdbId > 0 && vixStore.tmdbSet.has(tmdbId)) ||
        Boolean(finalImdbId && vixStore.imdbSet.has(finalImdbId));
      const vixsrcAvailable = inVixCatalog && vixEmbedOk;

      const verifiedServers: Array<'vidlink' | 'vidfast' | 'videasy' | 'vixsrc' | 'vidsrc_sh' | '2embed'> = [];
      if (vidlinkOk) verifiedServers.push('vidlink');
      if (vidfastOk) verifiedServers.push('vidfast');
      if (videasyOk) verifiedServers.push('videasy');
      if (vixsrcAvailable) verifiedServers.push('vixsrc');
      if (vidsrcShOk) verifiedServers.push('vidsrc_sh');
      if (twoEmbedOk) verifiedServers.push('2embed');

      const availableServers =
        verifiedServers.length > 0
          ? verifiedServers
          : (['vidlink', 'vidfast', 'vidsrc_sh', '2embed'] as const);

      const recommendedServer = availableServers[0];

      const payload = {
        directStreamUrl: savedDirectEntry?.url,
        vidlinkAvailable: vidlinkOk,
        vidfastAvailable: vidfastOk,
        videasyAvailable: videasyOk,
        vixsrcAvailable,
        availableServers,
        primeSrcHosts,
        resolvedTmdbId: tmdbId > 0 ? tmdbId : undefined,
        resolvedImdbId: finalImdbId,
        resolvedMalId: resolvedMalId || undefined,
        recommendedServer,
        info: primeInfo,
      };
      serverSourcesCache.set(cacheKey, { data: payload, fetchedAt: Date.now() });
      res.json(payload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to probe server sources';
      res.status(502).json({
        error: msg,
        vidlinkAvailable: false,
        vixsrcAvailable: false,
        primeSrcHosts: [],
      });
    }
  });

  /**
   * Genuine per-movie download stream endpoint.
   */
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

      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Cache-Control', 'no-store');

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
            res.status(500).json({ error: 'Unable to remux HLS video stream.' });
          }
        });

        ffmpeg.stdout.pipe(res);
        return;
      }

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

  /**
   * JS-Injected Anti-Redirect & Anti-Popunder Shield Proxy (/api/embed-shield)
   * Fetches allowlisted external embed pages, strips popunder/ad scripts and meta refreshes,
   * sets <base href> to the upstream origin, and injects the client-side anti-redirect JS guard.
   */
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

      // 1. Strip known popunder, ad-network, and histats scripts + meta refresh redirects
      html = html.replace(
        /<script\b[^>]*\bsrc\s*=\s*["'][^"']*(?:popads|popcash|propeller|adsterra|monetag|exoclick|juicyads|hilltopads|acscdn|onmarshtomorrow|onclickalgo|onclkds|doubleclick|googlesyndication|histats|ad-maven|bidvertiser|trafficjunky|clksite|clickadu|realsrv|trackwill|tsyndicate|createlouisville|tagivi|disable-devtool|adserver)[^"']*["'][^>]*>[\s\S]*?<\/script>/gi,
        ''
      );
      html = html.replace(
        /<script\b[^>]*>[\s\S]*?(?:Histats|popunder|onclickalgo|onmarshtomorrow|disable-devtool)[\s\S]*?<\/script>/gi,
        ''
      );
      html = html.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, '');

      // 2. Recursively shield nested allowlisted embed iframes (e.g. vidsrc.to -> vidsrc.sh)
      html = html.replace(
        /(<iframe\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'][^>]*>)/gi,
        (full, prefix: string, srcVal: string, suffix: string) => {
          try {
            const absUrl = new URL(srcVal, baseUrl).toString();
            if (isAllowedEmbedShieldUrl(absUrl)) {
              return `${prefix}/api/embed-shield?url=${encodeURIComponent(absUrl)}${suffix}`;
            }
          } catch {
            // Keep original attribute if malformed
          }
          return full;
        }
      );

      // 3. Inject <base> to preserve upstream relative assets + inject early JS Anti-Redirect Shield
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

  // Never let unknown /api/* routes fall through to SPA HTML
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });

  if (process.env.NODE_ENV !== 'production') {
    app.get('/@vite/client', (_req, res) => {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.send(`
const sheetsMap = new Map();
function updateStyle(id, content) {
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
}
function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style) {
    style.remove();
    sheetsMap.delete(id);
  }
}
function injectQuery(id) {
  return id;
}
function createHotContext() {
  return {
    accept() {},
    acceptDeps() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    decline() {},
    invalidate() {},
    on() {},
    off() {},
    send() {},
    data: {},
  };
}
class ErrorOverlay extends HTMLElement {}
export { ErrorOverlay, createHotContext, injectQuery, removeStyle, updateStyle };
`);
    });

    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir, { maxAge: '7d', index: false }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MullahMax server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
