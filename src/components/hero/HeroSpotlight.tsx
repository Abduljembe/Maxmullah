import React, { useState, useEffect } from 'react';
import { Play, Download, Info, HardDrive, ChevronLeft, ChevronRight } from 'lucide-react';
import { MediaItem } from '../../types';
import { useOffline } from '../../context/OfflineContext';
import { useProfile } from '../../context/ProfileContext';
import { calculateMatchScore } from '../../utils/recommendationEngine';

interface HeroSpotlightProps {
  featuredItems: MediaItem[];
  onPlay: (item: MediaItem) => void;
  onDownload: (item: MediaItem) => void;
  onSelect: (item: MediaItem) => void;
  onExploreSeries?: () => void;
}

export const HeroSpotlight: React.FC<HeroSpotlightProps> = ({
  featuredItems,
  onPlay,
  onDownload,
  onSelect,
}) => {
  const [activeIndex, setActiveIndex] = useState(() => {
    if (!featuredItems || featuredItems.length === 0) return 0;
    return Math.floor(Math.random() * featuredItems.length);
  });
  const [isPaused, setIsPaused] = useState(false);
  const [imageError, setImageError] = useState(false);

  const currentItem = featuredItems[activeIndex] || featuredItems[0];

  useEffect(() => {
    if (isPaused || featuredItems.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % featuredItems.length);
    }, 6500);
    return () => clearInterval(timer);
  }, [isPaused, featuredItems.length]);

  useEffect(() => {
    setImageError(false);
  }, [activeIndex]);

  const { isMediaDownloaded } = useOffline();
  const { currentProfile } = useProfile();

  if (!currentItem) return null;

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIndex((prev) => (prev - 1 + featuredItems.length) % featuredItems.length);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIndex((prev) => (prev + 1) % featuredItems.length);
  };

  const isDownloaded = isMediaDownloaded(currentItem.id);
  const { score: matchScore } = calculateMatchScore(currentItem, currentProfile);

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="relative w-full h-[82vh] min-h-[560px] xl:min-h-[680px] 2xl:min-h-[780px] overflow-hidden select-none group"
    >
      {/* Background Cinematic Image */}
      <img
        key={currentItem.id}
        src={imageError ? currentItem.posterUrl : currentItem.backdropUrl}
        alt={currentItem.title}
        referrerPolicy="no-referrer"
        onError={() => setImageError(true)}
        className="absolute inset-0 w-full h-full object-cover object-center scale-100 transition-all duration-700 ease-out"
      />

      {/* Cinematic Scrims */}
      <div className="absolute inset-0 scrim-hero" />
      <div className="absolute inset-0 scrim-side hidden md:block" />

      {/* Carousel Arrows */}
      <button
        onClick={handlePrev}
        aria-label="Previous featured title"
        className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 z-30 p-2.5 sm:p-3 rounded-full bg-black/45 hover:bg-black/80 text-white/80 hover:text-white border border-white/15 backdrop-blur-md transition-all cursor-pointer opacity-0 group-hover:opacity-100"
      >
        <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>

      <button
        onClick={handleNext}
        aria-label="Next featured title"
        className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 z-30 p-2.5 sm:p-3 rounded-full bg-black/45 hover:bg-black/80 text-white/80 hover:text-white border border-white/15 backdrop-blur-md transition-all cursor-pointer opacity-0 group-hover:opacity-100"
      >
        <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
      </button>

      {/* Content Overlay */}
      <div className="relative w-full px-4 sm:px-8 md:px-12 lg:px-16 xl:px-20 max-w-[2400px] mx-auto h-full flex flex-col justify-end pb-12 sm:pb-16 z-20">
        <div className="max-w-2xl lg:max-w-3xl space-y-3.5">
          {/* Clean Unboxed Metadata Line */}
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm font-medium text-slate-300">
            <span className="text-emerald-400 font-bold tabular-nums">{matchScore}% Match</span>
            <span aria-hidden="true" className="text-slate-500">·</span>
            <span>{currentItem.year}</span>
            <span aria-hidden="true" className="text-slate-500">·</span>
            <span className="text-slate-200">{currentItem.rating}</span>
            <span aria-hidden="true" className="text-slate-500">·</span>
            <span>{currentItem.duration}</span>
            <span aria-hidden="true" className="text-slate-500">·</span>
            <span className="text-slate-300">{currentItem.type === 'series' ? 'Series' : 'Movie'}</span>
            <span aria-hidden="true" className="text-slate-500">·</span>
            <span className="text-slate-300">{currentItem.genres.slice(0, 2).join(' / ')}</span>
          </div>

          {/* Main Title */}
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white font-display tracking-tight text-balance leading-none">
            {currentItem.title}
          </h1>

          {/* Synopsis */}
          <p className="text-xs sm:text-sm md:text-base text-slate-200 line-clamp-3 leading-relaxed max-w-xl">
            {currentItem.description}
          </p>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => onPlay(currentItem)}
              onMouseEnter={() => {
                import('../../services/videoProviderService').then(({ generateStreamSource }) => {
                  import('../../utils/adBlocker').then(({ prewarmStreamUrl }) => {
                    prewarmStreamUrl(generateStreamSource(currentItem).url);
                  });
                });
              }}
              className="flex items-center gap-2 px-7 py-3.5 rounded-xl bg-white text-slate-950 hover:bg-slate-200 font-extrabold text-sm transition-all shadow-xl cursor-pointer whitespace-nowrap"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Play</span>
            </button>

            <button
              onClick={() => onSelect(currentItem)}
              className="flex items-center gap-2 px-5 py-3.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-sm font-semibold backdrop-blur-md transition-colors cursor-pointer whitespace-nowrap"
            >
              <Info className="w-4 h-4" />
              <span>More Info</span>
            </button>

            <button
              onClick={() => onDownload(currentItem)}
              className={`flex items-center gap-2 px-5 py-3.5 rounded-xl text-sm font-semibold border transition-all cursor-pointer whitespace-nowrap ${
                isDownloaded
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-white/10 hover:bg-white/20 text-white border-white/15 backdrop-blur-md'
              }`}
            >
              {isDownloaded ? (
                <>
                  <HardDrive className="w-4 h-4 text-emerald-400" />
                  <span>Downloaded</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Clean Carousel Slide Dots */}
        {featuredItems.length > 1 && (
          <div className="absolute bottom-6 right-4 sm:right-12 flex items-center gap-2">
            {featuredItems.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => setActiveIndex(idx)}
                title={item.title}
                aria-label={`Show ${item.title}`}
                className={`h-1.5 rounded-full transition-all cursor-pointer ${
                  activeIndex === idx
                    ? 'w-7 bg-white'
                    : 'w-2 bg-white/35 hover:bg-white/60'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
