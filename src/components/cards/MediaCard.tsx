import React from 'react';
import { Play, Download, Check, HardDrive, Info } from 'lucide-react';
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

  const handleMouseEnter = () => {
    const stream = generateStreamSource(media);
    prewarmStreamUrl(stream.url);
  };

  return (
    <div
      onClick={() => onPlay(media)}
      onMouseEnter={handleMouseEnter}
      className="group relative rounded-2xl overflow-hidden bg-[#0E121B] border border-white/8 hover:border-white/25 transition-all duration-200 hover:-translate-y-1.5 shadow-lg flex flex-col cursor-pointer select-none"
    >
      {/* Poster Image Container */}
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-slate-900">
        <img
          src={media.posterUrl}
          alt={media.title}
          referrerPolicy="no-referrer"
          loading="lazy"
          className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
        />

        {/* Ambient Bottom Gradient Scrim */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0E121B] via-transparent to-black/20 opacity-75 group-hover:opacity-55 transition-opacity" />

        {/* Minimal Downloaded Indicator Only */}
        {isDownloaded && (
          <div className="absolute top-2.5 right-2.5 text-[10px] font-semibold text-emerald-300 bg-black/75 backdrop-blur-md px-2 py-0.5 rounded flex items-center gap-1 pointer-events-none">
            <HardDrive className="w-2.5 h-2.5" />
            <span>Saved</span>
          </div>
        )}

        {/* 1-Click Play Hover Overlay */}
        <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex flex-col items-center justify-center gap-3 p-4">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPlay(media);
            }}
            className="w-13 h-13 rounded-full bg-white text-slate-950 hover:bg-slate-200 flex items-center justify-center shadow-2xl transform group-hover:scale-105 transition-all cursor-pointer"
            title={media.type === 'series' ? 'Play Series' : 'Play Movie'}
            aria-label={`Play ${media.title}`}
          >
            <Play className="w-6 h-6 fill-current ml-0.5" />
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSelect(media);
              }}
              className="p-2 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs transition-colors cursor-pointer"
              title="Details & Episodes"
              aria-label={`More info about ${media.title}`}
            >
              <Info className="w-4 h-4" />
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
              <Download className="w-4 h-4" />
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
              <Check className={`w-4 h-4 ${inWatchlist ? 'stroke-[3]' : 'opacity-70'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Clean Card Metadata Footer */}
      <div className="p-3 flex flex-col justify-between flex-1">
        <h3 className="text-sm font-bold text-white font-display truncate leading-snug group-hover:text-rose-400 transition-colors">
          {media.title}
        </h3>

        <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1 font-medium tabular-nums">
          <span>{media.year}</span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className="truncate">{media.type === 'series' ? 'Series' : media.duration}</span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className="text-emerald-400 font-semibold">{media.rottenTomatoesScore}%</span>
        </div>
      </div>
    </div>
  );
};
