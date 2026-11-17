import { MediaItem } from '../types';

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
    name: 'VidLink HD',
    tag: 'Ad-Free · Fast',
    badge: 'VidLink',
    description: 'Clean ad-free HD & 4K player with instant autoplay and auto-resume.',
    adFree: true,
    latencyMs: 45,
  },
  {
    id: 'vidfast',
    name: 'VidFast',
    tag: 'Ad-Free · Turbo',
    badge: 'VidFast',
    description: 'Zero popups with adaptive HLS streaming and auto-next episode.',
    adFree: true,
    latencyMs: 55,
  },
  {
    id: 'videasy',
    name: 'Videasy',
    tag: 'Ad-Free · Smooth',
    badge: 'Videasy',
    description: 'Smooth low-buffer stream with multi-language subtitles.',
    adFree: true,
    latencyMs: 65,
  },
  {
    id: 'vixsrc',
    name: 'VixSrc',
    tag: 'Ad-Free · 4K',
    badge: 'VixSrc',
    description: 'Adaptive 4K & HD multi-audio stream with synchronized subtitles.',
    adFree: true,
    latencyMs: 75,
  },
  {
    id: 'primesrc',
    name: 'PrimeSrc Multi-Host',
    tag: 'Multi-Host',
    badge: 'PrimeSrc',
    description: 'Aggregates Luluvdoo, Filemoon, Voe, Mixdrop, Dood, Streamtape & Vidmoly.',
    adFree: true,
    latencyMs: 100,
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
    'vidlink',
    'vidfast',
    'videasy',
    'vixsrc',
    'primesrc',
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
  accentColor: string; // hex color without # (default: e50914)
  customTemplate: string;
}

const STORAGE_KEY_PROVIDER = 'mullahmax_video_provider_cfg_v7';

const DEFAULT_CONFIG: VideoProviderConfig = {
  provider: 'vidlink',
  vidukiServer: 'vidlink',
  accentColor: 'e50914',
  customTemplate:
    'https://vidlink.pro/movie/{id}?primaryColor=e50914&secondaryColor=170000&iconColor=e50914&autoplay=true&title=false&poster=true',
};

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
        : 'vidlink';
      return {
        provider: VALID_SERVER_IDS.has(parsed.provider) ? parsed.provider : savedServer,
        vidukiServer: savedServer,
        accentColor: (parsed.accentColor || 'e50914').replace('#', ''),
        customTemplate: parsed.customTemplate || DEFAULT_CONFIG.customTemplate,
      };
    }
  } catch {}
  return { ...DEFAULT_CONFIG };
}

export function saveVideoProviderConfig(config: VideoProviderConfig) {
  try {
    const validServer = VALID_SERVER_IDS.has(config.vidukiServer) ? config.vidukiServer : 'vidlink';
    const cleaned: VideoProviderConfig = {
      ...config,
      vidukiServer: validServer,
      accentColor: (config.accentColor || 'e50914').replace('#', ''),
    };
    localStorage.setItem(STORAGE_KEY_PROVIDER, JSON.stringify(cleaned));
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

/**
 * Constructs the stream URL for any selected movie or series, defaulting to
 * fast, ad-free autoplay players (VidLink -> VidFast -> Videasy -> VixSrc -> PrimeSrc).
 */
export function generateStreamSource(
  media: MediaItem,
  season = 1,
  episode = 1,
  overrideServer?: AnyServerId
): StreamSourceResult {
  const cfg = getVideoProviderConfig();
  const targetId = resolveTargetIdentifier(media);
  const imdbFallback = media.imdbId || (targetId.startsWith('tt') ? targetId : 'tt15239678');
  const color = (cfg.accentColor || 'e50914').replace('#', '');
  const sNum = Math.max(1, season);
  const epNum = Math.max(1, episode);

  const requestedServer = overrideServer ?? cfg.vidukiServer ?? 'vidlink';
  const server: AnyServerId = VALID_SERVER_IDS.has(requestedServer) ? requestedServer : 'vidlink';

  // 1. VidLink Pro (Default: Cleanest, Fastest, Ad-Free Autoplay)
  if (server === 'vidlink') {
    const url =
      media.type === 'series'
        ? `https://vidlink.pro/tv/${targetId}/${sNum}/${epNum}?primaryColor=${color}&secondaryColor=170000&iconColor=${color}&autoplay=true&title=false&poster=true&nextbutton=true`
        : `https://vidlink.pro/movie/${targetId}?primaryColor=${color}&secondaryColor=170000&iconColor=${color}&autoplay=true&title=false&poster=true`;
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

  // 4. VixSrc (Ad-Free 4K Multi-Audio)
  if (server === 'vixsrc') {
    const url =
      media.type === 'series'
        ? `https://vixsrc.to/tv/${targetId}/${sNum}/${epNum}?primaryColor=${color}&secondaryColor=170000&autoplay=1`
        : `https://vixsrc.to/movie/${targetId}?primaryColor=${color}&secondaryColor=170000&autoplay=1`;
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

  // 6. MultiEmbed (Backup)
  if (server === 'superembed') {
    const isTmdb = Boolean(media.tmdbId) || !targetId.startsWith('tt');
    const url =
      media.type === 'series'
        ? `https://multiembed.mov/?video_id=${targetId}&tmdb=${isTmdb ? 1 : 0}&s=${sNum}&e=${epNum}`
        : `https://multiembed.mov/?video_id=${targetId}&tmdb=${isTmdb ? 1 : 0}`;
    return {
      type: 'iframe',
      url,
      providerName: 'MultiEmbed',
      serverId: 'superembed',
      targetId,
    };
  }

  // 7. VidSrc Edge (Backup)
  if (server === 'vidsrc_sh') {
    const url =
      media.type === 'series'
        ? `https://vidsrc.sh/embed/tv?tmdb=${targetId}&season=${sNum}&episode=${epNum}&autoplay=true`
        : `https://vidsrc.sh/embed/movie?tmdb=${targetId}&autoplay=true`;
    return {
      type: 'iframe',
      url,
      providerName: 'VidSrc Edge',
      serverId: 'vidsrc_sh',
      targetId,
    };
  }

  // 8. 2Embed (Backup)
  if (server === '2embed') {
    const url =
      media.type === 'series'
        ? `https://www.2embed.cc/embedtv/${targetId}&s=${sNum}&e=${epNum}`
        : `https://www.2embed.cc/embed/${targetId}`;
    return {
      type: 'iframe',
      url,
      providerName: '2Embed',
      serverId: '2embed',
      targetId,
    };
  }

  // 9. VidSrc Pro (Backup)
  const url =
    media.type === 'series'
      ? `https://vidsrc.to/embed/tv/${imdbFallback}/${sNum}/${epNum}`
      : `https://vidsrc.to/embed/movie/${imdbFallback}`;
  return {
    type: 'iframe',
    url,
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
