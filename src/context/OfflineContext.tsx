import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { DownloadQuality, DownloadedItem, MediaItem, Episode } from '../types';

interface OfflineContextType {
  downloads: DownloadedItem[];
  isOffline: boolean;
  isSimulatedOffline: boolean;
  toggleSimulatedOffline: () => void;
  startDownload: (
    media: MediaItem,
    quality?: DownloadQuality,
    seasonNumber?: number,
    episodeNumber?: number,
    audioTrack?: string,
    subtitleTrack?: string
  ) => void;
  startBatchDownload: (
    media: MediaItem,
    episodes: Episode[],
    seasonNumber: number,
    quality?: DownloadQuality,
    audioTrack?: string,
    subtitleTrack?: string
  ) => void;
  pauseDownload: (downloadId: string) => void;
  resumeDownload: (downloadId: string) => void;
  removeDownload: (downloadId: string) => void;
  clearAllDownloads: () => void;
  isMediaDownloaded: (mediaId: string, seasonNumber?: number, episodeNumber?: number) => boolean;
  getDownloadedMedia: (mediaId: string, seasonNumber?: number, episodeNumber?: number) => DownloadedItem | undefined;
  storageStats: {
    totalDeviceMb: number;
    usedByMullahMaxMb: number;
    usedBySystemMb: number;
    freeSpaceMb: number;
  };
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

const STORAGE_KEY = 'mullahmax_offline_downloads_v4';
const SIMULATED_OFFLINE_KEY = 'mullahmax_simulated_offline';

function sanitizeDownloadedItem(item: DownloadedItem): DownloadedItem {
  const safeUrl =
    !item.videoUrl ||
    item.videoUrl.includes('googleapis.com') ||
    item.videoUrl.includes('commondatastorage')
      ? '/media/offline_media_sample.mp4'
      : item.videoUrl;
  return {
    ...item,
    videoUrl: safeUrl,
  };
}

// Initial pre-seeded demo downloads so user immediately has offline items ready to view
const INITIAL_DEMO_DOWNLOADS: DownloadedItem[] = [
  {
    id: 'dl-dune-part-two-4k',
    mediaId: 'dune-part-two',
    title: 'Dune: Part Two',
    type: 'movie',
    posterUrl: 'https://image.tmdb.org/t/p/w780/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/original/eZ239CUp1d6OryZEBPnO2n87gMG.jpg',
    quality: '4k',
    sizeMb: 3420,
    downloadedAt: Date.now() - 1000 * 60 * 60 * 14,
    status: 'completed',
    progress: 100,
    audioTrack: 'English (Dolby Atmos)',
    subtitleTrack: 'English [CC]',
    videoUrl: '/media/offline_media_sample.mp4',
    expiresInDays: 29,
  },
  {
    id: 'dl-deadpool-wolverine-1080p',
    mediaId: 'deadpool-and-wolverine',
    title: 'Deadpool & Wolverine',
    type: 'movie',
    posterUrl: 'https://image.tmdb.org/t/p/w780/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/original/yDHYTfA3R0jFYba16jBB1ef8oIt.jpg',
    quality: '1080p',
    sizeMb: 1840,
    downloadedAt: Date.now() - 1000 * 60 * 60 * 36,
    status: 'completed',
    progress: 100,
    audioTrack: 'English (Dolby Atmos)',
    subtitleTrack: 'English [CC]',
    videoUrl: '/media/offline_media_sample.mp4',
    expiresInDays: 27,
  },
  {
    id: 'dl-severance-s1-e1',
    mediaId: 'severance-apple',
    title: 'Severance',
    type: 'series',
    seasonNumber: 1,
    episodeNumber: 1,
    episodeTitle: 'Good News About Hell',
    posterUrl: 'https://static.tvmaze.com/uploads/images/original_untouched/548/1371406.jpg',
    backdropUrl: 'https://image.tmdb.org/t/p/original/ixgFmf1X59PUZam2qbAfskx2gQr.jpg',
    quality: '1080p',
    sizeMb: 950,
    downloadedAt: Date.now() - 1000 * 60 * 60 * 8,
    status: 'completed',
    progress: 100,
    audioTrack: 'English (Spatial Audio)',
    subtitleTrack: 'English [CC]',
    videoUrl: '/media/offline_media_sample.mp4',
    expiresInDays: 30,
  },
];

export const OfflineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [downloads, setDownloads] = useState<DownloadedItem[]>(() => {
    try {
      // Check current v4 key or migrate from v1/v2/v3
      const saved =
        localStorage.getItem(STORAGE_KEY) ||
        localStorage.getItem('mullahmax_offline_downloads_v1') ||
        localStorage.getItem('mullahmax_offline_downloads_v2') ||
        localStorage.getItem('mullahmax_offline_downloads_v3');
      if (saved) {
        const parsed = JSON.parse(saved) as DownloadedItem[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(sanitizeDownloadedItem);
        }
      }
    } catch (e) {
      console.warn('Failed to parse saved offline downloads', e);
    }
    return INITIAL_DEMO_DOWNLOADS.map(sanitizeDownloadedItem);
  });

  const [realIsOnline, setRealIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const [isSimulatedOffline, setIsSimulatedOffline] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIMULATED_OFFLINE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // Track browser online/offline events
  useEffect(() => {
    const handleOnline = () => setRealIsOnline(true);
    const handleOffline = () => setRealIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Save downloads to local storage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(downloads));
    } catch (e) {
      console.warn('Failed to save downloads to localStorage', e);
    }
  }, [downloads]);

  // Handle active downloads progress ticking
  useEffect(() => {
    const activeDownloads = downloads.filter((d) => d.status === 'downloading');
    if (activeDownloads.length === 0) return;

    const interval = setInterval(() => {
      setDownloads((prev) =>
        prev.map((item) => {
          if (item.status !== 'downloading') return item;
          const nextProgress = Math.min(100, item.progress + Math.floor(Math.random() * 12) + 6);
          const isDone = nextProgress >= 100;
          return {
            ...item,
            progress: nextProgress,
            status: isDone ? 'completed' : 'downloading',
          };
        })
      );
    }, 700);

    return () => clearInterval(interval);
  }, [downloads]);

  const toggleSimulatedOffline = () => {
    setIsSimulatedOffline((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIMULATED_OFFLINE_KEY, String(next));
      } catch {}
      return next;
    });
  };

  const isOffline = !realIsOnline || isSimulatedOffline;

  const startDownload = (
    media: MediaItem,
    quality: DownloadQuality = '1080p',
    seasonNumber?: number,
    episodeNumber?: number,
    audioTrack = 'English (Dolby Atmos)',
    subtitleTrack = 'English [CC]'
  ) => {
    // Generate id
    const downloadId = `dl-${media.id}${seasonNumber ? `-s${seasonNumber}-e${episodeNumber}` : ''}-${quality}`;

    // Calculate download size
    let baseSize = 1450;
    if (media.type === 'movie' && media.durationMinutes) {
      baseSize = Math.round(media.durationMinutes * 12);
    } else if (seasonNumber && episodeNumber && media.seasons) {
      const s = media.seasons.find((sn) => sn.seasonNumber === seasonNumber);
      const ep = s?.episodes.find((e) => e.episodeNumber === episodeNumber);
      if (ep?.downloadSizeMb) baseSize = ep.downloadSizeMb;
    }

    const multiplier = quality === '720p' ? 0.6 : quality === '4k' ? 2.4 : 1.0;
    const sizeMb = Math.round(baseSize * multiplier);

    // Episode details if series
    let epTitle: string | undefined;
    let videoUrl = media.videoPreviewUrl || '/media/offline_media_sample.mp4';
    if (seasonNumber && episodeNumber && media.seasons) {
      const s = media.seasons.find((sn) => sn.seasonNumber === seasonNumber);
      const ep = s?.episodes.find((e) => e.episodeNumber === episodeNumber);
      epTitle = ep?.title;
      if (ep?.videoUrl) videoUrl = ep.videoUrl;
    }

    if (videoUrl.includes('googleapis.com') || videoUrl.includes('commondatastorage')) {
      videoUrl = '/media/offline_media_sample.mp4';
    }

    const newItem: DownloadedItem = {
      id: downloadId,
      mediaId: media.id,
      title: media.title,
      type: media.type,
      seasonNumber,
      episodeNumber,
      episodeTitle: epTitle,
      posterUrl: media.posterUrl,
      backdropUrl: media.backdropUrl,
      quality,
      sizeMb,
      downloadedAt: Date.now(),
      status: 'downloading',
      progress: 5,
      audioTrack,
      subtitleTrack,
      videoUrl,
      expiresInDays: 30,
    };

    setDownloads((prev) => {
      const filtered = prev.filter((d) => d.id !== downloadId);
      return [newItem, ...filtered];
    });
  };

  const startBatchDownload = (
    media: MediaItem,
    episodes: Episode[],
    seasonNumber: number,
    quality: DownloadQuality = '1080p',
    audioTrack = 'English (Dolby Atmos)',
    subtitleTrack = 'English [CC]'
  ) => {
    const multiplier = quality === '720p' ? 0.6 : quality === '4k' ? 2.4 : 1.0;
    const newItems: DownloadedItem[] = episodes.map((ep, idx) => {
      const downloadId = `dl-${media.id}-s${seasonNumber}-e${ep.episodeNumber}-${quality}`;
      const sizeMb = Math.round((ep.downloadSizeMb || 950) * multiplier);
      return {
        id: downloadId,
        mediaId: media.id,
        title: media.title,
        type: media.type,
        seasonNumber,
        episodeNumber: ep.episodeNumber,
        episodeTitle: ep.title,
        posterUrl: media.posterUrl,
        backdropUrl: media.backdropUrl,
        quality,
        sizeMb,
        downloadedAt: Date.now() + idx,
        status: 'downloading',
        progress: 8 + (idx % 3) * 2,
        audioTrack,
        subtitleTrack,
        videoUrl:
          !ep.videoUrl || ep.videoUrl.includes('googleapis.com') || ep.videoUrl.includes('commondatastorage')
            ? '/media/offline_media_sample.mp4'
            : ep.videoUrl,
        expiresInDays: 30,
      };
    });

    setDownloads((prev) => {
      const idsToRemove = new Set(newItems.map((n) => n.id));
      const filtered = prev.filter((d) => !idsToRemove.has(d.id));
      return [...newItems, ...filtered];
    });
  };

  const pauseDownload = (downloadId: string) => {
    setDownloads((prev) =>
      prev.map((d) => (d.id === downloadId ? { ...d, status: 'paused' } : d))
    );
  };

  const resumeDownload = (downloadId: string) => {
    setDownloads((prev) =>
      prev.map((d) => (d.id === downloadId ? { ...d, status: 'downloading' } : d))
    );
  };

  const removeDownload = (downloadId: string) => {
    setDownloads((prev) => prev.filter((d) => d.id !== downloadId));
  };

  const clearAllDownloads = () => {
    setDownloads([]);
  };

  const isMediaDownloaded = (mediaId: string, seasonNumber?: number, episodeNumber?: number) => {
    return downloads.some((d) => {
      if (d.mediaId !== mediaId) return false;
      if (seasonNumber !== undefined && d.seasonNumber !== seasonNumber) return false;
      if (episodeNumber !== undefined && d.episodeNumber !== episodeNumber) return false;
      return d.status === 'completed';
    });
  };

  const getDownloadedMedia = (mediaId: string, seasonNumber?: number, episodeNumber?: number) => {
    return downloads.find((d) => {
      if (d.mediaId !== mediaId) return false;
      if (seasonNumber !== undefined && d.seasonNumber !== seasonNumber) return false;
      if (episodeNumber !== undefined && d.episodeNumber !== episodeNumber) return false;
      return d.status === 'completed';
    });
  };

  const storageStats = useMemo(() => {
    const usedByMullahMaxMb = downloads
      .filter((d) => d.status === 'completed')
      .reduce((sum, d) => sum + d.sizeMb, 0);
    const totalDeviceMb = 128 * 1024; // 128 GB
    const usedBySystemMb = 48 * 1024; // 48 GB
    const freeSpaceMb = Math.max(0, totalDeviceMb - usedBySystemMb - usedByMullahMaxMb);

    return {
      totalDeviceMb,
      usedByMullahMaxMb,
      usedBySystemMb,
      freeSpaceMb,
    };
  }, [downloads]);

  return (
    <OfflineContext.Provider
      value={{
        downloads,
        isOffline,
        isSimulatedOffline,
        toggleSimulatedOffline,
        startDownload,
        startBatchDownload,
        pauseDownload,
        resumeDownload,
        removeDownload,
        clearAllDownloads,
        isMediaDownloaded,
        getDownloadedMedia,
        storageStats,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
};

export const useOffline = () => {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
};
