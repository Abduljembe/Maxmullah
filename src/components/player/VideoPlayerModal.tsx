import React, { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
  X,
  HardDrive,
  ListVideo,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Settings,
  Captions,
} from 'lucide-react';
import Hls from 'hls.js';
import { MediaItem } from '../../types';
import { useOffline } from '../../context/OfflineContext';
import { useProfile } from '../../context/ProfileContext';
import { ensureMediaSeasons } from '../../utils/seriesUtils';
import { isDirectStreamUrl } from '../../utils/fileDownloader';
import {
  generateStreamSource,
  AnyServerId,
  getVideoProviderConfig,
  fetchLiveServerSources,
  getCachedLiveServerSources,
  LiveServerSourcesResponse,
  VixSrcPlayerEvent,
  VidLinkMediaDataEvent,
  VidLinkMediaProgressEntry,
  getSavedResumeSeconds,
  saveResumeSeconds,
  getVidLinkResumeSeconds,
  saveVidLinkMediaData,
  isLikelyAnime,
} from '../../services/videoProviderService';
import { injectAdShieldIntoIframe, prewarmStreamUrl } from '../../utils/adBlocker';

interface VideoPlayerModalProps {
  media: MediaItem;
  seasonNumber?: number;
  episodeNumber?: number;
  onClose: () => void;
  onSelectEpisode?: (seasonNum: number, episodeNum: number) => void;
}

const DEFAULT_FALLBACK_QUEUE: AnyServerId[] = ['vidlink', 'vidfast', 'vidsrc_sh', '2embed'];

export const VideoPlayerModal: React.FC<VideoPlayerModalProps> = ({
  media,
  seasonNumber = 1,
  episodeNumber = 1,
  onClose,
  onSelectEpisode,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const { isMediaDownloaded, getDownloadedMedia, isOffline } = useOffline();
  const { updateWatchProgress } = useProfile();

  const [currentSeason, setCurrentSeason] = useState<number>(seasonNumber || 1);
  const [currentEpisode, setCurrentEpisode] = useState<number>(episodeNumber || 1);
  const [drawerSeason, setDrawerSeason] = useState<number>(seasonNumber || 1);

  useEffect(() => {
    if (seasonNumber) {
      setCurrentSeason(seasonNumber);
      setDrawerSeason(seasonNumber);
    }
    if (episodeNumber) setCurrentEpisode(episodeNumber);
  }, [seasonNumber, episodeNumber]);

  const isDownloaded = isMediaDownloaded(media.id, currentSeason, currentEpisode);
  const downloadedItem = getDownloadedMedia(media.id, currentSeason, currentEpisode);
  const hasPlayableDownloadedFile = isDirectStreamUrl(downloadedItem?.videoUrl);

  const initialCachedSources = getCachedLiveServerSources(media, seasonNumber || 1, episodeNumber || 1);
  const initialDirectUrl =
    initialCachedSources?.directStreamUrl && isDirectStreamUrl(initialCachedSources.directStreamUrl)
      ? initialCachedSources.directStreamUrl
      : '';

  const [playerMode, setPlayerMode] = useState<'stream' | 'native' | 'offline'>(() =>
    isOffline && hasPlayableDownloadedFile
      ? 'offline'
      : initialDirectUrl
      ? 'native'
      : 'stream'
  );

  // Automatic server resolution & silent failover queue (zero manual server selection)
  const [isResolvingServer, setIsResolvingServer] = useState<boolean>(
    () => !(isOffline && hasPlayableDownloadedFile) && !initialCachedSources
  );
  const [serverQueue, setServerQueue] = useState<AnyServerId[]>(() => {
    const cachedList = initialCachedSources?.availableServers?.filter((s) => s !== 'primesrc');
    return cachedList && cachedList.length > 0 ? cachedList : DEFAULT_FALLBACK_QUEUE;
  });
  const [queueIndex, setQueueIndex] = useState<number>(0);
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [iframeLoaded, setIframeLoaded] = useState<boolean>(false);
  const [directStreamUrl, setDirectStreamUrl] = useState<string>(initialDirectUrl);
  const [liveSources, setLiveSources] = useState<LiveServerSourcesResponse | null>(
    initialCachedSources
  );

  // Native HTML5 / HLS media controls state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedTime, setBufferedTime] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showEpisodeDrawer, setShowEpisodeDrawer] = useState(false);

  const [providerCfg] = useState(() => getVideoProviderConfig());
  const [startAtSeconds, setStartAtSeconds] = useState<number>(() => {
    const localResume = getSavedResumeSeconds(media.id, seasonNumber || 1, episodeNumber || 1);
    const vidLinkResume = getVidLinkResumeSeconds(media, seasonNumber || 1, episodeNumber || 1);
    return Math.max(localResume, vidLinkResume);
  });

  const controlsTimeoutRef = useRef<number | null>(null);
  const lastSavedProgressSecRef = useRef<number>(0);

  const activeServer: AnyServerId = serverQueue[queueIndex] || 'vidlink';

  // Sync saved resume position when changing movie or episode
  useEffect(() => {
    const localResume = getSavedResumeSeconds(media.id, currentSeason, currentEpisode);
    const vidLinkResume = getVidLinkResumeSeconds(media, currentSeason, currentEpisode);
    setStartAtSeconds(Math.max(localResume, vidLinkResume));
    lastSavedProgressSecRef.current = 0;
  }, [media, currentSeason, currentEpisode]);

  // Automatic backend probe: find the verified working server before mounting the player
  useEffect(() => {
    if (isOffline && hasPlayableDownloadedFile) {
      setPlayerMode('offline');
      setIsResolvingServer(false);
      return;
    }

    const cached = getCachedLiveServerSources(media, currentSeason, currentEpisode);
    if (cached) {
      setLiveSources(cached);
      if (cached.directStreamUrl && isDirectStreamUrl(cached.directStreamUrl)) {
        setDirectStreamUrl(cached.directStreamUrl);
        setPlayerMode('native');
        setIsResolvingServer(false);
        return;
      }
      const verified = cached.availableServers?.filter((srv) => srv !== 'primesrc');
      setServerQueue(verified && verified.length > 0 ? verified : DEFAULT_FALLBACK_QUEUE);
      setQueueIndex(0);
      setPlayerMode('stream');
      setIsResolvingServer(false);
      setIframeLoaded(false);
      setIframeKey((k) => k + 1);
      return;
    }

    let cancelled = false;
    setIsResolvingServer(true);
    setIframeLoaded(false);
    setQueueIndex(0);

    const resolveWithTimeout = Promise.race<LiveServerSourcesResponse>([
      fetchLiveServerSources(media, currentSeason, currentEpisode),
      new Promise<LiveServerSourcesResponse>((resolve) =>
        window.setTimeout(
          () =>
            resolve({
              vidlinkAvailable: true,
              vixsrcAvailable: false,
              availableServers: DEFAULT_FALLBACK_QUEUE,
              primeSrcHosts: [],
            }),
          2800
        )
      ),
    ]);

    resolveWithTimeout.then((res) => {
      if (cancelled) return;
      setLiveSources(res);

      if (res.directStreamUrl && isDirectStreamUrl(res.directStreamUrl)) {
        setDirectStreamUrl(res.directStreamUrl);
        setPlayerMode('native');
        setIsResolvingServer(false);
        return;
      }

      const verified =
        res.availableServers && res.availableServers.length > 0
          ? res.availableServers.filter((srv) => srv !== 'primesrc')
          : DEFAULT_FALLBACK_QUEUE;

      setServerQueue(verified.length > 0 ? verified : DEFAULT_FALLBACK_QUEUE);
      setQueueIndex(0);
      setPlayerMode('stream');
      setIsResolvingServer(false);
      setIframeKey((k) => k + 1);
    });

    return () => {
      cancelled = true;
    };
  }, [media, currentSeason, currentEpisode, isOffline, hasPlayableDownloadedFile]);

  // Silent automatic failover across verified servers if a stream stalls without loading
  useEffect(() => {
    if (isResolvingServer || playerMode !== 'stream' || iframeLoaded) return;
    if (queueIndex >= serverQueue.length - 1) return;

    const timeout = window.setTimeout(() => {
      setQueueIndex((prev) => (prev < serverQueue.length - 1 ? prev + 1 : prev));
      setIframeLoaded(false);
      setIframeKey((k) => k + 1);
    }, 5200);

    return () => window.clearTimeout(timeout);
  }, [isResolvingServer, playerMode, iframeLoaded, queueIndex, serverQueue.length, iframeKey]);

  const allSeasons = ensureMediaSeasons(media);
  const activeSeason = allSeasons.find((s) => s.seasonNumber === currentSeason) || allSeasons[0];
  const resolvedMalId = liveSources?.resolvedMalId || media.malId;

  const resolvedMedia: MediaItem =
    liveSources?.resolvedTmdbId || liveSources?.resolvedImdbId || resolvedMalId
      ? {
          ...media,
          tmdbId: liveSources?.resolvedTmdbId || media.tmdbId,
          imdbId: liveSources?.resolvedImdbId || media.imdbId,
          malId: resolvedMalId,
        }
      : media;

  const activeStreamSource = generateStreamSource(
    resolvedMedia,
    currentSeason,
    currentEpisode,
    activeServer,
    {
      primaryColor: 'FFFFFF',
      secondaryColor: '3F3F46',
      iconColor: 'FFFFFF',
      icons: 'vid',
      playerType: providerCfg.playerType,
      showTitle: false,
      showPoster: false,
      autoplay: true,
      nextButton: media.type === 'series',
      lang: providerCfg.preferredLang,
      subFile: providerCfg.subFile,
      subLabel: providerCfg.subLabel,
      startAt: startAtSeconds,
      malId: resolvedMalId,
      animeSubOrDub: providerCfg.animeSubOrDub,
      animeFallback: providerCfg.animeFallback,
      useAnimeMode: isLikelyAnime(media),
      adShieldEnabled: true,
    }
  );

  useEffect(() => {
    if (!isResolvingServer && activeStreamSource?.url) {
      prewarmStreamUrl(activeStreamSource.url);
    }
  }, [isResolvingServer, activeStreamSource?.url]);

  const handleNavigateEpisode = (offset: number) => {
    if (media.type !== 'series') return;
    const currentSeasonData = allSeasons.find((s) => s.seasonNumber === currentSeason);
    const epsCount = currentSeasonData?.episodes.length || 10;

    let targetEp = currentEpisode + offset;
    let targetSeason = currentSeason;

    if (targetEp > epsCount) {
      if (currentSeason < allSeasons.length) {
        targetSeason = currentSeason + 1;
        targetEp = 1;
      } else {
        return;
      }
    } else if (targetEp < 1) {
      if (currentSeason > 1) {
        targetSeason = currentSeason - 1;
        const prevSeasonData = allSeasons.find((s) => s.seasonNumber === targetSeason);
        targetEp = prevSeasonData?.episodes.length || 10;
      } else {
        return;
      }
    }

    setCurrentSeason(targetSeason);
    setCurrentEpisode(targetEp);
    setDrawerSeason(targetSeason);
    onSelectEpisode?.(targetSeason, targetEp);
  };

  const hasNextEpisode =
    media.type === 'series' &&
    (currentSeason < allSeasons.length ||
      currentEpisode < (activeSeason?.episodes.length || 10));

  // Silent playback & progress tracking via postMessage (never displays errors)
  useEffect(() => {
    const handlePlayerMessage = (event: MessageEvent) => {
      const origin = event.origin || '';
      const isTrustedPlayerOrigin =
        origin === 'https://vidlink.pro' ||
        origin.includes('vixsrc') ||
        origin.includes('vidfast') ||
        origin.includes('videasy');
      if (origin && !isTrustedPlayerOrigin) return;

      const rawData = event.data as
        | Partial<VixSrcPlayerEvent>
        | Partial<VidLinkMediaDataEvent>
        | { type?: string; event?: string }
        | null;
      if (!rawData || typeof rawData !== 'object') return;

      // Silent failover if upstream reports playback error
      if (
        (rawData.type === 'ERROR' || (rawData as { event?: string }).event === 'error') &&
        queueIndex < serverQueue.length - 1
      ) {
        setQueueIndex((prev) => (prev < serverQueue.length - 1 ? prev + 1 : prev));
        setIframeLoaded(false);
        setIframeKey((k) => k + 1);
        return;
      }

      if (rawData.type === 'MEDIA_DATA' && 'data' in rawData && rawData.data) {
        saveVidLinkMediaData(rawData.data);
        const dataObj = rawData.data as
          | VidLinkMediaProgressEntry
          | Record<string, VidLinkMediaProgressEntry>;
        const targetKey = resolvedMedia.tmdbId ? String(resolvedMedia.tmdbId) : '';
        const matchedEntry: VidLinkMediaProgressEntry | undefined =
          'progress' in dataObj && dataObj.progress
            ? (dataObj as VidLinkMediaProgressEntry)
            : (targetKey
                ? (dataObj as Record<string, VidLinkMediaProgressEntry>)[targetKey]
                : undefined) ||
              Object.values(dataObj as Record<string, VidLinkMediaProgressEntry>)[0];

        if (matchedEntry?.progress?.duration && matchedEntry.progress.duration > 0) {
          const watched = matchedEntry.progress.watched || 0;
          const dur = matchedEntry.progress.duration;
          const pct = Math.min(99, Math.max(1, Math.round((watched / dur) * 100)));
          const sNum = matchedEntry.last_season_watched
            ? parseInt(matchedEntry.last_season_watched, 10) || currentSeason
            : currentSeason;
          const eNum = matchedEntry.last_episode_watched
            ? parseInt(matchedEntry.last_episode_watched, 10) || currentEpisode
            : currentEpisode;
          if (watched > 5) saveResumeSeconds(media.id, watched, sNum, eNum);
          updateWatchProgress(media.id, pct, sNum, eNum);
        }
        return;
      }

      if (rawData.type !== 'PLAYER_EVENT' || !('data' in rawData) || !rawData.data) return;

      const {
        event: playerEvent,
        currentTime: evTime,
        duration: evDur,
        season: evSeason,
        episode: evEpisode,
      } = rawData.data;
      const curSec = typeof evTime === 'number' && Number.isFinite(evTime) ? evTime : 0;
      const totalSec = typeof evDur === 'number' && Number.isFinite(evDur) ? evDur : 0;
      const effSeason = typeof evSeason === 'number' && evSeason > 0 ? evSeason : currentSeason;
      const effEpisode = typeof evEpisode === 'number' && evEpisode > 0 ? evEpisode : currentEpisode;

      if (playerEvent === 'play') {
        setIsPlaying(true);
        setIframeLoaded(true);
      } else if (playerEvent === 'pause' || playerEvent === 'seeked') {
        if (playerEvent === 'pause') setIsPlaying(false);
        if (curSec > 5) {
          saveResumeSeconds(media.id, curSec, effSeason, effEpisode);
          if (totalSec > 0) {
            updateWatchProgress(
              media.id,
              Math.min(99, Math.round((curSec / totalSec) * 100)),
              effSeason,
              effEpisode
            );
          }
        }
      } else if (playerEvent === 'timeupdate') {
        setIsPlaying(true);
        setIframeLoaded(true);
        if (curSec > 5 && Math.abs(curSec - lastSavedProgressSecRef.current) >= 5) {
          lastSavedProgressSecRef.current = curSec;
          saveResumeSeconds(media.id, curSec, effSeason, effEpisode);
          if (totalSec > 0) {
            updateWatchProgress(
              media.id,
              Math.min(99, Math.round((curSec / totalSec) * 100)),
              effSeason,
              effEpisode
            );
          }
        }
      } else if (playerEvent === 'ended') {
        setIsPlaying(false);
        saveResumeSeconds(media.id, 0, effSeason, effEpisode);
        updateWatchProgress(media.id, 100, effSeason, effEpisode);
        if (media.type === 'series' && hasNextEpisode) {
          handleNavigateEpisode(1);
        }
      }
    };

    window.addEventListener('message', handlePlayerMessage);
    return () => window.removeEventListener('message', handlePlayerMessage);
  }, [
    media.id,
    media.type,
    resolvedMedia.tmdbId,
    currentSeason,
    currentEpisode,
    hasNextEpisode,
    updateWatchProgress,
    queueIndex,
    serverQueue.length,
  ]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const skipTime = (seconds: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.min(
      videoRef.current.duration || 0,
      Math.max(0, videoRef.current.currentTime + seconds)
    );
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    videoRef.current.muted = nextMuted;
  };

  const toggleCaptions = () => {
    if (!videoRef.current) return;
    const next = !captionsEnabled;
    setCaptionsEnabled(next);
    const tracks = videoRef.current.textTracks;
    for (let i = 0; i < tracks.length; i++) {
      tracks[i].mode = next && i === 0 ? 'showing' : 'hidden';
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!document.fullscreenElement) onClose();
      } else if (playerMode === 'offline' || playerMode === 'native') {
        if (e.key === ' ' || e.key === 'k') {
          e.preventDefault();
          togglePlay();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          skipTime(-10);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          skipTime(10);
        } else if (e.key === 'm' || e.key === 'M') {
          e.preventDefault();
          toggleMute();
        } else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          toggleFullscreen();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playerMode, isPlaying, isMuted, isFullscreen]);

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = window.setTimeout(() => {
      if (isPlaying || playerMode === 'stream') {
        setShowControls(false);
      }
    }, 3000);
  };

  // Inbuilt Native HTML5 / HLS video engine with instant automatic playback & silent fallback
  useEffect(() => {
    if (playerMode !== 'native' && playerMode !== 'offline') return;
    const video = videoRef.current;
    if (!video) return;

    const source =
      playerMode === 'offline'
        ? downloadedItem?.videoUrl || ''
        : directStreamUrl.trim() || media.videoPreviewUrl || '';

    if (!isDirectStreamUrl(source)) {
      setPlayerMode('stream');
      return;
    }

    setIsLoading(true);

    const attemptAutoPlay = () => {
      video
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsLoading(false);
        })
        .catch(() => {
          video.muted = true;
          setIsMuted(true);
          video
            .play()
            .then(() => {
              setIsPlaying(true);
              setIsLoading(false);
            })
            .catch(() => {
              setIsPlaying(false);
              setIsLoading(false);
            });
        });
    };

    if (source.includes('.m3u8') && Hls.isSupported()) {
      if (hlsRef.current) hlsRef.current.destroy();
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
      });
      hls.loadSource(source);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, attemptAutoPlay);
      hls.on(Hls.Events.ERROR, (_ev, data) => {
        if (data.fatal && playerMode === 'native') {
          hls.destroy();
          setPlayerMode('stream');
        }
      });
      hlsRef.current = hls;

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.src = source;
      attemptAutoPlay();
    }
  }, [playerMode, directStreamUrl, downloadedItem, media]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    const dur = videoRef.current.duration || 1;
    setCurrentTime(cur);
    setDuration(dur);
    setIsLoading(false);

    if (videoRef.current.buffered && videoRef.current.buffered.length > 0) {
      setBufferedTime(videoRef.current.buffered.end(videoRef.current.buffered.length - 1));
    }

    const progressPct = Math.round((cur / dur) * 100);
    if (Math.floor(cur) % 5 === 0) {
      updateWatchProgress(media.id, progressPct, currentSeason, currentEpisode);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '00:00';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const showDarkLoadingStage =
    (playerMode === 'stream' && (isResolvingServer || !iframeLoaded)) ||
    ((playerMode === 'native' || playerMode === 'offline') && isLoading);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="fixed inset-0 z-50 bg-black flex items-center justify-center select-none overflow-hidden"
    >
      {/* Pure Pitch-Black Stage with Loading Spinner Only (no text, no error states, no server labels) */}
      {showDarkLoadingStage && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black">
          <Loader2 className="w-10 h-10 text-white/85 animate-spin" />
        </div>
      )}

      {/* 1. AUTOMATIC STREAM PLAYER */}
      {playerMode === 'stream' && !isResolvingServer && (
        <div className="w-full h-full relative bg-black overflow-hidden">
          <iframe
            key={`player-frame-${activeServer}-${currentSeason}-${currentEpisode}-${iframeKey}`}
            data-mullahmax-player="true"
            src={activeStreamSource.url}
            title={media.title}
            onLoad={(e) => {
              injectAdShieldIntoIframe(e.currentTarget);
              window.setTimeout(() => setIframeLoaded(true), 220);
            }}
            onError={() => {
              if (queueIndex < serverQueue.length - 1) {
                setQueueIndex((prev) => prev + 1);
                setIframeLoaded(false);
                setIframeKey((k) => k + 1);
              }
            }}
            referrerPolicy="origin"
            allow="autoplay *; fullscreen *; encrypted-media *; picture-in-picture *; accelerometer; gyroscope; clipboard-write; web-share"
            allowFullScreen
            className={`w-full h-full border-0 bg-black transition-opacity duration-200 ${
              iframeLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </div>
      )}

      {/* 2. INBUILT NATIVE HTML5 & HLS PLAYER (Minimal Monochrome Media Features Only) */}
      {(playerMode === 'offline' || playerMode === 'native') && (
        <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            autoPlay
            onTimeUpdate={handleTimeUpdate}
            onWaiting={() => setIsLoading(true)}
            onPlaying={() => {
              setIsLoading(false);
              setIsPlaying(true);
            }}
            onLoadedData={() => setIsLoading(false)}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                setDuration(videoRef.current.duration);
                videoRef.current.playbackRate = playbackSpeed;
              }
              setIsLoading(false);
            }}
            onError={() => {
              if (playerMode === 'native') {
                setPlayerMode('stream');
              }
            }}
            onEnded={() => setIsPlaying(false)}
            onClick={togglePlay}
            className="w-full h-full object-contain cursor-pointer"
          />

          {!isPlaying && !isLoading && (
            <button
              onClick={togglePlay}
              aria-label="Play"
              className="absolute flex items-center justify-center text-white/90 hover:text-white hover:scale-110 transition-transform cursor-pointer drop-shadow-2xl"
            >
              <Play className="w-14 h-14 sm:w-16 sm:h-16 fill-current ml-1" />
            </button>
          )}

          {/* Monochrome Media Controls Bar */}
          <div
            className={`absolute bottom-0 left-0 right-0 px-4 sm:px-5 pb-3 pt-10 bg-gradient-to-t from-black/95 via-black/45 to-transparent transition-opacity duration-200 ${
              showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="group relative mb-3 h-3 flex items-center">
              <div className="w-full h-[3px] group-hover:h-[5px] bg-white/25 rounded-full overflow-hidden relative transition-all">
                <div
                  className="absolute left-0 top-0 bottom-0 bg-white/35 transition-all"
                  style={{ width: `${Math.min(100, (bufferedTime / (duration || 1)) * 100)}%` }}
                />
                <div
                  className="absolute left-0 top-0 bottom-0 bg-white transition-all"
                  style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
            </div>

            <div className="flex items-center justify-between gap-4 text-white">
              <div className="flex items-center gap-3.5 sm:gap-4">
                <button
                  onClick={togglePlay}
                  className="p-1 text-white/90 hover:text-white transition-colors cursor-pointer"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 fill-current" />
                  ) : (
                    <Play className="w-5 h-5 fill-current" />
                  )}
                </button>

                <button
                  onClick={() => skipTime(-10)}
                  className="p-1 text-white/80 hover:text-white transition-colors cursor-pointer"
                  aria-label="Rewind 10s"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>

                <button
                  onClick={() => skipTime(10)}
                  className="p-1 text-white/80 hover:text-white transition-colors cursor-pointer"
                  aria-label="Forward 10s"
                >
                  <RotateCw className="w-5 h-5" />
                </button>

                <div className="group/vol flex items-center gap-2">
                  <button
                    onClick={toggleMute}
                    className="p-1 text-white/85 hover:text-white transition-colors cursor-pointer"
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="w-5 h-5" />
                    ) : (
                      <Volume2 className="w-5 h-5" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-0 group-hover/vol:w-16 opacity-0 group-hover/vol:opacity-100 h-1 bg-white/30 rounded-full appearance-none accent-white cursor-pointer transition-all duration-200"
                  />
                </div>

                <span className="text-xs text-white/90 font-medium tabular-nums tracking-tight">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const speeds = [1, 1.25, 1.5, 2, 0.75];
                    const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
                    setPlaybackSpeed(next);
                    if (videoRef.current) videoRef.current.playbackRate = next;
                  }}
                  className="p-1 text-white/85 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                  aria-label="Playback speed"
                >
                  <Settings className="w-5 h-5" />
                  {playbackSpeed !== 1 && (
                    <span className="text-[11px] font-mono">{playbackSpeed}x</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={toggleCaptions}
                  className={`p-1 transition-colors cursor-pointer ${
                    captionsEnabled ? 'text-white' : 'text-white/65 hover:text-white'
                  }`}
                  aria-label="Captions"
                >
                  <Captions className="w-5 h-5" />
                </button>

                <button
                  onClick={toggleFullscreen}
                  className="p-1 text-white/85 hover:text-white transition-colors cursor-pointer"
                  aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-5 h-5" />
                  ) : (
                    <Maximize2 className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MINIMAL FLOATING MEDIA CONTROLS ONLY (No titles, no server labels, no text badges) */}
      <div
        className={`absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-40 pointer-events-none transition-opacity duration-300 ${
          showDarkLoadingStage || showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <button
          onClick={onClose}
          className="pointer-events-auto p-2.5 rounded-full bg-black/55 hover:bg-black/80 text-white/85 hover:text-white border border-white/10 backdrop-blur-md transition-colors cursor-pointer"
          aria-label="Close Player"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Media Features Only: Series Episode Switcher & Offline Copy Toggle */}
        <div className="pointer-events-auto flex items-center gap-2">
          {media.type === 'series' && (
            <div className="flex items-center bg-black/60 p-1 rounded-full border border-white/10 backdrop-blur-md">
              <button
                onClick={() => handleNavigateEpisode(-1)}
                disabled={currentSeason === 1 && currentEpisode === 1}
                className="p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                aria-label="Previous Episode"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowEpisodeDrawer(true)}
                className="px-2.5 py-1 rounded-full text-white/95 hover:bg-white/10 cursor-pointer transition-colors flex items-center gap-1.5 text-xs font-semibold tabular-nums"
                aria-label="Episodes"
              >
                <ListVideo className="w-4 h-4" />
                <span>S{currentSeason} E{currentEpisode}</span>
              </button>
              <button
                onClick={() => handleNavigateEpisode(1)}
                disabled={!hasNextEpisode}
                className="p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                aria-label="Next Episode"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {isDownloaded && hasPlayableDownloadedFile && (
            <button
              onClick={() => setPlayerMode(playerMode === 'offline' ? 'stream' : 'offline')}
              className={`p-2.5 rounded-full border backdrop-blur-md transition-colors cursor-pointer ${
                playerMode === 'offline'
                  ? 'bg-white text-black border-white'
                  : 'bg-black/55 text-white/85 hover:text-white border-white/10'
              }`}
              aria-label="Toggle Downloaded Media"
            >
              <HardDrive className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* EPISODE DRAWER FOR SERIES */}
      {showEpisodeDrawer && media.type === 'series' && (
        <div className="absolute top-0 right-0 bottom-0 w-96 max-w-full bg-[#080A0F]/95 border-l border-white/10 p-5 backdrop-blur-2xl overflow-y-auto z-50 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3 shrink-0">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {allSeasons.map((season) => (
                <button
                  key={season.seasonNumber}
                  onClick={() => setDrawerSeason(season.seasonNumber)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
                    drawerSeason === season.seasonNumber
                      ? 'bg-white text-black border-white'
                      : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  S{season.seasonNumber}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowEpisodeDrawer(false)}
              className="p-1.5 rounded-full bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0 ml-2"
              aria-label="Close Episodes"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 py-2 no-scrollbar">
            {allSeasons
              .find((s) => s.seasonNumber === drawerSeason)
              ?.episodes.map((ep) => {
                const isCurrentEp =
                  currentSeason === drawerSeason && currentEpisode === ep.episodeNumber;

                return (
                  <button
                    key={ep.episodeNumber}
                    onClick={() => {
                      setCurrentSeason(drawerSeason);
                      setCurrentEpisode(ep.episodeNumber);
                      onSelectEpisode?.(drawerSeason, ep.episodeNumber);
                      setShowEpisodeDrawer(false);
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      isCurrentEp
                        ? 'bg-white/15 border-white/40 text-white'
                        : 'bg-white/5 border-white/5 hover:bg-white/10 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-white font-bold">
                          E{ep.episodeNumber}
                        </span>
                        <span className="truncate max-w-[200px]">{ep.title}</span>
                      </span>
                      <span className="text-slate-400 font-mono text-[11px]">{ep.duration}</span>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};
