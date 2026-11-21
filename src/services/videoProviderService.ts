import { MediaItem } from '../types';
import { wrapWithEmbedShieldProxy } from '../utils/adBlocker';

export type VideoStreamProvider =
  | 'vidlink'
  | 'vidfast'
  | 'videasy'
  | 'vixsrc'
  | 'primesrc'
  | 'superembed'
  | 'vidsrc_sh'
  | '2embed'
  | 'vidsrc'
  | 'custom';

export type VidukiServerId = 1 | 2 | 3 | 4;
export type AnyServerId =
  | 'vidlink'
  | 'vidfast'
  | 'videasy'
  | 'vixsrc'
  | 'primesrc'
  | 'superembed'
  | 'vidsrc_sh'
  | '2embed'
  | 'vidsrc';

export interface VidukiServerDefinition {
  id: AnyServerId;
  name: string;
  tag: string;
  badge: string;
  description: string;
  adFree: boolean;
  latencyMs: number;
}

export const VIDUKI_SERVERS: VidukiServerDefinition[] = [
  {
    id: 'vidfast',
    name: 'VidFast',
    tag: 'Ad-Free · Turbo',
    badge: 'VidFast',
    description: 'Zero popups with adaptive HLS streaming and auto-next episode.',
    adFree: true,
    latencyMs: 45,
  },
  {
    id: 'primesrc',
    name: 'PrimeSrc Multi-Host',
    tag: 'Multi-Host',
    badge: 'PrimeSrc',
    description: 'Aggregates Filemoon, Voe, Luluvdoo, Streamtape, Mixdrop, Dood & Vidmoly.',
    adFree: true,
    latencyMs: 55,
  },
  {
    id: 'vidlink',
    name: 'VidLink',
    tag: 'Auto-Fallback',
    badge: 'VidLink',
    description: 'Fast HD player with automatic fallback mirror if unavailable.',
    adFree: true,
    latencyMs: 65,
  },
  {
    id: 'videasy',
    name: 'Videasy',
    tag: 'Ad-Free · Smooth',
    badge: 'Videasy',
    description: 'Smooth low-buffer stream with multi-language subtitles.',
    adFree: true,
    latencyMs: 75,
  },
  {
    id: 'vixsrc',
    name: 'VixSrc HD',
    tag: '4K · Multi-Audio',
    badge: 'VixSrc',
    description: '4K & HD multi-audio stream (may require direct region access if Cloudflare protected).',
    adFree: true,
    latencyMs: 90,
  },
  {
    id: 'superembed',
    name: 'MultiEmbed',
    tag: 'Backup',
    badge: 'MultiEmbed',
    description: 'Worldwide multi-region backup stream mirror.',
    adFree: false,
    latencyMs: 135,
  },
  {
    id: 'vidsrc_sh',
    name: 'VidSrc Edge',
    tag: 'Backup',
    badge: 'VidSrc Edge',
    description: 'Cloudflare edge backup mirror.',
    adFree: false,
    latencyMs: 155,
  },
  {
    id: '2embed',
    name: '2Embed',
    tag: 'Backup',
    badge: '2Embed',
    description: 'Secondary mirror across older catalog titles.',
    adFree: false,
    latencyMs: 170,
  },
  {
    id: 'vidsrc',
    name: 'VidSrc Pro',
    tag: 'Backup',
    badge: 'VidSrc Pro',
    description: 'Legacy IMDb/TMDB stream mirror.',
    adFree: false,
    latencyMs: 185,
  },
];

const VALID_SERVER_IDS = new Set<string>(VIDUKI_SERVERS.map((s) => s.id));

export function isAdFreeServer(serverId: AnyServerId): boolean {
  return Boolean(VIDUKI_SERVERS.find((s) => s.id === serverId)?.adFree);
}

export function getNextFastestServer(currentServer: AnyServerId): AnyServerId {
  const order: AnyServerId[] = [
    'vidfast',
    'primesrc',
    'vidlink',
    'videasy',
    'vixsrc',
    'superembed',
    'vidsrc_sh',
    '2embed',
    'vidsrc',
  ];
  const idx = order.indexOf(currentServer);
  if (idx === -1 || idx === order.length - 1) {
    return order[0];
  }
  return order[idx + 1];
}

export interface VideoProviderConfig {
  provider: VideoStreamProvider;
  vidukiServer: AnyServerId;
  accentColor: string; // hex color without # (e.g. B20710)
  secondaryColor: string; // hex color without # (default: 170000)
  autoplay: boolean;
  preferredLang: string; // e.g. '' (auto) | 'en' | 'it' | 'es' | 'fr' | 'de'
  adShieldEnabled: boolean;
  customTemplate: string;
}

export interface VixSrcPlayerEvent {
  type: 'PLAYER_EVENT';
  data: {
    event: 'play' | 'pause' | 'seeked' | 'ended' | 'timeupdate';
    currentTime: number;
    duration: number;
    video_id: number;
  };
}

const STORAGE_KEY_PROVIDER = 'mullahmax_video_provider_cfg_v10';
const STORAGE_KEY_RESUME_PREFIX = 'mullahmax_resume_sec_';

const DEFAULT_CONFIG: VideoProviderConfig = {
  provider: 'vidfast',
  vidukiServer: 'vidfast',
  accentColor: 'B20710',
  secondaryColor: '170000',
  autoplay: true,
  preferredLang: '',
  adShieldEnabled: true,
  customTemplate:
    'https://vixsrc.to/movie/{id}?primaryColor=B20710&secondaryColor=170000&autoplay=true',
};

function sanitizeHexColor(raw: string | undefined, fallback: string): string {
  const cleaned = (raw || '').replace(/#/g, '').trim();
  return /^[0-9a-fA-F]{3,8}$/.test(cleaned) ? cleaned : fallback;
}

export function getVideoProviderConfig(): VideoProviderConfig {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROVIDER);
    if (raw) {
      const parsed = JSON.parse(raw);
      const savedServer = VALID_SERVER_IDS.has(parsed.vidukiServer)
        ? (parsed.vidukiServer as AnyServerId)
        : 'vidfast';
      return {
        provider: VALID_SERVER_IDS.has(parsed.provider) ? parsed.provider : savedServer,
        vidukiServer: savedServer,
        accentColor: sanitizeHexColor(parsed.accentColor, DEFAULT_CONFIG.accentColor),
        secondaryColor: sanitizeHexColor(parsed.secondaryColor, DEFAULT_CONFIG.secondaryColor),
        autoplay: typeof parsed.autoplay === 'boolean' ? parsed.autoplay : DEFAULT_CONFIG.autoplay,
        preferredLang: typeof parsed.preferredLang === 'string' ? parsed.preferredLang : '',
        adShieldEnabled:
          typeof parsed.adShieldEnabled === 'boolean'
            ? parsed.adShieldEnabled
            : DEFAULT_CONFIG.adShieldEnabled,
        customTemplate: parsed.customTemplate || DEFAULT_CONFIG.customTemplate,
      };
    }
  } catch {}
  return { ...DEFAULT_CONFIG };
}

export function saveVideoProviderConfig(config: VideoProviderConfig) {
  try {
    const validServer = VALID_SERVER_IDS.has(config.vidukiServer) ? config.vidukiServer : 'vidfast';
    const cleaned: VideoProviderConfig = {
      ...config,
      vidukiServer: validServer,
      accentColor: sanitizeHexColor(config.accentColor, DEFAULT_CONFIG.accentColor),
      secondaryColor: sanitizeHexColor(config.secondaryColor, DEFAULT_CONFIG.secondaryColor),
      autoplay: Boolean(config.autoplay),
      preferredLang: (config.preferredLang || '').trim(),
      adShieldEnabled: config.adShieldEnabled !== false,
    };
    localStorage.setItem(STORAGE_KEY_PROVIDER, JSON.stringify(cleaned));
  } catch {}
}

export function getSavedResumeSeconds(mediaId: string, season = 1, episode = 1): number {
  if (typeof window === 'undefined') return 0;
  try {
    const key = `${STORAGE_KEY_RESUME_PREFIX}${mediaId}_s${season}e${episode}`;
    const raw = localStorage.getItem(key);
    const secs = raw ? Math.floor(Number(raw)) : 0;
    return Number.isFinite(secs) && secs > 5 ? secs : 0;
  } catch {
    return 0;
  }
}

export function saveResumeSeconds(
  mediaId: string,
  seconds: number,
  season = 1,
  episode = 1
): void {
  if (typeof window === 'undefined') return;
  try {
    const key = `${STORAGE_KEY_RESUME_PREFIX}${mediaId}_s${season}e${episode}`;
    const cleanSecs = Math.max(0, Math.floor(seconds));
    if (cleanSecs > 0) {
      localStorage.setItem(key, String(cleanSecs));
    } else {
      localStorage.removeItem(key);
    }
  } catch {}
}

/**
 * Resolves the cleanest TMDB ID or IMDb ID for a media item.
 */
export function resolveTargetIdentifier(media: MediaItem): string {
  if (media.tmdbId && media.tmdbId > 0) {
    return String(media.tmdbId);
  }

  if (media.imdbId && media.imdbId.trim()) {
    return media.imdbId.trim();
  }

  if (media.id && /^tt\d+$/i.test(media.id)) {
    return media.id;
  }

  const tmdbMatch = media.id?.match(/tmdb-(?:movie|tv)-(\d+)/i);
  if (tmdbMatch && tmdbMatch[1]) {
    return tmdbMatch[1];
  }

  if (media.type === 'series') {
    return '76479';
  }
  return '693134';
}

export interface StreamSourceResult {
  type: 'iframe' | 'mp4';
  url: string;
  providerName: string;
  serverId?: AnyServerId;
  targetId: string;
}

export interface StreamCustomizationOptions {
  primaryColor?: string;
  secondaryColor?: string;
  autoplay?: boolean;
  startAt?: number;
  lang?: string;
  adShieldEnabled?: boolean;
}

export function buildVixSrcEmbedUrl(
  type: 'movie' | 'series',
  id: string,
  season = 1,
  episode = 1,
  opts: StreamCustomizationOptions = {}
): string {
  const cfg = getVideoProviderConfig();
  const primaryColor = sanitizeHexColor(opts.primaryColor ?? cfg.accentColor, 'B20710');
  const secondaryColor = sanitizeHexColor(opts.secondaryColor ?? cfg.secondaryColor, '170000');
  const autoplay = opts.autoplay ?? cfg.autoplay;
  const lang = (opts.lang ?? cfg.preferredLang ?? '').trim();
  const startAt = typeof opts.startAt === 'number' && opts.startAt > 5 ? Math.floor(opts.startAt) : 0;

  const basePath =
    type === 'series'
      ? `https://vixsrc.to/tv/${id}/${Math.max(1, season)}/${Math.max(1, episode)}`
      : `https://vixsrc.to/movie/${id}`;

  const params = new URLSearchParams();
  params.set('primaryColor', primaryColor);
  params.set('secondaryColor', secondaryColor);
  params.set('autoplay', String(autoplay));
  if (startAt > 0) {
    params.set('startAt', String(startAt));
  }
  if (lang) {
    params.set('lang', lang);
  }

  return `${basePath}?${params.toString()}`;
}

/**
 * Constructs the stream URL for any selected movie or series, defaulting to
 * VixSrc with full customization parameters (primaryColor, secondaryColor, autoplay, startAt, lang).
 */
export function generateStreamSource(
  media: MediaItem,
  season = 1,
  episode = 1,
  overrideServer?: AnyServerId,
  customization?: StreamCustomizationOptions
): StreamSourceResult {
  const cfg = getVideoProviderConfig();
  const targetId = resolveTargetIdentifier(media);
  const imdbFallback = media.imdbId || (targetId.startsWith('tt') ? targetId : 'tt15239678');
  const color = sanitizeHexColor(customization?.primaryColor ?? cfg.accentColor, 'B20710');
  const secondaryColor = sanitizeHexColor(
    customization?.secondaryColor ?? cfg.secondaryColor,
    '170000'
  );
  const sNum = Math.max(1, season);
  const epNum = Math.max(1, episode);

  const requestedServer = overrideServer ?? cfg.vidukiServer ?? 'vixsrc';
  const server: AnyServerId = VALID_SERVER_IDS.has(requestedServer) ? requestedServer : 'vixsrc';

  const vidfastFallbackUrl =
    media.type === 'series'
      ? `https://vidfast.pro/tv/${targetId}/${sNum}/${epNum}?autoPlay=true&theme=${color}&nextButton=true&title=false`
      : `https://vidfast.pro/movie/${targetId}?autoPlay=true&theme=${color}&title=false`;

  // 1. VidLink Pro
  if (server === 'vidlink') {
    const encodedFallback = encodeURIComponent(vidfastFallbackUrl);
    const url =
      media.type === 'series'
        ? `https://vidlink.pro/tv/${targetId}/${sNum}/${epNum}?primaryColor=${color}&secondaryColor=${secondaryColor}&iconColor=${color}&autoplay=true&title=false&poster=true&nextbutton=true&fallback_url=${encodedFallback}`
        : `https://vidlink.pro/movie/${targetId}?primaryColor=${color}&secondaryColor=${secondaryColor}&iconColor=${color}&autoplay=true&title=false&poster=true&fallback_url=${encodedFallback}`;
    return {
      type: 'iframe',
      url,
      providerName: 'VidLink',
      serverId: 'vidlink',
      targetId,
    };
  }

  // 2. VidFast (Ad-Free Turbo Autoplay)
  if (server === 'vidfast') {
    const url =
      media.type === 'series'
        ? `https://vidfast.pro/tv/${targetId}/${sNum}/${epNum}?autoPlay=true&theme=${color}&nextButton=true&title=false`
        : `https://vidfast.pro/movie/${targetId}?autoPlay=true&theme=${color}&title=false`;
    return {
      type: 'iframe',
      url,
      providerName: 'VidFast',
      serverId: 'vidfast',
      targetId,
    };
  }

  // 3. Videasy (Ad-Free Smooth)
  if (server === 'videasy') {
    const url =
      media.type === 'series'
        ? `https://player.videasy.net/tv/${targetId}/${sNum}/${epNum}?color=${color}&nextEpisode=true&overlay=true`
        : `https://player.videasy.net/movie/${targetId}?color=${color}&overlay=true`;
    return {
      type: 'iframe',
      url,
      providerName: 'Videasy',
      serverId: 'videasy',
      targetId,
    };
  }

  // 4. VixSrc (Ad-Free 4K Multi-Audio with full customization params & PLAYER_EVENT tracking)
  if (server === 'vixsrc') {
    const url = buildVixSrcEmbedUrl(
      media.type,
      targetId,
      sNum,
      epNum,
      customization
    );
    return {
      type: 'iframe',
      url,
      providerName: 'VixSrc',
      serverId: 'vixsrc',
      targetId,
    };
  }

  // 5. PrimeSrc (Hosts Filemoon, Voe, Dood, Luluvdoo, Streamtape, Mixdrop, Vinovo, Vidara, etc.)
  if (server === 'primesrc') {
    const isTmdb = !targetId.startsWith('tt');
    const idQuery = isTmdb ? `tmdb=${targetId}` : `imdb=${targetId}`;
    const url =
      media.type === 'series'
        ? `https://primesrc.me/embed/tv?${idQuery}&season=${sNum}&episode=${epNum}`
        : `https://primesrc.me/embed/movie?${idQuery}`;
    return {
      type: 'iframe',
      url,
      providerName: 'PrimeSrc',
      serverId: 'primesrc',
      targetId,
    };
  }

  const useShieldProxy = customization?.adShieldEnabled ?? cfg.adShieldEnabled ?? true;

  // 6. MultiEmbed (Backup - wrapped with JS redirect ad shield when active)
  if (server === 'superembed') {
    const isTmdb = Boolean(media.tmdbId) || !targetId.startsWith('tt');
    const rawUrl =
      media.type === 'series'
        ? `https://multiembed.mov/?video_id=${targetId}&tmdb=${isTmdb ? 1 : 0}&s=${sNum}&e=${epNum}`
        : `https://multiembed.mov/?video_id=${targetId}&tmdb=${isTmdb ? 1 : 0}`;
    return {
      type: 'iframe',
      url: useShieldProxy ? wrapWithEmbedShieldProxy(rawUrl) : rawUrl,
      providerName: 'MultiEmbed',
      serverId: 'superembed',
      targetId,
    };
  }

  // 7. VidSrc Edge (Backup - wrapped with JS redirect ad shield when active)
  if (server === 'vidsrc_sh') {
    const rawUrl =
      media.type === 'series'
        ? `https://vidsrc.sh/embed/tv?tmdb=${targetId}&season=${sNum}&episode=${epNum}&autoplay=true`
        : `https://vidsrc.sh/embed/movie?tmdb=${targetId}&autoplay=true`;
    return {
      type: 'iframe',
      url: useShieldProxy ? wrapWithEmbedShieldProxy(rawUrl) : rawUrl,
      providerName: 'VidSrc Edge',
      serverId: 'vidsrc_sh',
      targetId,
    };
  }

  // 8. 2Embed (Backup - wrapped with JS redirect ad shield when active)
  if (server === '2embed') {
    const rawUrl =
      media.type === 'series'
        ? `https://www.2embed.cc/embedtv/${targetId}&s=${sNum}&e=${epNum}`
        : `https://www.2embed.cc/embed/${targetId}`;
    return {
      type: 'iframe',
      url: useShieldProxy ? wrapWithEmbedShieldProxy(rawUrl) : rawUrl,
      providerName: '2Embed',
      serverId: '2embed',
      targetId,
    };
  }

  // 9. VidSrc Pro (Backup - wrapped with JS redirect ad shield when active)
  const rawUrl =
    media.type === 'series'
      ? `https://vidsrc.to/embed/tv/${imdbFallback}/${sNum}/${epNum}`
      : `https://vidsrc.to/embed/movie/${imdbFallback}`;
  return {
    type: 'iframe',
    url: useShieldProxy ? wrapWithEmbedShieldProxy(rawUrl) : rawUrl,
    providerName: 'VidSrc Pro',
    serverId: 'vidsrc',
    targetId: imdbFallback,
  };
}

export interface LivePrimeSrcHost {
  name: string;
  file_name: string | null;
  file_size: string | null;
  key: string;
  quality: string | null;
  audio_language: string | null;
}

export interface LiveServerSourcesResponse {
  directStreamUrl?: string;
  vidlinkAvailable: boolean;
  vixsrcAvailable: boolean;
  primeSrcHosts: LivePrimeSrcHost[];
  resolvedTmdbId?: number;
  resolvedImdbId?: string;
  recommendedServer?: AnyServerId;
}

export async function saveCustomDirectStream(
  media: MediaItem,
  url: string,
  season = 1,
  episode = 1
): Promise<boolean> {
  const id = resolveTargetIdentifier(media);
  const type = media.type === 'series' ? 'tv' : 'movie';
  try {
    const res = await fetch('/api/streams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        type,
        season,
        episode,
        url: url.trim(),
        title: media.title,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function removeCustomDirectStream(
  media: MediaItem,
  season = 1,
  episode = 1
): Promise<boolean> {
  const id = resolveTargetIdentifier(media);
  const type = media.type === 'series' ? 'tv' : 'movie';
  try {
    const params = new URLSearchParams({
      id,
      type,
      season: String(Math.max(1, season)),
      episode: String(Math.max(1, episode)),
    });
    const res = await fetch(`/api/streams?${params.toString()}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchLiveServerSources(
  media: MediaItem,
  season = 1,
  episode = 1
): Promise<LiveServerSourcesResponse> {
  const targetId = resolveTargetIdentifier(media);
  const tmdbId = /^\d+$/.test(targetId) ? targetId : media.tmdbId ? String(media.tmdbId) : '';
  const imdbId = media.imdbId || (targetId.startsWith('tt') ? targetId : '');
  const type = media.type === 'series' ? 'tv' : 'movie';

  try {
    const params = new URLSearchParams({
      type,
      season: String(Math.max(1, season)),
      episode: String(Math.max(1, episode)),
    });
    if (tmdbId) params.set('tmdbId', tmdbId);
    if (imdbId) params.set('imdbId', imdbId);

    const res = await fetch(`/api/servers/sources?${params.toString()}`);
    if (res.ok) {
      const data = (await res.json()) as Partial<LiveServerSourcesResponse>;
      return {
        directStreamUrl: data.directStreamUrl,
        vidlinkAvailable: Boolean(data.vidlinkAvailable),
        vixsrcAvailable: Boolean(data.vixsrcAvailable),
        primeSrcHosts: Array.isArray(data.primeSrcHosts) ? data.primeSrcHosts : [],
        resolvedTmdbId: typeof data.resolvedTmdbId === 'number' ? data.resolvedTmdbId : undefined,
        resolvedImdbId: data.resolvedImdbId,
        recommendedServer: data.recommendedServer,
      };
    }
  } catch (err) {
    console.warn('fetchLiveServerSources error:', err);
  }

  return { vidlinkAvailable: false, vixsrcAvailable: false, primeSrcHosts: [] };
}

export interface MovieDownloadMirror {
  id: string;
  label: string;
  url: string;
}

/**
 * Generates title-specific download portal URLs for the exact selected movie or TV episode
 * using its resolved TMDB or IMDb ID across VixSrc, PrimeSrc, and VidSrc download servers.
 */
export function getMovieDownloadMirrors(
  media: MediaItem,
  season = 1,
  episode = 1
): MovieDownloadMirror[] {
  const targetId = resolveTargetIdentifier(media);
  const sNum = Math.max(1, season);
  const epNum = Math.max(1, episode);

  if (media.type === 'series') {
    const isTmdb = !targetId.startsWith('tt');
    const primeQuery = isTmdb ? `tmdb=${targetId}` : `imdb=${targetId}`;
    return [
      {
        id: 'dl-vidsrc-vip',
        label: `Download Server 1 (${media.title} S${sNum}E${epNum})`,
        url: `https://dl.vidsrc.vip/tv/${targetId}/${sNum}/${epNum}`,
      },
      {
        id: 'primesrc',
        label: `PrimeSrc Multi-Host (${media.title} S${sNum}E${epNum})`,
        url: `https://primesrc.me/embed/tv?${primeQuery}&season=${sNum}&episode=${epNum}`,
      },
      {
        id: 'vixsrc',
        label: `VixSrc Server (${media.title} S${sNum}E${epNum})`,
        url: `https://vixsrc.to/tv/${targetId}/${sNum}/${epNum}`,
      },
    ];
  }

  const isTmdb = !targetId.startsWith('tt');
  const primeQuery = isTmdb ? `tmdb=${targetId}` : `imdb=${targetId}`;
  return [
    {
      id: 'dl-vidsrc-vip',
      label: `Download Server 1 (${media.title})`,
      url: `https://dl.vidsrc.vip/movie/${targetId}`,
    },
    {
      id: 'primesrc',
      label: `PrimeSrc Multi-Host (${media.title})`,
      url: `https://primesrc.me/embed/movie?${primeQuery}`,
    },
    {
      id: 'vixsrc',
      label: `VixSrc Server (${media.title})`,
      url: `https://vixsrc.to/movie/${targetId}`,
    },
  ];
}
