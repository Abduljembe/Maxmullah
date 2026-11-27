import React from 'react';
import {
  HardDrive,
  Play,
  Trash2,
  Pause,
  Download,
  CheckCircle2,
  ArrowDownToLine,
} from 'lucide-react';
import { DownloadedItem, MediaItem } from '../../types';
import { useOffline } from '../../context/OfflineContext';
import { MEDIA_CATALOG } from '../../data/mediaData';
import { downloadVideoFile, isDirectStreamUrl } from '../../utils/fileDownloader';

interface DownloadsViewProps {
  catalog?: MediaItem[];
  onPlayDownloaded: (media: MediaItem, seasonNum?: number, episodeNum?: number) => void;
  onDownloadItem?: (media: MediaItem, seasonNum?: number, episodeNum?: number) => void;
  onExploreCatalog: () => void;
}

export const DownloadsView: React.FC<DownloadsViewProps> = ({
  catalog = [],
  onPlayDownloaded,
  onDownloadItem,
  onExploreCatalog,
}) => {
  const {
    downloads,
    removeDownload,
    pauseDownload,
    resumeDownload,
    clearAllDownloads,
    storageStats,
  } = useOffline();

  const completedDownloads = downloads.filter((d) => d.status === 'completed');
  const activeDownloads = downloads.filter((d) => d.status !== 'completed');

  const resolveMediaFromDownload = (item: DownloadedItem): MediaItem => {
    const combinedCatalog = [...catalog, ...MEDIA_CATALOG];
    const parentMedia = combinedCatalog.find(
      (m) =>
        m.id === item.mediaId ||
        (item.tmdbId && m.tmdbId === item.tmdbId) ||
        (item.imdbId && m.imdbId === item.imdbId)
    );

    if (parentMedia) {
      return parentMedia;
    }

    return {
      id: item.mediaId,
      tmdbId: item.tmdbId,
      imdbId: item.imdbId,
      trailerYoutubeId: item.trailerYoutubeId,
      title: item.title,
      type: item.type,
      year: 2024,
      rating: item.type === 'series' ? 'TV-MA' : 'PG-13',
      imdbScore: 8.5,
      rottenTomatoesScore: 90,
      duration: item.type === 'series' ? 'Series' : 'Feature Film',
      genres: ['Cinema', 'Drama'],
      platforms: ['Max', 'Netflix'],
      primaryPlatform: 'Max',
      tagline: 'Saved to My Downloads',
      description: `${item.title} is saved in your downloads library.`,
      cast: ['Lead Cast'],
      posterUrl: item.posterUrl,
      backdropUrl: item.backdropUrl,
      videoPreviewUrl: item.videoUrl,
      audioTracks: [item.audioTrack || 'English (Dolby Atmos)'],
      subtitles: [item.subtitleTrack || 'English [CC]'],
      features: ['4K Ultra HD'],
      moodTags: ['Downloaded'],
    };
  };

  const handlePlay = (item: DownloadedItem) => {
    const resolved = resolveMediaFromDownload(item);
    onPlayDownloaded(resolved, item.seasonNumber, item.episodeNumber);
  };

  const handleSaveToDevice = async (item: DownloadedItem) => {
    if (isDirectStreamUrl(item.videoUrl)) {
      const fname =
        item.type === 'series'
          ? `${item.title}.S${String(item.seasonNumber || 1).padStart(2, '0')}E${String(
              item.episodeNumber || 1
            ).padStart(2, '0')}.${item.quality}.mp4`.replace(/[^a-zA-Z0-9.-]/g, '_')
          : `${item.title}.${item.quality}.mp4`.replace(/[^a-zA-Z0-9.-]/g, '_');
      await downloadVideoFile(item.videoUrl, fname);
      return;
    }

    const resolved = resolveMediaFromDownload(item);
    if (onDownloadItem) {
      onDownloadItem(resolved, item.seasonNumber, item.episodeNumber);
    }
  };

  return (
    <div className="w-full px-4 sm:px-8 md:px-12 lg:px-16 xl:px-20 max-w-[2400px] mx-auto py-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white font-display tracking-tight">
            My Downloads
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Your saved movies and episodes ready to watch or download to your device.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {downloads.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm('Delete all downloaded titles from your library?')) {
                  clearAllDownloads();
                }
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete All</span>
            </button>
          )}
        </div>
      </div>

      {/* Storage Breakdown Widget */}
      <div className="p-6 rounded-3xl bg-[#0E121B] border border-white/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Local Device Storage
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold font-mono text-white">
                {(storageStats.freeSpaceMb / 1024).toFixed(1)} GB Free
              </span>
              <span className="text-xs text-slate-400 font-mono">
                of {(storageStats.totalDeviceMb / 1024).toFixed(0)} GB total
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-rose-600" />
              <span className="text-slate-300">
                MullahMax ({(storageStats.usedByMullahMaxMb / 1024).toFixed(1)} GB)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-slate-600" />
              <span className="text-slate-400">System &amp; Apps</span>
            </div>
          </div>
        </div>

        {/* Multi-segment Storage Bar */}
        <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden flex">
          <div
            className="bg-slate-600 h-full"
            style={{
              width: `${(storageStats.usedBySystemMb / storageStats.totalDeviceMb) * 100}%`,
            }}
            title="System & other apps"
          />
          <div
            className="bg-rose-600 h-full transition-all duration-500"
            style={{
              width: `${(storageStats.usedByMullahMaxMb / storageStats.totalDeviceMb) * 100}%`,
            }}
            title="MullahMax Storage"
          />
        </div>
      </div>

      {/* Active Downloading Queue */}
      {activeDownloads.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-bold text-white font-display flex items-center gap-2">
            <Download className="w-4 h-4 text-rose-500 animate-bounce" />
            Downloading Queue ({activeDownloads.length})
          </h2>

          <div className="space-y-3">
            {activeDownloads.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-[#0E121B] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4">
                  {item.posterUrl ? (
                    <img
                      src={item.posterUrl}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="w-12 h-16 object-cover rounded-lg shrink-0"
                    />
                  ) : null}
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {item.title}
                      {item.episodeTitle && ` — Ep: ${item.episodeTitle}`}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                      <span className="font-mono uppercase text-rose-400 font-bold">
                        {item.quality}
                      </span>
                      <span>·</span>
                      <span className="font-mono">{(item.sizeMb / 1024).toFixed(1)} GB</span>
                      <span>·</span>
                      <span className="text-amber-400 font-semibold">
                        {item.status} ({item.progress}%)
                      </span>
                    </div>

                    <div className="w-48 sm:w-64 h-1.5 bg-white/10 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full bg-rose-600 transition-all duration-300"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  {item.status === 'downloading' ? (
                    <button
                      onClick={() => pauseDownload(item.id)}
                      className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 transition-colors"
                      title="Pause download"
                    >
                      <Pause className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => resumeDownload(item.id)}
                      className="p-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors"
                      title="Resume download"
                    >
                      <Play className="w-4 h-4 fill-current" />
                    </button>
                  )}
                  <button
                    onClick={() => removeDownload(item.id)}
                    className="p-2 rounded-lg bg-white/5 hover:bg-rose-600/20 text-slate-400 hover:text-rose-400 transition-colors"
                    title="Cancel download"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed Downloads */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white font-display flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Downloaded Titles ({completedDownloads.length})
          </h2>
        </div>

        {completedDownloads.length === 0 ? (
          <div className="text-center py-16 px-4 rounded-3xl bg-[#0E121B] border border-white/5 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-rose-600/20 text-rose-400 flex items-center justify-center mx-auto">
              <HardDrive className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white font-display">Your Downloads Are Empty</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Save any movie or series episode to watch quickly or download directly to your device.
            </p>
            <button
              onClick={onExploreCatalog}
              className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-lg cursor-pointer"
            >
              Browse Streaming Catalog
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {completedDownloads.map((item) => (
              <div
                key={item.id}
                className="group relative p-4 rounded-2xl bg-[#0E121B] hover:bg-[#131824] border border-white/10 transition-all flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="relative w-16 h-22 rounded-xl overflow-hidden shrink-0 border border-white/10 bg-slate-900">
                    {item.posterUrl ? (
                      <img
                        src={item.posterUrl}
                        alt={item.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : null}
                    <button
                      onClick={() => handlePlay(item)}
                      className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity cursor-pointer"
                    >
                      <Play className="w-6 h-6 fill-current" />
                    </button>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-white/10 text-white">
                        {item.quality.toUpperCase()}
                      </span>
                      <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Ready
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-white truncate">{item.title}</h3>

                    {item.episodeTitle && (
                      <p className="text-xs text-slate-400 truncate">
                        S{item.seasonNumber}:E{item.episodeNumber} · {item.episodeTitle}
                      </p>
                    )}

                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                      <span className="font-mono">{(item.sizeMb / 1024).toFixed(1)} GB</span>
                      <span>·</span>
                      <span className="truncate">{item.audioTrack}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handlePlay(item)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white text-slate-950 hover:bg-slate-200 text-xs font-bold transition-all cursor-pointer shadow-md"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Watch</span>
                  </button>

                  <button
                    onClick={() => handleSaveToDevice(item)}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-rose-300 hover:text-white transition-colors cursor-pointer"
                    title="Download movie file to your device"
                  >
                    <ArrowDownToLine className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => removeDownload(item.id)}
                    className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    title="Remove from downloads"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
