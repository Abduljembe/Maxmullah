/**
 * Genuine per-title video file downloader.
 * GUARANTEES:
 * 1. NEVER substitutes a fake/static sample MP4 clip for any chosen movie.
 * 2. Validates direct .mp4 / .m3u8 streams before triggering the browser's download manager.
 * 3. Routes remote HTTP(S) direct & HLS streams through /api/download-stream so the chosen title downloads cleanly as .mp4.
 */

export interface DownloadResult {
  ok: boolean;
  error?: string;
}

export function isDirectStreamUrl(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (
    !trimmed ||
    trimmed.includes('offline_media_sample.mp4') ||
    trimmed.includes('googleapis.com') ||
    trimmed.includes('commondatastorage') ||
    trimmed.includes('storage.google')
  ) {
    return false;
  }
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('blob:')
  );
}

function triggerAnchorDownload(href: string, safeFilename: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = safeFilename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function downloadVideoFile(url: string, filename: string): Promise<DownloadResult> {
  const baseName = filename.replace(/\.mp4$/i, '').replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeFilename = `${baseName || 'MullahMax_Movie'}.mp4`;

  if (!isDirectStreamUrl(url)) {
    return {
      ok: false,
      error: 'No direct .mp4 or .m3u8 stream link is attached to this title yet.',
    };
  }

  const trimmed = url.trim();

  if (trimmed.startsWith('blob:')) {
    triggerAnchorDownload(trimmed, safeFilename);
    return { ok: true };
  }

  // Validate stream reachability via /api/download-stream?check=1 first
  const checkEndpoint = `/api/download-stream?check=1&url=${encodeURIComponent(
    trimmed
  )}&filename=${encodeURIComponent(safeFilename)}`;

  try {
    const checkRes = await fetch(checkEndpoint);
    if (!checkRes.ok) {
      let errMsg = `Stream check failed (HTTP ${checkRes.status}).`;
      try {
        const body = (await checkRes.json()) as { error?: string };
        if (body.error) errMsg = body.error;
      } catch {}
      return { ok: false, error: errMsg };
    }

    const downloadEndpoint = `/api/download-stream?url=${encodeURIComponent(
      trimmed
    )}&filename=${encodeURIComponent(safeFilename)}`;

    triggerAnchorDownload(downloadEndpoint, safeFilename);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error starting download.',
    };
  }
}
