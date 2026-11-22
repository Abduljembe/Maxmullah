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
    id: 'vidlink',
    name: 'VidLink Fast',
    tag: 'Ad-Free · Instant',
    badge: 'VidLink',
    description: 'Clean minimal HD player with instant load and silent VidFast auto-fallback.',
    adFree: true,
    latencyMs: 35,
  },
  {
    id: 'vidfast',
    name: 'VidFast Turbo',
    tag: 'Ad-Free · Turbo',
    badge: 'VidFast',
    description: 'Zero popups with adaptive HLS streaming and auto-next episode.',
    adFree: true,
    latencyMs: 45,
  },
  {
    id: 'vixsrc',
    name: 'VixSrc HD',
    tag: '4K · Multi-Audio',
    badge: 'VixSrc',
    description: '4K & HD multi-audio stream (when available in your region).',
    adFree: true,
    latencyMs: 85,
  },
  {
    id: 'videasy',
    name: 'Videasy',
    tag: 'Ad-Free · Smooth',
    badge: 'Videasy',
    description: 'Smooth low-buffer stream with multi-language subtitles.',
    adFree: true,
    latencyMs: 95,
  },
  {
    id: 'primesrc',
    name: 'PrimeSrc Hosts',
    tag: 'Backup · Host Captcha',
    badge: 'PrimeSrc',
    description: 'Manual multi-host mirror (external hosts may show verification ads).',
    adFree: false,
    latencyMs: 140,
  },
  {
    id: 'superembed',
    name: 'MultiEmbed',
    tag: 'Backup · Shielded',
    badge: 'MultiEmbed',
    description: 'Worldwide multi-region backup stream mirror.',
    adFree: false,
    latencyMs: 155,
  },
  {
    id: 'vidsrc_sh',
    name: 'VidSrc Edge',
    tag: 'Backup · Shielded',
    badge: 'VidSrc Edge',
    description: 'Cloudflare edge backup mirror.',
    adFree: false,
    latencyMs: 165,
  },
  {
    id: '2embed',
    name: '2Embed',
    tag: 'Backup · Shielded',
    badge: '2Embed',
    description: 'Secondary mirror across older catalog titles.',
    adFree: false,
    latencyMs: 175,
  },
  {
    id: 'vidsrc',
    name: 'VidSrc Pro',
    tag: 'Backup · Shielded',
    badge: 'VidSrc Pro',
    description: 'Legacy IMDb/TMDB stream mirror.',
    adFree: false,
    latencyMs: 190,
  },
];

const VALID_SERVER_IDS = new Set<string>(VIDUKI_SERVERS.map((s) => s.id));

export function isAdFreeServer(serverId: AnyServerId): boolean {
  return Boolean(VIDUKI_SERVERS.find((s) => s.id === serverId)?.adFree);
}

export function getNextFastestServer(currentServer: AnyServerId): AnyServerId {
  const order: AnyServerId[] = [
    'vidlink',
    'vidfast',
    'vixsrc',
    'videasy',
    '2embed',
    'vidsrc_sh',
    'superembed',
    'vidsrc',
    'primesrc',
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

const STORAGE_KEY_PROVIDER = 'mullahmax_video_provider_cfg_v11';
const STORAGE_KEY_RESUME_PREFIX = 'mullahmax_resume_sec_';
export const STORAGE_KEY_VIDLINK_PROGRESS = 'vidLinkProgress';

const DEFAULT_CONFIG: VideoProviderConfig = {
  provider: 'vidlink',
  vidukiServer: 'vidlink',
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
    'https://vidlink.pro/movie/{id}?primaryColor=FFFFFF&secondaryColor=3F3F46&iconColor=FFFFFF&icons=vid&player=default&title=false&poster=false&autoplay=true&nextbutton=true',
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
      const savedServer = VALID_SERVER_IDS.has(parsed.vidukiServer)
        ? (parsed.vidukiServer as AnyServerId)
        : 'vidfast';
      return {
        provider: VALID_SERVER_IDS.has(parsed.provider) ? parsed.provider : savedServer,
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
    const validServer = VALID_SERVER_IDS.has(config.vidukiServer) ? config.vidukiServer : 'vidfast';
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
      ? `https://vidfast.pro/tv/${id}/${sNum}/${epNum}?autoPlay=${autoplay}&theme=${primaryColor}&nextButton=${nextbutton}&title=${title}`
      : `https://vidfast.pro/movie/${id}?autoPlay=${autoplay}&theme=${primaryColor}&title=${title}`;

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

  const requestedServer = overrideServer ?? cfg.vidukiServer ?? 'vidfast';
  const server: AnyServerId = VALID_SERVER_IDS.has(requestedServer) ? requestedServer : 'vidfast';

  // 1. VidLink Pro (Full Movies, TV & Anime MAL API + Customization + Watch Progress)
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
  resolvedMalId?: number;
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
    if (media.title) params.set('title', media.title);
    if (isLikelyAnime(media) && !media.malId) params.set('isAnime', '1');

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
        resolvedMalId: typeof data.resolvedMalId === 'number' ? data.resolvedMalId : undefined,
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
