import React, { useState } from 'react';
import { DownloadCloud, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        onClick={install}
        className={`flex items-center gap-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium transition-colors cursor-pointer shadow-md ${
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-1.5 text-xs'
        }`}
        title="Install MullahMax app for fast offline streaming"
      >
        <DownloadCloud className="w-3.5 h-3.5" />
        <span className="whitespace-nowrap">Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/5 hover:bg-white/10 text-white font-medium transition-colors cursor-pointer ${
            compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-xs'
          }`}
          title="Install on iOS Home Screen"
        >
          <Smartphone className="w-3.5 h-3.5 text-rose-400" />
          <span className="whitespace-nowrap">Install App</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-[#121620] border border-white/15 p-6 shadow-2xl text-slate-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-white">Install MullahMax on iOS</h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">
                Install MullahMax to your iPhone / iPad home screen for zero-latency playback and instant offline access:
              </p>
              <ol className="space-y-2.5 text-xs text-slate-200">
                <li className="flex items-start gap-2.5">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-rose-600/30 text-rose-400 font-bold shrink-0">1</span>
                  <span>Tap the <strong>Share</strong> button in the Safari toolbar.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-rose-600/30 text-rose-400 font-bold shrink-0">2</span>
                  <span>Scroll down and tap <strong>Add to Home Screen</strong>.</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-rose-600/30 text-rose-400 font-bold shrink-0">3</span>
                  <span>Launch MullahMax directly for full-screen offline streaming.</span>
                </li>
              </ol>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full rounded-xl bg-white/10 hover:bg-white/15 py-2.5 text-xs font-semibold text-white transition-colors"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
