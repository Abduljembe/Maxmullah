import React, { useState, useEffect } from 'react';
import {
  Download,
  X,
  HardDrive,
  Check,
  Tv,
  Film,
  Layers,
  Sparkles,
  ArrowDownToLine,
  CheckCircle2,
  ListVideo,
  Loader2,
  Server,
} from 'lucide-react';
import { DownloadQuality, MediaItem } from '../../types';
import { useOffline } from '../../context/OfflineContext';
import { ensureMediaSeasons } from '../../utils/seriesUtils';
import { downloadVideoFile } from '../../utils/fileDownloader';
import { fetchServerQualities, ServerQualityRendition } from '../../services/mediaQualityService';

interface DownloadModalProps {
  media: MediaItem;
  seasonNumber?: number;
  episodeNumber?: number;
  onClose: () => void;
  onDownloadStarted?: () => void;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9.-]/g, '_');
}

export const DownloadModal: React.FC<DownloadModalProps> = ({
  media,
  seasonNumber,
  episodeNumber,
  onClose,
  onDownloadStarted,
}) => {
  const { startDownload, startBatchDownload, storageStats } = useOffline();

  const isSeries = media.type === 'series';
  const seasons = isSeries ? ensureMediaSeasons(media) : [];

  // Season & Episode selection for series
  const [selectedSeasonNum, setSelectedSeasonNum] = useState<number>(seasonNumber || 1);
  const [selectedEpisodeNum, setSelectedEpisodeNum] = useState<number>(episodeNumber || 1);
  const [downloadScope, setDownloadScope] = useState<'single' | 'all'>('single');

  // Dynamic server qualities
  const [serverQualities, setServerQualities] = useState<ServerQualityRendition[]>([]);
  const [isLoadingQualities, setIsLoadingQualities] = useState<boolean>(true);
  const [selectedQualityId, setSelectedQualityId] = useState<string>('1080p');

  // Audio and subtitles
  const [selectedAudio, setSelectedAudio] = useState(
    media.audioTracks[0] || 'English (Dolby Atmos)'
  );
  const [selectedSubtitle, setSelectedSubtitle] = useState('English [CC]');

  // Also trigger direct browser file download onto user device (Downloads folder)
  const [saveDirectToDevice, setSaveDirectToDevice] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  // Active season and episode objects
  const activeSeason = isSeries
    ? seasons.find((s) => s.seasonNumber === selectedSeasonNum) || seasons[0]
    : undefined;
  const activeEpisode = activeSeason?.episodes.find(
    (e) => e.episodeNumber === selectedEpisodeNum
  ) || activeSeason?.episodes[0];

  // Dynamic server quality detection on title or season/episode change
  useEffect(() => {
    let cancelled = false;
    setIsLoadingQualities(true);
    fetchServerQualities(media, selectedSeasonNum, selectedEpisodeNum).then((qualities) => {
      if (cancelled) return;
      setServerQualities(qualities);
      // Select best default: 1080p if available, else highest available
      const defaultQuality =
        qualities.find((q) => q.id === '1080p') ||
        qualities.find((q) => q.id === '720p') ||
        qualities[qualities.length - 1];
      if (defaultQuality) {
        setSelectedQualityId(defaultQuality.id);
      }
      setIsLoadingQualities(false);
    });
    return () => {
      cancelled = true;
    };
  }, [media, selectedSeasonNum, selectedEpisodeNum]);

  // Selected rendition
  const activeRendition =
    serverQualities.find((q) => q.id === selectedQualityId) || serverQualities[0];

  // Total size calculation (scaled by season episode count if batch mode)
  const episodesMultiplier = downloadScope === 'all' && activeSeason ? activeSeason.episodes.length : 1;
  const totalDownloadMb = (activeRendition?.sizeMb || 1200) * episodesMultiplier;

  const handleConfirmDownload = async () => {
    setIsExporting(true);

    const effectiveQuality: DownloadQuality =
      selectedQualityId === '4k'
        ? '4k'
        : selectedQualityId === '720p' || selectedQualityId === '480p' || selectedQualityId === '360p'
        ? '720p'
        : '1080p';

    if (isSeries) {
      if (downloadScope === 'all' && activeSeason) {
        // Batch download all episodes of this season
        startBatchDownload(
          media,
          activeSeason.episodes,
          selectedSeasonNum,
          effectiveQuality,
          selectedAudio,
          selectedSubtitle
        );

        if (saveDirectToDevice && activeEpisode) {
          const fname = sanitizeFilename(
            `${media.title}.S0${selectedSeasonNum}E0${activeEpisode.episodeNumber}.${selectedQualityId}.mp4`
          );
          await downloadVideoFile(activeEpisode.videoUrl || media.videoPreviewUrl, fname);
        }
      } else {
        // Download single selected episode
        startDownload(
          media,
          effectiveQuality,
          selectedSeasonNum,
          selectedEpisodeNum,
          selectedAudio,
          selectedSubtitle
        );

        if (saveDirectToDevice) {
          const epNumFormatted = String(selectedEpisodeNum).padStart(2, '0');
          const fname = sanitizeFilename(
            `${media.title}.S0${selectedSeasonNum}E${epNumFormatted}.${selectedQualityId}.mp4`
          );
          await downloadVideoFile(activeEpisode?.videoUrl || media.videoPreviewUrl, fname);
        }
      }
    } else {
      // Movie download
      startDownload(
        media,
        effectiveQuality,
        undefined,
        undefined,
        selectedAudio,
        selectedSubtitle
      );

      if (saveDirectToDevice) {
        const fname = sanitizeFilename(`${media.title}.${media.year}.${selectedQualityId}.mp4`);
        await downloadVideoFile(media.videoPreviewUrl, fname);
      }
    }

    setIsExporting(false);
    onDownloadStarted?.();
    onClose();
  };

  const titleHeader = isSeries
    ? downloadScope === 'all'
      ? `Download All ${activeSeason?.episodes.length || 0} Episodes of Season ${selectedSeasonNum}`
      : `Download Season ${selectedSeasonNum}, Episode ${selectedEpisodeNum}`
    : `Download "${media.title}"`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-xl rounded-3xl bg-[#0E121B] border border-white/15 p-5 sm:p-7 shadow-2xl text-slate-100 animate-in fade-in zoom-in-95 duration-200 my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/10 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-rose-500 font-bold uppercase tracking-wider mb-1 font-mono">
              <Download className="w-4 h-4" />
              <span>Offline Download Vault</span>
            </div>
            <h3 className="text-lg sm:text-xl font-bold text-white font-display leading-snug truncate">
              {titleHeader}
            </h3>
            {isSeries && activeEpisode && downloadScope === 'single' && (
              <p className="text-xs text-rose-400 font-medium mt-0.5 truncate">
                "{activeEpisode.title}" ({activeEpisode.duration})
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Configuration Body */}
        <div className="overflow-y-auto space-y-5 my-4 pr-1">
          {/* SERIES SELECTOR: Season & Episode picker if TV Series */}
          {isSeries && seasons.length > 0 && (
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                  <Tv className="w-3.5 h-3.5" />
                  <span>Choose Season &amp; Episodes</span>
                </span>
                <span className="text-[11px] text-slate-400">
                  {seasons.length} Seasons available
                </span>
              </div>

              {/* Season Selection Pills */}
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                {seasons.map((s) => (
                  <button
                    key={s.seasonNumber}
                    onClick={() => {
                      setSelectedSeasonNum(s.seasonNumber);
                      setSelectedEpisodeNum(1);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                      selectedSeasonNum === s.seasonNumber
                        ? 'bg-rose-600 text-white shadow-md'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    Season {s.seasonNumber}
                  </button>
                ))}
              </div>

              {/* Single Episode vs Full Season Batch Mode */}
              <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setDownloadScope('single')}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    downloadScope === 'single'
                      ? 'bg-white/15 text-white border border-white/20'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <ListVideo className="w-3.5 h-3.5" />
                  <span>Choose Single Episode</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDownloadScope('all')}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    downloadScope === 'all'
                      ? 'bg-rose-600/30 text-rose-300 border border-rose-500/50'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-rose-400" />
                  <span>Download Whole Season ({activeSeason?.episodes.length || 0} Eps)</span>
                </button>
              </div>

              {/* Episode Dropdown / Grid if Single Episode mode */}
              {downloadScope === 'single' && activeSeason && (
                <div className="pt-1 space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-400 block">
                    Select Episode to Download:
                  </label>
                  <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
                    {activeSeason.episodes.map((ep) => {
                      const isSelected = selectedEpisodeNum === ep.episodeNumber;
                      return (
                        <button
                          key={ep.episodeNumber}
                          onClick={() => setSelectedEpisodeNum(ep.episodeNumber)}
                          className={`w-full text-left px-3 py-2 rounded-xl border text-xs transition-all cursor-pointer flex items-center justify-between gap-2 ${
                            isSelected
                              ? 'bg-rose-600/20 border-rose-500 text-white font-bold'
                              : 'bg-white/5 border-white/5 hover:bg-white/10 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <span
                              className={`w-6 h-6 rounded-md flex items-center justify-center font-mono text-[11px] shrink-0 ${
                                isSelected ? 'bg-rose-600 text-white' : 'bg-white/10 text-slate-400'
                              }`}
                            >
                              {ep.episodeNumber}
                            </span>
                            <span className="truncate">{ep.title}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 text-slate-400 font-mono text-[11px]">
                            <span>{ep.duration}</span>
                            <span>·</span>
                            <span>{ep.downloadSizeMb || 950} MB</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Dynamic Video Quality Selection (Detected from Server) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <Server className="w-3.5 h-3.5 text-rose-500" />
                <span>Detected Server Qualities ({serverQualities.length})</span>
              </label>
              {isLoadingQualities && (
                <span className="flex items-center gap-1.5 text-[11px] text-amber-400 font-mono">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Probing stream manifests...</span>
                </span>
              )}
            </div>

            {isLoadingQualities ? (
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center justify-center text-center space-y-2">
                <Loader2 className="w-6 h-6 text-rose-500 animate-spin" />
                <p className="text-xs text-slate-300 font-medium">
                  Waiting for streaming server to report available resolutions...
                </p>
                <p className="text-[11px] text-slate-400">
                  Parsing stream bitrates and resolution tiers
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                {serverQualities.map((opt) => {
                  const isSelected = selectedQualityId === opt.id;
                  const itemSizeMb = opt.sizeMb * episodesMultiplier;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setSelectedQualityId(opt.id)}
                      className={`text-left p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between h-24 ${
                        isSelected
                          ? 'bg-rose-600/20 border-rose-500 text-white shadow-lg shadow-rose-600/20 ring-1 ring-rose-500/50'
                          : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs font-black text-white">{opt.id.toUpperCase()}</span>
                        {isSelected ? (
                          <Check className="w-3.5 h-3.5 text-rose-400 stroke-[3]" />
                        ) : (
                          opt.badge && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold">
                              {opt.badge}
                            </span>
                          )
                        )}
                      </div>
                      <div>
                        <span className="text-sm font-mono font-black text-white">
                          {(itemSizeMb / 1024).toFixed(1)} GB
                        </span>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">{opt.codec}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Audio & Subtitle Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                Audio Language
              </label>
              <select
                value={selectedAudio}
                onChange={(e) => setSelectedAudio(e.target.value)}
                className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
              >
                {media.audioTracks.map((trk) => (
                  <option key={trk} value={trk} className="bg-slate-900 text-white">
                    {trk}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1">
                Included Subtitles
              </label>
              <select
                value={selectedSubtitle}
                onChange={(e) => setSelectedSubtitle(e.target.value)}
                className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
              >
                {media.subtitles.map((sub) => (
                  <option key={sub} value={sub} className="bg-slate-900 text-white">
                    {sub}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Real Device File Download Option */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-rose-600/15 to-transparent border border-rose-500/30 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-rose-600/30 text-rose-300 flex items-center justify-center shrink-0">
                <ArrowDownToLine className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-white block">
                  Also Save File to Your Device
                </span>
                <p className="text-[11px] text-slate-300">
                  Directly saves the .mp4 file to your computer or phone's Download folder.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              id="saveDirect"
              checked={saveDirectToDevice}
              onChange={(e) => setSaveDirectToDevice(e.target.checked)}
              className="w-5 h-5 rounded accent-rose-600 cursor-pointer"
            />
          </div>

          {/* Device Storage Status Bar */}
          <div className="bg-white/5 rounded-2xl p-3 border border-white/5 text-xs">
            <div className="flex items-center justify-between mb-1.5">
              <span className="flex items-center gap-1.5 text-slate-400">
                <HardDrive className="w-3.5 h-3.5 text-rose-400" />
                Device Storage
              </span>
              <span className="text-slate-300 font-mono">
                {(storageStats.freeSpaceMb / 1024).toFixed(1)} GB Available
              </span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden flex">
              <div
                className="bg-slate-500 h-full"
                style={{
                  width: `${(storageStats.usedBySystemMb / storageStats.totalDeviceMb) * 100}%`,
                }}
              />
              <div
                className="bg-rose-600 h-full"
                style={{
                  width: `${(storageStats.usedByMullahMaxMb / storageStats.totalDeviceMb) * 100}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1.5">
              <span>MullahMax Vault: {(storageStats.usedByMullahMaxMb / 1024).toFixed(1)} GB</span>
              <span className="text-rose-400 font-semibold font-mono">
                +{(totalDownloadMb / 1024).toFixed(1)} GB
              </span>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmDownload}
            disabled={isExporting}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold transition-all shadow-xl shadow-rose-600/30 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>
              {isExporting
                ? 'Starting Download...'
                : `Download Now (${(totalDownloadMb / 1024).toFixed(1)} GB)`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
