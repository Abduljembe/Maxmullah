import React from 'react';
import { WifiOff, HardDrive, ArrowRight } from 'lucide-react';
import { useOffline } from '../../context/OfflineContext';

export const OfflineBanner: React.FC<{
  onNavigateToDownloads: () => void;
  onOpenTMDBSettings?: () => void;
}> = ({ onNavigateToDownloads }) => {
  const { isOffline, downloads } = useOffline();

  // Only show banner when user is genuinely offline, just like a real streaming app
  if (!isOffline) return null;

  const completedDownloadsCount = downloads.filter((d) => d.status === 'completed').length;

  return (
    <div className="w-full py-2 transition-colors text-xs font-medium border-b bg-amber-950/60 border-amber-600/40 text-amber-200">
      <div className="w-full px-4 sm:px-8 md:px-12 lg:px-16 xl:px-20 max-w-[2400px] mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            You are offline — {completedDownloadsCount} downloaded{' '}
            {completedDownloadsCount === 1 ? 'title' : 'titles'} ready to watch
          </span>
        </div>

        <button
          onClick={onNavigateToDownloads}
          className="flex items-center gap-1.5 text-white hover:text-amber-300 font-semibold underline underline-offset-4 cursor-pointer"
        >
          <HardDrive className="w-3.5 h-3.5" />
          <span>Go to Downloads</span>
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
