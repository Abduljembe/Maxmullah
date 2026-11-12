import { MediaItem } from '../types';

export type VideoStreamProvider = 'vidlink' | 'vidsrc_sh' | 'vidsrc' | '2embed' | 'superembed' | 'viduki' | 'mullahmax' | 'custom';
export type VidukiServerId = 1 | 2 | 3 | 4;
export type AnyServerId = 'vidlink' | 'vidsrc_sh' | 'vidsrc' | '2embed' | 'superembed' | 1 | 2 | 3 | 4;

export interface VidukiServerDefinition {
  id: AnyServerId;
  name: string;
  tag: string;
  badge: string;
  description: string;
  latencyMs: number;
}

export const VIDUKI_SERVERS: VidukiServerDefinition[] = [
  {
    id: 'vidlink',
    name: 'Source 1 (HD Auto)',
    tag: 'Primary',
    badge: 'Source 1',
    description: 'High-speed adaptive HD stream with automatic resume.',
    latencyMs: 65,
  },
  {
    id: 'vidsrc_sh',
    name: 'Source 2 (Fast HD)',
    tag: 'Fast Mirror',
    badge: 'Source 2',
    description: 'Fast global edge stream for smooth playback.',
    latencyMs: 75,
  },
  {
    id: '2embed',
    name: 'Source 3 (Adaptive)',
    tag: 'Data Saver',
    badge: 'Source 3',
    description: 'Lightweight stream optimized for mobile or slower networks.',
    latencyMs: 90,
  },
  {
    id: 'vidsrc',
    name: 'Source 4 (HD Backup)',
    tag: 'Backup',
    badge: 'Source 4',
    description: 'Reliable secondary HD stream mirror.',
    latencyMs: 110,
  },
  {
    id: 'superembed',
    name: 'Source 5 (Global)',
    tag: 'Global',
    badge: 'Source 5',
    description: 'Worldwide multi-region stream mirror.',
    latencyMs: 145,
  },
  {
    id: 1,
    name: 'Source 6 (Standard)',
    tag: 'Compatible',
    badge: 'Source 6',
    description: 'Broad compatibility stream for older titles.',
    latencyMs: 210,
  },
  {
    id: 2,
    name: 'Source 7 (Multi-Audio)',
    tag: 'Multi-Lang',
    badge: 'Source 7',
    description: 'Includes multiple audio languages and subtitle tracks.',
    latencyMs: 240,
  },
  {
    id: 4,
    name: 'Source 8 (Ultra HD)',
    tag: '4K HDR',
    badge: 'Source 8',
    description: 'High-bitrate 1080p and 4K master source.',
    latencyMs: 280,
  },
];

export function getNextFastestServer(currentServer: AnyServerId): AnyServerId {
  const order: AnyServerId[] = ['vidlink', 'vidsrc_sh', '2embed', 'vidsrc', 'superembed', 1, 2, 4];
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

const STORAGE_KEY_PROVIDER = 'mullahmax_video_provider_cfg_v5';

export function getVideoProviderConfig(): VideoProviderConfig {
  if (typeof window === 'undefined') {
    return {
      provider: 'vidlink',
      vidukiServer: 'vidlink',
      accentColor: 'e50914',
      customTemplate: 'https://vidlink.pro/movie/{id}?primaryColor=e50914&autoplay=true',
    };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROVIDER);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        provider: parsed.provider || 'vidlink',
        vidukiServer: parsed.vidukiServer || 'vidlink',
        accentColor: (parsed.accentColor || 'e50914').replace('#', ''),
        customTemplate: parsed.customTemplate || 'https://vidlink.pro/movie/{id}?primaryColor=e50914&autoplay=true',
      };
    }
  } catch {}
  return {
    provider: 'vidlink',
    vidukiServer: 'vidlink',
    accentColor: 'e50914',
    customTemplate: 'https://vidlink.pro/movie/{id}?primaryColor=e50914&autoplay=true',
  };
}

export function saveVideoProviderConfig(config: VideoProviderConfig) {
  try {
    const cleaned = {
      ...config,
      accentColor: (config.accentColor || 'e50914').replace('#', ''),
    };
    localStorage.setItem(STORAGE_KEY_PROVIDER, JSON.stringify(cleaned));
  } catch {}
}

/**
 * Resolves the cleanest TMDB ID or IMDb ID for a media item.
 */
export function resolveTargetIdentifier(media: MediaItem): string {
  // 1. Explicit TMDB ID
  if (media.tmdbId && media.tmdbId > 0) {
    return String(media.tmdbId);
  }

  // 2. Explicit IMDb ID
  if (media.imdbId && media.imdbId.trim()) {
    return media.imdbId.trim();
  }

  // 3. Check if media.id is an IMDb ID (e.g., starts with 'tt')
  if (media.id && /^tt\d+$/i.test(media.id)) {
    return media.id;
  }

  // 4. Check if media.id is a formatted tmdb prefix (e.g. 'tmdb-movie-693134' or 'tmdb-tv-95396')
  const tmdbMatch = media.id?.match(/tmdb-(?:movie|tv)-(\d+)/i);
  if (tmdbMatch && tmdbMatch[1]) {
    return tmdbMatch[1];
  }

  // 5. Intelligent fallback to universal high-quality IDs for demo entries
  if (media.type === 'series') {
    return '76479'; // The Boys TMDB ID
  }
  return '693134'; // Dune Part Two TMDB ID
}

export interface StreamSourceResult {
  type: 'iframe' | 'mp4';
  url: string;
  providerName: string;
  serverId?: AnyServerId;
  targetId: string;
}

/**
 * Constructs the stream URL for any selected movie or series across multi-CDN streaming nodes.
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

  const server: AnyServerId = overrideServer ?? cfg.vidukiServer ?? 'vidlink';

  // 1. Server 1: VidLink Pro (Default - Blazing fast, ad-free, auto-resumes)
  if (server === 'vidlink') {
    let url: string;
    if (media.type === 'series') {
      url = `https://vidlink.pro/tv/${targetId}/${sNum}/${epNum}?primaryColor=${color}&secondaryColor=170000&iconColor=${color}&autoplay=true&title=false&poster=true`;
    } else {
      url = `https://vidlink.pro/movie/${targetId}?primaryColor=${color}&secondaryColor=170000&iconColor=${color}&autoplay=true&title=false&poster=true`;
    }
    return {
      type: 'iframe',
      url,
      providerName: 'VidLink Pro (Ad-Free & Fast)',
      serverId: 'vidlink',
      targetId,
    };
  }

  // 2. Server 2: VidSrc Cloudflare Edge (Instant Buffer)
  if (server === 'vidsrc_sh') {
    let url: string;
    if (media.type === 'series') {
      url = `https://vidsrc.sh/embed/tv?tmdb=${targetId}&season=${sNum}&episode=${epNum}&autoplay=true`;
    } else {
      url = `https://vidsrc.sh/embed/movie?tmdb=${targetId}&autoplay=true`;
    }
    return {
      type: 'iframe',
      url,
      providerName: 'VidSrc Cloudflare Edge',
      serverId: 'vidsrc_sh',
      targetId,
    };
  }

  // 3. Server 4: VidSrc Pro Fast
  if (server === 'vidsrc') {
    let url: string;
    if (media.type === 'series') {
      url = `https://vidsrc.to/embed/tv/${imdbFallback}/${sNum}/${epNum}`;
    } else {
      url = `https://vidsrc.to/embed/movie/${imdbFallback}`;
    }
    return {
      type: 'iframe',
      url,
      providerName: 'VidSrc Pro S4',
      serverId: 'vidsrc',
      targetId: imdbFallback,
    };
  }

  // 3. Server 3: 2Embed Ultra-Fast
  if (server === '2embed') {
    let url: string;
    if (media.type === 'series') {
      url = `https://www.2embed.cc/embedtv/${targetId}&s=${sNum}&e=${epNum}`;
    } else {
      url = `https://www.2embed.cc/embed/${targetId}`;
    }
    return {
      type: 'iframe',
      url,
      providerName: '2Embed Ultra S3',
      serverId: '2embed',
      targetId,
    };
  }

  // 4. Server 4: MultiEmbed Fast
  if (server === 'superembed') {
    let url: string;
    const isTmdb = Boolean(media.tmdbId);
    if (media.type === 'series') {
      url = `https://multiembed.mov/?video_id=${targetId}&tmdb=${isTmdb ? 1 : 0}&s=${sNum}&e=${epNum}`;
    } else {
      url = `https://multiembed.mov/?video_id=${targetId}&tmdb=${isTmdb ? 1 : 0}`;
    }
    return {
      type: 'iframe',
      url,
      providerName: 'MultiEmbed S4',
      serverId: 'superembed',
      targetId,
    };
  }

  // 5. Viduki Servers 1, 2, 3, 4
  const vidukiId = (typeof server === 'number' && server >= 1 && server <= 4) ? (server as VidukiServerId) : 1;
  const serverMeta = VIDUKI_SERVERS.find((s) => s.id === vidukiId) || VIDUKI_SERVERS[4];

  let url: string;
  if (media.type === 'series') {
    url = `https://viduki.net/${vidukiId}/tv/${imdbFallback}/${sNum}/${epNum}?color=${color}`;
  } else {
    url = `https://viduki.net/${vidukiId}/movie/${imdbFallback}?color=${color}`;
  }

  return {
    type: 'iframe',
    url,
    providerName: `Viduki ${serverMeta.badge}`,
    serverId: vidukiId,
    targetId: imdbFallback,
  };
}
