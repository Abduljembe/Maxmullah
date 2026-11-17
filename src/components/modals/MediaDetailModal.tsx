import React, { useState } from 'react';
import {
  X,
  Play,
  Download,
  Plus,
  Check,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  Share2,
  HardDrive,
  Film,
  Tv,
} from 'lucide-react';
import { MediaItem, StreamingPlatform } from '../../types';
import { PLATFORM_INFO } from '../../data/mediaData';
import { useOffline } from '../../context/OfflineContext';
import { useProfile } from '../../context/ProfileContext';
import { calculateMatchScore } from '../../utils/recommendationEngine';
import { ensureMediaSeasons } from '../../utils/seriesUtils';

interface MediaDetailModalProps {
  media: MediaItem;
  onClose: () => void;
  onPlay: (seasonNum?: number, episodeNum?: number) => void;
  onOpenDownload: (seasonNum?: number, episodeNum?: number) => void;
  onSelectMedia: (item: MediaItem) => void;
  allMedia: MediaItem[];
}

export const MediaDetailModal: React.FC<MediaDetailModalProps> = ({
  media,
  onClose,
  onPlay,
  onOpenDownload,
  onSelectMedia,
  allMedia,
}) => {
  const { isMediaDownloaded, getDownloadedMedia } = useOffline();
  const {
    currentProfile,
    isInWatchlist,
    toggleWatchlist,
    getMediaRating,
    rateMedia,
  } = useProfile();

  const [selectedSeason, setSelectedSeason] = useState(1);
  const [copiedShare, setCopiedShare] = useState(false);

  const inWatchlist = isInWatchlist(media.id);
  const rating = getMediaRating(media.id);
  const downloaded = isMediaDownloaded(media.id);
  const downloadedItem = getDownloadedMedia(media.id);

  const { score: matchScore, reasons: matchReasons } = calculateMatchScore(
    media,
    currentProfile
  );

  const seasons = ensureMediaSeasons(media);
  const currentSeasonData = seasons.find((s) => s.seasonNumber === selectedSeason) || seasons[0];

  const similarItems = allMedia
    .filter(
      (m) =>
        m.id !== media.id &&
        m.genres.some((g) => media.genres.includes(g))
    )
    .slice(0, 4);

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(
        `Watch "${media.title}" on MullahMax — Available on ${media.platforms.join(', ')}`
      );
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-5xl xl:max-w-6xl max-h-[92vh] rounded-3xl bg-[#0B0E17] border border-white/10 shadow-2xl overflow-y-auto no-scrollbar text-slate-100 my-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-30 p-2 rounded-full bg-black/60 hover:bg-black/90 text-white backdrop-blur-md transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Hero Backdrop Banner */}
        <div className="relative w-full h-72 sm:h-96 overflow-hidden">
          <img
            src={media.backdropUrl}
            alt={media.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B0E17] via-[#0B0E17]/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B0E17] via-[#0B0E17]/40 to-transparent" />

          {/* Floating Hero Info */}
          <div className="absolute bottom-6 left-6 right-6">
            <div className="flex items-center gap-2 mb-2 flex-wrap text-xs font-medium text-slate-300">
              <span className="text-emerald-400 font-bold tabular-nums">{matchScore}% Match</span>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span>{media.year}</span>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span>{media.rating}</span>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span>{media.duration}</span>
              <span aria-hidden="true" className="text-slate-500">·</span>
              <span>{media.type === 'series' ? `${seasons.length} Seasons` : 'Movie'}</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold text-white font-display tracking-tight text-balance">
              {media.title}
            </h1>

            {media.tagline && (
              <p className="text-xs sm:text-sm text-slate-300 italic mt-1 max-w-xl">
                "{media.tagline}"
              </p>
            )}

            {/* Match Reason Banner */}
            {matchReasons.length > 0 && (
              <p className="text-xs text-amber-300/90 mt-2 font-medium flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                {matchReasons[0]}
              </p>
            )}

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <button
                onClick={() => onPlay(media.type === 'series' ? selectedSeason : undefined, 1)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-white text-slate-950 hover:bg-slate-200 font-bold text-sm transition-all shadow-lg cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{media.type === 'series' ? `Play Season ${selectedSeason}, Episode 1` : 'Play Now'}</span>
              </button>

              <button
                onClick={() => onOpenDownload(media.type === 'series' ? selectedSeason : undefined, media.type === 'series' ? 1 : undefined)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  downloaded
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    : 'bg-white/10 hover:bg-white/20 text-white border-white/15'
                }`}
              >
                {downloaded ? (
                  <>
                    <HardDrive className="w-4 h-4 text-emerald-400" />
                    <span>Downloaded ({downloadedItem?.quality.toUpperCase()})</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download Offline</span>
                  </>
                )}
              </button>

              <button
                onClick={() => toggleWatchlist(media.id)}
                className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                  inWatchlist
                    ? 'bg-rose-600 border-rose-600 text-white'
                    : 'bg-white/10 hover:bg-white/20 text-white border-white/15'
                }`}
                title={inWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}
              >
                {inWatchlist ? <Check className="w-4 h-4 stroke-[3]" /> : <Plus className="w-4 h-4" />}
              </button>

              {/* Like / Dislike */}
              <div className="flex items-center bg-white/10 border border-white/15 rounded-xl p-1">
                <button
                  onClick={() => rateMedia(media.id, rating === 'like' ? 'neutral' : 'like')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    rating === 'like' ? 'bg-rose-600 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                  title="I like this (improves recommendations)"
                >
                  <ThumbsUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => rateMedia(media.id, rating === 'dislike' ? 'neutral' : 'dislike')}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    rating === 'dislike' ? 'bg-slate-700 text-white' : 'text-slate-300 hover:text-white'
                  }`}
                  title="Not for me"
                >
                  <ThumbsDown className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={handleShare}
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-colors cursor-pointer"
                title="Share Title"
              >
                {copiedShare ? <Check className="w-4 h-4 text-emerald-400" /> : <Share2 className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-8">
          {/* Platforms */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>Available on:</span>
            {media.platforms.map((plat, idx) => (
              <React.Fragment key={plat}>
                <span className="text-white font-semibold">{PLATFORM_INFO[plat].name}</span>
                {idx < media.platforms.length - 1 && <span aria-hidden="true">·</span>}
              </React.Fragment>
            ))}
          </div>

          {/* Two-column Overview & Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-4">
              <h3 className="text-base font-bold text-white font-display">Overview</h3>
              <p className="text-sm text-slate-300 leading-relaxed">{media.description}</p>

              {media.awards && (
                <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                  🏆 <strong>Accolades:</strong> {media.awards}
                </div>
              )}
            </div>

            <div className="space-y-3 text-xs bg-white/5 border border-white/5 rounded-2xl p-4">
              <div>
                <span className="text-slate-400 block mb-0.5">Genres:</span>
                <span className="text-white font-medium">{media.genres.join(', ')}</span>
              </div>

              {media.director && (
                <div>
                  <span className="text-slate-400 block mb-0.5">Director:</span>
                  <span className="text-white font-medium">{media.director}</span>
                </div>
              )}

              {media.creator && (
                <div>
                  <span className="text-slate-400 block mb-0.5">Creator:</span>
                  <span className="text-white font-medium">{media.creator}</span>
                </div>
              )}

              <div>
                <span className="text-slate-400 block mb-0.5">Cast:</span>
                <span className="text-white font-medium">{media.cast.join(', ')}</span>
              </div>

              <div>
                <span className="text-slate-400 block mb-0.5">Audio & Visual:</span>
                <span className="text-rose-400 font-semibold">{media.features.join(' · ')}</span>
              </div>
            </div>
          </div>



          {/* Series Episodes Section */}
          {media.type === 'series' && seasons.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white font-display">Episodes</h3>
                  <span className="text-xs text-slate-400">
                    Choose season and episode to play directly
                  </span>
                </div>

                {/* Season Selector */}
                {seasons.length > 1 && (
                  <div className="flex items-center gap-1.5 bg-white/5 p-1 rounded-xl border border-white/10 overflow-x-auto no-scrollbar">
                    {seasons.map((s) => (
                      <button
                        key={s.seasonNumber}
                        onClick={() => setSelectedSeason(s.seasonNumber)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                          selectedSeason === s.seasonNumber
                            ? 'bg-rose-600 text-white font-bold'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Season {s.seasonNumber}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Episodes List */}
              <div className="space-y-3">
                {currentSeasonData?.episodes.map((ep) => {
                  const epDownloaded = isMediaDownloaded(
                    media.id,
                    selectedSeason,
                    ep.episodeNumber
                  );

                  return (
                    <div
                      key={ep.episodeNumber}
                      onClick={() => onPlay(selectedSeason, ep.episodeNumber)}
                      className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all cursor-pointer"
                    >
                      <div className="flex items-start gap-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onPlay(selectedSeason, ep.episodeNumber);
                          }}
                          className="w-10 h-10 rounded-full bg-white/10 group-hover:bg-rose-600 flex items-center justify-center text-white shrink-0 transition-colors cursor-pointer mt-0.5"
                        >
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        </button>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-rose-400 font-bold">
                              EP {ep.episodeNumber}
                            </span>
                            <span className="text-sm font-bold text-white">{ep.title}</span>
                            <span className="text-xs text-slate-400 font-mono">· {ep.duration}</span>
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
                            {ep.synopsis}
                          </p>
                        </div>
                      </div>

                      {/* Download Episode Button */}
                      <div className="flex items-center justify-end shrink-0 sm:self-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenDownload(selectedSeason, ep.episodeNumber);
                          }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                            epDownloaded
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                              : 'bg-white/5 hover:bg-white/15 text-slate-300 border-white/10'
                          }`}
                          title="Download episode for offline playback"
                        >
                          {epDownloaded ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Ready Offline</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3.5 h-3.5" />
                              <span>{(ep.downloadSizeMb / 1024).toFixed(1)} GB</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Similar Recommended Titles */}
          {similarItems.length > 0 && (
            <div className="space-y-4 pt-4 border-t border-white/10">
              <h3 className="text-base font-bold text-white font-display">More Like This</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {similarItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => onSelectMedia(item)}
                    className="group relative rounded-xl overflow-hidden border border-white/10 bg-slate-900 cursor-pointer hover:border-rose-500/50 transition-all hover:-translate-y-1"
                  >
                    <div className="aspect-[3/4] w-full overflow-hidden">
                      <img
                        src={item.posterUrl}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                    <div className="p-3">
                      <h4 className="text-xs font-bold text-white truncate">{item.title}</h4>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                        <span>{item.year}</span>
                        <span className="text-rose-400 font-bold">{item.rottenTomatoesScore}%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
