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
  ExternalLink,
  Code,
} from 'lucide-react';
import { getTMDBApiKey, saveTMDBApiKey } from '../../services/tmdbService';
import {
  getVideoProviderConfig,
  saveVideoProviderConfig,
  VideoStreamProvider,
  VIDUKI_SERVERS,
  VidukiServerId,
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

  // Video Provider state (Viduki / VidSrc / MullahMax / Custom)
  const [providerCfg, setProviderCfg] = useState(getVideoProviderConfig());

  // TMDB state
  const [tmdbKey, setTmdbKey] = useState(getTMDBApiKey());
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSaveVideoProvider = (e: React.FormEvent) => {
    e.preventDefault();
    saveVideoProviderConfig(providerCfg);
    setSavedBanner('Viduki & Video Engine settings saved! Stream player will use this configuration.');
    setTimeout(() => setSavedBanner(null), 3500);
  };

  const handleSaveTMDB = async (e: React.FormEvent) => {
    e.preventDefault();
    saveTMDBApiKey(tmdbKey);
    setSavedBanner('TMDB Metadata settings saved successfully.');
    setTimeout(() => setSavedBanner(null), 3000);
    onReloadCatalog();
  };

  const activeServerMeta =
    VIDUKI_SERVERS.find((s) => s.id === providerCfg.vidukiServer) || VIDUKI_SERVERS[0];

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
                Streaming &amp; Viduki APIs
              </h3>
              <p className="text-xs text-slate-400">
                Configure Viduki Net servers 1–4, stream color theme, and movie metadata
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
            <span>Viduki API &amp; Servers</span>
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
            <span>Metadata &amp; Search</span>
          </button>
        </div>

        {/* Success Banner */}
        {savedBanner && (
          <div className="p-3 mb-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{savedBanner}</span>
          </div>
        )}

        {/* TAB 1: Viduki API & Video Stream Engine */}
        {activeTab === 'videoProvider' && (
          <form onSubmit={handleSaveVideoProvider} className="space-y-4">
            {/* Viduki Confirmation Callout */}
            <div className="p-3.5 rounded-2xl bg-rose-600/10 border border-rose-500/30 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <span className="flex items-center gap-1.5 text-rose-400">
                  <CheckCircle2 className="w-4 h-4" />
                  Viduki Net Official Iframe API Active
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-600 text-white uppercase tracking-wider font-mono">
                  Supported
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Viduki embeds work directly with <strong>TMDB IDs</strong> and <strong>IMDb IDs</strong>. No secret API key is needed in the URL. MullahMax resolves all titles to their official identifiers automatically.
              </p>
            </div>

            {/* Select Primary Provider */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">
                Primary Streaming Source
              </label>

              {[
                {
                  id: 'viduki' as VideoStreamProvider,
                  name: 'Viduki Net Iframe API (Official)',
                  desc: 'Supports Server 1 (Multi), Server 2 (Multi-Lang), Server 3 (Embeds), and Server 4 (Premium).',
                },
                {
                  id: 'mullahmax' as VideoStreamProvider,
                  name: 'MullahMax Direct Cinema CDN',
                  desc: 'Direct HTML5 MP4 player with full offline storage capabilities.',
                },
                {
                  id: 'vidsrc' as VideoStreamProvider,
                  name: 'VidSrc Multi-Host Backup',
                  desc: 'Secondary mirror embed resolving movies and TV series.',
                },
                {
                  id: 'custom' as VideoStreamProvider,
                  name: 'Custom Video API Template',
                  desc: 'Specify your own custom streaming server or private URL structure.',
                },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setProviderCfg({ ...providerCfg, provider: opt.id })}
                  className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    providerCfg.provider === opt.id
                      ? 'bg-rose-600/15 border-rose-500 text-white'
                      : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300'
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <span>{opt.name}</span>
                      {providerCfg.provider === opt.id && (
                        <span className="text-[10px] px-2 py-0.2 rounded-full bg-rose-600 text-white font-mono">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{opt.desc}</p>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ml-3 ${
                      providerCfg.provider === opt.id
                        ? 'border-rose-500 bg-rose-600'
                        : 'border-slate-500'
                    }`}
                  >
                    {providerCfg.provider === opt.id && (
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Viduki Server Selection */}
            {providerCfg.provider === 'viduki' && (
              <div className="space-y-3 pt-2 border-t border-white/10">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-rose-400" />
                  Default Viduki Server Cluster
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {VIDUKI_SERVERS.map((srv) => (
                    <button
                      key={srv.id}
                      type="button"
                      onClick={() =>
                        setProviderCfg({ ...providerCfg, vidukiServer: srv.id as VidukiServerId })
                      }
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                        providerCfg.vidukiServer === srv.id
                          ? 'bg-rose-600/20 border-rose-500 text-white'
                          : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-bold mb-1">
                        <span>{srv.name}</span>
                        <span className="text-[10px] text-rose-300 font-mono">{srv.tag}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        {srv.description}
                      </p>
                    </button>
                  ))}
                </div>

                {/* Color Hex Parameter */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-rose-400" />
                      Player Accent Color (?color=hex)
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

                {/* Generated URL Blueprint */}
                <div className="p-3 rounded-xl bg-black/60 border border-white/10 space-y-1">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                    <Code className="w-3 h-3 text-rose-400" />
                    <span>Active Endpoint Blueprint ({activeServerMeta.name})</span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-300 break-all">
                    https://viduki.net/{providerCfg.vidukiServer}/movie/{'{tmdb_id or imdb_id}'}?color=
                    {providerCfg.accentColor || 'e50914'}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 break-all">
                    https://viduki.net/{providerCfg.vidukiServer}/tv/{'{id}'}/{'{season}'}/{'{episode}'}?color=
                    {providerCfg.accentColor || 'e50914'}
                  </div>
                </div>
              </div>
            )}

            {/* Custom Template Field */}
            {providerCfg.provider === 'custom' && (
              <div className="pt-2 animate-in fade-in duration-150 space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">
                  Custom Video Embed Template
                </label>
                <input
                  type="text"
                  value={providerCfg.customTemplate}
                  onChange={(e) =>
                    setProviderCfg({ ...providerCfg, customTemplate: e.target.value })
                  }
                  placeholder="https://viduki.net/1/movie/{id}?color={color}"
                  className="w-full bg-white/5 border border-white/15 focus:border-rose-500 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none"
                />
                <p className="text-[11px] text-slate-400">
                  Supported tokens: <code>{'{id}'}</code>, <code>{'{imdb_id}'}</code>, <code>{'{tmdb_id}'}</code>, <code>{'{season}'}</code>, <code>{'{episode}'}</code>, <code>{'{color}'}</code>.
                </p>
              </div>
            )}

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
                <span>Save Provider Settings</span>
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
                  Dual Live Discovery Active
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                MullahMax searches across major streaming services (Netflix, Max, Disney+, Apple TV+, Prime Video, Hulu, etc.) with zero required API keys.
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
                    Clear TMDB Key
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
              <p className="text-[11px] text-slate-400 mt-1">
                Leave empty to use MullahMax&apos;s built-in live media discovery catalog.
              </p>
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
                <span>Save TMDB Settings</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
