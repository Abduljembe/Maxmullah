import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  X,
  HardDrive,
  ListVideo,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Captions,
  Check,
  Server,
  Music2,
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
  VIDUKI_SERVERS,
  getVideoProviderConfig,
  fetchLiveServerSources,
  getCachedLiveServerSources,
  LiveServerSourcesResponse,
  DirectStreamCandidate,
  VixSrcPlayerEvent,
  VidLinkMediaDataEvent,
  VidLinkMediaProgressEntry,
  getSavedResumeSeconds,
  saveResumeSeconds,
  getVidLinkResumeSeconds,
  saveVidLinkMediaData,
  isLikelyAnime,
  buildProxiedMediaUrl,
  isNestedPreviewFrame,
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

const DEFAULT_FALLBACK_QUEUE: AnyServerId[] = [
  'vidsrc_sh',
  'vidlink',
  'vidnest',
  'vidsrc_su',
  'vidsrc',
];
const DEPRECATED_QUEUE_SERVERS = new Set<AnyServerId>([
  'vidfast',
  'videasy',
  'superembed',
  '2embed',
  'primesrc',
  ...(isNestedPreviewFrame() ? (['autoembed', 'vidsrc_wtf'] as AnyServerId[]) : []),
]);
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
  const resolvedIdentityRef = useRef<string>('');
  const latestMediaRef = useRef<MediaItem>(media);
  latestMediaRef.current = media;

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

  const buildDirectCandidates = useCallback(
    (
      res: LiveServerSourcesResponse | null | undefined,
      subFallback: string,
      subLabelFallback: string
    ): DirectStreamCandidate[] => {
      const list: DirectStreamCandidate[] = [];
      const seen = new Set<string>();
      const pushUnique = (cand: DirectStreamCandidate | null | undefined) => {
        if (!cand?.url || !isDirectStreamUrl(cand.url)) return;
        const cleanUrl = cand.url.trim();
        if (seen.has(cleanUrl)) return;
        seen.add(cleanUrl);
        list.push({
          ...cand,
          url: cleanUrl,
          subtitleUrl: cand.subtitleUrl || subFallback || undefined,
          subtitleLabel: cand.subtitleLabel || subLabelFallback || 'English',
        });
      };

      if (res?.directStreamUrl) {
        pushUnique({
          url: res.directStreamUrl,
          subtitleUrl: res.directStreamSubtitleUrl,
          subtitleLabel: res.directStreamSubtitleLabel,
          referer: res.directStreamReferer,
          needsProxy: res.directStreamNeedsProxy,
          codec: res.directStreamCodec,
        });
      }
      if (Array.isArray(res?.directStreamFallbacks)) {
        for (const fb of res.directStreamFallbacks) {
          pushUnique(fb);
        }
      }
      if (media.videoPreviewUrl && isDirectStreamUrl(media.videoPreviewUrl)) {
        pushUnique({
          url: media.videoPreviewUrl,
          needsProxy: false,
        });
      }
      return list;
    },
    [media.videoPreviewUrl]
  );

  const [providerCfg] = useState(() => getVideoProviderConfig());

  const initialCachedSources = getCachedLiveServerSources(media, seasonNumber || 1, episodeNumber || 1);
  const initialCandidates = buildDirectCandidates(
    initialCachedSources,
    providerCfg.subFile || '',
    providerCfg.subLabel || 'English'
  );
  const firstInitialCandidate = initialCandidates[0];
  const initialDirectUrl = firstInitialCandidate?.url || '';

  const [playerMode, setPlayerMode] = useState<'stream' | 'native' | 'offline'>(() =>
    isOffline && hasPlayableDownloadedFile
      ? 'offline'
      : initialDirectUrl
      ? 'native'
      : 'stream'
  );

  const hasImmediateTmdbId = Boolean(
    media.tmdbId || /^tmdb-(?:movie|tv)-\d+/i.test(media.id || '') || /^\d+$/.test(media.id || '')
  );

  // Automatic server resolution & native-first direct HLS/MP4 playback
  const [isResolvingServer, setIsResolvingServer] = useState<boolean>(
    () =>
      !(isOffline && hasPlayableDownloadedFile) &&
      !initialDirectUrl
  );
  const [serverQueue, setServerQueue] = useState<AnyServerId[]>(() => {
    const cachedList = initialCachedSources?.availableServers?.filter(
      (s) => !DEPRECATED_QUEUE_SERVERS.has(s)
    );
    const base = cachedList && cachedList.length > 0 ? cachedList : DEFAULT_FALLBACK_QUEUE;
    const pref =
      providerCfg.vidukiServer && !DEPRECATED_QUEUE_SERVERS.has(providerCfg.vidukiServer)
        ? providerCfg.vidukiServer
        : null;
    return pref ? [pref, ...base.filter((s) => s !== pref)] : base;
  });
  const [queueIndex, setQueueIndex] = useState<number>(0);
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [iframeLoaded, setIframeLoaded] = useState<boolean>(false);
  const [revealTimedOut, setRevealTimedOut] = useState<boolean>(false);
  const [serverSwitchMode, setServerSwitchMode] = useState<'auto' | 'manual'>('auto');
  const [serverProbeStatus, setServerProbeStatus] = useState<
    'searching' | 'found' | 'switching' | 'manual' | 'exhausted'
  >(() => (initialDirectUrl ? 'found' : 'searching'));
  const [failedServers, setFailedServers] = useState<string[]>([]);
  const [directCandidates, setDirectCandidates] = useState<DirectStreamCandidate[]>(initialCandidates);
  const [directCandidateIdx, setDirectCandidateIdx] = useState<number>(0);
  const [directStreamUrl, setDirectStreamUrl] = useState<string>(initialDirectUrl);
  const [directSubtitleUrl, setDirectSubtitleUrl] = useState<string>(
    firstInitialCandidate?.subtitleUrl || ''
  );
  const [directSubtitleLabel, setDirectSubtitleLabel] = useState<string>(
    firstInitialCandidate?.subtitleLabel || 'Subtitles'
  );
  const [directReferer, setDirectReferer] = useState<string>(
    firstInitialCandidate?.referer || ''
  );
  const [useProxyForNative, setUseProxyForNative] = useState<boolean>(() =>
    firstInitialCandidate
      ? firstInitialCandidate.needsProxy ?? Boolean(firstInitialCandidate.referer)
      : false
  );
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
  const [activeMenu, setActiveMenu] = useState<'server' | 'quality' | 'audio' | 'captions' | null>(
    null
  );

  // HLS Quality / Audio / Subtitle track lists
  const [qualityLevels, setQualityLevels] = useState<HlsQualityOption[]>([]);
  const [hasHdFloor, setHasHdFloor] = useState<boolean>(false);
  const [selectedQualityIndex, setSelectedQualityIndex] = useState<number>(-1);
  const [audioTracks, setAudioTracks] = useState<TrackOption[]>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number>(0);
  const [subtitleTracks, setSubtitleTracks] = useState<TrackOption[]>([]);
  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState<number>(-1);

  const [startAtSeconds, setStartAtSeconds] = useState<number>(() => {
    const localResume = getSavedResumeSeconds(media.id, seasonNumber || 1, episodeNumber || 1);
    const vidLinkResume = getVidLinkResumeSeconds(media, seasonNumber || 1, episodeNumber || 1);
    return Math.max(localResume, vidLinkResume);
  });

  const activeServer: AnyServerId = serverQueue[queueIndex] || 'vidsrc_su';

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

  const mediaIdentityKey = `${media.id}:${media.tmdbId || ''}:${media.imdbId || ''}:${currentSeason}:${currentEpisode}:${isOffline && hasPlayableDownloadedFile ? 'offline' : 'online'}`;

  // Automatic backend probe: stops immediately once a working stream/server is resolved for this title/episode
  useEffect(() => {
    const activeMedia = latestMediaRef.current;
    if (isOffline && hasPlayableDownloadedFile) {
      resolvedIdentityRef.current = mediaIdentityKey;
      setPlayerMode('offline');
      setIsResolvingServer(false);
      setServerProbeStatus('found');
      return;
    }

    if (resolvedIdentityRef.current === mediaIdentityKey) {
      return;
    }
    resolvedIdentityRef.current = mediaIdentityKey;

    setFailedServers([]);
    setServerSwitchMode('auto');

    const applyResolvedSources = (res: LiveServerSourcesResponse) => {
      setLiveSources(res);
      const candidates = buildDirectCandidates(
        res,
        providerCfg.subFile || '',
        providerCfg.subLabel || 'English'
      );
      setDirectCandidates(candidates);
      setDirectCandidateIdx(0);

      const primaryCand = candidates[0];
      setDirectSubtitleUrl(primaryCand?.subtitleUrl || res.directStreamSubtitleUrl || providerCfg.subFile || '');
      setDirectSubtitleLabel(
        primaryCand?.subtitleLabel || res.directStreamSubtitleLabel || providerCfg.subLabel || 'English'
      );
      setDirectReferer(primaryCand?.referer || res.directStreamReferer || '');

      const verified =
        res.availableServers && res.availableServers.length > 0
          ? res.availableServers.filter((srv) => !DEPRECATED_QUEUE_SERVERS.has(srv))
          : DEFAULT_FALLBACK_QUEUE;

      const preferred =
        providerCfg.vidukiServer && !DEPRECATED_QUEUE_SERVERS.has(providerCfg.vidukiServer)
          ? providerCfg.vidukiServer
          : null;
      const ordered = preferred
        ? [preferred, ...verified.filter((s) => s !== preferred)]
        : verified;

      const nextQueue = ordered.length > 0 ? ordered : DEFAULT_FALLBACK_QUEUE;
      setServerQueue(nextQueue);
      setQueueIndex(0);

      if (primaryCand?.url) {
        setDirectStreamUrl(primaryCand.url);
        setUseProxyForNative(primaryCand.needsProxy ?? Boolean(primaryCand.referer));
        setPlayerMode('native');
        setIsResolvingServer(false);
        setServerProbeStatus('found');
        return;
      }

      setDirectStreamUrl('');
      setPlayerMode('stream');
      setIsResolvingServer(false);
      setServerProbeStatus('found');
      setIframeLoaded(false);
      setRevealTimedOut(false);
      setIframeKey((k) => k + 1);
    };

    const cached = getCachedLiveServerSources(activeMedia, currentSeason, currentEpisode);
    if (cached) {
      applyResolvedSources(cached);
      return;
    }

    let cancelled = false;
    setIsResolvingServer(true);
    setServerProbeStatus('searching');
    setIframeLoaded(false);
    setRevealTimedOut(false);
    setQueueIndex(0);

    const resolveWithTimeout = Promise.race<LiveServerSourcesResponse>([
      fetchLiveServerSources(activeMedia, currentSeason, currentEpisode, { fast: true }),
      new Promise<LiveServerSourcesResponse>((resolve) =>
        window.setTimeout(
          () =>
            resolve({
              vidlinkAvailable: true,
              vixsrcAvailable: false,
              recommendedServer: DEFAULT_FALLBACK_QUEUE[0],
              availableServers: DEFAULT_FALLBACK_QUEUE,
              primeSrcHosts: [],
            }),
          2400
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
  }, [mediaIdentityKey, currentSeason, currentEpisode, isOffline, hasPlayableDownloadedFile, providerCfg.subFile, providerCfg.subLabel, providerCfg.vidukiServer, buildDirectCandidates]);

  // Never keep the stream embed hidden behind the loading curtain if a subresource tracker stalls onload
  useEffect(() => {
    setRevealTimedOut(false);
    if (isResolvingServer || playerMode !== 'stream' || iframeLoaded) return;

    const revealTimer = window.setTimeout(() => {
      setRevealTimedOut(true);
    }, 2000);

    return () => window.clearTimeout(revealTimer);
  }, [isResolvingServer, playerMode, iframeLoaded, activeServer, currentSeason, currentEpisode, iframeKey]);

  const advanceAutoServer = useCallback(
    (failedId: AnyServerId) => {
      setFailedServers((prev) => (prev.includes(failedId) ? prev : [...prev, failedId]));
      if (serverSwitchMode !== 'auto') return;

      const nextIdx = serverQueue.findIndex(
        (srv, idx) => idx > queueIndex && srv !== failedId && !failedServers.includes(srv)
      );
      if (nextIdx >= 0) {
        setQueueIndex(nextIdx);
        setServerProbeStatus('switching');
        setIframeLoaded(false);
        setRevealTimedOut(false);
        setIframeKey((k) => k + 1);
      } else {
        setServerProbeStatus('exhausted');
      }
    },
    [serverSwitchMode, serverQueue, queueIndex, failedServers]
  );

  // Automatic failover ONLY in Auto mode if an embed genuinely fails to load before iframeLoaded
  useEffect(() => {
    if (
      serverSwitchMode !== 'auto' ||
      isResolvingServer ||
      playerMode !== 'stream' ||
      iframeLoaded ||
      serverProbeStatus === 'exhausted'
    ) {
      return;
    }
    const stallMs = activeServer === 'vidlink' || activeServer === 'vidnest' ? 8500 : 6000;
    const timeout = window.setTimeout(() => {
      advanceAutoServer(activeServer);
    }, stallMs);

    return () => window.clearTimeout(timeout);
  }, [
    serverSwitchMode,
    isResolvingServer,
    playerMode,
    iframeLoaded,
    serverProbeStatus,
    activeServer,
    advanceAutoServer,
  ]);

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
        origin.includes('vidsrc') ||
        origin.includes('autoembed') ||
        origin.includes('vidnest') ||
        origin.includes('vixsrc') ||
        origin.includes('stellarconductornexus') ||
        origin.includes('nextgencloudfabric');
      if (origin && !isTrustedPlayerOrigin) return;

      const rawData = event.data as
        | Partial<VixSrcPlayerEvent>
        | Partial<VidLinkMediaDataEvent>
        | { type?: string; event?: string }
        | null;
      if (!rawData || typeof rawData !== 'object') return;

      if (
        (rawData.type === 'ERROR' ||
          rawData.type === 'VS_EXPIRED' ||
          rawData.type === 'MEDIA_NOT_FOUND' ||
          (rawData as { event?: string }).event === 'error')
      ) {
        if (serverSwitchMode === 'auto') {
          advanceAutoServer(activeServer);
        }
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
    serverSwitchMode,
    activeServer,
    advanceAutoServer,
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

      if (e.key === ' ' || e.key === 'Backspace' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        if (playerMode === 'native' || playerMode === 'offline') {
          togglePlay();
        }
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (playerMode !== 'offline' && playerMode !== 'native') {
        return;
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

    // Step 1: If direct CDN bypassed proxy and failed (e.g. strict CORS), retry via proxy cleanly
    if (!useProxyForNative && rawNativeSource.startsWith('http')) {
      setUseProxyForNative(true);
      setIsLoading(true);
      return;
    }

    if (serverSwitchMode === 'manual') {
      setIsLoading(false);
      setServerProbeStatus('exhausted');
      return;
    }

    // Step 2: Seamlessly promote to next verified direct HLS/MP4 candidate (e.g. rogflix / onehd)
    const nextIdx = directCandidateIdx + 1;
    if (nextIdx < directCandidates.length) {
      const nextCand = directCandidates[nextIdx];
      const currentProgress = videoRef.current?.currentTime || 0;
      if (currentProgress > 5) {
        setStartAtSeconds(Math.floor(currentProgress));
        resumeAppliedRef.current = false;
      }
      setDirectCandidateIdx(nextIdx);
      setDirectStreamUrl(nextCand.url);
      setDirectSubtitleUrl(nextCand.subtitleUrl || providerCfg.subFile || '');
      setDirectSubtitleLabel(nextCand.subtitleLabel || providerCfg.subLabel || 'English');
      setDirectReferer(nextCand.referer || '');
      setUseProxyForNative(nextCand.needsProxy ?? Boolean(nextCand.referer));
      setServerProbeStatus('switching');
      setIsLoading(true);
      return;
    }

    // Step 3: Final fallback to verified embed queue if all direct streams fail
    setServerProbeStatus('switching');
    setPlayerMode('stream');
    setQueueIndex(0);
    setIframeLoaded(false);
    setRevealTimedOut(false);
    setIframeKey((k) => k + 1);
  }, [
    playerMode,
    useProxyForNative,
    rawNativeSource,
    serverSwitchMode,
    directCandidateIdx,
    directCandidates,
    providerCfg.subFile,
    providerCfg.subLabel,
  ]);

  // Native HTML5 / HLS video engine with smart ABR, codec preference, buffer stability & recovery
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
    setHasHdFloor(false);
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

      const supportsHevc =
        typeof MediaSource !== 'undefined' &&
        (MediaSource.isTypeSupported('video/mp4; codecs="hvc1.1.6.L90.90"') ||
          MediaSource.isTypeSupported('video/mp4; codecs="hev1.1.6.L90.90"'));

      const initialSeek = startAtSeconds > 5 ? startAtSeconds : -1;
      let mediaRecoveryCount = 0;
      let steppedDownNetworkError = false;
      let lowestHdLevelIndex = -1;

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        startLevel: -1,
        capLevelToPlayerSize: false,
        abrEwmaDefaultEstimate: 12_000_000, // Start ABR at 12 Mbps so 1080p/720p selects cleanly without low-res cold starts
        abrEwmaFastVoD: 3,
        abrEwmaSlowVoD: 9,
        abrBandWidthFactor: 0.9,
        abrBandWidthUpFactor: 0.7,
        startPosition: initialSeek,
        maxBufferLength: 35,
        maxMaxBufferLength: 90,
        maxBufferHole: 0.5,
        nudgeMaxRetry: 5,
        manifestLoadingTimeOut: 12000,
        manifestLoadingMaxRetry: 3,
        manifestLoadingRetryDelay: 500,
        levelLoadingTimeOut: 12000,
        levelLoadingMaxRetry: 3,
        fragLoadingTimeOut: 18000,
        fragLoadingMaxRetry: 5,
        fragLoadingRetryDelay: 500,
        backBufferLength: 60,
      });

      hls.loadSource(effectiveNativeSource);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (_ev, data) => {
        if (initialSeek > 5) {
          resumeAppliedRef.current = true;
        }
        const avcIndices: number[] = [];
        const rawLevels = data.levels.map((lvl, index) => {
          const codecStr = `${lvl.videoCodec || ''} ${lvl.codecSet || ''}`.toLowerCase();
          const isHevcLevel = /(hvc1|hev1)/.test(codecStr);
          if (!isHevcLevel) avcIndices.push(index);
          const effectiveHeight =
            lvl.height && lvl.height > 0
              ? lvl.height
              : lvl.bitrate >= 3_500_000
                ? 1080
                : lvl.bitrate >= 1_500_000
                  ? 720
                  : 480;
          return { lvl, index, isHevcLevel, effectiveHeight };
        });

        const playableLevels =
          !supportsHevc && avcIndices.length > 0
            ? rawLevels.filter((item) => !item.isHevcLevel)
            : rawLevels;

        const hdLevels = playableLevels.filter((item) => item.effectiveHeight >= 720);
        const displayLevels = hdLevels.length > 0 ? hdLevels : playableLevels;

        if (hdLevels.length > 0) {
          const sortedHdAsc = [...hdLevels].sort(
            (a, b) => a.effectiveHeight - b.effectiveHeight || a.lvl.bitrate - b.lvl.bitrate
          );
          const lowestHd = sortedHdAsc[0];
          const preferred1080 = [...sortedHdAsc]
            .reverse()
            .find((item) => item.effectiveHeight >= 1000 && item.effectiveHeight <= 1440);
          const preferredHd = preferred1080 || sortedHdAsc[sortedHdAsc.length - 1];

          lowestHdLevelIndex = lowestHd.index;
          const floorBitrate = lowestHd.lvl.maxBitrate || lowestHd.lvl.bitrate;
          if (floorBitrate > 0) {
            hls.config.minAutoBitrate = Math.max(1, floorBitrate - 1);
          }
          hls.startLevel = preferredHd.index;
          hls.nextAutoLevel = preferredHd.index;
          setHasHdFloor(true);
        } else if (!supportsHevc && avcIndices.length > 0 && avcIndices.length < rawLevels.length) {
          // If browser doesn't decode HEVC cleanly and H.264 levels exist, lock to highest compatible H.264
          hls.nextLevel = avcIndices[avcIndices.length - 1];
        }

        const levels: HlsQualityOption[] = [...displayLevels]
          .sort((a, b) => b.effectiveHeight - a.effectiveHeight || b.lvl.bitrate - a.lvl.bitrate)
          .map(({ lvl, index, effectiveHeight }) => ({
            index,
            label: lvl.height ? `${lvl.height}p` : `${effectiveHeight}p`,
          }));

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
        if (!data.fatal) {
          if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR && !video.paused) {
            hls.startLoad();
          }
          return;
        }

        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveryCount < 2) {
          mediaRecoveryCount += 1;
          hls.recoverMediaError();
          return;
        }

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !steppedDownNetworkError) {
          steppedDownNetworkError = true;
          const minAllowed = lowestHdLevelIndex >= 0 ? lowestHdLevelIndex : 0;
          if (hls.currentLevel > minAllowed) {
            const lowerLevel = Math.max(minAllowed, hls.currentLevel - 1);
            hls.nextLevel = lowerLevel;
            hls.currentLevel = lowerLevel;
            setSelectedQualityIndex(lowerLevel);
          }
          hls.startLoad();
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
  }, [playerMode, rawNativeSource, effectiveNativeSource, startAtSeconds, handleNativeSourceError]);

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

  const serverLabelForId = (id: AnyServerId) => {
    const def = VIDUKI_SERVERS.find((s) => s.id === id);
    return def?.badge || def?.name || id;
  };

  const handleSelectManualServer = (target: 'direct' | AnyServerId) => {
    setServerSwitchMode('manual');
    setServerProbeStatus('manual');
    setActiveMenu(null);

    if (target === 'direct' && directCandidates.length > 0) {
      const cand = directCandidates[0];
      setDirectCandidateIdx(0);
      setDirectStreamUrl(cand.url);
      setDirectSubtitleUrl(cand.subtitleUrl || providerCfg.subFile || '');
      setDirectSubtitleLabel(cand.subtitleLabel || providerCfg.subLabel || 'English');
      setDirectReferer(cand.referer || '');
      setUseProxyForNative(cand.needsProxy ?? Boolean(cand.referer));
      setPlayerMode('native');
      setIsLoading(true);
      return;
    }

    if (target !== 'direct') {
      let targetIdx = serverQueue.indexOf(target);
      if (targetIdx === -1) {
        setServerQueue((prev) => [...prev, target]);
        targetIdx = serverQueue.length;
      }
      setQueueIndex(targetIdx);
      setPlayerMode('stream');
      setIframeLoaded(false);
      setRevealTimedOut(false);
      setIframeKey((k) => k + 1);
    }
  };

  const handleEnableAutoServer = () => {
    setServerSwitchMode('auto');
    setFailedServers([]);
    if (directCandidates.length > 0 && playerMode !== 'native') {
      const cand = directCandidates[0];
      setDirectCandidateIdx(0);
      setDirectStreamUrl(cand.url);
      setDirectSubtitleUrl(cand.subtitleUrl || providerCfg.subFile || '');
      setDirectSubtitleLabel(cand.subtitleLabel || providerCfg.subLabel || 'English');
      setDirectReferer(cand.referer || '');
      setUseProxyForNative(cand.needsProxy ?? Boolean(cand.referer));
      setPlayerMode('native');
      setServerProbeStatus('found');
      setIsLoading(true);
      return;
    }
    if (serverProbeStatus === 'exhausted') {
      setQueueIndex(0);
      setPlayerMode('stream');
      setServerProbeStatus('searching');
      setIframeLoaded(false);
      setRevealTimedOut(false);
      setIframeKey((k) => k + 1);
    } else {
      setServerProbeStatus('found');
    }
  };

  const showDarkLoadingStage =
    (playerMode === 'stream' && (isResolvingServer || (!iframeLoaded && !revealTimedOut))) ||
    ((playerMode === 'native' || playerMode === 'offline') && isLoading);

  const hideCursor =
    (playerMode === 'native' || playerMode === 'offline') &&
    isPlaying &&
    !showControls &&
    !activeMenu &&
    !showEpisodeDrawer;

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const bufferedPct = duration > 0 ? Math.min(100, (bufferedTime / duration) * 100) : 0;
  const volumePct = isMuted ? 0 : Math.round(volume * 100);
  const topSubtitleText =
    media.type === 'series'
      ? `Season ${currentSeason} • Episode ${currentEpisode}`
      : `${media.year}${media.durationMinutes ? ` • ${media.durationMinutes} min` : ''}`;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        if ((isPlaying || playerMode === 'stream') && !activeMenu) setShowControls(false);
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
      {playerMode === 'stream' && !isResolvingServer && activeStreamSource.url && (
        <div className="w-full h-full relative bg-black overflow-hidden">
          <iframe
            key={`player-frame-${activeServer}-${currentSeason}-${currentEpisode}-${iframeKey}`}
            data-mullahmax-player="true"
            src={activeStreamSource.url}
            title={media.title}
            onLoad={(e) => {
              injectAdShieldIntoIframe(e.currentTarget);
              setIframeLoaded(true);
              setRevealTimedOut(true);
              setServerProbeStatus(serverSwitchMode === 'manual' ? 'manual' : 'found');
            }}
            onError={() => {
              if (serverSwitchMode === 'auto') {
                advanceAutoServer(activeServer);
              }
            }}
            referrerPolicy="origin"
            allow="autoplay *; fullscreen *; encrypted-media *; picture-in-picture *; accelerometer; gyroscope; clipboard-write; web-share"
            allowFullScreen
            className={`w-full h-full border-0 bg-black transition-opacity duration-150 ${
              iframeLoaded || revealTimedOut ? 'opacity-100' : 'opacity-0'
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
            preload="auto"
            crossOrigin={proxiedSubtitleUrl ? 'anonymous' : undefined}
            onTimeUpdate={handleTimeUpdate}
            onCanPlay={() => {
              setIsLoading(false);
              setServerProbeStatus(serverSwitchMode === 'manual' ? 'manual' : 'found');
            }}
            onWaiting={() => setIsLoading(true)}
            onPlaying={() => {
              setIsLoading(false);
              setIsPlaying(true);
              setServerProbeStatus(serverSwitchMode === 'manual' ? 'manual' : 'found');
            }}
            onLoadedData={() => {
              setIsLoading(false);
              setServerProbeStatus(serverSwitchMode === 'manual' ? 'manual' : 'found');
            }}
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
        </div>
      )}

      {/* TOP PLAYER HEADER (Back arrow, Title + Season/Episode or Year, Episode drawer + Fullscreen) */}
      <div
        className={`absolute top-0 left-0 right-0 px-4 sm:px-6 pt-4 pb-10 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-start justify-between z-40 pointer-events-none transition-opacity duration-200 ${
          showDarkLoadingStage || showControls || !isPlaying || activeMenu ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="pointer-events-auto flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-white/90 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold text-white leading-tight truncate">
              {media.title}
            </h1>
            <p className="text-xs text-white/60 leading-tight mt-0.5 truncate">
              {topSubtitleText}
            </p>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-2 shrink-0">
          {media.type === 'series' && (
            <div className="flex items-center bg-black/60 p-1 rounded-lg border border-white/10 backdrop-blur-md">
              <button
                type="button"
                onClick={() => handleNavigateEpisode(-1)}
                disabled={currentSeason === 1 && currentEpisode === 1}
                className="p-1.5 rounded text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                aria-label="Previous Episode"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowEpisodeDrawer(true)}
                className="px-2 py-1 rounded text-white/95 hover:bg-white/10 cursor-pointer transition-colors flex items-center gap-1.5 text-xs font-semibold tabular-nums"
                aria-label="Episodes"
              >
                <ListVideo className="w-4 h-4" />
                <span>S{currentSeason} E{currentEpisode}</span>
              </button>
              <button
                type="button"
                onClick={() => handleNavigateEpisode(1)}
                disabled={!hasNextEpisode}
                className="p-1.5 rounded text-white/80 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                aria-label="Next Episode"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {isDownloaded && hasPlayableDownloadedFile && (
            <button
              type="button"
              onClick={() =>
                setPlayerMode(playerMode === 'offline' ? (directStreamUrl ? 'native' : 'stream') : 'offline')
              }
              className={`p-2 rounded-lg border backdrop-blur-md transition-colors cursor-pointer ${
                playerMode === 'offline'
                  ? 'bg-white text-black border-white'
                  : 'bg-black/55 text-white/85 hover:text-white border-white/10'
              }`}
              aria-label="Toggle Downloaded Media"
            >
              <HardDrive className="w-4 h-4" />
            </button>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-lg text-white/85 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
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

      {/* Edge hover detector so the bottom bar stays reachable in embed mode even after auto-hide */}
      {playerMode === 'stream' && !showControls && !activeMenu && (
        <div
          onMouseEnter={handleMouseMove}
          onMouseMove={handleMouseMove}
          className="absolute bottom-0 left-0 right-0 h-5 z-30"
        />
      )}

      {/* UNIFIED BOTTOM PLAYER BAR (Red Progress + Red Volume + Server / Quality / Audio / Subtitles) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`absolute bottom-0 left-0 right-0 px-4 sm:px-6 pb-4 pt-10 bg-gradient-to-t from-black/95 via-black/75 to-transparent z-40 transition-opacity duration-200 ${
          showControls || !isPlaying || activeMenu || showDarkLoadingStage
            ? 'opacity-100'
            : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Row 1: Red Progress Bar + Time + Speaker + Red Volume Bar + Fullscreen */}
        <div className="flex items-center gap-3.5 mb-3">
          <div className="group relative flex-1 h-4 flex items-center">
            <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden relative">
              <div
                className="absolute left-0 top-0 bottom-0 bg-white/30 transition-all"
                style={{ width: `${bufferedPct}%` }}
              />
              <div
                className="absolute left-0 top-0 bottom-0 bg-[#E50914] transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {(playerMode === 'native' || playerMode === 'offline') && (
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
            )}
          </div>

          <span className="text-xs text-white/90 font-medium tabular-nums shrink-0">
            {duration > 0 ? `${formatTime(currentTime)} / ${formatTime(duration)}` : formatTime(currentTime)}
          </span>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleMute}
              disabled={playerMode === 'stream'}
              className="p-1 text-white/90 hover:text-white disabled:opacity-60 transition-colors cursor-pointer"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>
            <div className="relative w-16 sm:w-20 h-3 flex items-center">
              <div className="w-full h-2.5 bg-white/15 rounded-sm overflow-hidden relative">
                <div
                  className="absolute left-0 top-0 bottom-0 bg-[#E50914] transition-all"
                  style={{ width: `${volumePct}%` }}
                />
              </div>
              {playerMode !== 'stream' && (
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  aria-label="Volume"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1 text-white/85 hover:text-white transition-colors cursor-pointer shrink-0"
            aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Row 2: [ Server ] [ Quality ] [ Audio ] [ Subtitles ] + Shortcut Hints */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {/* SERVER BUTTON & POPOVER */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setActiveMenu((prev) => (prev === 'server' ? null : 'server'))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-colors cursor-pointer ${
                  activeMenu === 'server'
                    ? 'bg-[#252A36] text-white border-white/25'
                    : 'bg-[#171A23]/95 text-white/90 border-white/10 hover:bg-[#222633]'
                }`}
              >
                <Server className="w-3.5 h-3.5 text-white/75" />
                <span>Server</span>
              </button>

              {activeMenu === 'server' && (
                <div className="absolute bottom-11 left-0 w-60 rounded-xl bg-[#13161E]/95 border border-white/15 backdrop-blur-xl shadow-2xl p-2 text-xs z-50">
                  <div className="flex items-center justify-between px-2 py-1.5 mb-1 border-b border-white/10">
                    <span className="text-[11px] font-semibold text-white/75">Playback Mode</span>
                    <div className="flex items-center gap-1 bg-black/50 p-0.5 rounded-md border border-white/10">
                      <button
                        type="button"
                        onClick={handleEnableAutoServer}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                          serverSwitchMode === 'auto'
                            ? 'bg-[#E50914] text-white'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        Auto
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setServerSwitchMode('manual');
                          setServerProbeStatus('manual');
                        }}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                          serverSwitchMode === 'manual'
                            ? 'bg-white text-black'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        Manual
                      </button>
                    </div>
                  </div>

                  <div className="space-y-0.5 max-h-48 overflow-y-auto no-scrollbar">
                    {directCandidates.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleSelectManualServer('direct')}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                          playerMode === 'native'
                            ? 'bg-white/12 text-white font-semibold'
                            : 'text-slate-300 hover:bg-white/8'
                        }`}
                      >
                        <span>Direct HD</span>
                        {playerMode === 'native' && <Check className="w-3.5 h-3.5 text-white" />}
                      </button>
                    )}

                    {serverQueue.map((srvId) => {
                      const isCurrent = playerMode === 'stream' && activeServer === srvId;
                      const isFailed = failedServers.includes(srvId);
                      return (
                        <button
                          key={srvId}
                          type="button"
                          onClick={() => handleSelectManualServer(srvId)}
                          className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                            isCurrent
                              ? 'bg-white/12 text-white font-semibold'
                              : isFailed
                                ? 'text-white/40 hover:bg-white/8 hover:text-white/75'
                                : 'text-slate-200 hover:bg-white/8'
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <span>{serverLabelForId(srvId)}</span>
                            {isFailed && (
                              <span className="text-[10px] text-rose-400/80">unavailable</span>
                            )}
                          </span>
                          {isCurrent && <Check className="w-3.5 h-3.5 text-white" />}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-1.5 pt-1.5 border-t border-white/10 px-2 py-1 text-[11px] text-white/55 flex items-center gap-1.5">
                    {(serverProbeStatus === 'searching' || serverProbeStatus === 'switching') && (
                      <Loader2 className="w-3 h-3 animate-spin text-white/70 shrink-0" />
                    )}
                    <span>
                      {serverProbeStatus === 'searching'
                        ? 'Finding working server...'
                        : serverProbeStatus === 'switching'
                          ? 'Switching to next server...'
                          : serverProbeStatus === 'manual'
                            ? 'Manual server selected'
                            : serverProbeStatus === 'exhausted'
                              ? 'Select a server manually'
                              : 'Found • Search stopped'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* QUALITY BUTTON & POPOVER */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setActiveMenu((prev) => (prev === 'quality' ? null : 'quality'))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-colors cursor-pointer ${
                  activeMenu === 'quality'
                    ? 'bg-[#252A36] text-white border-white/25'
                    : 'bg-[#171A23]/95 text-white/85 border-white/10 hover:bg-[#222633]'
                }`}
              >
                <span className="px-1 py-0.2 rounded border border-white/40 text-[9px] font-bold leading-tight">
                  HD
                </span>
                <span>Quality</span>
              </button>

              {activeMenu === 'quality' && (
                <div className="absolute bottom-11 left-0 w-52 rounded-xl bg-[#13161E]/95 border border-white/15 backdrop-blur-xl shadow-2xl p-2 text-xs z-50 space-y-1">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/50">
                    Video Quality
                  </div>
                  {qualityLevels.length > 0 ? (
                    <div className="space-y-0.5 max-h-40 overflow-y-auto no-scrollbar">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedQualityIndex(-1);
                          if (hlsRef.current) hlsRef.current.currentLevel = -1;
                          setActiveMenu(null);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer ${
                          selectedQualityIndex === -1
                            ? 'bg-white/15 text-white font-semibold'
                            : 'text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        <span>{hasHdFloor ? 'Auto (720p–1080p+)' : 'Auto'}</span>
                        {selectedQualityIndex === -1 && <Check className="w-3.5 h-3.5" />}
                      </button>
                      {qualityLevels.map((lvl) => (
                        <button
                          key={lvl.index}
                          type="button"
                          onClick={() => {
                            setSelectedQualityIndex(lvl.index);
                            if (hlsRef.current) hlsRef.current.currentLevel = lvl.index;
                            setActiveMenu(null);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer ${
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
                  ) : (
                    <div className="px-2.5 py-2 text-white/70">
                      Auto (720p–1080p+ HD)
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* AUDIO BUTTON & POPOVER */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setActiveMenu((prev) => (prev === 'audio' ? null : 'audio'))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-colors cursor-pointer ${
                  activeMenu === 'audio'
                    ? 'bg-[#252A36] text-white border-white/25'
                    : 'bg-[#171A23]/95 text-white/85 border-white/10 hover:bg-[#222633]'
                }`}
              >
                <Music2 className="w-3.5 h-3.5 text-white/75" />
                <span>Audio</span>
              </button>

              {activeMenu === 'audio' && (
                <div className="absolute bottom-11 left-0 w-52 rounded-xl bg-[#13161E]/95 border border-white/15 backdrop-blur-xl shadow-2xl p-2 text-xs z-50 space-y-2">
                  <div>
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white/50">
                      Audio Track
                    </div>
                    {audioTracks.length > 0 ? (
                      <div className="space-y-0.5 max-h-32 overflow-y-auto no-scrollbar">
                        {audioTracks.map((tr) => (
                          <button
                            key={tr.id}
                            type="button"
                            onClick={() => {
                              setSelectedAudioTrack(tr.id);
                              if (hlsRef.current) hlsRef.current.audioTrack = tr.id;
                              setActiveMenu(null);
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg cursor-pointer ${
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
                    ) : (
                      <div className="px-2.5 py-1.5 text-white/80 flex items-center justify-between">
                        <span>Original Audio</span>
                        <Check className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>

                  {playerMode !== 'stream' && (
                    <div className="pt-2 border-t border-white/10 px-1">
                      <div className="px-1 text-[10px] font-bold uppercase tracking-wider text-white/50 mb-1.5">
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
                            className={`px-2 py-1 rounded text-[11px] font-mono cursor-pointer transition-colors ${
                              playbackSpeed === spd
                                ? 'bg-[#E50914] text-white font-bold'
                                : 'bg-white/5 text-slate-300 hover:bg-white/15'
                            }`}
                          >
                            {spd}x
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SUBTITLES BUTTON & POPOVER */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setActiveMenu((prev) => (prev === 'captions' ? null : 'captions'))}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition-colors cursor-pointer ${
                  activeMenu === 'captions' || captionsEnabled
                    ? 'bg-[#252A36] text-white border-white/25'
                    : 'bg-[#171A23]/95 text-white/90 border-white/10 hover:bg-[#222633]'
                }`}
              >
                <Captions className="w-3.5 h-3.5 text-white/85" />
                <span>Subtitles</span>
              </button>

              {activeMenu === 'captions' && (
                <div className="absolute bottom-11 left-0 w-48 rounded-xl bg-[#13161E]/95 border border-white/15 backdrop-blur-xl shadow-2xl p-2 text-xs space-y-0.5 z-50">
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
          </div>

          <span className="hidden md:block text-[11px] text-white/45 tracking-tight">
            Space / Backspace play-pause • F fullscreen • Esc back
          </span>
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
