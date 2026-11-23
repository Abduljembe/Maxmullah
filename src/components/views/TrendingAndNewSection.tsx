import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Plus } from 'lucide-react';
import { MediaItem, StreamingPlatform } from '../../types';
import {
  FetchServerMoviesResult,
  MovieFeedType,
  TMDB_WATCH_PROVIDER_IDS,
  fetchLiveTrendingPaged,
  fetchServerIndexedCatalog,
  fetchServerMovies,
  fetchServerSeries,
  mediaMatchesGenreId,
} from '../../services/tmdbService';
import { MediaCard } from '../cards/MediaCard';

export interface SeeAllTarget {
  type: 'movie' | 'series';
  feed?: MovieFeedType | 'all_feeds' | 'vixsrc' | 'popular' | 'trending' | 'top_rated' | 'now_playing';
  genreId?: number;
  vixLang?: string;
}

interface TrendingAndNewSectionProps {
  selectedPlatform: StreamingPlatform | 'ALL';
  fallbackCatalog: MediaItem[];
  onSelect: (media: MediaItem) => void;
  onPlay: (media: MediaItem) => void;
  onDownload: (media: MediaItem) => void;
  onSeeAllCategory: (target: SeeAllTarget) => void;
  onItemsLoaded?: (items: MediaItem[]) => void;
}

function deduplicateItems(list: MediaItem[]): MediaItem[] {
  const seen = new Set<string>();
  const out: MediaItem[] = [];
  for (const item of list) {
    const key = item.tmdbId ? `${item.type}-${item.tmdbId}` : item.id;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

interface InfiniteCinemaRowProps {
  title: string;
  fetchPage: (page: number) => Promise<FetchServerMoviesResult>;
  resetKey: string;
  fallbackItems: MediaItem[];
  mergeFallbackWithResults?: boolean;
  eager?: boolean;
  activationDelayMs?: number;
  onSelect: (media: MediaItem) => void;
  onPlay: (media: MediaItem) => void;
  onDownload: (media: MediaItem) => void;
  onSeeAll: () => void;
  onItemsLoaded?: (items: MediaItem[]) => void;
  headerExtra?: React.ReactNode;
}

const InfiniteCinemaRow: React.FC<InfiniteCinemaRowProps> = ({
  title,
  fetchPage,
  resetKey,
  fallbackItems,
  mergeFallbackWithResults = false,
  eager = false,
  activationDelayMs = 350,
  onSelect,
  onPlay,
  onDownload,
  onSeeAll,
  onItemsLoaded,
  headerExtra,
}) => {
  const sectionRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const rightSentinelRef = useRef<HTMLButtonElement>(null);

  const [hasActivated, setHasActivated] = useState(eager);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const pageRef = useRef(1);
  const totalPagesRef = useRef(500);
  const loadingRef = useRef(false);
  const emptyStreakRef = useRef(0);
  const activeKeyRef = useRef(resetKey);
  const onItemsLoadedRef = useRef(onItemsLoaded);
  onItemsLoadedRef.current = onItemsLoaded;

  useEffect(() => {
    if (eager || hasActivated) return;
    const node = sectionRef.current;

    const timer = window.setTimeout(() => {
      setHasActivated(true);
    }, activationDelayMs);

    if (!node || typeof IntersectionObserver === 'undefined') {
      return () => window.clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setHasActivated(true);
          observer.disconnect();
        }
      },
      { rootMargin: '1200px 0px' }
    );
    observer.observe(node);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [eager, hasActivated, activationDelayMs]);

  useEffect(() => {
    if (!hasActivated) return;
    let cancelled = false;
    activeKeyRef.current = resetKey;
    pageRef.current = 1;
    totalPagesRef.current = 500;
    loadingRef.current = true;
    emptyStreakRef.current = 0;
    setIsInitialLoading(true);
    setIsLoadingMore(false);
    setHasMore(true);

    // Fetch pages 1 & 2 on initial load so each category immediately has a rich horizontal strip
    Promise.all([fetchPage(1), fetchPage(2)])
      .then(([res1, res2]) => {
        if (cancelled || activeKeyRef.current !== resetKey) return;
        const combined = deduplicateItems([...(res1.items || []), ...(res2.items || [])]);
        const maxTotalPages = Math.max(1, res1.totalPages || 1, res2.totalPages || 1);
        const loadedPage = res2.items.length > 0 ? 2 : 1;

        setItems(combined);
        pageRef.current = loadedPage;
        totalPagesRef.current = maxTotalPages;
        setHasMore(loadedPage < maxTotalPages);

        if (combined.length > 0) {
          onItemsLoadedRef.current?.(combined);
        }
      })
      .finally(() => {
        if (!cancelled && activeKeyRef.current === resetKey) {
          loadingRef.current = false;
          setIsInitialLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasActivated, resetKey, fetchPage]);

  const loadNextPage = useCallback(async () => {
    if (!hasActivated || loadingRef.current) return;
    if (pageRef.current >= totalPagesRef.current) {
      setHasMore(false);
      return;
    }

    const currentKey = resetKey;
    const nextPage = pageRef.current + 1;
    loadingRef.current = true;
    setIsLoadingMore(true);

    try {
      const res = await fetchPage(nextPage);
      if (activeKeyRef.current !== currentKey) return;
      pageRef.current = nextPage;
      totalPagesRef.current = Math.max(pageRef.current, res.totalPages || totalPagesRef.current);

      if (res.items.length > 0) {
        emptyStreakRef.current = 0;
        setItems((prev) => deduplicateItems([...prev, ...res.items]));
        onItemsLoadedRef.current?.(res.items);
        setHasMore(pageRef.current < totalPagesRef.current);
      } else {
        emptyStreakRef.current += 1;
        setHasMore(emptyStreakRef.current < 2 && pageRef.current < totalPagesRef.current);
      }
    } finally {
      if (activeKeyRef.current === currentKey) {
        loadingRef.current = false;
        setIsLoadingMore(false);
      }
    }
  }, [hasActivated, resetKey, fetchPage]);

  useEffect(() => {
    const rail = railRef.current;
    const sentinel = rightSentinelRef.current;
    if (!rail || !sentinel || !hasActivated || isInitialLoading || !hasMore) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          loadNextPage();
        }
      },
      {
        root: rail,
        rootMargin: '0px 700px 0px 0px',
        threshold: 0.01,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasActivated, isInitialLoading, hasMore, items.length, loadNextPage]);

  const scrollRail = (direction: 'left' | 'right') => {
    if (!railRef.current) return;
    const rail = railRef.current;
    const distance = Math.max(360, rail.clientWidth * 0.8);
    rail.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });

    if (direction === 'right') {
      const remainingRight = rail.scrollWidth - (rail.scrollLeft + rail.clientWidth);
      if (remainingRight < distance * 2.5) {
        loadNextPage();
      }
    }
  };

  const renderedItems = useMemo(() => {
    if (items.length === 0) return fallbackItems;
    if (!mergeFallbackWithResults || fallbackItems.length === 0) return items;
    return deduplicateItems([...items, ...fallbackItems]);
  }, [items, fallbackItems, mergeFallbackWithResults]);

  return (
    <section
      ref={sectionRef}
      className="w-full px-4 sm:px-8 md:px-12 lg:px-16 xl:px-20 max-w-[2400px] mx-auto space-y-3.5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <h2 className="text-lg sm:text-xl font-bold text-white font-display truncate">
            {title}
          </h2>
          {headerExtra}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => scrollRail('left')}
            aria-label={`Scroll ${title} left`}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollRail('right')}
            aria-label={`Scroll ${title} right`}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onSeeAll}
            className="text-xs text-rose-500 hover:text-rose-400 font-semibold ml-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            See all
          </button>
        </div>
      </div>

      {isInitialLoading && items.length === 0 ? (
        <div className="flex gap-3.5 sm:gap-4 overflow-hidden">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div
              key={idx}
              className="w-[140px] sm:w-[155px] md:w-[168px] shrink-0 space-y-2 animate-pulse"
            >
              <div className="aspect-[2/3] rounded-xl bg-slate-800/70" />
              <div className="h-3.5 bg-slate-800 rounded w-3/4" />
              <div className="h-3 bg-slate-800/80 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div
          ref={railRef}
          onScroll={() => {
            const rail = railRef.current;
            if (!rail) return;
            if (rail.scrollWidth - (rail.scrollLeft + rail.clientWidth) < 850) {
              loadNextPage();
            }
          }}
          className="flex gap-3.5 sm:gap-4 overflow-x-auto pb-2 scroll-smooth no-scrollbar items-start"
        >
          {renderedItems.map((item) => (
            <div
              key={`${resetKey}-${item.id}`}
              className="w-[140px] sm:w-[155px] md:w-[168px] shrink-0"
            >
              <MediaCard
                media={item}
                onSelect={onSelect}
                onPlay={onPlay}
                onDownload={onDownload}
              />
            </div>
          ))}

          {hasMore && (
            <button
              ref={rightSentinelRef}
              type="button"
              onClick={loadNextPage}
              disabled={isLoadingMore}
              className="w-[105px] sm:w-[120px] aspect-[2/3] shrink-0 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex flex-col items-center justify-center gap-2 text-slate-300 transition-colors cursor-pointer"
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin text-rose-500" />
                  <span className="text-[11px] font-medium">Loading...</span>
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5 text-rose-500" />
                  <span className="text-[11px] font-semibold">Load more</span>
                </>
              )}
            </button>
          )}
        </div>
      )}
    </section>
  );
};

export const TrendingAndNewSection: React.FC<TrendingAndNewSectionProps> = ({
  selectedPlatform,
  fallbackCatalog,
  onSelect,
  onPlay,
  onDownload,
  onSeeAllCategory,
  onItemsLoaded,
}) => {
  const [trendingWindow, setTrendingWindow] = useState<'day' | 'week'>('day');
  const [vixLang, setVixLang] = useState<'all' | 'it'>('all');

  const watchProviderId =
    selectedPlatform !== 'ALL' ? TMDB_WATCH_PROVIDER_IDS[selectedPlatform] : undefined;

  const filterPlatformClient = (list: MediaItem[]) => {
    if (selectedPlatform === 'ALL') return list;
    const filtered = list.filter((m) => m.platforms.includes(selectedPlatform));
    return filtered.length > 0 ? filtered : list;
  };

  const catalogMovies = useMemo(
    () => fallbackCatalog.filter((m) => m.type === 'movie'),
    [fallbackCatalog]
  );
  const strictPlatformMovies = useMemo(
    () =>
      selectedPlatform === 'ALL'
        ? catalogMovies
        : catalogMovies.filter((m) => m.platforms.includes(selectedPlatform)),
    [catalogMovies, selectedPlatform]
  );

  const movieFallbacks = filterPlatformClient(catalogMovies);
  const seriesFallbacks = filterPlatformClient(fallbackCatalog.filter((m) => m.type === 'series'));

  const actionFallbacks = useMemo(
    () => movieFallbacks.filter((m) => mediaMatchesGenreId(m, 28)),
    [movieFallbacks]
  );
  const sciFiFallbacks = useMemo(
    () => strictPlatformMovies.filter((m) => mediaMatchesGenreId(m, 878)),
    [strictPlatformMovies]
  );
  const comedyFallbacks = useMemo(
    () => strictPlatformMovies.filter((m) => mediaMatchesGenreId(m, 35)),
    [strictPlatformMovies]
  );
  const horrorFallbacks = useMemo(
    () => movieFallbacks.filter((m) => mediaMatchesGenreId(m, 27)),
    [movieFallbacks]
  );
  const animationFallbacks = useMemo(
    () => strictPlatformMovies.filter((m) => mediaMatchesGenreId(m, 16)),
    [strictPlatformMovies]
  );

  const fetchTrendingMovies = useCallback(
    (page: number) =>
      watchProviderId
        ? fetchServerMovies({ feed: 'popular', releasedOnly: true, page, watchProviderId })
        : fetchLiveTrendingPaged('movie', page, trendingWindow),
    [watchProviderId, trendingWindow]
  );

  const fetchTrendingSeries = useCallback(
    (page: number) =>
      watchProviderId
        ? fetchServerSeries({ feed: 'popular', page, watchProviderId })
        : fetchLiveTrendingPaged('tv', page, trendingWindow),
    [watchProviderId, trendingWindow]
  );

  const fetchVixSrcMovies = useCallback(
    (page: number) =>
      fetchServerIndexedCatalog('movie', page, vixLang === 'all' ? undefined : vixLang),
    [vixLang]
  );

  const fetchVixSrcSeries = useCallback(
    (page: number) =>
      fetchServerIndexedCatalog('tv', page, vixLang === 'all' ? undefined : vixLang),
    [vixLang]
  );

  const fetchNewReleasedMovies = useCallback(
    (page: number) =>
      fetchServerMovies({
        feed: 'now_playing',
        releasedOnly: true,
        minVotes: 25,
        page,
        watchProviderId,
      }),
    [watchProviderId]
  );

  const fetchPopularMovies = useCallback(
    (page: number) =>
      fetchServerMovies({
        feed: 'popular',
        releasedOnly: true,
        minVotes: 250,
        page,
        watchProviderId,
      }),
    [watchProviderId]
  );

  const fetchTopRatedMovies = useCallback(
    (page: number) =>
      fetchServerMovies({ feed: 'top_rated', minVotes: 300, page, watchProviderId }),
    [watchProviderId]
  );

  const fetchActionMovies = useCallback(
    (page: number) =>
      fetchServerMovies({
        feed: 'popular',
        genreId: 28,
        withoutGenres: '16',
        minVotes: 400,
        page,
        watchProviderId,
      }),
    [watchProviderId]
  );

  const fetchSciFiMovies = useCallback(
    (page: number) =>
      fetchServerMovies({
        feed: 'popular',
        genreId: 878,
        minVotes: 50,
        page,
        watchProviderId,
      }),
    [watchProviderId]
  );

  const fetchComedyMovies = useCallback(
    (page: number) =>
      fetchServerMovies({
        feed: 'popular',
        genreId: 35,
        minVotes: 50,
        page,
        watchProviderId,
      }),
    [watchProviderId]
  );

  const fetchHorrorMovies = useCallback(
    (page: number) =>
      fetchServerMovies({
        feed: 'popular',
        genreId: 27,
        minVotes: 200,
        page,
        watchProviderId,
      }),
    [watchProviderId]
  );

  const fetchAnimationMovies = useCallback(
    (page: number) =>
      fetchServerMovies({
        feed: 'popular',
        genreId: 16,
        minVotes: 50,
        page,
        watchProviderId,
      }),
    [watchProviderId]
  );

  const windowToggle = (
    <div
      role="tablist"
      aria-label="Trending time window"
      className="inline-flex items-center p-0.5 rounded-lg bg-white/8 border border-white/10 text-[11px]"
    >
      <button
        type="button"
        role="tab"
        aria-selected={trendingWindow === 'day'}
        onClick={() => setTrendingWindow('day')}
        className={`px-2.5 py-0.5 rounded-md font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          trendingWindow === 'day'
            ? 'bg-rose-600 text-white'
            : 'text-slate-300 hover:text-white'
        }`}
      >
        Today
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={trendingWindow === 'week'}
        onClick={() => setTrendingWindow('week')}
        className={`px-2.5 py-0.5 rounded-md font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          trendingWindow === 'week'
            ? 'bg-rose-600 text-white'
            : 'text-slate-300 hover:text-white'
        }`}
      >
        This Week
      </button>
    </div>
  );

  const vixLangToggle = (
    <div
      role="tablist"
      aria-label="VixSrc language filter"
      className="inline-flex items-center p-0.5 rounded-lg bg-white/8 border border-white/10 text-[11px]"
    >
      <button
        type="button"
        role="tab"
        aria-selected={vixLang === 'all'}
        onClick={() => setVixLang('all')}
        className={`px-2.5 py-0.5 rounded-md font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          vixLang === 'all'
            ? 'bg-rose-600 text-white'
            : 'text-slate-300 hover:text-white'
        }`}
      >
        All
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={vixLang === 'it'}
        onClick={() => setVixLang('it')}
        className={`px-2.5 py-0.5 rounded-md font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          vixLang === 'it'
            ? 'bg-rose-600 text-white'
            : 'text-slate-300 hover:text-white'
        }`}
      >
        Italian (it)
      </button>
    </div>
  );

  return (
    <div className="space-y-9 pt-2">
      <InfiniteCinemaRow
        title="Trending movies"
        fetchPage={fetchTrendingMovies}
        resetKey={`trending-movies-${trendingWindow}-${selectedPlatform}`}
        fallbackItems={movieFallbacks}
        eager
        onSelect={onSelect}
        onPlay={onPlay}
        onDownload={onDownload}
        onSeeAll={() => onSeeAllCategory({ type: 'movie', feed: 'trending' })}
        onItemsLoaded={onItemsLoaded}
        headerExtra={windowToggle}
      />

      <InfiniteCinemaRow
        title="Trending series"
        fetchPage={fetchTrendingSeries}
        resetKey={`trending-series-${trendingWindow}-${selectedPlatform}`}
        fallbackItems={seriesFallbacks}
        eager
        onSelect={onSelect}
        onPlay={onPlay}
        onDownload={onDownload}
        onSeeAll={() => onSeeAllCategory({ type: 'series', feed: 'trending' })}
        onItemsLoaded={onItemsLoaded}
      />

      <InfiniteCinemaRow
        title="VixSrc Movies"
        fetchPage={fetchVixSrcMovies}
        resetKey={`vixsrc-movies-${vixLang}`}
        fallbackItems={movieFallbacks}
        eager
        onSelect={onSelect}
        onPlay={onPlay}
        onDownload={onDownload}
        onSeeAll={() => onSeeAllCategory({ type: 'movie', feed: 'vixsrc', vixLang })}
        onItemsLoaded={onItemsLoaded}
        headerExtra={vixLangToggle}
      />

      <InfiniteCinemaRow
        title="New movies"
        fetchPage={fetchNewReleasedMovies}
        resetKey={`new-released-movies-${selectedPlatform}`}
        fallbackItems={movieFallbacks}
        eager
        onSelect={onSelect}
        onPlay={onPlay}
        onDownload={onDownload}
        onSeeAll={() => onSeeAllCategory({ type: 'movie', feed: 'now_playing' })}
        onItemsLoaded={onItemsLoaded}
      />

      <InfiniteCinemaRow
        title="Popular movies"
        fetchPage={fetchPopularMovies}
        resetKey={`popular-released-movies-${selectedPlatform}`}
        fallbackItems={movieFallbacks}
        activationDelayMs={150}
        onSelect={onSelect}
        onPlay={onPlay}
        onDownload={onDownload}
        onSeeAll={() => onSeeAllCategory({ type: 'movie', feed: 'popular' })}
        onItemsLoaded={onItemsLoaded}
      />

      <InfiniteCinemaRow
        title="Top rated movies"
        fetchPage={fetchTopRatedMovies}
        resetKey={`top-rated-movies-${selectedPlatform}`}
        fallbackItems={movieFallbacks}
        activationDelayMs={250}
        onSelect={onSelect}
        onPlay={onPlay}
        onDownload={onDownload}
        onSeeAll={() => onSeeAllCategory({ type: 'movie', feed: 'top_rated' })}
        onItemsLoaded={onItemsLoaded}
      />

      <InfiniteCinemaRow
        title="Action movies"
        fetchPage={fetchActionMovies}
        resetKey={`genre-28-${selectedPlatform}`}
        fallbackItems={actionFallbacks}
        activationDelayMs={350}
        onSelect={onSelect}
        onPlay={onPlay}
        onDownload={onDownload}
        onSeeAll={() => onSeeAllCategory({ type: 'movie', genreId: 28 })}
        onItemsLoaded={onItemsLoaded}
      />

      <InfiniteCinemaRow
        title="Sci-Fi movies"
        fetchPage={fetchSciFiMovies}
        resetKey={`genre-878-${selectedPlatform}`}
        fallbackItems={sciFiFallbacks}
        mergeFallbackWithResults
        activationDelayMs={450}
        onSelect={onSelect}
        onPlay={onPlay}
        onDownload={onDownload}
        onSeeAll={() => onSeeAllCategory({ type: 'movie', genreId: 878 })}
        onItemsLoaded={onItemsLoaded}
      />

      <InfiniteCinemaRow
        title="Comedy movies"
        fetchPage={fetchComedyMovies}
        resetKey={`genre-35-${selectedPlatform}`}
        fallbackItems={comedyFallbacks}
        mergeFallbackWithResults
        activationDelayMs={550}
        onSelect={onSelect}
        onPlay={onPlay}
        onDownload={onDownload}
        onSeeAll={() => onSeeAllCategory({ type: 'movie', genreId: 35 })}
        onItemsLoaded={onItemsLoaded}
      />

      <InfiniteCinemaRow
        title="Horror movies"
        fetchPage={fetchHorrorMovies}
        resetKey={`genre-27-${selectedPlatform}`}
        fallbackItems={horrorFallbacks}
        activationDelayMs={650}
        onSelect={onSelect}
        onPlay={onPlay}
        onDownload={onDownload}
        onSeeAll={() => onSeeAllCategory({ type: 'movie', genreId: 27 })}
        onItemsLoaded={onItemsLoaded}
      />

      <InfiniteCinemaRow
        title="Animation movies"
        fetchPage={fetchAnimationMovies}
        resetKey={`genre-16-${selectedPlatform}`}
        fallbackItems={animationFallbacks}
        mergeFallbackWithResults
        activationDelayMs={750}
        onSelect={onSelect}
        onPlay={onPlay}
        onDownload={onDownload}
        onSeeAll={() => onSeeAllCategory({ type: 'movie', genreId: 16 })}
        onItemsLoaded={onItemsLoaded}
      />

      <InfiniteCinemaRow
        title="VixSrc Series"
        fetchPage={fetchVixSrcSeries}
        resetKey={`vixsrc-series-${vixLang}`}
        fallbackItems={seriesFallbacks}
        activationDelayMs={850}
        onSelect={onSelect}
        onPlay={onPlay}
        onDownload={onDownload}
        onSeeAll={() => onSeeAllCategory({ type: 'series', feed: 'vixsrc', vixLang })}
        onItemsLoaded={onItemsLoaded}
      />
    </div>
  );
};
