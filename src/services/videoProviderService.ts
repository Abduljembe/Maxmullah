import { MediaItem } from '../types';
import { wrapWithEmbedShieldProxy } from '../utils/adBlocker';

export type VideoStreamProvider =
  | 'vidsrc_su'
  | 'vidsrc_sh'
  | 'autoembed'
  | 'vidlink'
  | 'vidnest'
  | 'vidsrc_wtf'
  | 'vixsrc'
  | 'primesrc'
  | 'vidfast'
  | 'videasy'
  | 'superembed'
  | '2embed'
  | 'vidsrc'
  | 'custom';

export type VidukiServerId = 1 | 2 | 3 | 4;
export type AnyServerId =
  | 'vidsrc_su'
  | 'vidsrc_sh'
  | 'autoembed'
  | 'vidlink'
  | 'vidnest'
  | 'vidsrc_wtf'
  | 'vixsrc'
  | 'primesrc'
  | 'vidfast'
  | 'videasy'
  | 'superembed'
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
    id: 'vidsrc_su',
    name: 'MullahStream Instant',
    tag: 'Fastest · Autoplay HD',
    badge: 'Fast HD',
    description: 'Lightweight HTML5/HLS player with instant startup, multi-server core, and subtitles.',
    adFree: true,
    latencyMs: 28,
  },
  {
    id: 'vidsrc_sh',
    name: 'VidSrc Edge',
    tag: 'Fast · Multi-Source',
    badge: 'Edge HD',
    description: 'High-speed edge mirror with automatic stream resolution.',
    adFree: true,
    latencyMs: 42,
  },
  {
    id: 'autoembed',
    name: 'AutoEmbed HD',
    tag: 'Fast · Global CDN',
    badge: 'AutoEmbed',
    description: 'Reliable global CDN mirror for movies and series.',
    adFree: true,
    latencyMs: 55,
  },
  {
    id: 'vidlink',
    name: 'VidLink Pro',
    tag: 'HD · Multi-Audio',
    badge: 'VidLink',
    description: 'Full-featured HD/4K player with resume sync and anime MAL support.',
    adFree: true,
    latencyMs: 95,
  },
  {
    id: 'vidnest',
    name: 'VidNest HD',
    tag: 'Backup · Multi-Host',
    badge: 'VidNest',
    description: 'Secondary HD/4K stream mirror for movies, TV, and anime.',
    adFree: true,
    latencyMs: 110,
  },
  {
    id: 'vidsrc_wtf',
    name: 'VidSrc Direct',
    tag: 'Backup · Fast',
    badge: 'VidSrc',
    description: 'Clean direct fallback embed mirror.',
    adFree: true,
    latencyMs: 120,
  },
  {
    id: 'vixsrc',
    name: 'VixSrc HD',
    tag: '4K · Multi-Audio',
    badge: 'VixSrc',
    description: '4K & HD multi-audio stream (when available in your region).',
    adFree: true,
    latencyMs: 135,
  },
  {
    id: 'primesrc',
    name: 'PrimeSrc Hosts',
    tag: 'Backup · Manual Hosts',
    badge: 'PrimeSrc',
    description: 'Manual multi-host mirror.',
    adFree: false,
    latencyMs: 160,
  },
  {
    id: 'vidsrc',
    name: 'VidSrc Pro',
    tag: 'Legacy · Shielded',
    badge: 'VidSrc Pro',
    description: 'Legacy IMDb/TMDB stream mirror.',
    adFree: false,
    latencyMs: 190,
  },
];

const VALID_SERVER_IDS = new Set<string>(VIDUKI_SERVERS.map((s) => s.id));
const DEPRECATED_SERVER_IDS = new Set<string>(['vidfast', 'videasy', 'superembed', '2embed']);

export function normalizeActiveServerId(raw?: string | null): AnyServerId {
  if (raw && VALID_SERVER_IDS.has(raw) && !DEPRECATED_SERVER_IDS.has(raw)) {
    return raw as AnyServerId;
  }
  return 'vidsrc_su';
}

export function isAdFreeServer(serverId: AnyServerId): boolean {
  return Boolean(VIDUKI_SERVERS.find((s) => s.id === serverId)?.adFree);
}

export function getNextFastestServer(currentServer: AnyServerId): AnyServerId {
  const order: AnyServerId[] = [
    'vidsrc_su',
    'vidsrc_sh',
    'autoembed',
    'vidlink',
    'vidnest',
    'vidsrc_wtf',
    'vixsrc',
    'vidsrc',
  ];
  const idx = order.indexOf(currentServer);
  if (idx === -1 || idx === order.length - 1) {
    return order[0];
  }
  return order[idx + 1];
}

export type VidLinkIconsStyle = 'default' | 'vid';
export type VidLinkPlayerType = 'default' | 'jw';
export type VidLinkAnimeAudioType = 'sub' | 'dub';

export interface VideoProviderConfig {
  provider: VideoStreamProvider;
  vidukiServer: AnyServerId;
  accentColor: string; // hex color without # (e.g. B20710 or 63b8bc)
  secondaryColor: string; // hex color without # (default: 170000 or a2a2a2)
  iconColor: string; // hex color without # (e.g. eefdec or B20710)
  icons: VidLinkIconsStyle; // 'default' | 'vid'
  playerType: VidLinkPlayerType; // 'default' | 'jw'
  showTitle: boolean;
  showPoster: boolean;
  autoplay: boolean;
  nextButton: boolean;
  preferredLang: string; // e.g. '' (auto) | 'en' | 'it' | 'es' | 'fr' | 'de'
  subFile: string; // optional VTT URL
  subLabel: string; // defaults to 'External Subtitle'
  animeSubOrDub: VidLinkAnimeAudioType; // 'sub' | 'dub'
  animeFallback: boolean; // ?fallback=true
  adShieldEnabled: boolean;
  customTemplate: string;
}

export interface VixSrcPlayerEvent {
  type: 'PLAYER_EVENT';
  data: {
    event: 'play' | 'pause' | 'seeked' | 'ended' | 'timeupdate';
    currentTime: number;
    duration: number;
    video_id?: number;
    mtmdbId?: number;
    mediaType?: 'movie' | 'tv';
    season?: number;
    episode?: number;
  };
}

export interface VidLinkEpisodeProgress {
  season: string;
  episode: string;
  progress: {
    watched: number;
    duration: number;
  };
}

export interface VidLinkMediaProgressEntry {
  id: number;
  type: 'movie' | 'tv' | 'anime';
  title: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  progress: {
    watched: number;
    duration: number;
  };
  last_season_watched?: string;
  last_episode_watched?: string;
  show_progress?: Record<string, VidLinkEpisodeProgress>;
  last_updated?: number;
}

export interface VidLinkMediaDataEvent {
  type: 'MEDIA_DATA';
  data: Record<string, VidLinkMediaProgressEntry> | VidLinkMediaProgressEntry;
}

const STORAGE_KEY_PROVIDER = 'mullahmax_video_provider_cfg_v12';
const STORAGE_KEY_RESUME_PREFIX = 'mullahmax_resume_sec_';
export const STORAGE_KEY_VIDLINK_PROGRESS = 'vidLinkProgress';

const DEFAULT_CONFIG: VideoProviderConfig = {
  provider: 'vidsrc_su',
  vidukiServer: 'vidsrc_su',
  accentColor: 'FFFFFF',
  secondaryColor: '3F3F46',
  iconColor: 'FFFFFF',
  icons: 'vid',
  playerType: 'default',
  showTitle: false,
  showPoster: false,
  autoplay: true,
  nextButton: true,
  preferredLang: '',
  subFile: '',
  subLabel: 'External Subtitle',
  animeSubOrDub: 'sub',
  animeFallback: true,
  adShieldEnabled: true,
  customTemplate:
    'https://vidsrc.su/embed/movie/{id}?autoplay=true&pausescreen=false&colour=FFFFFF',
};

function sanitizeHexColor(raw: string | undefined, fallback: string): string {
  const cleaned = (raw || '').replace(/#/g, '').trim();
  return /^[0-9a-fA-F]{3,8}$/.test(cleaned) ? cleaned : fallback;
}

function sanitizeHttpUrl(raw: string | undefined): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {}
  return '';
}

export function getVideoProviderConfig(): VideoProviderConfig {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROVIDER);
    if (raw) {
      const parsed = JSON.parse(raw);
      const savedServer = normalizeActiveServerId(parsed.vidukiServer);
      return {
        provider: normalizeActiveServerId(parsed.provider || savedServer),
        vidukiServer: savedServer,
        accentColor: sanitizeHexColor(parsed.accentColor, DEFAULT_CONFIG.accentColor),
        secondaryColor: sanitizeHexColor(parsed.secondaryColor, DEFAULT_CONFIG.secondaryColor),
        iconColor: sanitizeHexColor(parsed.iconColor, DEFAULT_CONFIG.iconColor),
        icons: parsed.icons === 'vid' ? 'vid' : 'default',
        playerType: parsed.playerType === 'jw' ? 'jw' : 'default',
        showTitle: typeof parsed.showTitle === 'boolean' ? parsed.showTitle : DEFAULT_CONFIG.showTitle,
        showPoster: typeof parsed.showPoster === 'boolean' ? parsed.showPoster : DEFAULT_CONFIG.showPoster,
        autoplay: typeof parsed.autoplay === 'boolean' ? parsed.autoplay : DEFAULT_CONFIG.autoplay,
        nextButton: typeof parsed.nextButton === 'boolean' ? parsed.nextButton : DEFAULT_CONFIG.nextButton,
        preferredLang: typeof parsed.preferredLang === 'string' ? parsed.preferredLang : '',
        subFile: sanitizeHttpUrl(parsed.subFile),
        subLabel:
          typeof parsed.subLabel === 'string' && parsed.subLabel.trim()
            ? parsed.subLabel.trim().slice(0, 48)
            : DEFAULT_CONFIG.subLabel,
        animeSubOrDub: parsed.animeSubOrDub === 'dub' ? 'dub' : 'sub',
        animeFallback:
          typeof parsed.animeFallback === 'boolean'
            ? parsed.animeFallback
            : DEFAULT_CONFIG.animeFallback,
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
    const validServer = normalizeActiveServerId(config.vidukiServer);
    const cleaned: VideoProviderConfig = {
      ...config,
      vidukiServer: validServer,
      accentColor: sanitizeHexColor(config.accentColor, DEFAULT_CONFIG.accentColor),
      secondaryColor: sanitizeHexColor(config.secondaryColor, DEFAULT_CONFIG.secondaryColor),
      iconColor: sanitizeHexColor(config.iconColor, DEFAULT_CONFIG.iconColor),
      icons: config.icons === 'vid' ? 'vid' : 'default',
      playerType: config.playerType === 'jw' ? 'jw' : 'default',
      showTitle: Boolean(config.showTitle),
      showPoster: Boolean(config.showPoster),
      autoplay: Boolean(config.autoplay),
      nextButton: Boolean(config.nextButton),
      preferredLang: (config.preferredLang || '').trim(),
      subFile: sanitizeHttpUrl(config.subFile),
      subLabel: (config.subLabel || '').trim().slice(0, 48) || DEFAULT_CONFIG.subLabel,
      animeSubOrDub: config.animeSubOrDub === 'dub' ? 'dub' : 'sub',
      animeFallback: config.animeFallback !== false,
      adShieldEnabled: config.adShieldEnabled !== false,
    };
    localStorage.setItem(STORAGE_KEY_PROVIDER, JSON.stringify(cleaned));
  } catch {}
}

export function getVidLinkProgressMap(): Record<string, VidLinkMediaProgressEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VIDLINK_PROGRESS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, VidLinkMediaProgressEntry>;
    }
  } catch {}
  return {};
}

export function saveVidLinkMediaData(
  incoming: VidLinkMediaProgressEntry | Record<string, VidLinkMediaProgressEntry>
): Record<string, VidLinkMediaProgressEntry> {
  const existing = getVidLinkProgressMap();
  if (!incoming || typeof incoming !== 'object') return existing;

  const isSingleEntry =
    'id' in incoming &&
    (typeof (incoming as VidLinkMediaProgressEntry).id === 'number' ||
      typeof (incoming as VidLinkMediaProgressEntry).id === 'string') &&
    'progress' in incoming;

  const merged: Record<string, VidLinkMediaProgressEntry> = { ...existing };

  if (isSingleEntry) {
    const entry = incoming as VidLinkMediaProgressEntry;
    const key = String(entry.id);
    const prev = merged[key];
    merged[key] = {
      ...prev,
      ...entry,
      show_progress: {
        ...(prev?.show_progress || {}),
        ...(entry.show_progress || {}),
      },
      last_updated: entry.last_updated || Date.now(),
    };
  } else {
    for (const [key, entry] of Object.entries(
      incoming as Record<string, VidLinkMediaProgressEntry>
    )) {
      if (!entry || typeof entry !== 'object') continue;
      const prev = merged[key];
      merged[key] = {
        ...prev,
        ...entry,
        show_progress: {
          ...(prev?.show_progress || {}),
          ...(entry.show_progress || {}),
        },
        last_updated: entry.last_updated || prev?.last_updated || Date.now(),
      };
    }
  }

  try {
    localStorage.setItem(STORAGE_KEY_VIDLINK_PROGRESS, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent('mullahmax:vidlink-progress', { detail: merged }));
  } catch {}

  return merged;
}

export function getVidLinkResumeSeconds(media: MediaItem, season = 1, episode = 1): number {
  const map = getVidLinkProgressMap();
  const keysToTry = [media.tmdbId ? String(media.tmdbId) : '', resolveTargetIdentifier(media)].filter(
    Boolean
  );
  for (const key of keysToTry) {
    const entry = map[key];
    if (!entry) continue;
    if (media.type === 'series' && entry.show_progress) {
      const epProgress = entry.show_progress[`s${season}e${episode}`]?.progress?.watched;
      if (typeof epProgress === 'number' && epProgress > 5) {
        return Math.floor(epProgress);
      }
    }
    if (typeof entry.progress?.watched === 'number' && entry.progress.watched > 5) {
      return Math.floor(entry.progress.watched);
    }
  }
  return 0;
}

export function isLikelyAnime(media: MediaItem): boolean {
  if (media.malId && media.malId > 0) return true;
  if (media.platforms.includes('Crunchyroll')) return true;
  if (media.aliases?.some((a) => /anime/i.test(a))) return true;
  return false;
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
  iconColor?: string;
  icons?: VidLinkIconsStyle;
  playerType?: VidLinkPlayerType;
  showTitle?: boolean;
  showPoster?: boolean;
  autoplay?: boolean;
  nextButton?: boolean;
  startAt?: number;
  lang?: string;
  subFile?: string;
  subLabel?: string;
  malId?: number;
  animeSubOrDub?: VidLinkAnimeAudioType;
  animeFallback?: boolean;
  useAnimeMode?: boolean;
  adShieldEnabled?: boolean;
}

export function buildVidLinkEmbedUrl(
  media: MediaItem,
  id: string,
  season = 1,
  episode = 1,
  opts: StreamCustomizationOptions = {}
): string {
  const cfg = getVideoProviderConfig();
  const primaryColor = sanitizeHexColor(opts.primaryColor ?? cfg.accentColor, 'B20710');
  const secondaryColor = sanitizeHexColor(opts.secondaryColor ?? cfg.secondaryColor, '170000');
  const iconColor = sanitizeHexColor(opts.iconColor ?? cfg.iconColor, 'EEFDEC');
  const icons: VidLinkIconsStyle = opts.icons ?? cfg.icons ?? 'default';
  const player: VidLinkPlayerType = opts.playerType ?? cfg.playerType ?? 'default';
  const title = opts.showTitle ?? cfg.showTitle ?? false;
  const poster = opts.showPoster ?? cfg.showPoster ?? true;
  const autoplay = opts.autoplay ?? cfg.autoplay ?? true;
  const nextbutton = opts.nextButton ?? cfg.nextButton ?? true;
  const startAt =
    typeof opts.startAt === 'number' && opts.startAt > 5 ? Math.floor(opts.startAt) : 0;
  const subFile = sanitizeHttpUrl(opts.subFile ?? cfg.subFile);
  const subLabel = (opts.subLabel ?? cfg.subLabel ?? 'External Subtitle').trim();
  const subOrDub: VidLinkAnimeAudioType = opts.animeSubOrDub ?? cfg.animeSubOrDub ?? 'sub';
  const animeFallback = opts.animeFallback ?? cfg.animeFallback ?? true;

  const sNum = Math.max(1, season);
  const epNum = Math.max(1, episode);
  const resolvedMalId = opts.malId && opts.malId > 0 ? opts.malId : media.malId;
  const shouldUseAnimeEndpoint =
    Boolean(resolvedMalId && resolvedMalId > 0) && (opts.useAnimeMode ?? isLikelyAnime(media));

  const fallbackTargetUrl =
    media.type === 'series'
      ? `https://vidsrc.su/embed/tv/${id}/${sNum}/${epNum}?autoplay=${autoplay}&autonextepisode=${nextbutton}&colour=${primaryColor}&pausescreen=false`
      : `https://vidsrc.su/embed/movie/${id}?autoplay=${autoplay}&colour=${primaryColor}&pausescreen=false`;

  let basePath: string;
  if (shouldUseAnimeEndpoint && resolvedMalId) {
    basePath = `https://vidlink.pro/anime/${resolvedMalId}/${epNum}/${subOrDub}`;
  } else if (media.type === 'series') {
    basePath = `https://vidlink.pro/tv/${id}/${sNum}/${epNum}`;
  } else {
    basePath = `https://vidlink.pro/movie/${id}`;
  }

  const params = new URLSearchParams();
  if (shouldUseAnimeEndpoint && animeFallback) {
    params.set('fallback', 'true');
  }
  params.set('primaryColor', primaryColor);
  params.set('secondaryColor', secondaryColor);
  params.set('iconColor', iconColor);
  params.set('icons', icons);
  params.set('player', player);
  params.set('title', String(title));
  params.set('poster', String(poster));
  params.set('autoplay', String(autoplay));
  if (media.type === 'series' || shouldUseAnimeEndpoint) {
    params.set('nextbutton', String(nextbutton));
  }
  if (startAt > 0) {
    params.set('startAt', String(startAt));
  }
  if (subFile) {
    params.set('sub_file', subFile);
    if (subLabel) {
      params.set('sub_label', subLabel);
    }
  }
  params.set('fallback_url', fallbackTargetUrl);

  return `${basePath}?${params.toString()}`;
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
 * Constructs the stream URL for any selected movie, show, or anime across
 * VidLink (full API params + Anime MAL support), VidFast, PrimeSrc, Videasy, VixSrc, and shielded mirrors.
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
  const sNum = Math.max(1, season);
  const epNum = Math.max(1, episode);

  const requestedServer = overrideServer ?? cfg.vidukiServer ?? 'vidsrc_su';
  const server: AnyServerId = normalizeActiveServerId(requestedServer);

  // 1. VidSrc.su Instant HTML5/HLS Player (Lightweight Vite SPA, zero Cloudflare challenge)
  if (server === 'vidsrc_su') {
    const url =
      media.type === 'series'
        ? `https://vidsrc.su/embed/tv/${targetId}/${sNum}/${epNum}?autoplay=true&autonextepisode=true&colour=${color}&pausescreen=false`
        : `https://vidsrc.su/embed/movie/${targetId}?autoplay=true&colour=${color}&pausescreen=false`;
    return {
      type: 'iframe',
      url,
      providerName: 'Fast HD',
      serverId: 'vidsrc_su',
      targetId,
    };
  }

  // 2. VidSrc Edge (Direct embed — must NOT wrap in /api/embed-shield because it calls relative /vs_src.php)
  if (server === 'vidsrc_sh') {
    const url =
      media.type === 'series'
        ? `https://vidsrc.sh/embed/tv?tmdb=${targetId}&season=${sNum}&episode=${epNum}&autoplay=true`
        : `https://vidsrc.sh/embed/movie?tmdb=${targetId}&autoplay=true`;
    return {
      type: 'iframe',
      url,
      providerName: 'Edge HD',
      serverId: 'vidsrc_sh',
      targetId,
    };
  }

  // 3. AutoEmbed HD (Verified fast CDN mirror)
  if (server === 'autoembed') {
    const url =
      media.type === 'series'
        ? `https://player.autoembed.me/embed/tv/${targetId}/${sNum}/${epNum}`
        : `https://player.autoembed.me/embed/movie/${targetId}`;
    return {
      type: 'iframe',
      url,
      providerName: 'AutoEmbed',
      serverId: 'autoembed',
      targetId,
    };
  }

  // 4. VidLink Pro (Full Movies, TV & Anime MAL API + Customization + Watch Progress)
  if (server === 'vidlink') {
    const url = buildVidLinkEmbedUrl(media, targetId, sNum, epNum, customization);
    return {
      type: 'iframe',
      url,
      providerName: 'VidLink',
      serverId: 'vidlink',
      targetId,
    };
  }

  // 5. VidNest HD (Multi-Host Backup)
  if (server === 'vidnest') {
    const url =
      media.type === 'series'
        ? `https://vidnest.fun/tv/${targetId}/${sNum}/${epNum}`
        : `https://vidnest.fun/movie/${targetId}`;
    return {
      type: 'iframe',
      url,
      providerName: 'VidNest',
      serverId: 'vidnest',
      targetId,
    };
  }

  // 6. VidSrc Direct
  if (server === 'vidsrc_wtf') {
    const url =
      media.type === 'series'
        ? `https://vidsrc.wtf/api/1/tv/?id=${targetId}&s=${sNum}&e=${epNum}`
        : `https://vidsrc.wtf/api/1/movie/?id=${targetId}`;
    return {
      type: 'iframe',
      url,
      providerName: 'VidSrc Direct',
      serverId: 'vidsrc_wtf',
      targetId,
    };
  }

  // 7. VixSrc (Ad-Free 4K Multi-Audio with full customization params & PLAYER_EVENT tracking)
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

  // 8. PrimeSrc
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

  // 9. VidSrc Pro (Legacy Backup - wrapped with JS redirect ad shield when active)
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

export interface SavedDirectStreamRecord {
  url: string;
  title?: string;
  subtitleUrl?: string;
  subtitleLabel?: string;
  referer?: string;
  updatedAt?: string;
}

export interface LiveServerSourcesResponse {
  directStreamUrl?: string;
  directStreamSubtitleUrl?: string;
  directStreamSubtitleLabel?: string;
  directStreamReferer?: string;
  vidlinkAvailable: boolean;
  vidfastAvailable?: boolean;
  videasyAvailable?: boolean;
  vixsrcAvailable: boolean;
  availableServers?: AnyServerId[];
  primeSrcHosts: LivePrimeSrcHost[];
  resolvedTmdbId?: number;
  resolvedImdbId?: string;
  resolvedMalId?: number;
  recommendedServer?: AnyServerId;
}

export function buildProxiedMediaUrl(rawUrl: string, referer?: string): string {
  const clean = rawUrl.trim();
  if (!clean) return '';
  if (
    clean.startsWith('blob:') ||
    clean.startsWith('/api/stream-proxy') ||
    clean.startsWith('/api/jellyfin-stream/')
  ) {
    return clean;
  }
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    return clean;
  }
  const params = new URLSearchParams({ url: clean });
  if (referer && (referer.startsWith('http://') || referer.startsWith('https://'))) {
    params.set('ref', referer.trim());
  }
  return `/api/stream-proxy?${params.toString()}`;
}

export async function getSavedDirectStream(
  media: MediaItem,
  season = 1,
  episode = 1
): Promise<SavedDirectStreamRecord | null> {
  const id = resolveTargetIdentifier(media);
  const type = media.type === 'series' ? 'tv' : 'movie';
  try {
    const params = new URLSearchParams({
      id,
      type,
      season: String(Math.max(1, season)),
      episode: String(Math.max(1, episode)),
    });
    if (media.imdbId) params.set('imdbId', media.imdbId);
    const res = await fetch(`/api/streams?${params.toString()}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { entry?: SavedDirectStreamRecord | null };
    return data.entry || null;
  } catch {
    return null;
  }
}

export async function getSavedDirectStreamsCount(): Promise<number> {
  try {
    const res = await fetch('/api/streams');
    if (!res.ok) return 0;
    const data = (await res.json()) as { count?: number; streams?: Record<string, unknown> };
    if (typeof data.count === 'number') return data.count;
    return data.streams ? Object.keys(data.streams).length : 0;
  } catch {
    return 0;
  }
}

export async function saveCustomDirectStream(
  media: MediaItem,
  url: string,
  season = 1,
  episode = 1,
  options?: { subtitleUrl?: string; subtitleLabel?: string; referer?: string }
): Promise<{ ok: boolean; error?: string }> {
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
        subtitleUrl: options?.subtitleUrl?.trim() || undefined,
        subtitleLabel: options?.subtitleLabel?.trim() || undefined,
        referer: options?.referer?.trim() || undefined,
      }),
    });
    invalidateLiveServerSourcesCache(media, season, episode);
    if (!res.ok) {
      let msg = `Failed to save direct stream (HTTP ${res.status}).`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body.error) msg = body.error;
      } catch {}
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
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
    invalidateLiveServerSourcesCache(media, season, episode);
    return res.ok;
  } catch {
    return false;
  }
}

const clientSourcesCache = new Map<
  string,
  { data: LiveServerSourcesResponse; fetchedAt: number }
>();
const clientSourcesInflight = new Map<string, Promise<LiveServerSourcesResponse>>();
const CLIENT_SOURCES_TTL_MS = 5 * 60 * 1000;

function makeClientSourcesCacheKey(media: MediaItem, season: number, episode: number): string {
  const targetId = resolveTargetIdentifier(media);
  const type = media.type === 'series' ? 'tv' : 'movie';
  return `${type}:${targetId}:s${Math.max(1, season)}e${Math.max(1, episode)}`;
}

export function invalidateLiveServerSourcesCache(
  media: MediaItem,
  season = 1,
  episode = 1
): void {
  const key = makeClientSourcesCacheKey(media, season, episode);
  clientSourcesCache.delete(key);
}

export function getCachedLiveServerSources(
  media: MediaItem,
  season = 1,
  episode = 1
): LiveServerSourcesResponse | null {
  const key = makeClientSourcesCacheKey(media, season, episode);
  const cached = clientSourcesCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CLIENT_SOURCES_TTL_MS) {
    return cached.data;
  }
  return null;
}

export function prefetchLiveServerSources(media: MediaItem, season = 1, episode = 1): void {
  if (typeof window === 'undefined') return;
  if (getCachedLiveServerSources(media, season, episode)) return;
  void fetchLiveServerSources(media, season, episode, { fast: true });
}

export async function fetchLiveServerSources(
  media: MediaItem,
  season = 1,
  episode = 1,
  options?: { fast?: boolean }
): Promise<LiveServerSourcesResponse> {
  const fast = options?.fast !== false;
  const key = makeClientSourcesCacheKey(media, season, episode);
  const cached = clientSourcesCache.get(key);
  if (
    cached &&
    Date.now() - cached.fetchedAt < CLIENT_SOURCES_TTL_MS &&
    (fast || cached.data.primeSrcHosts.length > 0)
  ) {
    return cached.data;
  }

  const inflightKey = `${key}:${fast ? 'fast' : 'full'}`;
  const existingInflight = clientSourcesInflight.get(inflightKey);
  if (existingInflight) {
    return existingInflight;
  }

  const targetId = resolveTargetIdentifier(media);
  const tmdbId = /^\d+$/.test(targetId) ? targetId : media.tmdbId ? String(media.tmdbId) : '';
  const imdbId = media.imdbId || (targetId.startsWith('tt') ? targetId : '');
  const type = media.type === 'series' ? 'tv' : 'movie';

  const requestPromise = (async (): Promise<LiveServerSourcesResponse> => {
    try {
      const params = new URLSearchParams({
        type,
        season: String(Math.max(1, season)),
        episode: String(Math.max(1, episode)),
      });
      if (fast) params.set('fast', '1');
      if (tmdbId) params.set('tmdbId', tmdbId);
      if (imdbId) params.set('imdbId', imdbId);
      if (media.title) params.set('title', media.title);
      if (isLikelyAnime(media) && !media.malId) params.set('isAnime', '1');

      const res = await fetch(`/api/servers/sources?${params.toString()}`);
      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (res.ok && contentType.includes('application/json')) {
        const data = (await res.json()) as Partial<LiveServerSourcesResponse>;
        const normalized: LiveServerSourcesResponse = {
          directStreamUrl: data.directStreamUrl,
          directStreamSubtitleUrl: data.directStreamSubtitleUrl,
          directStreamSubtitleLabel: data.directStreamSubtitleLabel,
          directStreamReferer: data.directStreamReferer,
          vidlinkAvailable: Boolean(data.vidlinkAvailable),
          vidfastAvailable: Boolean(data.vidfastAvailable),
          videasyAvailable: Boolean(data.videasyAvailable),
          vixsrcAvailable: Boolean(data.vixsrcAvailable),
          availableServers: Array.isArray(data.availableServers) ? data.availableServers : undefined,
          primeSrcHosts: Array.isArray(data.primeSrcHosts) ? data.primeSrcHosts : [],
          resolvedTmdbId: typeof data.resolvedTmdbId === 'number' ? data.resolvedTmdbId : undefined,
          resolvedImdbId: data.resolvedImdbId,
          resolvedMalId: typeof data.resolvedMalId === 'number' ? data.resolvedMalId : undefined,
          recommendedServer: data.recommendedServer,
        };
        clientSourcesCache.set(key, { data: normalized, fetchedAt: Date.now() });
        return normalized;
      }
    } catch (err) {
      console.warn('fetchLiveServerSources error:', err);
    } finally {
      clientSourcesInflight.delete(inflightKey);
    }

    return {
      vidlinkAvailable: true,
      vixsrcAvailable: false,
      recommendedServer: 'vidsrc_su',
      availableServers: ['vidsrc_su', 'vidsrc_sh', 'autoembed', 'vidlink', 'vidnest'],
      primeSrcHosts: [],
    };
  })();

  clientSourcesInflight.set(inflightKey, requestPromise);
  return requestPromise;
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
