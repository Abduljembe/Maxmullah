import React, { useState } from 'react';
import {
  X,
  Play,
  Download,
  Film,
  Sparkles,
  HardDrive,
  CheckCircle2,
  Clock,
  Layers,
  Star,
} from 'lucide-react';
import { MediaItem } from '../../types';
import { ensureMediaSeasons } from '../../utils/seriesUtils';
import { useOffline } from '../../context/OfflineContext';
import { useProfile } from '../../context/ProfileContext';
import { PLATFORM_INFO } from '../../data/mediaData';

interface SeriesEpisodePickerModalProps {
  media: MediaItem;
  initialSeason?: number;
  initialEpisode?: number;
  isOpen: boolean;
  onClose: () => void;
  onPlayEpisode: (seasonNum: number, episodeNum: number) => void;
  onDownloadEpisode?: (seasonNum: number, episodeNum: number) => void;
}

export const SeriesEpisodePickerModal: React.FC<SeriesEpisodePickerModalProps> = ({
  media,
  initialSeason = 1,
  initialEpisode = 1,
  isOpen,
  onClose,
  onPlayEpisode,
  onDownloadEpisode,
}) => {
  const seasons = ensureMediaSeasons(media);
  const [selectedSeasonNum, setSelectedSeasonNum] = useState<number>(initialSeason);
  const [customSeason, setCustomSeason] = useState(String(initialSeason));
  const [customEpisode, setCustomEpisode] = useState(String(initialEpisode));

  const { isMediaDownloaded } = useOffline();
  const { currentProfile } = useProfile();

  if (!isOpen) return null;

  const currentSeason =
    seasons.find((s) => s.seasonNumber === selectedSeasonNum) || seasons[0] || {
      seasonNumber: 1,
      title: 'Season 1',
      episodes: [],
    };

  // Find if user has watch history for this series
  const userHistory = currentProfile.watchHistory.find((h) => h.mediaId === media.id);
  const resumeSeason = userHistory?.season || 1;
  const resumeEpisode = userHistory?.episode || 1;
  const resumeProgress = userHistory?.progressPercentage || 0;

  const handleCustomPlay = (e: React.FormEvent) => {
    e.preventDefault();
    const s = Math.max(1, parseInt(customSeason, 10) || 1);
    const ep = Math.max(1, parseInt(customEpisode, 10) || 1);
    onPlayEpisode(s, ep);
    onClose();
  };

  const primaryPlat = PLATFORM_INFO[media.primaryPlatform];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-4xl xl:max-w-5xl rounded-3xl bg-[#0B0E17] border border-white/10 shadow-2xl overflow-hidden text-slate-100 max-h-[92vh] flex flex-col my-auto">
        {/* Header Hero Banner */}
        <div className="relative h-44 sm:h-52 w-full overflow-hidden shrink-0 bg-slate-900">
          {(media.backdropUrl || media.posterUrl) ? (
            <img
              src={media.backdropUrl || media.posterUrl}
              alt={media.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover object-center"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0E17] via-[#0B0E17]/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B0E17] via-transparent to-transparent" />

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-20 p-2 rounded-full bg-black/60 hover:bg-black/90 text-white backdrop-blur-md transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Series Hero Info */}
          <div className="absolute bottom-4 left-6 right-6 flex items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 bg-rose-600/20 border border-rose-500/30 px-2 py-0.5 rounded-full font-mono">
                  Series Episode Guide
                </span>
                <span className="text-white/40">·</span>
                <span className="text-xs text-slate-300 font-semibold">{media.rating}</span>
                <span className="text-white/40">·</span>
                <span className="text-xs text-slate-300">{media.duration}</span>
                {media.imdbScore > 0 && (
                  <>
                    <span className="text-white/40">·</span>
                    <span className="inline-flex items-center gap-1 text-xs text-amber-400 font-bold tabular-nums">
                      <Star className="w-3.5 h-3.5 fill-amber-400" />
                      {media.imdbScore.toFixed(1)}
                    </span>
                  </>
                )}
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white font-display tracking-tight truncate max-w-lg">
                {media.title}
              </h2>
            </div>
          </div>
        </div>

        {/* Resume Banner (if user previously watched an episode) */}
        {userHistory && (
          <div className="px-6 py-3 bg-rose-950/40 border-b border-rose-500/20 flex items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-rose-400" />
              <span>
                You last watched <strong>Season {resumeSeason}, Episode {resumeEpisode}</strong> ({resumeProgress}% completed)
              </span>
            </div>
            <button
              onClick={() => {
                onPlayEpisode(resumeSeason, resumeEpisode);
                onClose();
              }}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition-colors cursor-pointer shrink-0"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>Resume S{resumeSeason}:E{resumeEpisode}</span>
            </button>
          </div>
        )}

        {/* Season Selector Tabs */}
        <div className="px-6 pt-4 pb-2 border-b border-white/10 shrink-0 bg-[#0E121B]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-rose-400" />
              Select Season
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {seasons.length} {seasons.length === 1 ? 'Season' : 'Seasons'} Available
            </span>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2">
            {seasons.map((s) => (
              <button
                key={s.seasonNumber}
                onClick={() => setSelectedSeasonNum(s.seasonNumber)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer border ${
                  selectedSeasonNum === s.seasonNumber
                    ? 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-600/20'
                    : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white'
                }`}
              >
                Season {s.seasonNumber}
              </button>
            ))}
          </div>
        </div>

        {/* Episodes List Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 no-scrollbar">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold pb-1">
            <span>Episodes in Season {selectedSeasonNum}</span>
            <span>Click any episode to stream</span>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {currentSeason.episodes.map((ep) => {
              const isDownloaded = isMediaDownloaded(
                media.id,
                selectedSeasonNum,
                ep.episodeNumber
              );

              return (
                <div
                  key={ep.episodeNumber}
                  className="group p-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-rose-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3.5">
                    {/* Play Button Icon */}
                    <button
                      onClick={() => {
                        onPlayEpisode(selectedSeasonNum, ep.episodeNumber);
                        onClose();
                      }}
                      className="w-10 h-10 rounded-xl bg-white/10 group-hover:bg-rose-600 text-white flex items-center justify-center shrink-0 transition-colors shadow-md cursor-pointer mt-0.5"
                      title={`Play S${selectedSeasonNum}:E${ep.episodeNumber}`}
                    >
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </button>

                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-rose-400 font-mono">
                          S{selectedSeasonNum} : E{ep.episodeNumber}
                        </span>
                        <span className="text-sm font-bold text-white group-hover:text-rose-200 transition-colors">
                          {ep.title}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">· {ep.duration}</span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed line-clamp-2">
                        {ep.synopsis}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      onClick={() => {
                        onPlayEpisode(selectedSeasonNum, ep.episodeNumber);
                        onClose();
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>Play</span>
                    </button>

                    {onDownloadEpisode && (
                      <button
                        onClick={() => onDownloadEpisode(selectedSeasonNum, ep.episodeNumber)}
                        className={`p-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                          isDownloaded
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/10'
                        }`}
                        title="Download for Offline Viewing"
                      >
                        {isDownloaded ? (
                          <HardDrive className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer: Direct Jumper for Custom Season & Episode */}
        <div className="p-4 bg-[#080A0F] border-t border-white/10 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <form onSubmit={handleCustomPlay} className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-400 font-medium">Or jump directly to:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Season</span>
              <input
                type="number"
                min={1}
                max={25}
                value={customSeason}
                onChange={(e) => setCustomSeason(e.target.value)}
                className="w-14 bg-white/5 border border-white/15 focus:border-rose-500 rounded-lg px-2 py-1 text-center font-mono font-bold text-white focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Episode</span>
              <input
                type="number"
                min={1}
                max={50}
                value={customEpisode}
                onChange={(e) => setCustomEpisode(e.target.value)}
                className="w-14 bg-white/5 border border-white/15 focus:border-rose-500 rounded-lg px-2 py-1 text-center font-mono font-bold text-white focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="px-3.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-colors cursor-pointer"
            >
              Go to Episode →
            </button>
          </form>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white px-3 py-1 cursor-pointer self-end sm:self-auto"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
