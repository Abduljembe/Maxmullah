import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Film,
  TrendingUp,
  Flame,
  Award,
  Calendar,
  Search,
  RefreshCw,
  Loader2,
  Layers,
  Tv,
} from 'lucide-react';
import { MediaItem, StreamingPlatform } from '../../types';
import { MediaCard } from '../cards/MediaCard';
import {
  fetchServerMovies,
  fetchAllServerMoviesMultiFeed,
  fetchServerIndexedCatalog,
  MOVIE_GENRES_LIST,
  MovieFeedType,
  TMDB_WATCH_PROVIDER_IDS,
  mediaMatchesGenreId,
} from '../../services/tmdbService';

export type MoviesViewFeed = MovieFeedType | 'all_feeds' | 'vixsrc';

interface MoviesViewProps {
  onSelectMovie: (media: MediaItem) => void;
  onPlayMovie: (media: MediaItem) => void;
  onDownloadMovie: (media: MediaItem) => void;
  initialCatalogMovies?: MediaItem[];
  initialFeed?: MoviesViewFeed;
  initialGenreId?: number;
  initialVixLang?: string;
}

function deduplicateMedia(list: MediaItem[]): MediaItem[] {
  const map = new Map<string, MediaItem>();
  list.forEach((item) => {
    const key = item.tmdbId ? `tmdb-${item.tmdbId}` : item.id;
    if (!map.has(key)) {
      map.set(key, item);
    }
  });
  return Array.from(map.values());
}

export const MoviesView: React.FC<MoviesViewProps> = ({
  onSelectMovie,
  onPlayMovie,
  onDownloadMovie,
  initialCatalogMovies = [],
  initialFeed = 'popular',
  initialGenreId = 0,
  initialVixLang = 'all',
}) => {
  const [activeFeed, setActiveFeed] = useState<MoviesViewFeed>(initialFeed);
  const [selectedGenreId, setSelectedGenreId] = useState<number>(initialGenreId);
  const [selectedPlatform, setSelectedPlatform] = useState<StreamingPlatform | 'ALL'>('ALL');
  const [vixLang, setVixLang] = useState<string>(initialVixLang || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [serverMovies, setServerMovies] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMorePages, setHasMorePages] = useState(true);

  const pageRef = useRef(1);
  const totalPagesRef = useRef(500);
  const isFetchingMoreRef = useRef(false);
  const emptyStreakRef = useRef(0);
  const errorStreakRef = useRef(0);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const fallbackMoviesRef = useRef(initialCatalogMovies);
  fallbackMoviesRef.current = initialCatalogMovies;

  useEffect(() => {
    setActiveFeed(initialFeed);
  }, [initialFeed]);

  useEffect(() => {
    setSelectedGenreId(initialGenreId);
  }, [initialGenreId]);

  useEffect(() => {
    if (initialVixLang) setVixLang(initialVixLang);
  }, [initialVixLang]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const watchProviderId =
    selectedPlatform !== 'ALL' ? TMDB_WATCH_PROVIDER_IDS[selectedPlatform] : undefined;

  const fetchBatchForPage = useCallback(
    async (pageNum: number) => {
      if (activeFeed === 'vixsrc' && !debouncedQuery && selectedGenreId === 0 && !watchProviderId) {
        return fetchServerIndexedCatalog(
          'movie',
          pageNum,
          vixLang === 'all' ? undefined : vixLang
        );
      }

      if (
        activeFeed === 'all_feeds' &&
        !debouncedQuery &&
        selectedGenreId === 0 &&
        !watchProviderId
      ) {
        const [indexedRes, multiRes] = await Promise.allSettled([
          fetchServerIndexedCatalog('movie', pageNum, vixLang === 'all' ? undefined : vixLang),
          fetchAllServerMoviesMultiFeed(pageNum),
        ]);
        const combined: MediaItem[] = [];
        if (indexedRes.status === 'fulfilled' && indexedRes.value.items.length > 0) {
          combined.push(...indexedRes.value.items);
        }
        if (multiRes.status === 'fulfilled' && multiRes.value.length > 0) {
          combined.push(...multiRes.value);
        }
        return {
          items: deduplicateMedia(combined),
          page: pageNum,
          totalPages: 500,
          totalResults: 40000,
        };
      }

      return fetchServerMovies({
        feed: activeFeed === 'all_feeds' || activeFeed === 'vixsrc' ? 'popular' : activeFeed,
        page: pageNum,
        genreId: selectedGenreId > 0 ? selectedGenreId : undefined,
        releasedOnly: activeFeed === 'popular' || activeFeed === 'now_playing' || selectedGenreId > 0,
        minVotes: selectedGenreId > 0 ? 50 : undefined,
        watchProviderId,
        query: debouncedQuery || undefined,
      });
    },
    [activeFeed, selectedGenreId, watchProviderId, vixLang, debouncedQuery]
  );

  const loadMovies = useCallback(
    async (pageToLoad = 1, append = false) => {
      if (pageToLoad === 1 && !append) {
        setIsLoading(true);
        isFetchingMoreRef.current = false;
        emptyStreakRef.current = 0;
        errorStreakRef.current = 0;
      } else {
        if (isFetchingMoreRef.current) return;
        isFetchingMoreRef.current = true;
        setIsLoadingMore(true);
      }

      try {
        const filterLocalCatalog = () =>
          fallbackMoviesRef.current.filter((m) => {
            if (m.type !== 'movie') return false;
            if (selectedGenreId > 0 && !mediaMatchesGenreId(m, selectedGenreId)) {
              return false;
            }
            if (debouncedQuery && !m.title.toLowerCase().includes(debouncedQuery.toLowerCase())) {
              return false;
            }
            if (selectedPlatform !== 'ALL' && !m.platforms.includes(selectedPlatform)) {
              return false;
            }
            return true;
          });

        const applyGenreFilterIfNeeded = (list: MediaItem[]) =>
          selectedGenreId > 0 && debouncedQuery
            ? list.filter((m) => mediaMatchesGenreId(m, selectedGenreId))
            : list;

        if (!append && pageToLoad === 1) {
          // Load pages 1 & 2 immediately so every category starts richly populated
          const [res1, res2] = await Promise.all([
            fetchBatchForPage(1),
            fetchBatchForPage(2),
          ]);
          const liveCombined = applyGenreFilterIfNeeded(
            deduplicateMedia([...(res1.items || []), ...(res2.items || [])])
          );
          const localFiltered = filterLocalCatalog();
          const shouldMergeLocal =
            selectedGenreId > 0 && activeFeed !== 'vixsrc' && !debouncedQuery;
          const combined =
            liveCombined.length > 0
              ? shouldMergeLocal
                ? deduplicateMedia([...liveCombined, ...localFiltered])
                : liveCombined
              : localFiltered;

          if (combined.length > 0) {
            const maxTotal =
              liveCombined.length > 0
                ? Math.max(1, res1.totalPages || 1, res2.totalPages || 1)
                : 1;
            const loadedPage = liveCombined.length > 0 && res2.items.length > 0 ? 2 : 1;
            setServerMovies(combined);
            pageRef.current = loadedPage;
            totalPagesRef.current = maxTotal;
            setHasMorePages(liveCombined.length > 0 && loadedPage < maxTotal);
          } else {
            setServerMovies([]);
            setHasMorePages(false);
          }
        } else {
          const result = await fetchBatchForPage(pageToLoad);
          errorStreakRef.current = 0;
          pageRef.current = pageToLoad;
          totalPagesRef.current = Math.max(pageToLoad, result.totalPages || totalPagesRef.current);
          const filteredItems = applyGenreFilterIfNeeded(result.items);
          if (filteredItems.length > 0) {
            emptyStreakRef.current = 0;
            setServerMovies((prev) => deduplicateMedia([...prev, ...filteredItems]));
            setHasMorePages(pageToLoad < totalPagesRef.current);
          } else {
            emptyStreakRef.current += 1;
            setHasMorePages(emptyStreakRef.current < 3 && pageToLoad < totalPagesRef.current);
          }
        }
      } catch (err) {
        console.warn('MoviesView loadMovies error:', err);
        errorStreakRef.current += 1;
        if (!append) {
          const localFallback = fallbackMoviesRef.current.filter((m) => {
            if (m.type !== 'movie') return false;
            if (selectedGenreId > 0 && !mediaMatchesGenreId(m, selectedGenreId)) return false;
            if (debouncedQuery && !m.title.toLowerCase().includes(debouncedQuery.toLowerCase())) {
              return false;
            }
            if (selectedPlatform !== 'ALL' && !m.platforms.includes(selectedPlatform)) return false;
            return true;
          });
          setServerMovies(localFallback);
          setHasMorePages(false);
        } else {
          setHasMorePages(errorStreakRef.current < 3);
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
        isFetchingMoreRef.current = false;
      }
    },
    [fetchBatchForPage, activeFeed, debouncedQuery, selectedGenreId, selectedPlatform]
  );

  useEffect(() => {
    pageRef.current = 1;
    totalPagesRef.current = 500;
    setHasMorePages(true);
    loadMovies(1, false);
  }, [loadMovies]);

  const handleLoadMore = useCallback(() => {
    if (isLoading || isFetchingMoreRef.current) return;
    if (pageRef.current >= totalPagesRef.current) {
      setHasMorePages(false);
      return;
    }
    loadMovies(pageRef.current + 1, true);
  }, [isLoading, loadMovies]);

  // Dual infinite scroll triggers: IntersectionObserver + window scroll + tall-viewport check
  useEffect(() => {
    const sentinel = bottomSentinelRef.current;
    if (isLoading || !hasMorePages) return;

    const checkNeedMore = () => {
      if (isFetchingMoreRef.current) return;
      const scrollBottom = window.innerHeight + window.scrollY;
      const docHeight = document.documentElement.scrollHeight;
      if (scrollBottom >= docHeight - 1000) {
        handleLoadMore();
      }
    };
    window.addEventListener('scroll', checkNeedMore, { passive: true });

    let observer: IntersectionObserver | null = null;
    if (sentinel && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            handleLoadMore();
          }
        },
        { rootMargin: '1100px 0px', threshold: 0.01 }
      );
      observer.observe(sentinel);
    }

    let rafId = 0;
    if (!isLoadingMore) {
      rafId = window.requestAnimationFrame(checkNeedMore);
    }

    return () => {
      window.removeEventListener('scroll', checkNeedMore);
      if (rafId) window.cancelAnimationFrame(rafId);
      observer?.disconnect();
    };
  }, [isLoading, isLoadingMore, hasMorePages, serverMovies.length, handleLoadMore]);

  const feedTabs = [
    { id: 'popular', label: 'Popular', icon: Flame },
    { id: 'trending', label: 'Trending', icon: TrendingUp },
    { id: 'vixsrc', label: 'VixSrc Library', icon: Tv },
    { id: 'top_rated', label: 'Top Rated', icon: Award },
    { id: 'now_playing', label: 'New Releases', icon: Calendar },
    { id: 'all_feeds', label: 'All Movies', icon: Layers },
  ] as const;

  return (
    <div className="w-full px-4 sm:px-8 md:px-12 lg:px-16 xl:px-20 max-w-[2400px] mx-auto py-8 space-y-8 animate-fade-in">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-6 border-b border-white/10">
        <div className="space-y-1.5">
          <h1 className="text-3xl sm:text-4xl font-black text-white font-display tracking-tight">
            Movies
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
            Browse popular releases, trending hits, VixSrc indexed movies, critically acclaimed films, and genres.
          </p>
        </div>

        <button
          onClick={() => {
            pageRef.current = 1;
            loadMovies(1, false);
          }}
          disabled={isLoading}
          className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 transition-colors cursor-pointer flex items-center gap-2 text-xs font-semibold shrink-0 self-start lg:self-auto"
          title="Refresh catalog"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-rose-500' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Control Bar: Search + Feed Switcher */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            {feedTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeFeed === tab.id && !debouncedQuery;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveFeed(tab.id);
                    if (tab.id === 'vixsrc') setSelectedGenreId(0);
                    setSearchQuery('');
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center gap-2 whitespace-nowrap border ${
                    isActive
                      ? 'bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-600/30'
                      : 'bg-white/5 text-slate-300 border-white/5 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {(activeFeed === 'vixsrc' || activeFeed === 'all_feeds') && (
              <div className="inline-flex items-center p-0.5 rounded-xl bg-white/5 border border-white/10 text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setVixLang('all')}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold cursor-pointer whitespace-nowrap ${
                    vixLang === 'all' ? 'bg-rose-600 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  All Audio
                </button>
                <button
                  type="button"
                  onClick={() => setVixLang('it')}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold cursor-pointer whitespace-nowrap ${
                    vixLang === 'it' ? 'bg-rose-600 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Italian (it)
                </button>
              </div>
            )}

            <div className="relative min-w-[220px] sm:w-64">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search movies..."
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-rose-500 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs font-bold p-1"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Genre Selector Ribbon */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          {MOVIE_GENRES_LIST.map((genre) => {
            const isSelected = selectedGenreId === genre.id;
            return (
              <button
                key={genre.id}
                onClick={() => setSelectedGenreId(genre.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
                  isSelected
                    ? 'bg-amber-500 text-black font-bold shadow-sm shadow-amber-500/20'
                    : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
                }`}
              >
                {genre.name}
              </button>
            );
          })}
        </div>

        {/* Platform Filter Ribbon */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0 font-mono">
            Platform:
          </span>
          <button
            onClick={() => setSelectedPlatform('ALL')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
              selectedPlatform === 'ALL'
                ? 'bg-white text-slate-950 font-bold'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            All Platforms
          </button>
          {[
            'Netflix',
            'Max',
            'Disney+',
            'Apple TV+',
            'Prime Video',
            'Paramount+',
            'Peacock',
            'Hulu',
            'Criterion Channel',
          ].map((p) => (
            <button
              key={p}
              onClick={() => setSelectedPlatform(p as StreamingPlatform)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                selectedPlatform === p
                  ? 'bg-rose-600 text-white font-bold'
                  : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Movie Cards Grid */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-10 h-10 text-rose-500 animate-spin" />
          <p className="text-sm font-semibold text-slate-300">Loading movies...</p>
        </div>
      ) : serverMovies.length === 0 ? (
        <div className="py-20 text-center rounded-3xl bg-white/5 border border-white/10 p-8 space-y-4 max-w-md mx-auto">
          <Film className="w-12 h-12 text-slate-500 mx-auto" />
          <h3 className="text-lg font-bold text-white">No Movies Found</h3>
          <p className="text-xs text-slate-400">
            {searchQuery
              ? `No movies matched "${searchQuery}".`
              : 'Try selecting a different genre or clearing platform filters.'}
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedGenreId(0);
              setSelectedPlatform('ALL');
              setActiveFeed('popular');
            }}
            className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold cursor-pointer hover:bg-rose-500 transition-colors"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4 sm:gap-5">
            {serverMovies.map((movie) => (
              <MediaCard
                key={movie.id}
                media={movie}
                onSelect={onSelectMovie}
                onPlay={(m) => onPlayMovie(m)}
                onDownload={(m) => onDownloadMovie(m)}
              />
            ))}
          </div>

          {hasMorePages && (
            <div ref={bottomSentinelRef} className="pt-4 pb-8 flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
              >
                <Loader2 className={`w-4 h-4 ${isLoadingMore ? 'animate-spin text-rose-500' : 'text-slate-400'}`} />
                <span>{isLoadingMore ? 'Loading more movies...' : 'Load more movies'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
