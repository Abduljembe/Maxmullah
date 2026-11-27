import React, { useState } from 'react';
import {
  X,
  UserPlus,
  Sparkles,
  Trash2,
  Pencil,
  Cloud,
  LogIn,
  LogOut,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { StreamingPlatform, UserProfile } from '../../types';
import { useProfile } from '../../context/ProfileContext';
import { useAuth } from '../../context/AuthContext';
import { PLATFORM_INFO } from '../../data/mediaData';

interface ProfileModalProps {
  onClose: () => void;
  onOpenAuth?: () => void;
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

export const ProfileModal: React.FC<ProfileModalProps> = ({ onClose, onOpenAuth }) => {
  const {
    currentProfile,
    profiles,
    isCloudSynced,
    isLoadingProfiles,
    switchProfile,
    createProfile,
    updateProfileDetails,
    deleteProfile,
  } = useProfile();
  const { user, isEmailVerified, logout } = useAuth();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState('');
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0]);
  const [isKidsProfile, setIsKidsProfile] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(['Sci-Fi', 'Thriller']);
  const [selectedPlatforms, setSelectedPlatforms] = useState<StreamingPlatform[]>([
    'Netflix',
    'Max',
    'Apple TV+',
  ]);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState('');

  const openCreateForm = () => {
    setActionError('');
    setConfirmDeleteId(null);
    setEditingProfileId(null);
    setProfileName('');
    setAvatarColor(AVATAR_COLORS[profiles.length % AVATAR_COLORS.length]);
    setIsKidsProfile(false);
    setSelectedGenres(['Sci-Fi', 'Thriller']);
    setSelectedPlatforms(['Netflix', 'Max', 'Apple TV+']);
    setIsFormOpen(true);
  };

  const openEditForm = (profile: UserProfile) => {
    setActionError('');
    setConfirmDeleteId(null);
    setEditingProfileId(profile.id);
    setProfileName(profile.name);
    setAvatarColor(profile.avatarColor || AVATAR_COLORS[0]);
    setIsKidsProfile(Boolean(profile.isKids));
    setSelectedGenres(profile.favoriteGenres.length ? profile.favoriteGenres : ['Drama']);
    setSelectedPlatforms(
      profile.preferredPlatforms.length ? profile.preferredPlatforms : ['Netflix']
    );
    setIsFormOpen(true);
  };

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

  const handleSubmitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = profileName.trim();
    if (!clean) return;

    setActionError('');
    setIsSaving(true);
    try {
      if (editingProfileId) {
        await updateProfileDetails(editingProfileId, {
          name: clean,
          avatar: clean.charAt(0).toUpperCase(),
          avatarColor,
          isKids: isKidsProfile,
          favoriteGenres: selectedGenres,
          preferredPlatforms: selectedPlatforms,
        });
      } else {
        await createProfile({
          name: clean,
          avatar: clean.charAt(0).toUpperCase(),
          avatarColor,
          isKids: isKidsProfile,
          favoriteGenres: selectedGenres,
          preferredPlatforms: selectedPlatforms,
        });
      }
      setIsFormOpen(false);
      setEditingProfileId(null);
      setProfileName('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not save profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async (profileId: string) => {
    setActionError('');
    setIsSaving(true);
    try {
      await deleteProfile(profileId);
      setConfirmDeleteId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete profile.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSwitchProfile = async (profileId: string) => {
    setActionError('');
    try {
      await switchProfile(profileId);
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not switch profile.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-3xl bg-[#0E121B] border border-white/15 p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto no-scrollbar"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
          <div>
            <h3 className="text-xl font-bold text-white font-display">
              {isFormOpen
                ? editingProfileId
                  ? 'Edit Profile'
                  : 'Create New Profile'
                : "Who's Watching?"}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Each profile maintains its own watchlist, watch history, and taste profile.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Close profiles modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Account & Cloud Sync Banner */}
        <div className="mb-5 p-4 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {user ? (
            <>
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-white truncate">
                    {user.displayName || user.email || 'Account'}
                  </span>
                  {isEmailVerified ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-300">
                      <Cloud className="w-3 h-3" />
                      {isCloudSynced ? 'Cloud Synced' : 'Account Active'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-300">
                      <AlertCircle className="w-3 h-3" />
                      Verify Email to Sync
                    </span>
                  )}
                </div>
                {user.email && (
                  <p className="text-xs text-slate-400 truncate">{user.email}</p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!isEmailVerified && onOpenAuth && (
                  <button
                    type="button"
                    onClick={onOpenAuth}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Verify Email
                  </button>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    await logout();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-white">Guest Mode (This Device Only)</p>
                <p className="text-xs text-slate-400">
                  Sign in or create an account to save &amp; sync multiple profiles across devices.
                </p>
              </div>
              {onOpenAuth && (
                <button
                  type="button"
                  onClick={onOpenAuth}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer shadow-lg"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In / Sign Up</span>
                </button>
              )}
            </>
          )}
        </div>

        {actionError && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-xs text-rose-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{actionError}</span>
          </div>
        )}

        {!isFormOpen ? (
          <div className="space-y-6">
            {isLoadingProfiles && (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
                <span>Syncing account profiles...</span>
              </div>
            )}

            {/* Profiles Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {profiles.map((p) => {
                const isActive = p.id === currentProfile.id;
                const isConfirmingDelete = confirmDeleteId === p.id;

                return (
                  <div
                    key={p.id}
                    className={`group relative flex flex-col items-center p-4 rounded-2xl border transition-all ${
                      isActive
                        ? 'bg-rose-600/15 border-rose-500 shadow-lg shadow-rose-950/40'
                        : 'bg-white/5 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {/* Action Icons (Edit / Delete) */}
                    <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
                      <button
                        type="button"
                        onClick={() => openEditForm(p)}
                        className="p-1.5 rounded-lg bg-black/40 text-slate-300 hover:text-white hover:bg-black/70 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                        title={`Edit ${p.name}`}
                        aria-label={`Edit ${p.name}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>

                      {profiles.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDeleteId(isConfirmingDelete ? null : p.id)
                          }
                          className="p-1.5 rounded-lg bg-black/40 text-slate-300 hover:text-rose-400 hover:bg-black/70 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                          title={`Delete ${p.name}`}
                          aria-label={`Delete ${p.name}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Switch Profile Click Area */}
                    <button
                      type="button"
                      onClick={() => handleSwitchProfile(p.id)}
                      className="flex flex-col items-center w-full cursor-pointer focus:outline-none"
                    >
                      <div
                        className={`relative w-16 h-16 rounded-2xl bg-gradient-to-br ${p.avatarColor} flex items-center justify-center text-white text-2xl font-bold font-display shadow-md mb-2 group-hover:scale-105 transition-transform`}
                      >
                        {p.avatar}
                        {p.isKids && (
                          <span className="absolute -bottom-1.5 px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 text-[9px] font-black tracking-wider uppercase shadow">
                            KIDS
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-bold text-white truncate max-w-[110px] mt-1">
                        {p.name}
                      </span>
                      {isActive ? (
                        <span className="text-[10px] text-rose-400 font-bold mt-1 flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          Active
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 mt-1">Switch</span>
                      )}
                    </button>

                    {/* Inline Delete Confirmation */}
                    {isConfirmingDelete && (
                      <div className="mt-3 w-full pt-2.5 border-t border-white/10 flex flex-col gap-1.5">
                        <span className="text-[10px] text-rose-300 font-semibold text-center">
                          Delete &ldquo;{p.name}&rdquo;?
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleConfirmDelete(p.id)}
                            className="flex-1 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold cursor-pointer"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => setConfirmDeleteId(null)}
                            className="flex-1 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-[10px] font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add Profile Tile */}
              <button
                type="button"
                onClick={openCreateForm}
                className="flex flex-col items-center justify-center p-4 rounded-2xl border border-dashed border-white/20 hover:border-rose-500/60 hover:bg-white/5 transition-all cursor-pointer text-slate-400 hover:text-white min-h-[140px]"
              >
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-2">
                  <UserPlus className="w-6 h-6" />
                </div>
                <span className="text-xs font-semibold">Add Profile</span>
              </button>
            </div>

            {/* Active Profile Taste Summary */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="text-slate-400">Active Profile Taste Model</span>
                <span className="text-rose-400 flex items-center gap-1 font-bold">
                  <Sparkles className="w-3.5 h-3.5" />
                  {currentProfile.name}
                  {currentProfile.isKids && ' · Kids'}
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
                Watched {currentProfile.watchHistory.length} titles ·{' '}
                {currentProfile.watchlist.length} saved in Watchlist ·{' '}
                {currentProfile.liked.length} liked
              </p>
            </div>
          </div>
        ) : (
          /* Profile Creation / Edit Form */
          <form onSubmit={handleSubmitProfile} className="space-y-5">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Profile Name
              </label>
              <input
                type="text"
                required
                maxLength={50}
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="e.g. Cinema Room, Family, Alex"
                className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
              />
            </div>

            {/* Avatar Color & Kids Toggle */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-2">
                  Avatar Gradient
                </label>
                <div className="flex items-center gap-2.5">
                  {AVATAR_COLORS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setAvatarColor(col)}
                      className={`w-8 h-8 rounded-full bg-gradient-to-br ${col} cursor-pointer transition-transform ${
                        avatarColor === col ? 'scale-125 ring-2 ring-white' : 'opacity-80'
                      }`}
                      aria-label="Select avatar color"
                    />
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsKidsProfile((prev) => !prev)}
                className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-colors self-start sm:self-end ${
                  isKidsProfile
                    ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                    : 'bg-white/5 border-white/15 text-slate-300 hover:bg-white/10'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Kids Profile</span>
                <span
                  className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    isKidsProfile
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-white/10 text-slate-400'
                  }`}
                >
                  {isKidsProfile ? 'ON' : 'OFF'}
                </span>
              </button>
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
                disabled={isSaving}
                onClick={() => {
                  setIsFormOpen(false);
                  setEditingProfileId(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-bold transition-all shadow-lg flex items-center gap-2 cursor-pointer"
              >
                {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{editingProfileId ? 'Save Changes' : 'Save & Activate Profile'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

