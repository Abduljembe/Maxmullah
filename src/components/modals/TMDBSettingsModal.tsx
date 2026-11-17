import React, { useState } from 'react';
import {
  X,
  Check,
  Globe,
  CheckCircle2,
  Film,
  PlaySquare,
  Server,
  Palette,
} from 'lucide-react';
import { getTMDBApiKey, saveTMDBApiKey } from '../../services/tmdbService';
import {
  getVideoProviderConfig,
  saveVideoProviderConfig,
  VIDUKI_SERVERS,
  AnyServerId,
  VideoStreamProvider,
} from '../../services/videoProviderService';

interface TMDBSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReloadCatalog: () => void;
}

export const TMDBSettingsModal: React.FC<TMDBSettingsModalProps> = ({
  isOpen,
  onClose,
  onReloadCatalog,
}) => {
  const [activeTab, setActiveTab] = useState<'videoProvider' | 'tmdb'>('videoProvider');
  const [providerCfg, setProviderCfg] = useState(getVideoProviderConfig());
  const [tmdbKey, setTmdbKey] = useState(getTMDBApiKey());
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSaveVideoProvider = (e: React.FormEvent) => {
    e.preventDefault();
    saveVideoProviderConfig(providerCfg);
    setSavedBanner('Default streaming server and theme saved.');
    setTimeout(() => setSavedBanner(null), 3500);
  };

  const handleSaveTMDB = async (e: React.FormEvent) => {
    e.preventDefault();
    saveTMDBApiKey(tmdbKey);
    setSavedBanner('Metadata settings saved.');
    setTimeout(() => setSavedBanner(null), 3000);
    onReloadCatalog();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div className="w-full max-w-xl rounded-3xl bg-[#0E121B] border border-white/15 p-6 sm:p-7 shadow-2xl text-slate-100 max-h-[92vh] overflow-y-auto no-scrollbar">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-white/10 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-600/20 text-rose-400 flex items-center justify-center">
              <PlaySquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white font-display">
                Playback &amp; Server Preferences
              </h3>
              <p className="text-xs text-slate-400">
                Choose default streaming server, player accent theme, and metadata lookup
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 p-1 rounded-xl bg-white/5 border border-white/10 mb-5 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('videoProvider')}
            className={`flex-1 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'videoProvider'
                ? 'bg-rose-600 text-white font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Film className="w-3.5 h-3.5" />
            <span>Streaming Servers</span>
          </button>

          <button
            onClick={() => setActiveTab('tmdb')}
            className={`flex-1 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'tmdb'
                ? 'bg-rose-600 text-white font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Catalog &amp; Search</span>
          </button>
        </div>

        {/* Success Banner */}
        {savedBanner && (
          <div className="p-3 mb-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{savedBanner}</span>
          </div>
        )}

        {/* TAB 1: Streaming Servers */}
        {activeTab === 'videoProvider' && (
          <form onSubmit={handleSaveVideoProvider} className="space-y-4">
            <div className="space-y-3">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-rose-400" />
                <span>Default Playback Server</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {VIDUKI_SERVERS.map((srv) => (
                  <button
                    key={srv.id}
                    type="button"
                    onClick={() =>
                      setProviderCfg({
                        ...providerCfg,
                        provider: srv.id as VideoStreamProvider,
                        vidukiServer: srv.id as AnyServerId,
                      })
                    }
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      providerCfg.vidukiServer === srv.id
                        ? 'bg-rose-600/20 border-rose-500 text-white'
                        : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold mb-1">
                      <span className="truncate pr-2">{srv.name}</span>
                      <span className="text-[10px] text-rose-300 font-mono shrink-0">{srv.tag}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight line-clamp-2">
                      {srv.description}
                    </p>
                  </button>
                ))}
              </div>

              {/* Accent Color Hex Parameter */}
              <div className="pt-2 border-t border-white/10">
                <label className="text-xs font-semibold text-slate-300 flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-rose-400" />
                    Player Accent Color
                  </span>
                  <span className="text-[10px] text-slate-400">Hex without #</span>
                </label>
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg border border-white/20 shrink-0"
                    style={{ backgroundColor: `#${providerCfg.accentColor || 'e50914'}` }}
                  />
                  <input
                    type="text"
                    value={providerCfg.accentColor}
                    onChange={(e) =>
                      setProviderCfg({
                        ...providerCfg,
                        accentColor: e.target.value.replace('#', '').trim(),
                      })
                    }
                    placeholder="e50914"
                    className="flex-1 bg-white/5 border border-white/15 focus:border-rose-500 rounded-xl px-3.5 py-2 text-xs text-white font-mono placeholder-slate-500 focus:outline-none"
                  />
                  {['e50914', '3b82f6', '10b981', '8b5cf6', 'f59e0b'].map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setProviderCfg({ ...providerCfg, accentColor: col })}
                      className="w-6 h-6 rounded-md border border-white/20 cursor-pointer transition-transform hover:scale-110"
                      style={{ backgroundColor: `#${col}` }}
                      title={`Select #${col}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
              >
                Close
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Settings</span>
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: Metadata & TMDB Key */}
        {activeTab === 'tmdb' && (
          <form onSubmit={handleSaveTMDB} className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
              <div className="flex items-center justify-between text-xs font-semibold mb-1">
                <span className="text-slate-400">Catalog Engine</span>
                <span className="text-emerald-400 flex items-center gap-1 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Live Discovery Active
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Movies and series load directly from VixSrc, PrimeSrc, and major streaming catalogs automatically.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center justify-between">
                <span>Personal TMDB API Key (Optional)</span>
                {tmdbKey && (
                  <button
                    type="button"
                    onClick={() => {
                      saveTMDBApiKey('');
                      setTmdbKey('');
                      onReloadCatalog();
                    }}
                    className="text-[11px] text-rose-400 hover:text-rose-300 underline cursor-pointer"
                  >
                    Clear Key
                  </button>
                )}
              </label>
              <input
                type="text"
                value={tmdbKey}
                onChange={(e) => setTmdbKey(e.target.value)}
                placeholder="Paste personal TMDB v3 API Key (optional)..."
                className="w-full bg-white/5 border border-white/15 focus:border-rose-500 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none transition-colors"
              />
            </div>

            <div className="pt-3 flex items-center justify-end gap-2 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
              >
                Close
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save Settings</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
