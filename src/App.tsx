/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Sparkles,
  HardDrive,
  Film,
  Tv,
  TrendingUp,
  Award,
  Layers,
  ChevronRight,
  Filter,
  Globe,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { MediaItem, StreamingPlatform } from './types';
import { MEDIA_CATALOG, PLATFORM_INFO } from './data/mediaData';
import { ProfileProvider, useProfile } from './context/ProfileContext';
import { OfflineProvider, useOffline } from './context/OfflineContext';
import { TopBar } from './components/navigation/TopBar';
import { OfflineBanner } from './components/pwa/OfflineBanner';
import { HeroSpotlight } from './components/hero/HeroSpotlight';
import { PlatformFilterBar } from './components/navigation/PlatformFilterBar';
import { MediaCard } from './components/cards/MediaCard';
import { MediaDetailModal } from './components/modals/MediaDetailModal';
import { VideoPlayerModal } from './components/player/VideoPlayerModal';
import { DownloadModal } from './components/modals/DownloadModal';
import { ProfileModal } from './components/modals/ProfileModal';
import { VibeMatcherModal } from './components/modals/VibeMatcherModal';
import { SeriesEpisodePickerModal } from './components/modals/SeriesEpisodePickerModal';
import { SearchDrawer } from './components/search/SearchDrawer';
import { DownloadsView } from './components/views/DownloadsView';
import { MoviesView, MoviesViewFeed } from './components/views/MoviesView';
import { SeriesView, SeriesViewFeed } from './components/views/SeriesView';
import { TrendingAndNewSection, SeeAllTarget } from './components/views/TrendingAndNewSection';
import { NetworksView } from './components/views/NetworksView';
import { TMDBSettingsModal } from './components/modals/TMDBSettingsModal';
import {
  fetchLiveTrending,
  fetchServerMovies,
  fetchServerIndexedCatalog,
} from './services/tmdbService';
import { getBecauseYouWatched } from './utils/recommendationEngine';
import { installAdShield } from './utils/adBlocker';

function MainAppContent() {
  const { currentProfile, activeMood } = useProfile();
  const { isOffline } = useOffline();

  // Install anti-ad shield on application boot
  useEffect(() => {
    installAdShield();
  }, []);

  // Unified dynamic catalog (seeded with local offline-ready catalog + live TMDB feed)
  const [catalog, setCatalog] = useState<MediaItem[]>(MEDIA_CATALOG);
  const [isSyncingLive, setIsSyncingLive] = useState(false);
  const [showTMDBSettings, setShowTMDBSettings] = useState(false);

  // Tab navigation
  const [currentTab, setCurrentTab] = useState<'home' | 'movies' | 'series' | 'networks' | 'downloads'>(
    isOffline ? 'downloads' : 'home'
  );
  const [selectedPlatform, setSelectedPlatform] = useState<StreamingPlatform | 'ALL'>('ALL');
  const [moviesPreset, setMoviesPreset] = useState<{
    feed: MoviesViewFeed;
    genreId: number;
    vixLang: string;
  }>({
    feed: 'popular',
    genreId: 0,
    vixLang: 'all',
  });
  const [seriesPreset, setSeriesPreset] = useState<{
    feed: SeriesViewFeed;
    genreId: number;
    vixLang: string;
  }>({
    feed: 'all_feeds',
    genreId: 0,
    vixLang: 'all',
  });

  // Modals state
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [playingMedia, setPlayingMedia] = useState<{
    media: MediaItem;
    seasonNum?: number;
    episodeNum?: number;
  } | null>(null);

  // Target series for choosing season & episode before playing
  const [seriesForPicker, setSeriesForPicker] = useState<MediaItem | null>(null);

  const [downloadTarget, setDownloadTarget] = useState<{
    media: MediaItem;
    seasonNum?: number;
    episodeNum?: number;
  } | null>(null);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showVibeMatcher, setShowVibeMatcher] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [downloadToast, setDownloadToast] = useState<string | null>(null);

  // Handler for playing media: auto-resumes where user left off if available, or opens player immediately
  const handlePlayMedia = (media: MediaItem, seasonNum?: number, episodeNum?: number) => {
    let sNum = seasonNum;
    let eNum = episodeNum;

    // Check if user has an existing progress to resume for this title
    if (media.type === 'series' && (!sNum || !eNum)) {
      const historyItem = currentProfile.watchHistory.find((h) => h.mediaId === media.id);
      if (historyItem && historyItem.season && historyItem.episode) {
        sNum = historyItem.season;
        eNum = historyItem.episode;
      }
    }

    setPlayingMedia({
      media,
      seasonNum: sNum || 1,
      episodeNum: eNum || 1,
    });
  };

  // Live Server Movies & Series Loader (VixSrc / PrimeSrc index + TMDB feeds)
  const loadLiveTMDB = async () => {
    if (isOffline) return;
    setIsSyncingLive(true);
    try {
      const [liveItems, popularMovies, serverMovies, serverSeries] = await Promise.allSettled([
        fetchLiveTrending('all'),
        fetchServerMovies({ feed: 'popular', page: 1 }),
        fetchServerIndexedCatalog('movie', 1),
        fetchServerIndexedCatalog('tv', 1),
      ]);

      const itemsToAdd: MediaItem[] = [];
      if (liveItems.status === 'fulfilled' && liveItems.value) {
        itemsToAdd.push(...liveItems.value);
      }
      if (popularMovies.status === 'fulfilled' && popularMovies.value?.items) {
        itemsToAdd.push(...popularMovies.value.items);
      }
      if (serverMovies.status === 'fulfilled' && serverMovies.value?.items) {
        itemsToAdd.push(...serverMovies.value.items);
      }
      if (serverSeries.status === 'fulfilled' && serverSeries.value?.items) {
        itemsToAdd.push(...serverSeries.value.items);
      }

      if (itemsToAdd.length > 0) {
        setCatalog(() => {
          const map = new Map<string, MediaItem>();
          // Curated offline-ready items first
          MEDIA_CATALOG.forEach((item) => map.set(item.id, item));
          // Live items from TMDB / server feed (avoid duplicates)
          itemsToAdd.forEach((item) => {
            const alreadyExists = Array.from(map.values()).some(
              (m) =>
                m.id === item.id ||
                (m.tmdbId && item.tmdbId && m.tmdbId === item.tmdbId) ||
                m.title.toLowerCase() === item.title.toLowerCase()
            );
            if (!alreadyExists) {
              map.set(item.id, item);
            }
          });
          return Array.from(map.values());
        });
      }
    } catch (e) {
      console.warn('Could not fetch live TMDB feed:', e);
    } finally {
      setIsSyncingLive(false);
    }
  };

  const mergeCatalogItems = (incomingItems: MediaItem[]) => {
    if (!incomingItems || incomingItems.length === 0) return;
    setCatalog((prev) => {
      const map = new Map<string, MediaItem>();
      prev.forEach((item) => map.set(item.id, item));
      let added = false;
      incomingItems.forEach((item) => {
        const alreadyExists = Array.from(map.values()).some(
          (m) =>
            m.id === item.id ||
            (m.tmdbId && item.tmdbId && m.tmdbId === item.tmdbId) ||
            m.title.toLowerCase() === item.title.toLowerCase()
        );
        if (!alreadyExists) {
          map.set(item.id, item);
          added = true;
        }
      });
      return added ? Array.from(map.values()) : prev;
    });
  };

  useEffect(() => {
    loadLiveTMDB();
  }, [isOffline]);

  const becauseWatched = useMemo(() => {
    return getBecauseYouWatched(catalog, currentProfile);
  }, [catalog, currentProfile]);

  // Catalog filtered by selected streaming platform
  const platformFilteredCatalog = useMemo(() => {
    if (selectedPlatform === 'ALL') return catalog;
    return catalog.filter((item) => item.platforms.includes(selectedPlatform));
  }, [catalog, selectedPlatform]);

  // Featured Hero items (Curated mix of blockbusters and prestige multi-season TV series)
  const heroFeaturedItems = useMemo(() => {
    const featuredIds = [
      'dune-part-two',
      'the-penguin-hbo',
      'deadpool-and-wolverine',
      'severance-apple',
      'gladiator-2',
      'the-bear-fx',
      'oppenheimer-universal',
      'stranger-things',
      'shogun-hulu',
      'the-dark-knight',
      'fallout-prime',
      'arcane-league',
    ];
    const items = featuredIds
      .map((id) => catalog.find((m) => m.id === id))
      .filter(Boolean) as MediaItem[];
    return items.length > 0 ? items : catalog.slice(0, 8);
  }, [catalog]);

  const seriesOnly = useMemo(() => {
    return platformFilteredCatalog.filter((m) => m.type === 'series');
  }, [platformFilteredCatalog]);

  return (
    <div className="min-h-screen bg-[#080A0F] text-slate-100 flex flex-col font-sans selection:bg-rose-600 selection:text-white">
      {/* Top Banner for Network/Offline state & simulated airplane mode toggle */}
      <OfflineBanner
        onNavigateToDownloads={() => setCurrentTab('downloads')}
        onOpenTMDBSettings={() => setShowTMDBSettings(true)}
      />

      {/* Top Bar Contract (Wordmark - 4/5 Links - Primary Actions) */}
      <TopBar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          if (tab === 'movies') setMoviesPreset({ feed: 'popular', genreId: 0, vixLang: 'all' });
          if (tab === 'series') setSeriesPreset({ feed: 'all_feeds', genreId: 0, vixLang: 'all' });
          setCurrentTab(tab);
        }}
        onOpenProfile={() => setShowProfileModal(true)}
        onOpenVibeMatcher={() => setShowVibeMatcher(true)}
        onToggleSearch={() => setShowSearch(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-20">
        {/* DOWNLOADS / OFFLINE VAULT VIEW */}
        {currentTab === 'downloads' && (
          <DownloadsView
            catalog={catalog}
            onPlayDownloaded={(media, seasonNum, episodeNum) =>
              setPlayingMedia({ media, seasonNum, episodeNum })
            }
            onDownloadItem={(media, seasonNum, episodeNum) =>
              setDownloadTarget({ media, seasonNum, episodeNum })
            }
            onExploreCatalog={() => setCurrentTab('home')}
          />
        )}

        {/* HOME VIEW */}
        {currentTab === 'home' && (
          <div className="space-y-12">
            {/* Cinematic Hero Spotlight */}
            <HeroSpotlight
              featuredItems={heroFeaturedItems}
              onPlay={(item) => handlePlayMedia(item)}
              onDownload={(item) => setDownloadTarget({ media: item })}
              onSelect={setSelectedMedia}
              onExploreSeries={() => setCurrentTab('series')}
            />

            {/* Platform Filter Bar */}
            <PlatformFilterBar
              selectedPlatform={selectedPlatform}
              onSelectPlatform={setSelectedPlatform}
            />

            {/* Trending (Today | This Week) & Endless Category Cinema Rows */}
            <TrendingAndNewSection
              selectedPlatform={selectedPlatform}
              fallbackCatalog={platformFilteredCatalog}
              onSelect={setSelectedMedia}
              onPlay={(m) => handlePlayMedia(m)}
              onDownload={(m) => setDownloadTarget({ media: m })}
              onSeeAllCategory={(target: SeeAllTarget) => {
                if (target.type === 'series') {
                  setSeriesPreset({
                    feed: (target.feed as SeriesViewFeed) || 'all_feeds',
                    genreId: target.genreId || 0,
                    vixLang: target.vixLang || 'all',
                  });
                  setCurrentTab('series');
                } else {
                  setMoviesPreset({
                    feed: (target.feed as MoviesViewFeed) || 'popular',
                    genreId: target.genreId || 0,
                    vixLang: target.vixLang || 'all',
                  });
                  setCurrentTab('movies');
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onItemsLoaded={mergeCatalogItems}
            />

            {/* Section: Because You Watched (when watch history is available) */}
            {becauseWatched && becauseWatched.recommendations.length > 0 && (
              <div className="w-full px-4 sm:px-8 md:px-12 lg:px-16 xl:px-20 max-w-[2400px] mx-auto space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl sm:text-2xl font-black text-white font-display">
                    Because You Watched{' '}
                    <span className="text-rose-400">"{becauseWatched.referenceItem.title}"</span>
                  </h2>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4 sm:gap-5">
                  {becauseWatched.recommendations.map((item) => (
                    <MediaCard
                      key={item.id}
                      media={item}
                      onSelect={setSelectedMedia}
                      onPlay={(m) => handlePlayMedia(m)}
                      onDownload={(m) => setDownloadTarget({ media: m })}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Section 6: Browse by Streaming Network Showcase */}
            <div className="w-full px-4 sm:px-8 md:px-12 lg:px-16 xl:px-20 max-w-[2400px] mx-auto space-y-4 pt-4">
              <h2 className="text-xl sm:text-2xl font-black text-white font-display">
                All Major Platforms Under One Roof
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-8 gap-3.5 sm:gap-4">
                {Object.entries(PLATFORM_INFO).map(([key, info]) => {
                  const plat = key as StreamingPlatform;
                  const count = MEDIA_CATALOG.filter((m) => m.platforms.includes(plat)).length;

                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setSelectedPlatform(plat);
                        setCurrentTab('networks');
                      }}
                      className="p-4 rounded-2xl border text-left transition-all hover:-translate-y-1 cursor-pointer flex flex-col justify-between h-28 group"
                      style={{
                        backgroundColor: info.bgColor,
                        borderColor: info.borderColor,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: info.color }}
                        />
                        <span className="text-[11px] font-mono text-slate-300">
                          {count} titles
                        </span>
                      </div>
                      <div>
                        <h3 className="text-sm font-extrabold text-white font-display">
                          {info.name}
                        </h3>
                        <p className="text-[11px] text-slate-300 line-clamp-1 mt-0.5">
                          {info.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* MOVIES ONLY TAB (Loads endless pages from servers on scroll) */}
        {currentTab === 'movies' && (
          <MoviesView
            onSelectMovie={setSelectedMedia}
            onPlayMovie={(m) => handlePlayMedia(m)}
            onDownloadMovie={(m) => setDownloadTarget({ media: m })}
            initialCatalogMovies={catalog.filter((m) => m.type === 'movie')}
            initialFeed={moviesPreset.feed}
            initialGenreId={moviesPreset.genreId}
            initialVixLang={moviesPreset.vixLang}
          />
        )}

        {/* SERIES ONLY TAB (Fetches endless pages from servers on scroll) */}
        {currentTab === 'series' && (
          <SeriesView
            onSelectSeries={setSelectedMedia}
            onPlaySeries={(m) => handlePlayMedia(m)}
            onDownloadSeries={(m) => setDownloadTarget({ media: m })}
            initialCatalogSeries={seriesOnly}
            initialFeed={seriesPreset.feed}
            initialGenreId={seriesPreset.genreId}
            initialVixLang={seriesPreset.vixLang}
          />
        )}

        {/* ALL PLATFORMS EXPLORATION TAB */}
        {currentTab === 'networks' && (
          <NetworksView
            selectedPlatform={selectedPlatform}
            onSelectPlatform={setSelectedPlatform}
            fallbackCatalog={platformFilteredCatalog}
            onSelect={setSelectedMedia}
            onPlay={(m) => handlePlayMedia(m)}
            onDownload={(m) => setDownloadTarget({ media: m })}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-white/8 bg-[#06080C] py-8 text-xs text-slate-500">
        <div className="w-full px-4 sm:px-8 md:px-12 lg:px-16 xl:px-20 max-w-[2400px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-bold text-white font-display tracking-tight">MULLAHMAX</span>
            <span>·</span>
            <span>Movies &amp; Series</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>Netflix · Max · Disney+ · Apple TV+ · Prime Video · Hulu</span>
          </div>
          <div>
            <span>© {new Date().getFullYear()} MullahMax</span>
          </div>
        </div>
      </footer>

      {/* MODALS */}
      {/* 1. Media Detail Modal */}
      {selectedMedia && (
        <MediaDetailModal
          media={selectedMedia}
          onClose={() => setSelectedMedia(null)}
          onPlay={(seasonNum, episodeNum) => {
            handlePlayMedia(selectedMedia, seasonNum, episodeNum);
            setSelectedMedia(null);
          }}
          onOpenDownload={(seasonNum, episodeNum) => {
            setDownloadTarget({ media: selectedMedia, seasonNum, episodeNum });
          }}
          onSelectMedia={setSelectedMedia}
          allMedia={catalog}
        />
      )}

      {/* 2. Series Episode Picker Modal (Explicit Season and Episode selector) */}
      {seriesForPicker && (
        <SeriesEpisodePickerModal
          media={seriesForPicker}
          isOpen={Boolean(seriesForPicker)}
          onClose={() => setSeriesForPicker(null)}
          onPlayEpisode={(sNum, eNum) => {
            const target = seriesForPicker;
            setSeriesForPicker(null);
            setPlayingMedia({
              media: target,
              seasonNum: sNum,
              episodeNum: eNum,
            });
          }}
          onDownloadEpisode={(sNum, eNum) => {
            const target = seriesForPicker;
            setSeriesForPicker(null);
            setDownloadTarget({
              media: target,
              seasonNum: sNum,
              episodeNum: eNum,
            });
          }}
        />
      )}

      {/* 3. Video Player Modal (Offline & Online capable) */}
      {playingMedia && (
        <VideoPlayerModal
          media={playingMedia.media}
          seasonNumber={playingMedia.seasonNum}
          episodeNumber={playingMedia.episodeNum}
          onClose={() => setPlayingMedia(null)}
          onSelectEpisode={(sNum, eNum) => {
            setPlayingMedia({ media: playingMedia.media, seasonNum: sNum, episodeNum: eNum });
          }}
        />
      )}

      {/* 4. Offline Download Quality Modal */}
      {downloadTarget && (
        <DownloadModal
          media={downloadTarget.media}
          seasonNumber={downloadTarget.seasonNum}
          episodeNumber={downloadTarget.episodeNum}
          onClose={() => setDownloadTarget(null)}
          onDownloadStarted={() => {
            const title = downloadTarget.media.title;
            const detail =
              downloadTarget.media.type === 'series' && downloadTarget.seasonNum
                ? ` (S0${downloadTarget.seasonNum}${
                    downloadTarget.episodeNum ? `E0${downloadTarget.episodeNum}` : ''
                  })`
                : '';
            setDownloadToast(
              `Downloading "${title}${detail}" to Device & Offline Vault!`
            );
            setTimeout(() => setDownloadToast(null), 4500);
          }}
        />
      )}

      {/* 5. Profile Management & Switcher Modal */}
      {showProfileModal && (
        <ProfileModal onClose={() => setShowProfileModal(false)} />
      )}

      {/* 6. Vibe & Mood Matcher Modal */}
      {showVibeMatcher && (
        <VibeMatcherModal
          catalog={catalog}
          onClose={() => setShowVibeMatcher(false)}
          onSelectMedia={(m) => setSelectedMedia(m)}
          onPlay={(m) => handlePlayMedia(m)}
        />
      )}

      {/* 7. Universal Search Drawer with Live TMDB Querying */}
      <SearchDrawer
        catalog={catalog}
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        onSelectMedia={setSelectedMedia}
        onPlay={(m) => handlePlayMedia(m)}
        onDownload={(m) => setDownloadTarget({ media: m })}
        onOpenTMDBSettings={() => setShowTMDBSettings(true)}
      />

      {/* 8. TMDB Live API Settings Modal */}
      <TMDBSettingsModal
        isOpen={showTMDBSettings}
        onClose={() => setShowTMDBSettings(false)}
        onReloadCatalog={loadLiveTMDB}
      />

      {/* Download Notification Toast */}
      {downloadToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl bg-[#0E121B]/95 border border-emerald-500/50 text-white shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-bold">{downloadToast}</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <OfflineProvider>
      <ProfileProvider>
        <MainAppContent />
      </ProfileProvider>
    </OfflineProvider>
  );
}
