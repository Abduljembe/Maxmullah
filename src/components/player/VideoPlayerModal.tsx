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
  SlidersHorizontal,
  Check,
  ChevronDown,
  RefreshCw,
  ArrowDownToLine,
  ShieldCheck,
  Settings,
  Captions,
} from 'lucide-react';
import Hls from 'hls.js';
import { MediaItem } from '../../types';
import { useOffline } from '../../context/OfflineContext';
import { useProfile } from '../../context/ProfileContext';
import { ensureMediaSeasons } from '../../utils/seriesUtils';
import { downloadVideoFile, isDirectStreamUrl } from '../../utils/fileDownloader';
import {
  generateStreamSource,
  VIDUKI_SERVERS,
  AnyServerId,
  getVideoProviderConfig,
  saveVideoProviderConfig,
  getNextFastestServer,
  fetchLiveServerSources,
  saveCustomDirectStream,
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

  // Dynamic Season and Episode selection state
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

  // Automatically play local file when offline only if a real local/stream URL exists; otherwise use stream
  const [playerMode, setPlayerMode] = useState<'stream' | 'native' | 'offline' | 'trailer'>(() =>
    isOffline && hasPlayableDownloadedFile ? 'offline' : 'stream'
  );

  // Default to fastest ad-free VidLink/VidFast routing (no ad/captcha PrimeSrc hosts)
  const [selectedServer, setSelectedServer] = useState<AnyServerId>(() => {
    const saved = getVideoProviderConfig().vidukiServer;
    return saved === 'primesrc' ? 'vidlink' : saved || 'vidlink';
  });
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [customStreamUrl, setCustomStreamUrl] = useState('');
  const [liveSources, setLiveSources] = useState<LiveServerSourcesResponse | null>(null);

  // Native HTML5 / HLS player controls state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedTime, setBufferedTime] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showControls, setShowControls] = useState(true);
  const [showEpisodeDrawer, setShowEpisodeDrawer] = useState(false);

  // VidLink & VixSrc customization state
  const [providerCfg, setProviderCfg] = useState(() => getVideoProviderConfig());
  const [startAtSeconds, setStartAtSeconds] = useState<number>(() => {
    const localResume = getSavedResumeSeconds(media.id, seasonNumber || 1, episodeNumber || 1);
    const vidLinkResume = getVidLinkResumeSeconds(media, seasonNumber || 1, episodeNumber || 1);
    return Math.max(localResume, vidLinkResume);
  });
  const [vixLiveTime, setVixLiveTime] = useState<number>(0);
  const [vixDuration, setVixDuration] = useState<number>(0);
  const [useAnimeMode, setUseAnimeMode] = useState<boolean>(() => isLikelyAnime(media));
  const [manualMalId, setManualMalId] = useState<string>(() =>
    media.malId ? String(media.malId) : ''
  );

  const controlsTimeoutRef = useRef<number | null>(null);
  const userManuallyPickedServerRef = useRef(false);
  const lastSavedProgressSecRef = useRef<number>(0);

  // Sync saved startAt resume position when changing movie or episode
  useEffect(() => {
    const localResume = getSavedResumeSeconds(media.id, currentSeason, currentEpisode);
    const vidLinkResume = getVidLinkResumeSeconds(media, currentSeason, currentEpisode);
    const saved = Math.max(localResume, vidLinkResume);
    setStartAtSeconds(saved);
    setVixLiveTime(saved);
    setVixDuration(0);
    lastSavedProgressSecRef.current = 0;
  }, [media, currentSeason, currentEpisode]);

  // Probe live direct stream registry + VixSrc, PrimeSrc, VidFast availability & resolve TMDB/IMDb IDs
  useEffect(() => {
    let cancelled = false;
    fetchLiveServerSources(media, currentSeason, currentEpisode).then((res) => {
      if (cancelled) return;
      setLiveSources(res);

      // Prefer saved direct CDN/HLS stream (.m3u8/.mp4) when mapped for 0-ad native playback
      if (res.directStreamUrl && isDirectStreamUrl(res.directStreamUrl)) {
        setCustomStreamUrl(res.directStreamUrl);
        if (!isOffline) {
          setPlayerMode('native');
        }
        return;
      }

      // Auto-route away only from unavailable ad-free servers (never auto-select ad/captcha PrimeSrc)
      if (!userManuallyPickedServerRef.current && res.recommendedServer) {
        const currentUnavailable =
          (selectedServer === 'vixsrc' && !res.vixsrcAvailable) ||
          (selectedServer === 'vidlink' && !res.vidlinkAvailable);

        if (
          currentUnavailable &&
          res.recommendedServer !== 'primesrc' &&
          res.recommendedServer !== selectedServer
        ) {
          setSelectedServer(res.recommendedServer);
          setIframeLoaded(false);
          setIframeKey((k) => k + 1);
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [media, currentSeason, currentEpisode, isOffline]);

  // Fast background failover (4s) across ad-free mirrors if an embed frame stalls
  useEffect(() => {
    if (playerMode !== 'stream' || iframeLoaded) return;
    const timeout = window.setTimeout(() => {
      const nextServer = getNextFastestServer(selectedServer);
      setSelectedServer(nextServer);
      setIframeLoaded(false);
      setIframeKey((k) => k + 1);
      const cfg = getVideoProviderConfig();
      saveVideoProviderConfig({ ...cfg, vidukiServer: nextServer });
    }, 4000);
    return () => window.clearTimeout(timeout);
  }, [playerMode, iframeLoaded, selectedServer, currentSeason, currentEpisode, iframeKey]);

  // Resolved structured seasons & active episode
  const allSeasons = ensureMediaSeasons(media);
  const activeSeason = allSeasons.find((s) => s.seasonNumber === currentSeason) || allSeasons[0];
  const activeEpisode = activeSeason?.episodes.find(
    (e) => e.episodeNumber === currentEpisode
  );

  // Merge resolved TMDB, IMDb & MAL IDs for searched titles so all embed mirrors match accurately
  const parsedManualMalId = parseInt(manualMalId.trim(), 10);
  const resolvedMalId =
    Number.isFinite(parsedManualMalId) && parsedManualMalId > 0
      ? parsedManualMalId
      : liveSources?.resolvedMalId || media.malId;

  const resolvedMedia: MediaItem =
    liveSources?.resolvedTmdbId || liveSources?.resolvedImdbId || resolvedMalId
      ? {
          ...media,
          tmdbId: liveSources?.resolvedTmdbId || media.tmdbId,
          imdbId: liveSources?.resolvedImdbId || media.imdbId,
          malId: resolvedMalId,
        }
      : media;

  // Generate stream source cleanly under the hood (including full VidLink & VixSrc customization params)
  const activeStreamSource = generateStreamSource(
    resolvedMedia,
    currentSeason,
    currentEpisode,
    selectedServer,
    {
      primaryColor: providerCfg.accentColor,
      secondaryColor: providerCfg.secondaryColor,
      iconColor: providerCfg.iconColor,
      icons: providerCfg.icons,
      playerType: providerCfg.playerType,
      showTitle: providerCfg.showTitle,
      showPoster: providerCfg.showPoster,
      autoplay: providerCfg.autoplay,
      nextButton: providerCfg.nextButton,
      lang: providerCfg.preferredLang,
      subFile: providerCfg.subFile,
      subLabel: providerCfg.subLabel,
      startAt: startAtSeconds,
      malId: resolvedMalId,
      animeSubOrDub: providerCfg.animeSubOrDub,
      animeFallback: providerCfg.animeFallback,
      useAnimeMode,
      adShieldEnabled: providerCfg.adShieldEnabled !== false,
    }
  );

  useEffect(() => {
    if (activeStreamSource?.url) {
      prewarmStreamUrl(activeStreamSource.url);
    }
  }, [activeStreamSource?.url]);

  const trailerId = media.trailerYoutubeId || 'Way9Dexny3w';

  const displayTitle = activeEpisode
    ? `${media.title} · S${currentSeason} E${currentEpisode}: ${activeEpisode.title}`
    : media.title;

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
    setPlayerMode('stream');
    setIframeLoaded(false);
    setIframeKey((prev) => prev + 1);
  };

  const hasNextEpisode =
    media.type === 'series' &&
    (currentSeason < allSeasons.length ||
      currentEpisode < (activeSeason?.episodes.length || 10));

  // VidLink MEDIA_DATA (localStorage['vidLinkProgress']) + PLAYER_EVENT tracking via postMessage
  useEffect(() => {
    const handlePlayerMessage = (event: MessageEvent) => {
      const origin = event.origin || '';
      const isTrustedPlayerOrigin =
        origin === 'https://vidlink.pro' ||
        origin.includes('vixsrc') ||
        origin.includes('vidfast');
      if (origin && !isTrustedPlayerOrigin) {
        return;
      }

      const rawData = event.data as
        | Partial<VixSrcPlayerEvent>
        | Partial<VidLinkMediaDataEvent>
        | null;
      if (!rawData || typeof rawData !== 'object') return;

      // 1. VidLink Continue Watching MEDIA_DATA persistence (saved into localStorage['vidLinkProgress'])
      if (rawData.type === 'MEDIA_DATA' && rawData.data) {
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
                : undefined) || Object.values(dataObj as Record<string, VidLinkMediaProgressEntry>)[0];

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
          if (watched > 5) {
            saveResumeSeconds(media.id, watched, sNum, eNum);
          }
          updateWatchProgress(media.id, pct, sNum, eNum);
        }
        return;
      }

      // 2. VidLink & VixSrc PLAYER_EVENT lifecycle tracking (play, pause, seeked, ended, timeupdate)
      if (rawData.type !== 'PLAYER_EVENT' || !rawData.data) return;

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

      if (curSec > 0) setVixLiveTime(curSec);
      if (totalSec > 0) setVixDuration(totalSec);

      if (playerEvent === 'play') {
        setIsPlaying(true);
        setIframeLoaded(true);
      } else if (playerEvent === 'pause' || playerEvent === 'seeked') {
        if (playerEvent === 'pause') setIsPlaying(false);
        if (curSec > 5) {
          saveResumeSeconds(media.id, curSec, effSeason, effEpisode);
          if (totalSec > 0) {
            const pct = Math.min(99, Math.round((curSec / totalSec) * 100));
            updateWatchProgress(media.id, pct, effSeason, effEpisode);
          }
        }
      } else if (playerEvent === 'timeupdate') {
        setIsPlaying(true);
        if (curSec > 5 && Math.abs(curSec - lastSavedProgressSecRef.current) >= 5) {
          lastSavedProgressSecRef.current = curSec;
          saveResumeSeconds(media.id, curSec, effSeason, effEpisode);
          if (totalSec > 0) {
            const pct = Math.min(99, Math.round((curSec / totalSec) * 100));
            updateWatchProgress(media.id, pct, effSeason, effEpisode);
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
  }, [media.id, media.type, resolvedMedia.tmdbId, currentSeason, currentEpisode, hasNextEpisode, updateWatchProgress]);

  const updateCustomization = (patch: Partial<typeof providerCfg>, reloadFrame = true) => {
    const next = { ...providerCfg, ...patch };
    setProviderCfg(next);
    saveVideoProviderConfig(next);
    if (reloadFrame) {
      if (vixLiveTime > 5) {
        setStartAtSeconds(Math.floor(vixLiveTime));
      }
      setIframeLoaded(false);
      setIframeKey((k) => k + 1);
    }
  };

  const handleSelectServer = (serverId: AnyServerId) => {
    userManuallyPickedServerRef.current = true;
    setSelectedServer(serverId);
    setShowSourceMenu(false);
    setPlayerMode('stream');
    setIframeLoaded(false);
    setIframeKey((prev) => prev + 1);
    const cfg = getVideoProviderConfig();
    saveVideoProviderConfig({ ...cfg, vidukiServer: serverId });
  };

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!document.fullscreenElement) {
          onClose();
        }
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

  // Mouse inactivity hide controls
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      window.clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = window.setTimeout(() => {
      if (isPlaying || playerMode === 'stream') {
        setShowControls(false);
      }
    }, 3200);
  };

  // Inbuilt Native HLS.js video engine lifecycle with instant 1-click autoplay
  useEffect(() => {
    if (playerMode !== 'native' && playerMode !== 'offline') return;
    const video = videoRef.current;
    if (!video) return;

    const source =
      playerMode === 'offline'
        ? downloadedItem?.videoUrl || ''
        : customStreamUrl.trim() || media.videoPreviewUrl || '';

    if (!isDirectStreamUrl(source)) {
      setPlayerMode('stream');
      return;
    }

    const attemptAutoPlay = () => {
      video
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsLoading(false);
        })
        .catch(() => {
          // If browser blocks unmuted autoplay, retry muted smoothly
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
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90,
      });
      hls.loadSource(source);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, attemptAutoPlay);
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
  }, [playerMode, customStreamUrl, downloadedItem, media]);

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
      updateWatchProgress(media.id, progressPct, seasonNumber, episodeNumber);
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

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className={`fixed inset-0 z-50 bg-black flex items-center justify-center select-none overflow-hidden ${
        isFullscreen ? 'p-0' : 'p-2 sm:p-4 md:p-6'
      }`}
    >
      {/* 1. STREAMING PLAYER (Clean Picture-2 Framed Dark Stage, Fast Instant Load) */}
      {playerMode === 'stream' && (
        <div
          className={`w-full h-full relative flex flex-col bg-black overflow-hidden ${
            isFullscreen ? '' : 'rounded-xl border border-white/10'
          }`}
        >
          {/* Minimal Pitch-Black Loading State (No noisy blurred backdrop flash) */}
          {!iframeLoaded && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black">
              <Loader2 className="w-8 h-8 text-white/80 animate-spin" />
            </div>
          )}

          <iframe
            key={`player-frame-${selectedServer}-${currentSeason}-${currentEpisode}-${iframeKey}`}
            data-mullahmax-player="true"
            src={activeStreamSource.url}
            title={displayTitle}
            onLoad={(e) => {
              setIframeLoaded(true);
              if (providerCfg.adShieldEnabled !== false) {
                injectAdShieldIntoIframe(e.currentTarget);
              }
            }}
            referrerPolicy="origin"
            allow="autoplay *; fullscreen *; encrypted-media *; picture-in-picture *; accelerometer; gyroscope; clipboard-write; web-share"
            allowFullScreen
            className={`w-full h-full border-0 bg-black transition-opacity duration-150 ${
              iframeLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </div>
      )}

      {/* 2. TRAILER */}
      {playerMode === 'trailer' && (
        <div
          className={`w-full h-full relative bg-black overflow-hidden ${
            isFullscreen ? '' : 'rounded-xl border border-white/10'
          }`}
        >
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${trailerId}?autoplay=1&mute=0&controls=1&rel=0&modestbranding=1`}
            title={`${media.title} Trailer`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            className="w-full h-full border-0"
          />
        </div>
      )}

      {/* 3. INBUILT NATIVE HTML5 & HLS PLAYER (Matches Picture 2 Monochrome Dark Controls) */}
      {(playerMode === 'offline' || playerMode === 'native') && (
        <div
          className={`relative w-full h-full flex items-center justify-center bg-black overflow-hidden ${
            isFullscreen ? '' : 'rounded-xl border border-white/10'
          }`}
        >
          <video
            ref={videoRef}
            playsInline
            onTimeUpdate={handleTimeUpdate}
            onWaiting={() => setIsLoading(true)}
            onPlaying={() => setIsLoading(false)}
            onLoadedData={() => setIsLoading(false)}
            onLoadedMetadata={() => {
              if (videoRef.current) {
                setDuration(videoRef.current.duration);
                videoRef.current.playbackRate = playbackSpeed;
              }
              setIsLoading(false);
            }}
            onEnded={() => setIsPlaying(false)}
            onClick={togglePlay}
            className="w-full h-full object-contain cursor-pointer"
          />

          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-black/50">
              <Loader2 className="w-10 h-10 text-white animate-spin" />
            </div>
          )}

          {/* Crisp White Centered Play Triangle (matches Picture 2) */}
          {!isPlaying && !isLoading && (
            <button
              onClick={togglePlay}
              aria-label="Play video"
              className="absolute flex items-center justify-center text-white/90 hover:text-white hover:scale-110 transition-transform cursor-pointer drop-shadow-2xl"
            >
              <Play className="w-14 h-14 sm:w-16 sm:h-16 fill-current ml-1" />
            </button>
          )}

          {/* Bottom Controls matching Picture 2 */}
          <div
            className={`absolute bottom-0 left-0 right-0 px-4 sm:px-5 pb-3 pt-10 bg-gradient-to-t from-black/95 via-black/45 to-transparent transition-opacity duration-200 ${
              showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            {/* Clean Thin Monochrome White Progress Scrubber */}
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
                  title={isPlaying ? 'Pause' : 'Play'}
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
                  title="Rewind 10s"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>

                <button
                  onClick={() => skipTime(10)}
                  className="p-1 text-white/80 hover:text-white transition-colors cursor-pointer"
                  title="Forward 10s"
                >
                  <RotateCw className="w-5 h-5" />
                </button>

                <div className="group/vol flex items-center gap-2">
                  <button
                    onClick={toggleMute}
                    className="p-1 text-white/85 hover:text-white transition-colors cursor-pointer"
                    title={isMuted ? 'Unmute' : 'Mute'}
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
                <div className="relative flex items-center">
                  <button
                    type="button"
                    onClick={() => {
                      const speeds = [1, 1.25, 1.5, 2, 0.75];
                      const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
                      setPlaybackSpeed(next);
                      if (videoRef.current) videoRef.current.playbackRate = next;
                    }}
                    className="p-1 text-white/85 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
                    title={`Playback Speed (${playbackSpeed}x)`}
                  >
                    <Settings className="w-5 h-5" />
                    {playbackSpeed !== 1 && (
                      <span className="text-[11px] font-mono">{playbackSpeed}x</span>
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSourceMenu(true)}
                  className="p-1 text-white/85 hover:text-white transition-colors cursor-pointer"
                  title="Subtitles & Player Settings"
                >
                  <Captions className="w-5 h-5" />
                </button>

                <button
                  onClick={toggleFullscreen}
                  className="p-1 text-white/85 hover:text-white transition-colors cursor-pointer"
                  title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                >
                  {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CLEAN CINEMA TOP BAR */}
      <div
        className={`absolute top-0 left-0 right-0 p-4 sm:p-5 bg-gradient-to-b from-black/90 via-black/50 to-transparent transition-opacity duration-300 flex items-center justify-between z-40 pointer-events-auto ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Left: Back & Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer shrink-0"
            title="Close Player"
            aria-label="Close Player"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base md:text-lg font-bold text-white font-display truncate max-w-xs sm:max-w-md md:max-w-xl">
              {displayTitle}
            </h2>
            <span className="text-[11px] text-slate-400 font-medium tabular-nums">
              {media.rating} · {media.year}
              {vixDuration > 0 && ` · ${formatTime(vixLiveTime)} / ${formatTime(vixDuration)}`}
            </span>
          </div>
        </div>

        {/* Right: Episode Navigation, Source Switcher & Trailer */}
        <div className="flex items-center gap-2 shrink-0">
          {media.type === 'series' && (
            <div className="flex items-center bg-white/10 p-0.5 rounded-xl border border-white/10 text-xs">
              <button
                onClick={() => handleNavigateEpisode(-1)}
                disabled={currentSeason === 1 && currentEpisode === 1}
                className="px-2 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                ‹ Prev
              </button>
              <button
                onClick={() => setShowEpisodeDrawer(true)}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer transition-colors flex items-center gap-1.5"
              >
                <ListVideo className="w-3.5 h-3.5" />
                <span>S{currentSeason} E{currentEpisode}</span>
                <ChevronDown className="w-3 h-3 opacity-75" />
              </button>
              <button
                onClick={() => handleNavigateEpisode(1)}
                disabled={!hasNextEpisode}
                className="px-2 py-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                Next ›
              </button>
            </div>
          )}

          {/* Quick 1-Click Fast Ad-Free Server Switcher */}
          <div className="hidden lg:flex items-center gap-1 p-1 rounded-xl bg-white/10 border border-white/10 text-xs">
            {(['vidlink', 'vidfast', 'vixsrc'] as AnyServerId[]).map((srvId) => {
              const def = VIDUKI_SERVERS.find((s) => s.id === srvId);
              if (!def) return null;
              const isActive = selectedServer === srvId && playerMode === 'stream';
              return (
                <button
                  key={srvId}
                  onClick={() => handleSelectServer(srvId)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-white text-black'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {def.badge}
                </button>
              );
            })}
          </div>

          {/* All Servers & Direct Stream Picker */}
          <div className="relative">
            <button
              onClick={() => setShowSourceMenu(!showSourceMenu)}
              className="px-3 py-1.5 rounded-xl font-semibold transition-colors cursor-pointer text-xs flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white border border-white/10 whitespace-nowrap shrink-0"
              title="All streaming servers"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{activeStreamSource.providerName}</span>
            </button>

            {showSourceMenu && (
              <div className="absolute top-full right-0 mt-2 w-[22rem] max-h-[82vh] overflow-y-auto rounded-2xl bg-[#0D111A]/95 border border-white/15 p-3 shadow-2xl backdrop-blur-2xl z-50 text-slate-200 space-y-2.5 no-scrollbar">
                <div className="flex items-center justify-between px-1 pb-1.5 border-b border-white/10">
                  <span className="text-xs font-bold text-white">Streaming Servers</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setIframeLoaded(false);
                        setIframeKey((k) => k + 1);
                        setShowSourceMenu(false);
                      }}
                      className="text-slate-400 hover:text-white p-1 cursor-pointer"
                      title="Reload"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setShowSourceMenu(false)}
                      className="text-slate-400 hover:text-white p-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="max-h-52 overflow-y-auto space-y-1 no-scrollbar">
                  {VIDUKI_SERVERS.map((server) => {
                    const isSelected = selectedServer === server.id && playerMode === 'stream';
                    const primeHosts = liveSources?.primeSrcHosts || [];
                    const distinctPrimeNames = Array.from(
                      new Set(primeHosts.map((h) => h.name).filter(Boolean))
                    );
                    const subLabel =
                      server.id === 'primesrc' && distinctPrimeNames.length > 0
                        ? `${distinctPrimeNames.slice(0, 6).join(' · ')}${
                            distinctPrimeNames.length > 6 ? ` +${distinctPrimeNames.length - 6}` : ''
                          }`
                        : server.description;

                    return (
                      <button
                        key={server.id}
                        onClick={() => handleSelectServer(server.id)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                          isSelected
                            ? 'bg-rose-600/25 text-white font-semibold'
                            : 'hover:bg-white/10 text-slate-300'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{server.name}</span>
                            {server.id === 'vidlink' && liveSources?.vidlinkAvailable && (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                            )}
                            {server.id === 'vixsrc' && liveSources?.vixsrcAvailable && (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                            )}
                            {server.id === 'primesrc' && primeHosts.length > 0 && (
                              <span className="text-[10px] font-mono text-emerald-400 shrink-0">
                                ({primeHosts.length})
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">{subLabel}</div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-rose-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                {/* VidLink & VixSrc Full Customization Parameters */}
                <div className="pt-2 border-t border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-300">
                      Player Engine &amp; Icons
                    </span>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={providerCfg.playerType}
                        onChange={(e) =>
                          updateCustomization({
                            playerType: e.target.value === 'jw' ? 'jw' : 'default',
                          })
                        }
                        className="bg-black/60 border border-white/15 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-rose-500 cursor-pointer"
                        title="VidLink player engine"
                      >
                        <option value="default">VidLink Default</option>
                        <option value="jw">JW Player</option>
                      </select>
                      <select
                        value={providerCfg.icons}
                        onChange={(e) =>
                          updateCustomization({
                            icons: e.target.value === 'vid' ? 'vid' : 'default',
                          })
                        }
                        className="bg-black/60 border border-white/15 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-rose-500 cursor-pointer"
                        title="Player icons style"
                      >
                        <option value="default">Default Icons</option>
                        <option value="vid">Vid Icons</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-300">
                      Colors (Primary · Sec · Icon)
                    </span>
                    <div className="flex items-center gap-1.5">
                      {[
                        { label: 'Pure White', primary: 'FFFFFF', secondary: '3F3F46', icon: 'FFFFFF' },
                        { label: 'Crimson', primary: 'B20710', secondary: '170000', icon: 'FFFFFF' },
                        { label: 'Teal', primary: '63B8BC', secondary: 'A2A2A2', icon: 'EEFDEC' },
                        { label: 'Rose', primary: 'E11D48', secondary: '19060D', icon: 'FFE4E6' },
                        { label: 'Blue', primary: '2563EB', secondary: '0A1128', icon: 'DBEAFE' },
                      ].map((preset) => {
                        const activeColor =
                          providerCfg.accentColor.toUpperCase() === preset.primary.toUpperCase();
                        return (
                          <button
                            key={preset.primary}
                            type="button"
                            title={preset.label}
                            onClick={() =>
                              updateCustomization({
                                accentColor: preset.primary,
                                secondaryColor: preset.secondary,
                                iconColor: preset.icon,
                              })
                            }
                            className={`w-4 h-4 rounded-full border transition-transform cursor-pointer ${
                              activeColor
                                ? 'border-white scale-110'
                                : 'border-white/20 opacity-75 hover:opacity-100'
                            }`}
                            style={{ backgroundColor: `#${preset.primary}` }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <label className="flex flex-col gap-0.5 text-[10px] text-slate-400">
                      <span>Primary #</span>
                      <input
                        type="text"
                        maxLength={7}
                        defaultValue={providerCfg.accentColor}
                        onBlur={(e) => updateCustomization({ accentColor: e.target.value })}
                        className="bg-black/50 border border-white/15 rounded-md px-2 py-1 text-[11px] font-mono text-white focus:outline-none focus:border-rose-500 uppercase"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5 text-[10px] text-slate-400">
                      <span>Secondary #</span>
                      <input
                        type="text"
                        maxLength={7}
                        defaultValue={providerCfg.secondaryColor}
                        onBlur={(e) => updateCustomization({ secondaryColor: e.target.value })}
                        className="bg-black/50 border border-white/15 rounded-md px-2 py-1 text-[11px] font-mono text-white focus:outline-none focus:border-rose-500 uppercase"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5 text-[10px] text-slate-400">
                      <span>Icon #</span>
                      <input
                        type="text"
                        maxLength={7}
                        defaultValue={providerCfg.iconColor}
                        onBlur={(e) => updateCustomization({ iconColor: e.target.value })}
                        className="bg-black/50 border border-white/15 rounded-md px-2 py-1 text-[11px] font-mono text-white focus:outline-none focus:border-rose-500 uppercase"
                      />
                    </label>
                  </div>

                  {/* VidLink Player Feature Toggles */}
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { key: 'autoplay', label: 'Autoplay', val: providerCfg.autoplay },
                      { key: 'showTitle', label: 'Title', val: providerCfg.showTitle },
                      { key: 'showPoster', label: 'Poster', val: providerCfg.showPoster },
                      { key: 'nextButton', label: 'Next Ep', val: providerCfg.nextButton },
                    ].map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() =>
                          updateCustomization({ [opt.key]: !opt.val } as Partial<typeof providerCfg>)
                        }
                        className={`px-1.5 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                          opt.val
                            ? 'bg-rose-600/25 border-rose-500 text-rose-200'
                            : 'bg-white/5 border-white/10 text-slate-400'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {/* Audio Language + Redirect Ad Shield */}
                  <div className="flex items-center justify-between gap-2">
                    <select
                      value={providerCfg.preferredLang}
                      onChange={(e) => updateCustomization({ preferredLang: e.target.value })}
                      className="bg-black/60 border border-white/15 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-rose-500 cursor-pointer"
                      title="Audio language"
                    >
                      <option value="">Audio: Auto</option>
                      <option value="en">English (en)</option>
                      <option value="it">Italian (it)</option>
                      <option value="es">Spanish (es)</option>
                      <option value="fr">French (fr)</option>
                      <option value="de">German (de)</option>
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        updateCustomization({
                          adShieldEnabled: providerCfg.adShieldEnabled === false,
                        })
                      }
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer flex items-center gap-1 ${
                        providerCfg.adShieldEnabled !== false
                          ? 'bg-emerald-600/25 border-emerald-500/60 text-emerald-200'
                          : 'bg-white/5 border-white/15 text-slate-400'
                      }`}
                    >
                      <ShieldCheck className="w-3 h-3" />
                      Ad Shield {providerCfg.adShieldEnabled !== false ? 'On' : 'Off'}
                    </button>
                  </div>

                  {/* VidLink Anime (MAL ID) Support */}
                  <div className="pt-1.5 border-t border-white/10 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-300">
                        Anime Stream (MAL)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setUseAnimeMode(!useAnimeMode);
                          setIframeLoaded(false);
                          setIframeKey((k) => k + 1);
                        }}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border cursor-pointer ${
                          useAnimeMode
                            ? 'bg-amber-500/25 border-amber-400/60 text-amber-200'
                            : 'bg-white/5 border-white/15 text-slate-400'
                        }`}
                      >
                        {useAnimeMode ? 'Anime Mode On' : 'Off'}
                      </button>
                    </div>
                    {useAnimeMode && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          value={manualMalId || (resolvedMalId ? String(resolvedMalId) : '')}
                          onChange={(e) => setManualMalId(e.target.value)}
                          onBlur={() => {
                            setIframeLoaded(false);
                            setIframeKey((k) => k + 1);
                          }}
                          placeholder="MAL ID (e.g. 16498)"
                          className="flex-1 min-w-0 bg-black/50 border border-white/15 rounded-lg px-2 py-1 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            updateCustomization({
                              animeSubOrDub: providerCfg.animeSubOrDub === 'sub' ? 'dub' : 'sub',
                            })
                          }
                          className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-[10px] font-bold uppercase text-white cursor-pointer"
                        >
                          {providerCfg.animeSubOrDub}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateCustomization({ animeFallback: !providerCfg.animeFallback })
                          }
                          title="Auto fallback between Sub & Dub"
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold border cursor-pointer ${
                            providerCfg.animeFallback
                              ? 'bg-rose-600/25 border-rose-500 text-rose-200'
                              : 'bg-white/5 border-white/10 text-slate-400'
                          }`}
                        >
                          Fallback
                        </button>
                      </div>
                    )}
                  </div>

                  {/* External VTT Subtitle Injection (sub_file & sub_label) */}
                  <div className="pt-1.5 border-t border-white/10 space-y-1">
                    <span className="text-[10px] font-semibold text-slate-400 block">
                      External Subtitles (.vtt URL &amp; Label)
                    </span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="url"
                        defaultValue={providerCfg.subFile}
                        onBlur={(e) => {
                          if (e.target.value.trim() !== providerCfg.subFile) {
                            updateCustomization({ subFile: e.target.value.trim() });
                          }
                        }}
                        placeholder="https://.../subtitles.vtt"
                        className="flex-1 min-w-0 bg-black/50 border border-white/15 rounded-lg px-2 py-1 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                      />
                      <input
                        type="text"
                        defaultValue={providerCfg.subLabel}
                        onBlur={(e) => {
                          if (e.target.value.trim() !== providerCfg.subLabel) {
                            updateCustomization({ subLabel: e.target.value.trim() });
                          }
                        }}
                        placeholder="Label"
                        className="w-20 bg-black/50 border border-white/15 rounded-lg px-2 py-1 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Quiet Custom Stream Input inside Source Drawer */}
                <div className="pt-2 border-t border-white/10 space-y-1.5">
                  <span className="text-[11px] text-slate-400 block">
                    Direct Stream (.m3u8 / .mp4)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="url"
                      value={customStreamUrl}
                      onChange={(e) => setCustomStreamUrl(e.target.value)}
                      placeholder="https://..."
                      className="flex-1 bg-black/50 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                    />
                    <button
                      onClick={async () => {
                        if (isDirectStreamUrl(customStreamUrl)) {
                          setPlayerMode('native');
                          setShowSourceMenu(false);
                          await saveCustomDirectStream(
                            resolvedMedia,
                            customStreamUrl,
                            currentSeason,
                            currentEpisode
                          );
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs cursor-pointer whitespace-nowrap"
                    >
                      Save &amp; Play
                    </button>
                    {isDirectStreamUrl(customStreamUrl) && (
                      <button
                        onClick={async () => {
                          const fname = `${media.title}.mp4`.replace(/[^a-zA-Z0-9.-]/g, '_');
                          await downloadVideoFile(customStreamUrl, fname);
                        }}
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                        title="Download this stream as .mp4"
                      >
                        <ArrowDownToLine className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setPlayerMode(playerMode === 'trailer' ? 'stream' : 'trailer')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer border ${
              playerMode === 'trailer'
                ? 'bg-rose-600 text-white border-rose-500'
                : 'bg-white/10 text-slate-200 border-white/10 hover:bg-white/20'
            }`}
          >
            Trailer
          </button>

          {isDownloaded && hasPlayableDownloadedFile && (
            <button
              onClick={() => setPlayerMode(playerMode === 'offline' ? 'stream' : 'offline')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer border flex items-center gap-1.5 ${
                playerMode === 'offline'
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30'
              }`}
              title="Play downloaded copy"
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Downloaded</span>
            </button>
          )}
        </div>
      </div>

      {/* EPISODE DRAWER FOR SERIES */}
      {showEpisodeDrawer && media.type === 'series' && (
        <div className="absolute top-0 right-0 bottom-0 w-96 max-w-full bg-[#080A0F]/95 border-l border-white/10 p-5 backdrop-blur-2xl overflow-y-auto z-50 flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3 shrink-0">
            <div>
              <h3 className="text-base font-bold text-white font-display">
                {media.title}
              </h3>
              <span className="text-xs text-slate-400">Episodes</span>
            </div>
            <button
              onClick={() => setShowEpisodeDrawer(false)}
              className="p-1.5 rounded-full bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="pb-3 border-b border-white/10 shrink-0">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {allSeasons.map((season) => (
                <button
                  key={season.seasonNumber}
                  onClick={() => setDrawerSeason(season.seasonNumber)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
                    drawerSeason === season.seasonNumber
                      ? 'bg-rose-600 text-white border-rose-500'
                      : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  Season {season.seasonNumber}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 py-3 no-scrollbar">
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
                      setPlayerMode('stream');
                      setIframeLoaded(false);
                      setIframeKey((prev) => prev + 1);
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                      isCurrentEp
                        ? 'bg-rose-600/25 border-rose-500 text-white'
                        : 'bg-white/5 border-white/5 hover:bg-white/10 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold mb-1">
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono text-rose-400 font-bold">
                          E{ep.episodeNumber}
                        </span>
                        <span className="truncate max-w-[180px]">{ep.title}</span>
                      </span>
                      <span className="text-slate-400 font-mono text-[11px]">{ep.duration}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                      {ep.synopsis}
                    </p>
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
};
