import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Film } from 'lucide-react';
import { MediaItem, StreamingPlatform } from '../../types';
import { PlatformFilterBar } from '../navigation/PlatformFilterBar';
import { MediaCard } from '../cards/MediaCard';
import {
  TMDB_WATCH_PROVIDER_IDS,
  fetchServerMovies,
  fetchServerSeries,
} from '../../services/tmdbService';

interface NetworksViewProps {
  selectedPlatform: StreamingPlatform | 'ALL';
  onSelectPlatform: (platform: StreamingPlatform | 'ALL') => void;
  fallbackCatalog: MediaItem[];
  onSelect: (media: MediaItem) => void;
  onPlay: (media: MediaItem) => void;
  onDownload: (media: MediaItem) => void;
}

function deduplicateMedia(list: MediaItem[]): MediaItem[] {
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

export const NetworksView: React.FC<NetworksViewProps> = ({
  selectedPlatform,
  onSelectPlatform,
  fallbackCatalog,
  onSelect,
  onPlay,
  onDownload,
}) => {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMorePages, setHasMorePages] = useState(true);

  const pageRef = useRef(1);
  const totalPagesRef = useRef(500);
  const fetchingRef = useRef(false);
  const errorStreakRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef(fallbackCatalog);
  fallbackRef.current = fallbackCatalog;

  const watchProviderId =
    selectedPlatform !== 'ALL' ? TMDB_WATCH_PROVIDER_IDS[selectedPlatform] : undefined;

  const loadPage = useCallback(
    async (pageToLoad: number, append: boolean) => {
      if (pageToLoad === 1 && !append) {
        setIsLoading(true);
        fetchingRef.current = false;
        errorStreakRef.current = 0;
      } else {
        if (fetchingRef.current) return;
        fetchingRef.current = true;
        setIsLoadingMore(true);
      }

      try {
        const [movieRes, seriesRes] = await Promise.all([
          fetchServerMovies({ feed: 'popular', page: pageToLoad, watchProviderId }),
          fetchServerSeries({ feed: 'popular', page: pageToLoad, watchProviderId }),
        ]);
        errorStreakRef.current = 0;

        const interleaved: MediaItem[] = [];
        const maxLen = Math.max(movieRes.items.length, seriesRes.items.length);
        for (let i = 0; i < maxLen; i++) {
          if (movieRes.items[i]) interleaved.push(movieRes.items[i]);
          if (seriesRes.items[i]) interleaved.push(seriesRes.items[i]);
        }

        const batch = deduplicateMedia(interleaved);
        if (batch.length > 0) {
          setItems((prev) => (append ? deduplicateMedia([...prev, ...batch]) : batch));
          pageRef.current = pageToLoad;
          totalPagesRef.current = Math.max(
            pageToLoad,
            Math.max(movieRes.totalPages || 1, seriesRes.totalPages || 1)
          );
          setHasMorePages(pageToLoad < totalPagesRef.current);
        } else if (!append) {
          setItems(fallbackRef.current);
          setHasMorePages(false);
        } else {
          setHasMorePages(false);
        }
      } catch {
        errorStreakRef.current += 1;
        if (!append) {
          setItems(fallbackRef.current);
          setHasMorePages(false);
        } else {
          setHasMorePages(errorStreakRef.current < 3);
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
        fetchingRef.current = false;
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
    if (isLoading || fetchingRef.current || pageRef.current >= totalPagesRef.current) return;
    loadPage(pageRef.current + 1, true);
  }, [isLoading, loadPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (isLoading || !hasMorePages) return;

    const checkNeedMore = () => {
      if (fetchingRef.current) return;
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
  }, [isLoading, isLoadingMore, hasMorePages, items.length, handleLoadMore]);

  return (
    <div className="w-full px-4 sm:px-8 md:px-12 lg:px-16 xl:px-20 max-w-[2400px] mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-black text-white font-display">
          Browse by Network
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Explore movies and series across your favorite networks.
        </p>
      </div>

      <PlatformFilterBar
        selectedPlatform={selectedPlatform}
        onSelectPlatform={onSelectPlatform}
      />

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-10 h-10 text-rose-500 animate-spin" />
          <p className="text-sm font-semibold text-slate-300">Loading titles...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center rounded-3xl bg-white/5 border border-white/10 p-8 space-y-3 max-w-md mx-auto">
          <Film className="w-10 h-10 text-slate-500 mx-auto" />
          <p className="text-sm font-semibold text-white">No titles found for this network</p>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4 sm:gap-5 pt-2">
            {items.map((item) => (
              <MediaCard
                key={item.id}
                media={item}
                onSelect={onSelect}
                onPlay={onPlay}
                onDownload={onDownload}
              />
            ))}
          </div>

          {hasMorePages && (
            <div ref={sentinelRef} className="pt-4 pb-8 flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
              >
                <Loader2 className={`w-4 h-4 ${isLoadingMore ? 'animate-spin text-rose-500' : 'text-slate-400'}`} />
                <span>{isLoadingMore ? 'Loading more...' : 'Load more'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
