import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Film } from 'lucide-react';
import { MediaItem, StreamingPlatform } from '../../types';
import { MediaCard } from '../cards/MediaCard';
import { TMDB_WATCH_PROVIDER_IDS, fetchServerMovies } from '../../services/tmdbService';

interface HomeInfiniteCatalogGridProps {
  selectedPlatform: StreamingPlatform | 'ALL';
  onSelect: (media: MediaItem) => void;
  onPlay: (media: MediaItem) => void;
  onDownload: (media: MediaItem) => void;
  onItemsLoaded?: (items: MediaItem[]) => void;
}

function deduplicateMedia(list: MediaItem[]): MediaItem[] {
  const map = new Map<string, MediaItem>();
  for (const item of list) {
    const key = item.tmdbId ? `tmdb-${item.tmdbId}` : item.id;
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
}

export const HomeInfiniteCatalogGrid: React.FC<HomeInfiniteCatalogGridProps> = ({
  selectedPlatform,
  onSelect,
  onPlay,
  onDownload,
  onItemsLoaded,
}) => {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMorePages, setHasMorePages] = useState(true);

  const pageRef = useRef(1);
  const totalPagesRef = useRef(500);
  const isFetchingRef = useRef(false);
  const emptyStreakRef = useRef(0);
  const errorStreakRef = useRef(0);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const onItemsLoadedRef = useRef(onItemsLoaded);
  onItemsLoadedRef.current = onItemsLoaded;

  const watchProviderId =
    selectedPlatform !== 'ALL' ? TMDB_WATCH_PROVIDER_IDS[selectedPlatform] : undefined;

  const loadPage = useCallback(
    async (pageToLoad: number, append: boolean) => {
      if (!append && pageToLoad === 1) {
        setIsInitialLoading(true);
        isFetchingRef.current = false;
        emptyStreakRef.current = 0;
        errorStreakRef.current = 0;
      } else {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;
        setIsLoadingMore(true);
      }

      try {
        if (!append && pageToLoad === 1) {
          const [res1, res2] = await Promise.all([
            fetchServerMovies({ feed: 'popular', releasedOnly: true, page: 1, watchProviderId }),
            fetchServerMovies({ feed: 'popular', releasedOnly: true, page: 2, watchProviderId }),
          ]);
          const combined = deduplicateMedia([...(res1.items || []), ...(res2.items || [])]);
          const maxTotal = Math.max(1, res1.totalPages || 1, res2.totalPages || 1);
          const loadedPage = res2.items.length > 0 ? 2 : 1;
          setItems(combined);
          pageRef.current = loadedPage;
          totalPagesRef.current = maxTotal;
          setHasMorePages(combined.length > 0 && loadedPage < maxTotal);
          if (combined.length > 0) {
            onItemsLoadedRef.current?.(combined);
          }
        } else {
          const res = await fetchServerMovies({
            feed: 'popular',
            releasedOnly: true,
            page: pageToLoad,
            watchProviderId,
          });
          errorStreakRef.current = 0;
          pageRef.current = pageToLoad;
          totalPagesRef.current = Math.max(pageToLoad, res.totalPages || totalPagesRef.current);

          if (res.items.length > 0) {
            emptyStreakRef.current = 0;
            setItems((prev) => deduplicateMedia([...prev, ...res.items]));
            onItemsLoadedRef.current?.(res.items);
            setHasMorePages(pageToLoad < totalPagesRef.current);
          } else {
            emptyStreakRef.current += 1;
            setHasMorePages(emptyStreakRef.current < 3 && pageToLoad < totalPagesRef.current);
          }
        }
      } catch (err) {
        console.warn('HomeInfiniteCatalogGrid load error:', err);
        errorStreakRef.current += 1;
        if (!append) {
          setHasMorePages(false);
        } else {
          setHasMorePages(errorStreakRef.current < 3);
        }
      } finally {
        setIsInitialLoading(false);
        setIsLoadingMore(false);
        isFetchingRef.current = false;
      }
    },
    [watchProviderId]
  );

  useEffect(() => {
    pageRef.current = 1;
    totalPagesRef.current = 500;
    setHasMorePages(true);
    loadPage(1, false);
  }, [loadPage]);

  const handleLoadMore = useCallback(() => {
    if (isInitialLoading || isFetchingRef.current) return;
    if (pageRef.current >= totalPagesRef.current) {
      setHasMorePages(false);
      return;
    }
    loadPage(pageRef.current + 1, true);
  }, [isInitialLoading, loadPage]);

  useEffect(() => {
    const sentinel = bottomSentinelRef.current;
    if (isInitialLoading || !hasMorePages) return;

    const checkNeedMore = () => {
      if (isFetchingRef.current) return;
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
  }, [isInitialLoading, isLoadingMore, hasMorePages, items.length, handleLoadMore]);

  if (!isInitialLoading && items.length === 0) {
    return null;
  }

  return (
    <section className="w-full px-4 sm:px-8 md:px-12 lg:px-16 xl:px-20 max-w-[2400px] mx-auto space-y-5 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Film className="w-5 h-5 text-rose-500 shrink-0" />
          <h2 className="text-xl sm:text-2xl font-black text-white font-display tracking-tight">
            {selectedPlatform === 'ALL'
              ? 'Explore More Movies'
              : `More Movies on ${selectedPlatform}`}
          </h2>
        </div>
        <span className="text-xs text-slate-400 hidden sm:inline">
          Keep scrolling to load more titles
        </span>
      </div>

      {isInitialLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4 sm:gap-5">
          {Array.from({ length: 16 }).map((_, idx) => (
            <div key={idx} className="space-y-2 animate-pulse">
              <div className="aspect-[2/3] rounded-xl bg-slate-800/70" />
              <div className="h-3.5 bg-slate-800 rounded w-3/4" />
              <div className="h-3 bg-slate-800/80 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4 sm:gap-5">
            {items.map((movie) => (
              <MediaCard
                key={`home-grid-${movie.id}`}
                media={movie}
                onSelect={onSelect}
                onPlay={onPlay}
                onDownload={onDownload}
              />
            ))}
          </div>

          {hasMorePages && (
            <div ref={bottomSentinelRef} className="pt-2 pb-6 flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
              >
                <Loader2
                  className={`w-4 h-4 ${isLoadingMore ? 'animate-spin text-rose-500' : 'text-slate-400'}`}
                />
                <span>{isLoadingMore ? 'Loading more movies...' : 'Load more movies'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
