import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Check,
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
  buildProxiedMediaUrl,
} from '../../services/videoProviderService';
import { injectAdShieldIntoIframe, prewarmStreamUrl } from '../../utils/adBlocker';

interface VideoPlayerModalProps {
  media: MediaItem;
  seasonNumber?: number;
  episodeNumber?: number;
  onClose: () => void;
  onSelectEpisode?: (seasonNum: number, episodeNum: number) => void;
}

interface HlsQualityOption {
  index: number;
  label: string;
}

interface TrackOption {
  id: number;
  label: string;
}

const DEFAULT_FALLBACK_QUEUE: AnyServerId[] = ['vidlink', 'vidfast', 'vidsrc_sh', '2embed'];
const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 2];

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
  const clickTimerRef = useRef<number | null>(null);
  const resumeAppliedRef = useRef<boolean>(false);
  const controlsTimeoutRef = useRef<number | null>(null);
  const lastSavedProgressSecRef = useRef<number>(0);

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
      : initialDirectUrl || isDirectStreamUrl(media.videoPreviewUrl)
      ? 'native'
      : 'stream'
  );

  // Automatic server resolution & silent failover queue
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
  const [directSubtitleUrl, setDirectSubtitleUrl] = useState<string>(
    initialCachedSources?.directStreamSubtitleUrl || ''
  );
  const [directSubtitleLabel, setDirectSubtitleLabel] = useState<string>(
    initialCachedSources?.directStreamSubtitleLabel || 'Subtitles'
  );
  const [directReferer, setDirectReferer] = useState<string>(
    initialCachedSources?.directStreamReferer || ''
  );
  const [useProxyForNative, setUseProxyForNative] = useState<boolean>(() =>
    Boolean(initialCachedSources?.directStreamReferer)
  );
  const [liveSources, setLiveSources] = useState<LiveServerSourcesResponse | null>(
    initialCachedSources
  );

  // Native HTML5 / HLS / VLC media controls state
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
  const [activeMenu, setActiveMenu] = useState<'settings' | 'captions' | null>(null);

  // HLS Quality / Audio / Subtitle track lists
  const [qualityLevels, setQualityLevels] = useState<HlsQualityOption[]>([]);
  const [selectedQualityIndex, setSelectedQualityIndex] = useState<number>(-1);
  const [audioTracks, setAudioTracks] = useState<TrackOption[]>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number>(0);
  const [subtitleTracks, setSubtitleTracks] = useState<TrackOption[]>([]);
  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState<number>(-1);

  const [providerCfg] = useState(() => getVideoProviderConfig());
  const [startAtSeconds, setStartAtSeconds] = useState<number>(() => {
    const localResume = getSavedResumeSeconds(media.id, seasonNumber || 1, episodeNumber || 1);
    const vidLinkResume = getVidLinkResumeSeconds(media, seasonNumber || 1, episodeNumber || 1);
    return Math.max(localResume, vidLinkResume);
  });

  const activeServer: AnyServerId = serverQueue[queueIndex] || 'vidlink';

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Sync saved resume position when changing movie or episode
  useEffect(() => {
    const localResume = getSavedResumeSeconds(media.id, currentSeason, currentEpisode);
    const vidLinkResume = getVidLinkResumeSeconds(media, currentSeason, currentEpisode);
    setStartAtSeconds(Math.max(localResume, vidLinkResume));
    lastSavedProgressSecRef.current = 0;
    resumeAppliedRef.current = false;
  }, [media, currentSeason, currentEpisode]);

  // Automatic backend probe: prioritize saved/CDN/Jellyfin direct media first, fallback cleanly to verified embed servers
  useEffect(() => {
    if (isOffline && hasPlayableDownloadedFile) {
      setPlayerMode('offline');
      setIsResolvingServer(false);
      return;
    }

    const applyResolvedSources = (res: LiveServerSourcesResponse) => {
      setLiveSources(res);
      const resolvedSub = res.directStreamSubtitleUrl || providerCfg.subFile || '';
      const resolvedSubLabel = res.directStreamSubtitleLabel || providerCfg.subLabel || 'English';
      const resolvedRef = res.directStreamReferer || '';

      setDirectSubtitleUrl(resolvedSub);
      setDirectSubtitleLabel(resolvedSubLabel);
      setDirectReferer(resolvedRef);

      const candidateDirect =
        (res.directStreamUrl && isDirectStreamUrl(res.directStreamUrl) ? res.directStreamUrl : '') ||
        (isDirectStreamUrl(media.videoPreviewUrl) ? media.videoPreviewUrl || '' : '');

      if (candidateDirect) {
        setDirectStreamUrl(candidateDirect);
        setUseProxyForNative(Boolean(resolvedRef));
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
      setIframeLoaded(false);
      setIframeKey((k) => k + 1);
    };

    const cached = getCachedLiveServerSources(media, currentSeason, currentEpisode);
    if (cached) {
      applyResolvedSources(cached);
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
      applyResolvedSources(res);
    });

    return () => {
      cancelled = true;
    };
  }, [media, currentSeason, currentEpisode, isOffline, hasPlayableDownloadedFile, providerCfg.subFile, providerCfg.subLabel]);

  // Silent automatic failover across verified servers if embed stream stalls
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

  const allSeasons = useMemo(() => ensureMediaSeasons(media), [media]);
  const activeSeason = allSeasons.find((s) => s.seasonNumber === currentSeason) || allSeasons[0];
  const resolvedMalId = liveSources?.resolvedMalId || media.malId;

  const resolvedMedia: MediaItem = useMemo(
    () =>
      liveSources?.resolvedTmdbId || liveSources?.resolvedImdbId || resolvedMalId
        ? {
            ...media,
            tmdbId: liveSources?.resolvedTmdbId || media.tmdbId,
            imdbId: liveSources?.resolvedImdbId || media.imdbId,
            malId: resolvedMalId,
          }
        : media,
    [media, liveSources, resolvedMalId]
  );

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
    if (!isResolvingServer && playerMode === 'stream' && activeStreamSource?.url) {
      prewarmStreamUrl(activeStreamSource.url);
    }
  }, [isResolvingServer, playerMode, activeStreamSource?.url]);

  const handleNavigateEpisode = useCallback(
    (offset: number) => {
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
    },
    [media.type, allSeasons, currentSeason, currentEpisode, onSelectEpisode]
  );

  const hasNextEpisode =
    media.type === 'series' &&
    (currentSeason < allSeasons.length ||
      currentEpisode < (activeSeason?.episodes.length || 10));

  // Silent playback & progress tracking via postMessage in stream mode
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
    handleNavigateEpisode,
  ]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setActiveMenu(null);
    if (video.paused) {
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  const skipTime = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = Math.min(video.duration || 0, Math.max(0, video.currentTime + seconds));
    video.currentTime = next;
    setCurrentTime(next);
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    video.muted = nextMuted;
  }, [isMuted]);

  const adjustVolume = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    const nextVol = Math.min(1, Math.max(0, Number((volume + delta).toFixed(2))));
    setVolume(nextVol);
    setIsMuted(nextVol === 0);
    video.volume = nextVol;
    video.muted = nextVol === 0;
  }, [volume]);

  const applySubtitleTrack = useCallback((trackIdx: number) => {
    const hls = hlsRef.current;
    const video = videoRef.current;
    setSelectedSubtitleTrack(trackIdx);
    const enabled = trackIdx >= 0;
    setCaptionsEnabled(enabled);

    if (hls && hls.subtitleTracks.length > 0 && trackIdx < hls.subtitleTracks.length) {
      hls.subtitleTrack = trackIdx;
    }

    if (video) {
      const tracks = video.textTracks;
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = enabled && i === trackIdx ? 'showing' : 'hidden';
      }
    }
  }, []);

  const toggleCaptions = useCallback(() => {
    const nextEnabled = !captionsEnabled;
    if (!nextEnabled) {
      applySubtitleTrack(-1);
      return;
    }
    if (subtitleTracks.length > 0 || (videoRef.current && videoRef.current.textTracks.length > 0)) {
      applySubtitleTrack(0);
    } else {
      setCaptionsEnabled(false);
    }
  }, [captionsEnabled, subtitleTracks.length, applySubtitleTrack]);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const handleVideoClick = () => {
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      return;
    }
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      togglePlay();
    }, 180);
  };

  const handleVideoDoubleClick = () => {
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    toggleFullscreen();
  };

  // Full keyboard navigation (VLC / Netflix hotkeys)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName;
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        if (activeMenu) {
          setActiveMenu(null);
          return;
        }
        if (showEpisodeDrawer) {
          setShowEpisodeDrawer(false);
          return;
        }
        if (!document.fullscreenElement) onClose();
        return;
      }

      if (playerMode !== 'offline' && playerMode !== 'native') return;

      if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        skipTime(-10);
      } else if (e.key === 'ArrowRight' || e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        skipTime(10);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        adjustVolume(0.1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        adjustVolume(-0.1);
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        toggleMute();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        toggleCaptions();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    playerMode,
    activeMenu,
    showEpisodeDrawer,
    onClose,
    togglePlay,
    skipTime,
    adjustVolume,
    toggleMute,
    toggleFullscreen,
    toggleCaptions,
  ]);

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = window.setTimeout(() => {
      if ((isPlaying || playerMode === 'stream') && !activeMenu && !showEpisodeDrawer) {
        setShowControls(false);
      }
    }, 2500);
  };

  // Effective native playback URL (direct CDN first, seamless /api/stream-proxy fallback on CORS/network failure)
  const rawNativeSource =
    playerMode === 'offline'
      ? downloadedItem?.videoUrl || ''
      : directStreamUrl.trim() || media.videoPreviewUrl || '';

  const effectiveNativeSource =
    playerMode === 'native' && useProxyForNative && rawNativeSource.startsWith('http')
      ? buildProxiedMediaUrl(rawNativeSource, directReferer || undefined)
      : rawNativeSource;

  const proxiedSubtitleUrl = useMemo(() => {
    if (!directSubtitleUrl) return '';
    return buildProxiedMediaUrl(directSubtitleUrl, directReferer || undefined);
  }, [directSubtitleUrl, directReferer]);

  const handleNativeSourceError = useCallback(() => {
    if (playerMode !== 'native') return;
    if (!useProxyForNative && rawNativeSource.startsWith('http')) {
      setUseProxyForNative(true);
      setIsLoading(true);
      return;
    }
    setPlayerMode('stream');
  }, [playerMode, useProxyForNative, rawNativeSource]);

  // Native HTML5 / HLS video engine with multi-quality, audio & subtitle track extraction
  useEffect(() => {
    if (playerMode !== 'native' && playerMode !== 'offline') return;
    const video = videoRef.current;
    if (!video) return;

    if (!isDirectStreamUrl(rawNativeSource)) {
      setPlayerMode('stream');
      return;
    }

    setIsLoading(true);
    setQualityLevels([]);
    setSelectedQualityIndex(-1);
    setAudioTracks([]);
    setSubtitleTracks([]);

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

    const looksLikeHls =
      /\.m3u8(\?|$)/i.test(rawNativeSource) ||
      effectiveNativeSource.includes('/api/jellyfin-stream/');

    if (looksLikeHls && Hls.isSupported()) {
      if (hlsRef.current) hlsRef.current.destroy();
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
      });

      hls.loadSource(effectiveNativeSource);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_ev, data) => {
        const levels: HlsQualityOption[] = data.levels
          .map((lvl, index) => ({
            index,
            label: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)} kbps`,
          }))
          .reverse();
        setQualityLevels(levels);
        attemptAutoPlay();
      });

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_ev, data) => {
        setAudioTracks(
          data.audioTracks.map((tr, idx) => ({
            id: idx,
            label: tr.name || tr.lang?.toUpperCase() || `Audio ${idx + 1}`,
          }))
        );
        if (hls.audioTrack >= 0) setSelectedAudioTrack(hls.audioTrack);
      });

      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_ev, data) => {
        setSubtitleTracks(
          data.subtitleTracks.map((tr, idx) => ({
            id: idx,
            label: tr.name || tr.lang?.toUpperCase() || `Track ${idx + 1}`,
          }))
        );
      });

      hls.on(Hls.Events.ERROR, (_ev, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
          return;
        }
        hls.destroy();
        handleNativeSourceError();
      });

      hlsRef.current = hls;

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    video.src = effectiveNativeSource;
    attemptAutoPlay();

    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [playerMode, rawNativeSource, effectiveNativeSource, handleNativeSourceError]);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    const cur = video.currentTime;
    const dur = video.duration || 1;
    setCurrentTime(cur);
    setDuration(dur);
    setIsLoading(false);

    if (video.buffered && video.buffered.length > 0) {
      setBufferedTime(video.buffered.end(video.buffered.length - 1));
    }

    if (cur > 5 && Math.abs(cur - lastSavedProgressSecRef.current) >= 5) {
      lastSavedProgressSecRef.current = cur;
      const progressPct = Math.min(99, Math.round((cur / dur) * 100));
      saveResumeSeconds(media.id, cur, currentSeason, currentEpisode);
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
    if (!Number.isFinite(secs) || isNaN(secs)) return '00:00';
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

  const hideCursor =
    (playerMode === 'native' || playerMode === 'offline') &&
    isPlaying &&
    !showControls &&
    !activeMenu &&
    !showEpisodeDrawer;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        if (isPlaying && !activeMenu) setShowControls(false);
      }}
      className={`fixed inset-0 z-50 bg-black flex items-center justify-center select-none overflow-hidden ${
        hideCursor ? 'cursor-none' : ''
      }`}
    >
      {/* Pure Pitch-Black Loading Stage (zero labels, spinner only) */}
      {showDarkLoadingStage && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black pointer-events-none">
          <Loader2 className="w-10 h-10 text-white/85 animate-spin" />
        </div>
      )}

      {/* 1. EMBED FALLBACK PLAYER (for titles without a direct CDN/HLS link) */}
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

      {/* 2. NETFLIX / VLC NATIVE HTML5 & HLS MEDIA PLAYER */}
      {(playerMode === 'offline' || playerMode === 'native') && (
        <div className="relative w-full h-full flex items-center justify-center bg-black overflow-hidden">
          <video
            ref={videoRef}
            playsInline
            autoPlay
            crossOrigin={proxiedSubtitleUrl ? 'anonymous' : undefined}
            onTimeUpdate={handleTimeUpdate}
            onWaiting={() => setIsLoading(true)}
            onPlaying={() => {
              setIsLoading(false);
              setIsPlaying(true);
            }}
            onLoadedData={() => setIsLoading(false)}
            onLoadedMetadata={() => {
              const video = videoRef.current;
              if (video) {
                const dur = video.duration || 0;
                setDuration(dur);
                video.playbackRate = playbackSpeed;
                video.volume = volume;
                video.muted = isMuted;
                if (!resumeAppliedRef.current && startAtSeconds > 5 && (!dur || startAtSeconds < dur - 10)) {
                  video.currentTime = startAtSeconds;
                  setCurrentTime(startAtSeconds);
                }
                resumeAppliedRef.current = true;
              }
              setIsLoading(false);
            }}
            onError={handleNativeSourceError}
            onEnded={() => {
              setIsPlaying(false);
              saveResumeSeconds(media.id, 0, currentSeason, currentEpisode);
              updateWatchProgress(media.id, 100, currentSeason, currentEpisode);
              if (media.type === 'series' && hasNextEpisode) {
                handleNavigateEpisode(1);
              }
            }}
            onClick={handleVideoClick}
            onDoubleClick={handleVideoDoubleClick}
            className={`w-full h-full object-contain ${hideCursor ? 'cursor-none' : 'cursor-pointer'}`}
          >
            {proxiedSubtitleUrl && (
              <track
                kind="subtitles"
                src={proxiedSubtitleUrl}
                label={directSubtitleLabel || 'Subtitles'}
                srcLang="en"
              />
            )}
          </video>

          {!isPlaying && !isLoading && (
            <button
              onClick={togglePlay}
              aria-label="Play"
              className="absolute flex items-center justify-center text-white/90 hover:text-white hover:scale-110 transition-transform cursor-pointer drop-shadow-2xl"
            >
              <Play className="w-16 h-16 sm:w-20 sm:h-20 fill-current ml-1" />
            </button>
          )}

          {/* VLC / Monochrome Bottom Controls Bar (zero labels during playback) */}
          <div
            onClick={(e) => e.stopPropagation()}
            className={`absolute bottom-0 left-0 right-0 px-4 sm:px-6 pb-4 pt-12 bg-gradient-to-t from-black/95 via-black/50 to-transparent transition-opacity duration-200 ${
              showControls || !isPlaying || activeMenu ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            {/* Seek Scrubber */}
            <div className="group relative mb-3 h-3 flex items-center">
              <div className="w-full h-[3px] group-hover:h-[5px] bg-white/25 rounded-full overflow-hidden relative transition-all">
                <div
                  className="absolute left-0 top-0 bottom-0 bg-white/35 transition-all"
                  style={{ width: `${Math.min(100, (bufferedTime / (duration || 1)) * 100)}%` }}
                />
                <div
                  className="absolute left-0 top-0 bottom-0 bg-white transition-all"
                  style={{ width: `${Math.min(100, (currentTime / (duration || 1)) * 100)}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                aria-label="Seek timeline"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
            </div>

            <div className="relative flex items-center justify-between gap-4 text-white">
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
                    aria-label="Volume"
                    className="w-0 group-hover/vol:w-20 opacity-0 group-hover/vol:opacity-100 h-1 bg-white/30 rounded-full appearance-none accent-white cursor-pointer transition-all duration-200"
                  />
                </div>

                <span className="text-xs text-white/90 font-medium tabular-nums tracking-tight">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-3">
                {/* Quality / Speed / Audio Popover */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setActiveMenu((prev) => (prev === 'settings' ? null : 'settings'))}
                    className={`p-1 transition-colors cursor-pointer flex items-center gap-1 ${
                      activeMenu === 'settings' ? 'text-white' : 'text-white/80 hover:text-white'
                    }`}
                    aria-label="Playback settings"
                  >
                    <Settings className="w-5 h-5" />
                  </button>

                  {activeMenu === 'settings' && (
                    <div className="absolute bottom-10 right-0 w-56 rounded-2xl bg-[#0D1017]/95 border border-white/15 backdrop-blur-xl shadow-2xl p-3 text-xs space-y-3 z-50">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                          Speed
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {PLAYBACK_SPEEDS.map((spd) => (
                            <button
                              key={spd}
                              type="button"
                              onClick={() => {
                                setPlaybackSpeed(spd);
                                if (videoRef.current) videoRef.current.playbackRate = spd;
                              }}
                              className={`px-2 py-1 rounded-lg font-mono text-[11px] cursor-pointer transition-colors ${
                                playbackSpeed === spd
                                  ? 'bg-white text-black font-bold'
                                  : 'bg-white/5 text-slate-300 hover:bg-white/15'
                              }`}
                            >
                              {spd}x
                            </button>
                          ))}
                        </div>
                      </div>

                      {qualityLevels.length > 0 && (
                        <div className="pt-2 border-t border-white/10">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                            Quality
                          </div>
                          <div className="space-y-0.5 max-h-32 overflow-y-auto no-scrollbar">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedQualityIndex(-1);
                                if (hlsRef.current) hlsRef.current.currentLevel = -1;
                              }}
                              className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer ${
                                selectedQualityIndex === -1
                                  ? 'bg-white/15 text-white font-semibold'
                                  : 'text-slate-300 hover:bg-white/10'
                              }`}
                            >
                              <span>Auto</span>
                              {selectedQualityIndex === -1 && <Check className="w-3.5 h-3.5" />}
                            </button>
                            {qualityLevels.map((lvl) => (
                              <button
                                key={lvl.index}
                                type="button"
                                onClick={() => {
                                  setSelectedQualityIndex(lvl.index);
                                  if (hlsRef.current) hlsRef.current.currentLevel = lvl.index;
                                }}
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer ${
                                  selectedQualityIndex === lvl.index
                                    ? 'bg-white/15 text-white font-semibold'
                                    : 'text-slate-300 hover:bg-white/10'
                                }`}
                              >
                                <span>{lvl.label}</span>
                                {selectedQualityIndex === lvl.index && <Check className="w-3.5 h-3.5" />}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {audioTracks.length > 1 && (
                        <div className="pt-2 border-t border-white/10">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                            Audio
                          </div>
                          <div className="space-y-0.5 max-h-28 overflow-y-auto no-scrollbar">
                            {audioTracks.map((tr) => (
                              <button
                                key={tr.id}
                                type="button"
                                onClick={() => {
                                  setSelectedAudioTrack(tr.id);
                                  if (hlsRef.current) hlsRef.current.audioTrack = tr.id;
                                }}
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer ${
                                  selectedAudioTrack === tr.id
                                    ? 'bg-white/15 text-white font-semibold'
                                    : 'text-slate-300 hover:bg-white/10'
                                }`}
                              >
                                <span className="truncate">{tr.label}</span>
                                {selectedAudioTrack === tr.id && <Check className="w-3.5 h-3.5" />}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Captions / Subtitles Popover */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      if (subtitleTracks.length <= 1 && proxiedSubtitleUrl) {
                        toggleCaptions();
                      } else if (subtitleTracks.length > 0 || proxiedSubtitleUrl) {
                        setActiveMenu((prev) => (prev === 'captions' ? null : 'captions'));
                      } else {
                        toggleCaptions();
                      }
                    }}
                    className={`p-1 transition-colors cursor-pointer ${
                      captionsEnabled ? 'text-white' : 'text-white/65 hover:text-white'
                    }`}
                    aria-label="Subtitles"
                  >
                    <Captions className="w-5 h-5" />
                  </button>

                  {activeMenu === 'captions' && (
                    <div className="absolute bottom-10 right-0 w-48 rounded-2xl bg-[#0D1017]/95 border border-white/15 backdrop-blur-xl shadow-2xl p-2.5 text-xs space-y-1 z-50">
                      <button
                        type="button"
                        onClick={() => {
                          applySubtitleTrack(-1);
                          setActiveMenu(null);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer ${
                          !captionsEnabled
                            ? 'bg-white/15 text-white font-semibold'
                            : 'text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        <span>Off</span>
                        {!captionsEnabled && <Check className="w-3.5 h-3.5" />}
                      </button>
                      {(subtitleTracks.length > 0
                        ? subtitleTracks
                        : proxiedSubtitleUrl
                        ? [{ id: 0, label: directSubtitleLabel || 'English' }]
                        : []
                      ).map((sub) => (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => {
                            applySubtitleTrack(sub.id);
                            setActiveMenu(null);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer ${
                            captionsEnabled && selectedSubtitleTrack === sub.id
                              ? 'bg-white/15 text-white font-semibold'
                              : 'text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          <span className="truncate">{sub.label}</span>
                          {captionsEnabled && selectedSubtitleTrack === sub.id && (
                            <Check className="w-3.5 h-3.5" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

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

      {/* MINIMAL FLOATING TOP NAVIGATION (No titles, no server badges, hides cleanly during playback) */}
      <div
        className={`absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-40 pointer-events-none transition-opacity duration-300 ${
          showDarkLoadingStage || showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <button
          onClick={onClose}
          className="pointer-events-auto p-2.5 rounded-full bg-black/55 hover:bg-black/80 text-white/85 hover:text-white border border-white/10 backdrop-blur-md transition-colors cursor-pointer"
          aria-label="Close Player"
        >
          <X className="w-5 h-5" />
        </button>

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
              onClick={() => setPlayerMode(playerMode === 'offline' ? (directStreamUrl ? 'native' : 'stream') : 'offline')}
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
