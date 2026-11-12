import React, { useState } from 'react';
import { X, UserPlus, Check, Sparkles, Trash2, Heart } from 'lucide-react';
import { StreamingPlatform, UserProfile } from '../../types';
import { useProfile } from '../../context/ProfileContext';
import { PLATFORM_INFO } from '../../data/mediaData';

interface ProfileModalProps {
  onClose: () => void;
}

const ALL_GENRES = [
  'Sci-Fi',
  'Drama',
  'Comedy',
  'Action',
  'Thriller',
  'Crime',
  'Psychological Thriller',
  'Animation',
  'Fantasy',
  'Adventure',
  'Mystery',
  'Biography',
  'History',
  'Western',
];

const AVATAR_COLORS = [
  'from-amber-500 to-rose-600',
  'from-emerald-400 to-teal-600',
  'from-blue-500 to-indigo-600',
  'from-purple-500 to-pink-600',
  'from-rose-500 to-orange-500',
  'from-cyan-400 to-blue-600',
];

export const ProfileModal: React.FC<ProfileModalProps> = ({ onClose }) => {
  const { currentProfile, profiles, switchProfile, createProfile, deleteProfile } = useProfile();

  const [isCreating, setIsCreating] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newAvatarColor, setNewAvatarColor] = useState(AVATAR_COLORS[0]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(['Sci-Fi', 'Thriller']);
  const [selectedPlatforms, setSelectedPlatforms] = useState<StreamingPlatform[]>([
    'Netflix',
    'Max',
    'Apple TV+',
  ]);

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]
    );
  };

  const togglePlatform = (platform: StreamingPlatform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim()) return;

    createProfile({
      name: newProfileName.trim(),
      avatar: newProfileName.trim().charAt(0).toUpperCase(),
      avatarColor: newAvatarColor,
      favoriteGenres: selectedGenres,
      preferredPlatforms: selectedPlatforms,
    });

    setIsCreating(false);
    setNewProfileName('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-xl rounded-3xl bg-[#0E121B] border border-white/15 p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto no-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
          <div>
            <h3 className="text-xl font-bold text-white font-display">Manage Profiles</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Personalized recommendations and taste algorithms adapt to each viewer.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isCreating ? (
          <div className="space-y-6">
            {/* Profiles Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {profiles.map((p) => {
                const isActive = p.id === currentProfile.id;

                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      switchProfile(p.id);
                      onClose();
                    }}
                    className={`group relative flex flex-col items-center p-4 rounded-2xl border transition-all cursor-pointer ${
                      isActive
                        ? 'bg-rose-600/15 border-rose-500 shadow-lg shadow-rose-950/40'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    <div
                      className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${p.avatarColor} flex items-center justify-center text-white text-2xl font-bold font-display shadow-md mb-2 group-hover:scale-105 transition-transform`}
                    >
                      {p.avatar}
                    </div>
                    <span className="text-sm font-bold text-white truncate max-w-[100px]">
                      {p.name}
                    </span>
                    {isActive ? (
                      <span className="text-[10px] text-rose-400 font-bold mt-1">Active</span>
                    ) : (
                      <span className="text-[10px] text-slate-400 mt-1">Switch</span>
                    )}

                    {profiles.length > 1 && !isActive && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete profile "${p.name}"?`)) {
                            deleteProfile(p.id);
                          }
                        }}
                        className="absolute top-2 right-2 p-1 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Delete Profile"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </button>
                );
              })}

              {/* Add Profile Tile */}
              <button
                onClick={() => setIsCreating(true)}
                className="flex flex-col items-center justify-center p-4 rounded-2xl border border-dashed border-white/20 hover:border-rose-500/60 hover:bg-white/5 transition-all cursor-pointer text-slate-400 hover:text-white"
              >
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-2">
                  <UserPlus className="w-6 h-6" />
                </div>
                <span className="text-xs font-semibold">New Profile</span>
              </button>
            </div>

            {/* Active Profile Taste Summary */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-400">Current Taste Model</span>
                <span className="text-rose-400 flex items-center gap-1 font-bold">
                  <Sparkles className="w-3.5 h-3.5" />
                  {currentProfile.name}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {currentProfile.favoriteGenres.map((g) => (
                  <span
                    key={g}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-white/10 text-white font-medium"
                  >
                    {g}
                  </span>
                ))}
              </div>
              <p className="text-xs text-slate-400">
                Watched {currentProfile.watchHistory.length} titles · {currentProfile.watchlist.length} saved in Watchlist · {currentProfile.liked.length} liked
              </p>
            </div>
          </div>
        ) : (
          /* Profile Creation Form */
          <form onSubmit={handleCreate} className="space-y-5">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Profile Name
              </label>
              <input
                type="text"
                required
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="e.g. Cinema Room, Family, Alex"
                className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            {/* Avatar Color */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Avatar Gradient
              </label>
              <div className="flex items-center gap-2">
                {AVATAR_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setNewAvatarColor(col)}
                    className={`w-8 h-8 rounded-full bg-gradient-to-br ${col} cursor-pointer transition-transform ${
                      newAvatarColor === col ? 'scale-125 ring-2 ring-white' : 'opacity-80'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Favorite Genres */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Select Favorite Genres
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_GENRES.map((genre) => {
                  const isSelected = selectedGenres.includes(genre);
                  return (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => toggleGenre(genre)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-rose-600 text-white font-bold'
                          : 'bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {genre}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Preferred Platforms */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Preferred Streaming Services
              </label>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(PLATFORM_INFO).map((platKey) => {
                  const platform = platKey as StreamingPlatform;
                  const isSelected = selectedPlatforms.includes(platform);
                  return (
                    <button
                      key={platform}
                      type="button"
                      onClick={() => togglePlatform(platform)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-white text-slate-950 font-bold'
                          : 'bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {platform}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-lg"
              >
                Save &amp; Activate Profile
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
