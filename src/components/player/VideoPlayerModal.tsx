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
} from '../../services/videoProviderService';
import { prewarmStreamUrl } from '../../utils/adBlocker';

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

  // Inbuilt background server routing & silent failover (defaults to verified VixSrc player)
  const [selectedServer, setSelectedServer] = useState<AnyServerId>(() => {
    return getVideoProviderConfig().vidukiServer || 'vixsrc';
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

  const controlsTimeoutRef = useRef<number | null>(null);
  const userManuallyPickedServerRef = useRef(false);

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

      // Auto-route to a verified playable server if current server lacks this title
      if (!userManuallyPickedServerRef.current && res.recommendedServer) {
        const currentIsVerified =
          (selectedServer === 'vixsrc' && res.vixsrcAvailable) ||
          (selectedServer === 'primesrc' && res.primeSrcHosts.length > 0);

        if (!currentIsVerified && res.recommendedServer !== selectedServer) {
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

  // Silent background failover if an embed frame stalls without loading for 6.5s
  useEffect(() => {
    if (playerMode !== 'stream' || iframeLoaded) return;
    const timeout = window.setTimeout(() => {
      const nextServer = getNextFastestServer(selectedServer);
      setSelectedServer(nextServer);
      setIframeLoaded(false);
      setIframeKey((k) => k + 1);
      const cfg = getVideoProviderConfig();
      saveVideoProviderConfig({ ...cfg, vidukiServer: nextServer });
    }, 6500);
    return () => window.clearTimeout(timeout);
  }, [playerMode, iframeLoaded, selectedServer, currentSeason, currentEpisode, iframeKey]);

  // Resolved structured seasons & active episode
  const allSeasons = ensureMediaSeasons(media);
  const activeSeason = allSeasons.find((s) => s.seasonNumber === currentSeason) || allSeasons[0];
  const activeEpisode = activeSeason?.episodes.find(
    (e) => e.episodeNumber === currentEpisode
  );

  // Merge resolved TMDB & IMDb IDs for searched titles so all embed mirrors match accurately
  const resolvedMedia: MediaItem =
    liveSources?.resolvedTmdbId || liveSources?.resolvedImdbId
      ? {
          ...media,
          tmdbId: liveSources.resolvedTmdbId || media.tmdbId,
          imdbId: liveSources.resolvedImdbId || media.imdbId,
        }
      : media;

  // Generate stream source cleanly under the hood
  const activeStreamSource = generateStreamSource(
    resolvedMedia,
    currentSeason,
    currentEpisode,
    selectedServer
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
      className="fixed inset-0 z-50 bg-black flex items-center justify-center select-none overflow-hidden"
    >
      {/* 1. STREAMING PLAYER */}
      {playerMode === 'stream' && (
        <div className="w-full h-full relative flex flex-col bg-black">
          {/* Smooth Backdrop Loading Curtain (Fades out automatically when player loads) */}
          <div
            className={`absolute inset-0 z-10 flex flex-col items-center justify-center bg-black transition-opacity duration-300 ${
              iframeLoaded ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
          >
            {media.backdropUrl && (
              <img
                src={media.backdropUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover opacity-30 blur-md scale-105"
              />
            )}
            <div className="relative z-10 flex flex-col items-center gap-3 text-center px-6">
              <Loader2 className="w-11 h-11 text-rose-500 animate-spin" />
              <p className="text-sm font-semibold text-white tracking-tight">
                Starting {media.title} on {activeStreamSource.providerName}...
              </p>
              <button
                onClick={() => handleSelectServer(getNextFastestServer(selectedServer))}
                className="mt-1 px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
              >
                Switch Server
              </button>
            </div>
          </div>

          <iframe
            key={`player-frame-${selectedServer}-${currentSeason}-${currentEpisode}-${iframeKey}`}
            src={activeStreamSource.url}
            title={displayTitle}
            onLoad={() => setIframeLoaded(true)}
            referrerPolicy="origin"
            allow="autoplay *; fullscreen *; encrypted-media *; picture-in-picture *; accelerometer; gyroscope; clipboard-write; web-share"
            allowFullScreen
            className={`w-full h-full border-0 transition-opacity duration-300 ${
              iframeLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </div>
      )}

      {/* 2. TRAILER */}
      {playerMode === 'trailer' && (
        <div className="w-full h-full relative bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${trailerId}?autoplay=1&mute=0&controls=1&rel=0&modestbranding=1`}
            title={`${media.title} Trailer`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            className="w-full h-full border-0"
          />
        </div>
      )}

      {/* 3. INBUILT NATIVE HTML5 & HLS PLAYER (Active for Downloads & Direct Streams) */}
      {(playerMode === 'offline' || playerMode === 'native') && (
        <div className="relative w-full h-full flex items-center justify-center bg-black">
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
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none bg-black/40">
              <Loader2 className="w-12 h-12 text-rose-500 animate-spin" />
            </div>
          )}

          {!isPlaying && !isLoading && (
            <button
              onClick={togglePlay}
              className="absolute w-20 h-20 rounded-full bg-rose-600/90 hover:bg-rose-600 text-white flex items-center justify-center shadow-2xl backdrop-blur-md transition-transform hover:scale-110 cursor-pointer"
            >
              <Play className="w-8 h-8 fill-current ml-1" />
            </button>
          )}

          {/* Bottom Controls */}
          <div
            className={`absolute bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-black/95 via-black/60 to-transparent transition-opacity duration-300 ${
              showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            {/* Progress Scrubber */}
            <div className="group relative mb-4">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="w-full h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer accent-rose-600 group-hover:h-2.5 transition-all relative z-10"
              />
              <div
                className="absolute left-0 top-0 h-1.5 group-hover:h-2.5 bg-white/30 rounded-full pointer-events-none transition-all"
                style={{ width: `${Math.min(100, (bufferedTime / (duration || 1)) * 100)}%` }}
              />
              <div
                className="absolute left-0 top-0 h-1.5 group-hover:h-2.5 bg-rose-600 rounded-full pointer-events-none transition-all z-10"
                style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <button
                  onClick={togglePlay}
                  className="p-2.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer"
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5" />
                  ) : (
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  )}
                </button>

                <button
                  onClick={() => skipTime(-10)}
                  className="p-2 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title="Rewind 10s"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>

                <button
                  onClick={() => skipTime(10)}
                  className="p-2 text-slate-300 hover:text-white transition-colors cursor-pointer"
                  title="Forward 10s"
                >
                  <RotateCw className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleMute}
                    className="text-slate-300 hover:text-white transition-colors cursor-pointer"
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
                    className="w-16 sm:w-20 h-1 bg-white/20 rounded-full appearance-none accent-rose-600 cursor-pointer"
                  />
                </div>

                <span className="text-xs text-slate-300 font-mono hidden sm:inline tabular-nums">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={playbackSpeed}
                  onChange={(e) => {
                    const spd = parseFloat(e.target.value);
                    setPlaybackSpeed(spd);
                    if (videoRef.current) videoRef.current.playbackRate = spd;
                  }}
                  className="bg-white/10 text-white text-xs font-semibold rounded-lg px-2 py-1 border border-white/10 cursor-pointer"
                >
                  {[0.5, 1, 1.25, 1.5, 2].map((s) => (
                    <option key={s} value={s} className="bg-slate-900">
                      {s}x
                    </option>
                  ))}
                </select>

                <button
                  onClick={toggleFullscreen}
                  className="p-2 text-slate-300 hover:text-white transition-colors cursor-pointer"
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
            <span className="text-[11px] text-slate-400 font-medium">
              {media.rating} · {media.year}
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

          {/* Quick 1-Click Ad-Free Server Switcher */}
          <div className="hidden lg:flex items-center gap-1 p-1 rounded-xl bg-white/10 border border-white/10 text-xs">
            {(['vixsrc', 'vidfast', 'videasy', 'primesrc'] as AnyServerId[]).map((srvId) => {
              const def = VIDUKI_SERVERS.find((s) => s.id === srvId);
              if (!def) return null;
              const isActive = selectedServer === srvId && playerMode === 'stream';
              return (
                <button
                  key={srvId}
                  onClick={() => handleSelectServer(srvId)}
                  className={`px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-rose-600 text-white'
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
              <div className="absolute top-full right-0 mt-2 w-80 rounded-2xl bg-[#0D111A]/95 border border-white/15 p-3 shadow-2xl backdrop-blur-2xl z-50 text-slate-200 space-y-2">
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

                <div className="max-h-72 overflow-y-auto space-y-1 no-scrollbar">
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
