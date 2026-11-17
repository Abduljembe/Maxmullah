import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;
const DEFAULT_TMDB_KEY = process.env.TMDB_API_KEY || '1cf50e6248dc270629e802686245c2c8';

interface VixSrcEntry {
  tmdb_id: number;
  imdb_id?: string;
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

const vixsrcIndexCache: Record<'movie' | 'tv', { data: VixSrcEntry[]; fetchedAt: number } | null> = {
  movie: null,
  tv: null,
};
const tmdbMetadataCache = new Map<string, { data: Record<string, unknown>; fetchedAt: number }>();

const INDEX_CACHE_TTL_MS = 30 * 60 * 1000;
const TMDB_CACHE_TTL_MS = 60 * 60 * 1000;

async function getVixSrcIndex(type: 'movie' | 'tv'): Promise<VixSrcEntry[]> {
  const cached = vixsrcIndexCache[type];
  if (cached && Date.now() - cached.fetchedAt < INDEX_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const res = await fetch(`https://vixsrc.to/api/list/${type}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const json = (await res.json()) as VixSrcEntry[];
      if (Array.isArray(json) && json.length > 0) {
        vixsrcIndexCache[type] = { data: json, fetchedAt: Date.now() };
        return json;
      }
    }
  } catch (err) {
    console.warn(`[servers/catalog] Failed to fetch vixsrc ${type} list:`, err);
  }

  return cached?.data || [];
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

  try {
    const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${DEFAULT_TMDB_KEY}&append_to_response=credits,watch/providers`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    if (!data || (!data.title && !data.name)) return null;
    if (!data.poster_path && !data.backdrop_path) return null;
    if (imdbId && !data.imdb_id) {
      data.imdb_id = imdbId;
    }
    tmdbMetadataCache.set(cacheKey, { data, fetchedAt: Date.now() });
    return data;
  } catch {
    return null;
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
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('169.254.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.')
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function startServer() {
  const app = express();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  /**
   * Fetches real indexed movies & TV series directly from VixSrc catalog servers
   * and hydrates them with metadata/posters from TMDB.
   */
  app.get('/api/servers/catalog', async (req, res) => {
    const rawType = req.query.type === 'tv' ? 'tv' : 'movie';
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const pageSize = 20;

    try {
      const index = await getVixSrcIndex(rawType);
      if (index.length === 0) {
        res.json({ items: [], page, totalPages: 1, totalResults: 0 });
        return;
      }

      // Walk backwards from most popular/famous entries at the tail of the list
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
        slice.map((entry) => fetchTMDBItemMetadata(rawType, entry.tmdb_id, entry.imdb_id))
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
   * Queries live PrimeSrc host servers (Filemoon, Voe, Dood, Luluvdoo, Streamtape, Mixdrop, etc.)
   * and checks VixSrc availability for any chosen movie or TV episode.
   */
  app.get('/api/servers/sources', async (req, res) => {
    const tmdbId = parseInt(String(req.query.tmdbId || '0'), 10);
    const imdbId = typeof req.query.imdbId === 'string' ? req.query.imdbId.trim() : '';
    const type = req.query.type === 'series' || req.query.type === 'tv' ? 'tv' : 'movie';
    const season = Math.max(1, parseInt(String(req.query.season || '1'), 10) || 1);
    const episode = Math.max(1, parseInt(String(req.query.episode || '1'), 10) || 1);

    if (!tmdbId && !imdbId) {
      res.status(400).json({ error: 'tmdbId or imdbId is required' });
      return;
    }

    try {
      const targetParam = tmdbId > 0 ? `tmdb=${tmdbId}` : `imdb=${encodeURIComponent(imdbId)}`;
      const primeUrl =
        type === 'tv'
          ? `https://primesrc.me/api/v1/s?${targetParam}&season=${season}&episode=${episode}&type=tv`
          : `https://primesrc.me/api/v1/s?${targetParam}&type=movie`;

      const [primeResult, vixIndex] = await Promise.allSettled([
        fetch(primeUrl, {
          headers: {
            Referer:
              type === 'tv'
                ? `https://primesrc.me/embed/tv?${targetParam}&season=${season}&episode=${episode}`
                : `https://primesrc.me/embed/movie?${targetParam}`,
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(5500),
        }).then((r) => (r.ok ? r.json() : null)),
        getVixSrcIndex(type),
      ]);

      let primeSrcHosts: PrimeSrcHost[] = [];
      let primeInfo: Record<string, unknown> | null = null;
      if (primeResult.status === 'fulfilled' && primeResult.value) {
        const data = primeResult.value as {
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

      let vixsrcAvailable = false;
      if (vixIndex.status === 'fulfilled' && Array.isArray(vixIndex.value)) {
        vixsrcAvailable = vixIndex.value.some(
          (entry) =>
            (tmdbId > 0 && entry.tmdb_id === tmdbId) ||
            (imdbId && entry.imdb_id === imdbId)
        );
      }

      res.json({
        vixsrcAvailable,
        primeSrcHosts,
        info: primeInfo,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to probe server sources';
      res.status(502).json({ error: msg, vixsrcAvailable: false, primeSrcHosts: [] });
    }
  });

  /**
   * Genuine per-movie download stream endpoint.
   * - Supports direct .mp4 / video files (streamed with Content-Disposition: attachment)
   * - Supports .m3u8 HLS playlists (remuxed on the fly to .mp4 via /usr/bin/ffmpeg)
   * - Supports ?check=1 preflight validation so UI can report invalid/HTML URLs cleanly
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
    app.use(express.static(distDir));
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
