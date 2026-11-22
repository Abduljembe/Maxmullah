import React from 'react';
import { Play, Download, Check, HardDrive, Info, Star } from 'lucide-react';
import { MediaItem } from '../../types';
import { useOffline } from '../../context/OfflineContext';
import { useProfile } from '../../context/ProfileContext';
import { generateStreamSource } from '../../services/videoProviderService';
import { prewarmStreamUrl } from '../../utils/adBlocker';

interface MediaCardProps {
  media: MediaItem;
  onSelect: (media: MediaItem) => void;
  onPlay: (media: MediaItem) => void;
  onDownload: (media: MediaItem) => void;
  showMatchScore?: boolean;
  showReleaseDate?: boolean;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  media,
  onSelect,
  onPlay,
  onDownload,
}) => {
  const { isMediaDownloaded } = useOffline();
  const { isInWatchlist, toggleWatchlist } = useProfile();

  const isDownloaded = isMediaDownloaded(media.id);
  const inWatchlist = isInWatchlist(media.id);
  const hasRealRating = typeof media.imdbScore === 'number' && media.imdbScore > 0;
  const typeLabel = media.type === 'series' ? 'SERIES' : 'MOVIE';

  const handleMouseEnter = () => {
    const stream = generateStreamSource(media);
    prewarmStreamUrl(stream.url);
  };

  return (
    <div
      onClick={() => onPlay(media)}
      onMouseEnter={handleMouseEnter}
      className="group relative flex flex-col cursor-pointer select-none"
    >
      {/* Poster Image Container */}
      <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden bg-[#121622] border border-white/10 group-hover:border-white/30 transition-all duration-200 group-hover:-translate-y-1 shadow-lg">
        <img
          src={media.posterUrl}
          alt={media.title}
          referrerPolicy="no-referrer"
          loading="lazy"
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
        />

        {/* Subtle Top/Bottom Contrast Scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/35 opacity-80 group-hover:opacity-60 transition-opacity" />

        {/* Top-Left: Real Star Rating (only when rated > 0) */}
        {hasRealRating && (
          <div className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-md text-xs font-bold text-white tabular-nums pointer-events-none">
            <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
            <span>{media.imdbScore.toFixed(1)}</span>
          </div>
        )}

        {/* Top-Right: MOVIE / SERIES Type Tag + Offline Disk Indicator */}
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1 pointer-events-none">
          {isDownloaded && (
            <span
              className="p-1 rounded-md bg-emerald-600/90 text-white"
              title="Downloaded Offline"
            >
              <HardDrive className="w-3 h-3" />
            </span>
          )}
          <span
            className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide uppercase backdrop-blur-md ${
              media.type === 'series'
                ? 'bg-indigo-600/95 text-white'
                : 'bg-black/75 text-slate-100 border border-white/15'
            }`}
          >
            {typeLabel}
          </span>
        </div>

        {/* 1-Click Play Hover Overlay */}
        <div className="absolute inset-0 z-20 bg-black/55 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex flex-col items-center justify-center gap-3 p-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlay(media);
            }}
            className="w-12 h-12 rounded-full bg-white text-slate-950 hover:bg-slate-200 flex items-center justify-center shadow-2xl transform group-hover:scale-105 transition-all cursor-pointer"
            title={media.type === 'series' ? 'Play Series' : 'Play Movie'}
            aria-label={`Play ${media.title}`}
          >
            <Play className="w-5 h-5 fill-current ml-0.5" />
          </button>

          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect(media);
              }}
              className="p-2 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs transition-colors cursor-pointer"
              title="Details & Episodes"
              aria-label={`More info about ${media.title}`}
            >
              <Info className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownload(media);
              }}
              className="p-2 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs transition-colors cursor-pointer"
              title="Download"
              aria-label={`Download ${media.title}`}
            >
              <Download className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleWatchlist(media.id);
              }}
              className={`p-2 rounded-full text-xs transition-colors cursor-pointer ${
                inWatchlist ? 'bg-rose-600 text-white' : 'bg-white/15 hover:bg-white/25 text-white'
              }`}
              title={inWatchlist ? 'In My List' : 'Add to My List'}
              aria-label={inWatchlist ? `Remove ${media.title} from list` : `Add ${media.title} to list`}
            >
              <Check className={`w-3.5 h-3.5 ${inWatchlist ? 'stroke-[3]' : 'opacity-70'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Clean Card Title & Type · Year Footer */}
      <div className="pt-2 px-0.5 space-y-0.5">
        <h3 className="text-[13px] font-bold text-white font-display truncate leading-snug group-hover:text-rose-400 transition-colors">
          {media.title}
        </h3>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium tabular-nums">
          <span>{media.type === 'series' ? 'Series' : 'Movie'}</span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span>{media.year}</span>
        </div>
      </div>
    </div>
  );
};
