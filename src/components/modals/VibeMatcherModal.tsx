import React, { useState } from 'react';
import { X, Sparkles, Play, Check, Star } from 'lucide-react';
import { MediaItem, StreamingPlatform } from '../../types';
import { useProfile } from '../../context/ProfileContext';
import { PLATFORM_INFO } from '../../data/mediaData';

interface VibeMatcherModalProps {
  catalog: MediaItem[];
  onClose: () => void;
  onSelectMedia: (item: MediaItem) => void;
  onPlay: (item: MediaItem) => void;
}

const VIBES = [
  { id: 'Mind-Bending', label: 'Mind-Bending & Sci-Fi', desc: 'Complex plots, paradoxes, cosmic scope' },
  { id: 'Adrenaline', label: 'Late Night Adrenaline', desc: 'High stakes thrillers, intense crime & pacing' },
  { id: 'Prestige Drama', label: 'Prestige Drama', desc: 'Award-winning acting, boardrooms, deep dialogue' },
  { id: 'Heartwarming & Wholesome', label: 'Cozy & Uplifting', desc: 'Feel-good comedy, inspirational stories' },
  { id: 'Cinematic Masterpiece', label: 'Criterion / Masterpiece', desc: 'Landmark visuals, monumental direction' },
];

const TIME_FILTERS = [
  { id: 'any', label: 'Any Duration' },
  { id: 'quick', label: 'Under 45m (Quick Snack)' },
  { id: 'movie', label: '1 - 2 Hours (Standard Movie)' },
  { id: 'epic', label: '2+ Hours (Epic Feature)' },
  { id: 'series', label: 'Multi-Season Binge' },
];

export const VibeMatcherModal: React.FC<VibeMatcherModalProps> = ({
  catalog,
  onClose,
  onSelectMedia,
  onPlay,
}) => {
  const { currentProfile } = useProfile();

  const [selectedVibe, setSelectedVibe] = useState(VIBES[0].id);
  const [selectedDuration, setSelectedDuration] = useState('any');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('any');

  // Filter & Rank Catalog based on vibe + duration + platform
  const matchedResults = catalog
    .filter((item) => {
      // Platform filter
      if (selectedPlatform !== 'any' && !item.platforms.includes(selectedPlatform as StreamingPlatform)) {
        return false;
      }
      // Duration filter
      if (selectedDuration === 'series' && item.type !== 'series') return false;
      if (selectedDuration === 'movie' && item.type !== 'movie') return false;
      if (selectedDuration === 'quick' && item.type === 'movie' && (item.durationMinutes || 90) > 45) return false;
      if (selectedDuration === 'epic' && item.type === 'movie' && (item.durationMinutes || 0) < 130) return false;

      return true;
    })
    .map((item) => {
      let score = 70;
      if (item.moodTags.some((m) => m.toLowerCase().includes(selectedVibe.toLowerCase()))) {
        score += 20;
      }
      if (item.genres.some((g) => currentProfile.favoriteGenres.includes(g))) {
        score += 10;
      }
      if (item.rottenTomatoesScore > 90) {
        score += 8;
      }
      return { item, matchScore: Math.min(99, score) };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 4);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-3xl bg-[#0E121B] border border-white/15 p-6 sm:p-8 shadow-2xl text-slate-100 max-h-[92vh] overflow-y-auto no-scrollbar">
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-white/10 mb-6">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-rose-500 font-bold uppercase tracking-wider mb-1">
              <Sparkles className="w-4 h-4" />
              <span>Smart Taste Matcher</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white font-display">
              What are you in the mood for, {currentProfile.name}?
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Filter across Netflix, Max, Apple TV+, and 8 other networks in real-time.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. Pick Vibe */}
        <div className="space-y-3 mb-6">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            1. Select Your Current Vibe
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {VIBES.map((v) => {
              const isSelected = selectedVibe === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedVibe(v.id)}
                  className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-rose-600/20 border-rose-500 text-white'
                      : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300'
                  }`}
                >
                  <div className="text-xs font-bold text-white flex items-center justify-between">
                    <span>{v.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-rose-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{v.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Target Duration & Platform Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              2. Available Time
            </label>
            <select
              value={selectedDuration}
              onChange={(e) => setSelectedDuration(e.target.value)}
              className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
            >
              {TIME_FILTERS.map((tf) => (
                <option key={tf.id} value={tf.id} className="bg-slate-900 text-white">
                  {tf.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              3. Streaming Network
            </label>
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
            >
              <option value="any" className="bg-slate-900 text-white">
                All Major Platforms Combined
              </option>
              {Object.keys(PLATFORM_INFO).map((plat) => (
                <option key={plat} value={plat} className="bg-slate-900 text-white">
                  {plat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Results Stream */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Top Recommendations for You ({matchedResults.length})
            </span>
          </div>

          <div className="space-y-3">
            {matchedResults.map(({ item, matchScore }) => (
              <div
                key={item.id}
                className="group p-3 sm:p-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all flex items-center justify-between gap-4"
              >
                <div
                  onClick={() => {
                    onPlay(item);
                    onClose();
                  }}
                  className="flex items-center gap-3.5 min-w-0 cursor-pointer"
                >
                  {item.posterUrl ? (
                    <img
                      src={item.posterUrl}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="w-12 h-16 object-cover rounded-lg shrink-0 border border-white/10"
                    />
                  ) : null}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 text-[11px] text-slate-300 tabular-nums">
                      {item.imdbScore > 0 && (
                        <>
                          <span className="inline-flex items-center gap-1 font-bold text-amber-400">
                            <Star className="w-3 h-3 fill-amber-400" />
                            {item.imdbScore.toFixed(1)}
                          </span>
                          <span className="text-slate-500">·</span>
                        </>
                      )}
                      <span>{item.year}</span>
                      <span className="text-slate-500">·</span>
                      <span>{item.duration}</span>
                    </div>

                    <h4 className="text-sm font-bold text-white truncate">{item.title}</h4>
                    <p className="text-xs text-slate-400 truncate max-w-sm">
                      {item.genres.join(', ')} · Available on {item.platforms.join(', ')}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      onPlay(item);
                      onClose();
                    }}
                    className="p-2.5 rounded-xl bg-white text-slate-950 hover:bg-slate-200 font-bold text-xs transition-colors cursor-pointer"
                    title="Play Now"
                  >
                    <Play className="w-4 h-4 fill-current" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
