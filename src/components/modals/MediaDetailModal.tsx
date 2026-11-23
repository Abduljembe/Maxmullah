import React, { useEffect, useState } from 'react';
import {
  X,
  Play,
  Download,
  Plus,
  Check,
  ThumbsUp,
  ThumbsDown,
  Share2,
  HardDrive,
  Star,
  Link2,
  Trash2,
} from 'lucide-react';
import { MediaItem } from '../../types';
import { PLATFORM_INFO } from '../../data/mediaData';
import { useOffline } from '../../context/OfflineContext';
import { useProfile } from '../../context/ProfileContext';
import { ensureMediaSeasons } from '../../utils/seriesUtils';
import {
  getSavedDirectStream,
  saveCustomDirectStream,
  removeCustomDirectStream,
} from '../../services/videoProviderService';

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
    isInWatchlist,
    toggleWatchlist,
    getMediaRating,
    rateMedia,
  } = useProfile();

  const [selectedSeason, setSelectedSeason] = useState(1);
  const [copiedShare, setCopiedShare] = useState(false);
  const [showDirectPanel, setShowDirectPanel] = useState(false);
  const [hasDirectAttached, setHasDirectAttached] = useState(false);
  const [directUrlInput, setDirectUrlInput] = useState('');
  const [directSubInput, setDirectSubInput] = useState('');
  const [directSaving, setDirectSaving] = useState(false);
  const [directFeedback, setDirectFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    const epNum = media.type === 'series' ? 1 : 1;
    getSavedDirectStream(media, selectedSeason, epNum).then((entry) => {
      if (!active) return;
      if (entry?.url) {
        setHasDirectAttached(true);
        setDirectUrlInput(entry.url);
        setDirectSubInput(entry.subtitleUrl || '');
      } else {
        setHasDirectAttached(false);
        setDirectUrlInput('');
        setDirectSubInput('');
      }
    });
    return () => {
      active = false;
    };
  }, [media, selectedSeason]);

  const inWatchlist = isInWatchlist(media.id);
  const rating = getMediaRating(media.id);
  const downloaded = isMediaDownloaded(media.id);
  const downloadedItem = getDownloadedMedia(media.id);
  const hasRealRating = typeof media.imdbScore === 'number' && media.imdbScore > 0;

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

  const handleSaveDirectStream = async (playImmediately: boolean) => {
    const cleanUrl = directUrlInput.trim();
    if (!cleanUrl) {
      setDirectFeedback({ type: 'err', text: 'Enter a valid http(s) .mp4 or .m3u8 stream URL.' });
      return;
    }
    setDirectSaving(true);
    setDirectFeedback(null);
    const sNum = media.type === 'series' ? selectedSeason : 1;
    const result = await saveCustomDirectStream(media, cleanUrl, sNum, 1, {
      subtitleUrl: directSubInput.trim() || undefined,
    });
    setDirectSaving(false);
    if (!result.ok) {
      setDirectFeedback({ type: 'err', text: result.error || 'Could not save direct stream.' });
      return;
    }
    setHasDirectAttached(true);
    setDirectFeedback({ type: 'ok', text: 'Direct stream saved for native ad-free playback.' });
    if (playImmediately) {
      onPlay(media.type === 'series' ? selectedSeason : undefined, 1);
    }
  };

  const handleRemoveDirectStream = async () => {
    setDirectSaving(true);
    const sNum = media.type === 'series' ? selectedSeason : 1;
    const ok = await removeCustomDirectStream(media, sNum, 1);
    setDirectSaving(false);
    if (ok) {
      setHasDirectAttached(false);
      setDirectUrlInput('');
      setDirectSubInput('');
      setDirectFeedback({ type: 'ok', text: 'Removed attached direct stream.' });
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
              {hasRealRating && (
                <>
                  <span className="inline-flex items-center gap-1 text-amber-400 font-bold tabular-nums">
                    <Star className="w-3.5 h-3.5 fill-amber-400" />
                    {media.imdbScore.toFixed(1)}
                  </span>
                  <span aria-hidden="true" className="text-slate-500">·</span>
                </>
              )}
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

              <button
                type="button"
                onClick={() => setShowDirectPanel((prev) => !prev)}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                  hasDirectAttached || showDirectPanel
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-white/10 hover:bg-white/20 text-slate-200 border-white/15'
                }`}
                title="Attach direct .mp4 or .m3u8 stream for native VLC-style playback"
              >
                <Link2 className="w-4 h-4" />
                <span>{hasDirectAttached ? 'Direct Stream Ready' : 'Direct Media'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Collapsible Direct Media Stream Binder */}
        {showDirectPanel && (
          <div className="mx-6 sm:mx-8 mt-6 p-4 sm:p-5 rounded-2xl bg-white/[0.04] border border-white/15 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white font-display">
                  Attach Direct Media Stream (.m3u8 / .mp4)
                </h3>
                <p className="text-xs text-slate-400">
                  Plays directly in the built-in native player with CORS proxy fallback, hardware scrubbing, and zero ads.
                </p>
              </div>
              {hasDirectAttached && (
                <button
                  type="button"
                  onClick={handleRemoveDirectStream}
                  disabled={directSaving}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Video / HLS Stream URL (.m3u8 or .mp4)
                </label>
                <input
                  type="url"
                  value={directUrlInput}
                  onChange={(e) => setDirectUrlInput(e.target.value)}
                  placeholder="https://cdn.example.com/movie/master.m3u8"
                  className="w-full bg-black/50 border border-white/15 focus:border-white/50 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                  Optional Subtitle Track URL (.vtt)
                </label>
                <input
                  type="url"
                  value={directSubInput}
                  onChange={(e) => setDirectSubInput(e.target.value)}
                  placeholder="https://cdn.example.com/subtitles/en.vtt"
                  className="w-full bg-black/50 border border-white/15 focus:border-white/50 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none font-mono"
                />
              </div>
            </div>

            {directFeedback && (
              <div
                className={`text-xs px-3 py-2 rounded-xl border ${
                  directFeedback.type === 'ok'
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                }`}
              >
                {directFeedback.text}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => handleSaveDirectStream(false)}
                disabled={directSaving}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/15 cursor-pointer disabled:opacity-50"
              >
                Save Link
              </button>
              <button
                type="button"
                onClick={() => handleSaveDirectStream(true)}
                disabled={directSaving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white text-slate-950 hover:bg-slate-200 text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Save &amp; Play in Native Player</span>
              </button>
            </div>
          </div>
        )}

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
                <span className="text-slate-400 block mb-1.5">Cast:</span>
                {media.castProfiles && media.castProfiles.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {media.castProfiles.slice(0, 4).map((person) => (
                      <div key={person.name} className="flex items-center gap-2 pr-2 py-0.5 rounded-lg bg-white/5">
                        {person.profileUrl && (
                          <img
                            src={person.profileUrl}
                            alt={person.name}
                            referrerPolicy="no-referrer"
                            className="w-6 h-6 rounded-md object-cover shrink-0"
                          />
                        )}
                        <span className="text-white font-medium truncate max-w-[130px]">{person.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-white font-medium">{media.cast.join(', ')}</span>
                )}
              </div>

              <div>
                <span className="text-slate-400 block mb-0.5">Audio &amp; Visual:</span>
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
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1 tabular-nums">
                        <span>{item.year}</span>
                        {item.imdbScore > 0 && (
                          <span className="inline-flex items-center gap-1 text-amber-400 font-bold">
                            <Star className="w-3 h-3 fill-amber-400" />
                            {item.imdbScore.toFixed(1)}
                          </span>
                        )}
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
