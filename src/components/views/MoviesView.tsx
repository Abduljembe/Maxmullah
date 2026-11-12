import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Film,
  Sparkles,
  TrendingUp,
  Flame,
  Award,
  Calendar,
  Search,
  Filter,
  RefreshCw,
  Loader2,
  ChevronDown,
  Layers,
  ArrowRight,
  Tv,
} from 'lucide-react';
import { MediaItem, StreamingPlatform } from '../../types';
import { MediaCard } from '../cards/MediaCard';
import {
  fetchServerMovies,
  fetchAllServerMoviesMultiFeed,
  MOVIE_GENRES_LIST,
  MovieFeedType,
} from '../../services/tmdbService';

interface MoviesViewProps {
  onSelectMovie: (media: MediaItem) => void;
  onPlayMovie: (media: MediaItem) => void;
  onDownloadMovie: (media: MediaItem) => void;
  initialCatalogMovies?: MediaItem[];
}

export const MoviesView: React.FC<MoviesViewProps> = ({
  onSelectMovie,
  onPlayMovie,
  onDownloadMovie,
  initialCatalogMovies = [],
}) => {
  // Feed selection: popular, trending, top_rated, now_playing, or 'all_feeds'
  const [activeFeed, setActiveFeed] = useState<MovieFeedType | 'all_feeds'>('popular');
  const [selectedGenreId, setSelectedGenreId] = useState<number>(0);
  const [selectedPlatform, setSelectedPlatform] = useState<StreamingPlatform | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Server data state
  const [serverMovies, setServerMovies] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResults, setTotalResults] = useState(0);
  const [isServerLive, setIsServerLive] = useState(true);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Main loader from server
  const loadMovies = useCallback(
    async (pageToLoad = 1, append = false) => {
      if (pageToLoad === 1) {
        setIsLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      try {
        if (activeFeed === 'all_feeds' && !debouncedQuery && selectedGenreId === 0) {
          // Multi-feed massive load: popular + trending + top_rated + now_playing
          const batch = await fetchAllServerMoviesMultiFeed(pageToLoad);
          if (batch.length > 0) {
            setServerMovies((prev) => (append ? deduplicateMedia([...prev, ...batch]) : batch));
            setTotalResults(batch.length * 4);
            setTotalPages(10);
            setIsServerLive(true);
          } else if (!append) {
            setServerMovies(initialCatalogMovies.filter((m) => m.type === 'movie'));
          }
        } else {
          // Specific feed, genre, or search query
          const result = await fetchServerMovies({
            feed: activeFeed === 'all_feeds' ? 'popular' : activeFeed,
            page: pageToLoad,
            genreId: selectedGenreId > 0 ? selectedGenreId : undefined,
            query: debouncedQuery || undefined,
          });

          if (result.items.length > 0) {
            setServerMovies((prev) =>
              append ? deduplicateMedia([...prev, ...result.items]) : result.items
            );
            setTotalPages(result.totalPages);
            setTotalResults(result.totalResults);
            setIsServerLive(true);
          } else if (!append && pageToLoad === 1) {
            // Fallback to local catalog if server returned 0 results
            const localFiltered = initialCatalogMovies.filter((m) => {
              if (m.type !== 'movie') return false;
              if (debouncedQuery && !m.title.toLowerCase().includes(debouncedQuery.toLowerCase())) {
                return false;
              }
              return true;
            });
            setServerMovies(localFiltered);
          }
        }
      } catch (err) {
        console.warn('MoviesView loadMovies error:', err);
        setIsServerLive(false);
        if (!append) {
          setServerMovies(initialCatalogMovies.filter((m) => m.type === 'movie'));
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [activeFeed, selectedGenreId, debouncedQuery, initialCatalogMovies]
  );

  // Trigger load when filters change
  useEffect(() => {
    setCurrentPage(1);
    loadMovies(1, false);
  }, [loadMovies]);

  // Load next page from server
  const handleLoadMore = () => {
    if (isLoadingMore || currentPage >= totalPages) return;
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    loadMovies(nextPage, true);
  };

  // Helper deduplicator
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

  // Filter by platform client-side if a specific platform is picked
  const displayedMovies = useMemo(() => {
    if (selectedPlatform === 'ALL') return serverMovies;
    return serverMovies.filter((m) => m.platforms.includes(selectedPlatform));
  }, [serverMovies, selectedPlatform]);

  const feedTabs = [
    { id: 'popular', label: 'Popular', icon: Flame },
    { id: 'trending', label: 'Trending', icon: TrendingUp },
    { id: 'top_rated', label: 'Top Rated', icon: Award },
    { id: 'now_playing', label: 'In Theaters', icon: Calendar },
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
            Browse popular releases, trending hits, critically acclaimed films, and new cinema.
          </p>
        </div>

        <button
          onClick={() => {
            setCurrentPage(1);
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
          {/* Feed Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            {feedTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeFeed === tab.id && !debouncedQuery;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveFeed(tab.id);
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

          {/* Search */}
          <div className="relative min-w-[240px] sm:w-72">
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
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
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
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors whitespace-nowrap ${
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
          <p className="text-sm font-semibold text-slate-300">
            Loading movies...
          </p>
        </div>
      ) : displayedMovies.length === 0 ? (
        <div className="py-20 text-center rounded-3xl bg-white/5 border border-white/10 p-8 space-y-4 max-w-md mx-auto">
          <Film className="w-12 h-12 text-slate-500 mx-auto" />
          <h3 className="text-lg font-bold text-white">No Movies Found</h3>
          <p className="text-xs text-slate-400">
            {searchQuery
              ? `No movies matched "${searchQuery}" on the live server.`
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
            {displayedMovies.map((movie) => (
              <MediaCard
                key={movie.id}
                media={movie}
                onSelect={onSelectMovie}
                onPlay={(m) => onPlayMovie(m)}
                onDownload={(m) => onDownloadMovie(m)}
              />
            ))}
          </div>

          {/* Load More Button */}
          {currentPage < totalPages && (
            <div className="pt-6 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white font-bold text-xs sm:text-sm flex items-center gap-2.5 shadow-xl shadow-rose-600/25 transition-all hover:scale-105 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Loading more...</span>
                  </>
                ) : (
                  <>
                    <span>Load More Movies</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
