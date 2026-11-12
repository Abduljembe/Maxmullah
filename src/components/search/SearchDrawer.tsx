import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  X,
  Globe,
  Loader2,
  Sparkles,
  Film,
  Tv,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { MediaItem, MediaType } from '../../types';
import { MediaCard } from '../cards/MediaCard';
import { searchTMDB } from '../../services/tmdbService';

interface SearchDrawerProps {
  catalog: MediaItem[];
  isOpen: boolean;
  onClose: () => void;
  onSelectMedia: (item: MediaItem) => void;
  onPlay: (item: MediaItem) => void;
  onDownload: (item: MediaItem) => void;
  onOpenTMDBSettings: () => void;
}

const POPULAR_SEARCH_CHIPS = [
  'Dune',
  'Deadpool',
  'Oppenheimer',
  'The Batman',
  'Arcane',
  'Alien',
  'Severance',
  'The Bear',
  'Breaking Bad',
  'The Boys',
  'Fallout',
  'Stranger Things',
  'Shōgun',
  'Gladiator',
  'The Penguin',
  'Interstellar',
  'Attack on Titan',
];

export const SearchDrawer: React.FC<SearchDrawerProps> = ({
  catalog,
  isOpen,
  onClose,
  onSelectMedia,
  onPlay,
  onDownload,
  onOpenTMDBSettings,
}) => {
  const [query, setQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | MediaType>('all');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  const [minRating, setMinRating] = useState<number>(0);
  const [liveResults, setLiveResults] = useState<MediaItem[]>([]);
  const [isSearchingLive, setIsSearchingLive] = useState(false);

  // Extract all distinct genres safely
  const allGenres = useMemo(() => {
    const set = new Set<string>();
    catalog.forEach((m) => (m.genres || []).forEach((g) => set.add(g)));
    return Array.from(set).sort();
  }, [catalog]);

  // Debounced live search
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) {
      setLiveResults([]);
      setIsSearchingLive(false);
      return;
    }

    setIsSearchingLive(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchTMDB(trimmed);
        setLiveResults(results);
      } catch (e) {
        console.warn('Live search error:', e);
      } finally {
        setIsSearchingLive(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  // Robust fuzzy match against catalog
  const filteredLocal = useMemo(() => {
    const q = query.trim().toLowerCase();
    const queryTokens = q.split(/\s+/).filter(Boolean);

    return catalog.filter((item) => {
      // Type filter
      if (selectedType !== 'all' && item.type !== selectedType) return false;

      // Genre filter
      if (selectedGenre !== 'all' && !(item.genres || []).includes(selectedGenre)) return false;

      // Min RT score
      if (minRating > 0 && (item.rottenTomatoesScore || 0) < minRating) return false;

      // If no query, pass
      if (!q) return true;

      const title = (item.title || '').toLowerCase();
      const cast = (item.cast || []).map((c) => c.toLowerCase()).join(' ');
      const director = (item.director || '').toLowerCase();
      const creator = (item.creator || '').toLowerCase();
      const genres = (item.genres || []).map((g) => g.toLowerCase()).join(' ');
      const platforms = (item.platforms || []).map((p) => p.toLowerCase()).join(' ');
      const aliases = (item.aliases || []).map((a) => a.toLowerCase()).join(' ');
      const tagline = (item.tagline || '').toLowerCase();
      const desc = (item.description || '').toLowerCase();

      const fullHaystack = `${title} ${aliases} ${cast} ${director} ${creator} ${genres} ${platforms} ${tagline} ${desc}`;

      // Match all query tokens or exact title match
      return (
        title.includes(q) ||
        aliases.includes(q) ||
        queryTokens.every((token) => fullHaystack.includes(token))
      );
    });
  }, [catalog, query, selectedType, selectedGenre, minRating]);

  // Combined & deduplicated results
  const combinedResults = useMemo(() => {
    const map = new Map<string, MediaItem>();

    // Add local results first
    filteredLocal.forEach((item) => {
      map.set(item.id, item);
    });

    // Add live results
    liveResults.forEach((item) => {
      if (selectedType !== 'all' && item.type !== selectedType) return;
      if (selectedGenre !== 'all' && !(item.genres || []).includes(selectedGenre)) return;
      if (minRating > 0 && (item.rottenTomatoesScore || 0) < minRating) return;

      // Don't add duplicate by title
      const alreadyHas = Array.from(map.values()).some(
        (m) => m.title.toLowerCase() === item.title.toLowerCase()
      );
      if (!alreadyHas) {
        map.set(item.id, item);
      }
    });

    return Array.from(map.values());
  }, [filteredLocal, liveResults, selectedType, selectedGenre, minRating]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#080A0F]/95 backdrop-blur-xl flex flex-col p-4 sm:p-6 lg:p-8 overflow-y-auto no-scrollbar">
      <div className="max-w-7xl mx-auto w-full space-y-6">
        {/* Search Input Bar */}
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search movies, series, actors, directors (e.g. Dune, Succession, Nolan, Breaking Bad)..."
              className="w-full bg-white/5 border border-white/15 focus:border-rose-500 rounded-2xl pl-12 pr-12 py-3.5 text-sm sm:text-base text-white placeholder-slate-400 focus:outline-none transition-all shadow-inner"
            />
            {isSearchingLive ? (
              <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-rose-500 animate-spin" />
            ) : query ? (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>

          <button
            onClick={onClose}
            className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Popular Search Chips */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 text-xs">
          <span className="text-slate-400 font-semibold whitespace-nowrap flex items-center gap-1 shrink-0">
            <TrendingUp className="w-3.5 h-3.5 text-rose-500" />
            Popular:
          </span>
          {POPULAR_SEARCH_CHIPS.map((chip) => (
            <button
              key={chip}
              onClick={() => setQuery(chip)}
              className={`px-3 py-1 rounded-xl whitespace-nowrap font-medium transition-colors cursor-pointer border ${
                query.toLowerCase() === chip.toLowerCase()
                  ? 'bg-rose-600 text-white border-rose-500 font-bold'
                  : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white'
              }`}
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1 border-t border-white/10">
          <div className="flex flex-wrap items-center gap-3">
            {/* Type Filter */}
            <div className="flex items-center bg-white/5 p-1 rounded-xl border border-white/10">
              <button
                onClick={() => setSelectedType('all')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  selectedType === 'all'
                    ? 'bg-rose-600 text-white font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setSelectedType('movie')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  selectedType === 'movie'
                    ? 'bg-rose-600 text-white font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Movies
              </button>
              <button
                onClick={() => setSelectedType('series')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
                  selectedType === 'series'
                    ? 'bg-rose-600 text-white font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Series
              </button>
            </div>

            {/* Genre Dropdown */}
            <select
              value={selectedGenre}
              onChange={(e) => setSelectedGenre(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500 cursor-pointer"
            >
              <option value="all" className="bg-slate-900 text-white">
                All Genres
              </option>
              {allGenres.map((g) => (
                <option key={g} value={g} className="bg-slate-900 text-white">
                  {g}
                </option>
              ))}
            </select>

            {/* Min RT Score */}
            <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10 text-slate-300">
              <span className="text-slate-400">Min Score:</span>
              <button
                onClick={() => setMinRating(minRating === 90 ? 0 : 90)}
                className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                  minRating === 90
                    ? 'bg-emerald-600 text-white'
                    : 'text-emerald-400 hover:bg-white/10'
                }`}
              >
                90%+ Only
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-slate-400 font-mono tabular-nums">
              {combinedResults.length} {combinedResults.length === 1 ? 'title' : 'titles'}
            </span>
          </div>
        </div>



        {/* Results Grid */}
        {combinedResults.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <p className="text-slate-300 text-base font-semibold">
              No titles found matching "{query}"
            </p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Try searching by movie title, series name, director (e.g. "Nolan", "Villeneuve"), actor ("Pedro Pascal", "Cillian Murphy"), or click one of the trending suggestions above.
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => {
                  setQuery('');
                  setSelectedType('all');
                  setSelectedGenre('all');
                  setMinRating(0);
                }}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold cursor-pointer"
              >
                Reset All Filters
              </button>
            </div>

            {/* Quick Suggestions Shelf */}
            <div className="pt-8 text-left">
              <h4 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-4">
                Popular Titles You Can Watch Right Now:
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
                {catalog.slice(0, 6).map((item) => (
                  <MediaCard
                    key={item.id}
                    media={item}
                    onSelect={(m) => {
                      onSelectMedia(m);
                      onClose();
                    }}
                    onPlay={(m) => {
                      onPlay(m);
                      onClose();
                    }}
                    onDownload={onDownload}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {combinedResults.map((item) => (
                <MediaCard
                  key={item.id}
                  media={item}
                  onSelect={(m) => {
                    onSelectMedia(m);
                    onClose();
                  }}
                  onPlay={(m) => {
                    onPlay(m);
                    onClose();
                  }}
                  onDownload={onDownload}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
