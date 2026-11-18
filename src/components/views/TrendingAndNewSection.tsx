import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MediaItem, StreamingPlatform } from '../../types';
import {
  fetchLiveTrending,
  fetchNewReleasesFeed,
} from '../../services/tmdbService';
import { MediaCard } from '../cards/MediaCard';

interface TrendingAndNewSectionProps {
  selectedPlatform: StreamingPlatform | 'ALL';
  fallbackCatalog: MediaItem[];
  onSelect: (media: MediaItem) => void;
  onPlay: (media: MediaItem) => void;
  onDownload: (media: MediaItem) => void;
  onViewAllMovies: () => void;
  onViewAllSeries: () => void;
  onItemsLoaded?: (items: MediaItem[]) => void;
}

interface CinemaRowProps {
  title: string;
  items: MediaItem[];
  isLoading: boolean;
  onSelect: (media: MediaItem) => void;
  onPlay: (media: MediaItem) => void;
  onDownload: (media: MediaItem) => void;
  onSeeAll: () => void;
  headerExtra?: React.ReactNode;
}

const CinemaRow: React.FC<CinemaRowProps> = ({
  title,
  items,
  isLoading,
  onSelect,
  onPlay,
  onDownload,
  onSeeAll,
  headerExtra,
}) => {
  const railRef = useRef<HTMLDivElement>(null);

  const scrollRail = (direction: 'left' | 'right') => {
    if (!railRef.current) return;
    const distance = Math.max(360, railRef.current.clientWidth * 0.8);
    railRef.current.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

  return (
    <section className="w-full px-4 sm:px-8 md:px-12 lg:px-16 xl:px-20 max-w-[2400px] mx-auto space-y-3.5">
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

      {isLoading && items.length === 0 ? (
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
          className="flex gap-3.5 sm:gap-4 overflow-x-auto pb-2 scroll-smooth no-scrollbar"
        >
          {items.map((item) => (
            <div
              key={item.id}
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
  onViewAllMovies,
  onViewAllSeries,
  onItemsLoaded,
}) => {
  const [trendingWindow, setTrendingWindow] = useState<'day' | 'week'>('day');
  const [trendingMovies, setTrendingMovies] = useState<MediaItem[]>([]);
  const [trendingSeries, setTrendingSeries] = useState<MediaItem[]>([]);
  const [popularMovies, setPopularMovies] = useState<MediaItem[]>([]);
  const [newMovies, setNewMovies] = useState<MediaItem[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(true);
  const [loadingRows, setLoadingRows] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingTrending(true);
    Promise.all([
      fetchLiveTrending('movie', 1, trendingWindow),
      fetchLiveTrending('tv', 1, trendingWindow),
    ])
      .then(([moviesRes, seriesRes]) => {
        if (cancelled) return;
        if (moviesRes.length > 0) setTrendingMovies(moviesRes);
        if (seriesRes.length > 0) setTrendingSeries(seriesRes);
        onItemsLoaded?.([...moviesRes, ...seriesRes]);
      })
      .finally(() => {
        if (!cancelled) setLoadingTrending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [trendingWindow]);

  useEffect(() => {
    let cancelled = false;
    setLoadingRows(true);
    Promise.all([
      fetchNewReleasesFeed('popular', 1),
      fetchNewReleasesFeed('now_playing', 1),
    ])
      .then(([popularRes, nowPlayingRes]) => {
        if (cancelled) return;
        if (popularRes.length > 0) setPopularMovies(popularRes);
        if (nowPlayingRes.length > 0) setNewMovies(nowPlayingRes);
        onItemsLoaded?.([...popularRes, ...nowPlayingRes]);
      })
      .finally(() => {
        if (!cancelled) setLoadingRows(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const applyPlatformFilter = (items: MediaItem[], fallback: MediaItem[]) => {
    const base = items.length > 0 ? items : fallback;
    if (selectedPlatform === 'ALL') return base;
    const filtered = base.filter((m) => m.platforms.includes(selectedPlatform));
    return filtered.length > 0 ? filtered : base;
  };

  const movieFallbacks = fallbackCatalog.filter((m) => m.type === 'movie');
  const seriesFallbacks = fallbackCatalog.filter((m) => m.type === 'series');

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

  return (
    <div className="space-y-9 pt-2">
      <CinemaRow
        title="Trending movies"
        items={applyPlatformFilter(trendingMovies, movieFallbacks)}
        isLoading={loadingTrending}
        onSelect={onSelect}
        onPlay={onPlay}
        onDownload={onDownload}
        onSeeAll={onViewAllMovies}
        headerExtra={windowToggle}
      />

      <CinemaRow
        title="Trending series"
        items={applyPlatformFilter(trendingSeries, seriesFallbacks)}
        isLoading={loadingTrending}
        onSelect={onSelect}
        onPlay={onPlay}
        onDownload={onDownload}
        onSeeAll={onViewAllSeries}
      />

      <CinemaRow
        title="New movies"
        items={applyPlatformFilter(newMovies, movieFallbacks)}
        isLoading={loadingRows}
        onSelect={onSelect}
        onPlay={onPlay}
        onDownload={onDownload}
        onSeeAll={onViewAllMovies}
      />

      <CinemaRow
        title="Popular movies"
        items={applyPlatformFilter(popularMovies, movieFallbacks)}
        isLoading={loadingRows}
        onSelect={onSelect}
        onPlay={onPlay}
        onDownload={onDownload}
        onSeeAll={onViewAllMovies}
      />
    </div>
  );
};
