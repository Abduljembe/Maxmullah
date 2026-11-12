import React, { createContext, useContext, useEffect, useState } from 'react';
import { StreamingPlatform, UserProfile } from '../types';

interface ProfileContextType {
  currentProfile: UserProfile;
  profiles: UserProfile[];
  switchProfile: (profileId: string) => void;
  createProfile: (profile: Omit<UserProfile, 'id' | 'watchlist' | 'liked' | 'disliked' | 'watchHistory'>) => void;
  deleteProfile: (profileId: string) => void;
  toggleWatchlist: (mediaId: string) => void;
  isInWatchlist: (mediaId: string) => boolean;
  rateMedia: (mediaId: string, rating: 'like' | 'dislike' | 'neutral') => void;
  getMediaRating: (mediaId: string) => 'like' | 'dislike' | 'neutral';
  updateWatchProgress: (mediaId: string, progressPercentage: number, season?: number, episode?: number) => void;
  activeMood: string | undefined;
  setActiveMood: (mood: string | undefined) => void;
}

const DEFAULT_PROFILES: UserProfile[] = [
  {
    id: 'profile-aziz',
    name: 'Aziz',
    avatar: 'A',
    avatarColor: 'from-amber-500 to-rose-600',
    favoriteGenres: ['Sci-Fi', 'Psychological Thriller', 'Prestige Drama', 'Crime'],
    preferredPlatforms: ['Max', 'Apple TV+', 'Netflix', 'Criterion Channel'],
    watchlist: ['dune-part-two', 'severance-apple', 'seven-samurai'],
    liked: ['dune-part-two', 'deadpool-and-wolverine', 'severance-apple'],
    disliked: [],
    watchHistory: [
      { mediaId: 'dune-part-two', watchedAt: Date.now() - 3600000 * 24, progressPercentage: 85 },
      { mediaId: 'deadpool-and-wolverine', watchedAt: Date.now() - 3600000 * 48, progressPercentage: 100 },
      { mediaId: 'oppenheimer-universal', watchedAt: Date.now() - 3600000 * 72, progressPercentage: 42 },
    ],
  },
  {
    id: 'profile-sophia',
    name: 'Sophia',
    avatar: 'S',
    avatarColor: 'from-emerald-400 to-teal-600',
    favoriteGenres: ['Comedy', 'Mystery', 'Drama', 'Thriller'],
    preferredPlatforms: ['Hulu', 'Netflix', 'Peacock'],
    watchlist: ['the-bear-fx', 'ted-lasso-apple'],
    liked: ['the-bear-fx', 'ted-lasso-apple'],
    disliked: [],
    watchHistory: [
      { mediaId: 'the-bear-fx', watchedAt: Date.now() - 3600000 * 12, progressPercentage: 70, season: 1, episode: 1 },
    ],
  },
  {
    id: 'profile-family',
    name: 'Family & Kids',
    avatar: 'F',
    avatarColor: 'from-blue-500 to-indigo-600',
    favoriteGenres: ['Animation', 'Adventure', 'Fantasy', 'Family'],
    preferredPlatforms: ['Disney+', 'Prime Video', 'Crunchyroll'],
    watchlist: ['attack-on-titan', 'andor-starwars'],
    liked: ['andor-starwars'],
    disliked: [],
    watchHistory: [],
  },
  {
    id: 'profile-cinephile',
    name: 'Cinephile Master',
    avatar: 'C',
    avatarColor: 'from-purple-500 to-pink-600',
    favoriteGenres: ['Art House', 'History', 'Crime', 'Biography'],
    preferredPlatforms: ['Criterion Channel', 'Max', 'Apple TV+'],
    watchlist: ['seven-samurai', 'parasite-criterion', 'oppenheimer-universal'],
    liked: ['seven-samurai', 'parasite-criterion'],
    disliked: [],
    watchHistory: [],
  },
];

const PROFILES_STORAGE_KEY = 'mullahmax_profiles_v1';
const CURRENT_PROFILE_KEY = 'mullahmax_active_profile_id_v1';

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profiles, setProfiles] = useState<UserProfile[]>(() => {
    try {
      const stored = localStorage.getItem(PROFILES_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return DEFAULT_PROFILES;
  });

  const [currentProfileId, setCurrentProfileId] = useState<string>(() => {
    try {
      const storedId = localStorage.getItem(CURRENT_PROFILE_KEY);
      if (storedId && profiles.some((p) => p.id === storedId)) {
        return storedId;
      }
    } catch {}
    return profiles[0]?.id || DEFAULT_PROFILES[0].id;
  });

  const [activeMood, setActiveMood] = useState<string | undefined>(undefined);

  // Sync to local storage
  useEffect(() => {
    try {
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profiles));
    } catch {}
  }, [profiles]);

  useEffect(() => {
    try {
      localStorage.setItem(CURRENT_PROFILE_KEY, currentProfileId);
    } catch {}
  }, [currentProfileId]);

  const currentProfile = profiles.find((p) => p.id === currentProfileId) || profiles[0];

  const switchProfile = (profileId: string) => {
    if (profiles.some((p) => p.id === profileId)) {
      setCurrentProfileId(profileId);
    }
  };

  const createProfile = (
    data: Omit<UserProfile, 'id' | 'watchlist' | 'liked' | 'disliked' | 'watchHistory'>
  ) => {
    const newProfile: UserProfile = {
      ...data,
      id: `profile-${Date.now()}`,
      watchlist: [],
      liked: [],
      disliked: [],
      watchHistory: [],
    };
    setProfiles((prev) => [...prev, newProfile]);
    setCurrentProfileId(newProfile.id);
  };

  const deleteProfile = (profileId: string) => {
    if (profiles.length <= 1) return; // Prevent deleting the last profile
    setProfiles((prev) => prev.filter((p) => p.id !== profileId));
    if (currentProfileId === profileId) {
      const remaining = profiles.filter((p) => p.id !== profileId);
      setCurrentProfileId(remaining[0].id);
    }
  };

  const toggleWatchlist = (mediaId: string) => {
    setProfiles((prev) =>
      prev.map((p) => {
        if (p.id !== currentProfileId) return p;
        const exists = p.watchlist.includes(mediaId);
        const nextWatchlist = exists
          ? p.watchlist.filter((id) => id !== mediaId)
          : [...p.watchlist, mediaId];
        return { ...p, watchlist: nextWatchlist };
      })
    );
  };

  const isInWatchlist = (mediaId: string) => {
    return currentProfile.watchlist.includes(mediaId);
  };

  const rateMedia = (mediaId: string, rating: 'like' | 'dislike' | 'neutral') => {
    setProfiles((prev) =>
      prev.map((p) => {
        if (p.id !== currentProfileId) return p;
        const liked = p.liked.filter((id) => id !== mediaId);
        const disliked = p.disliked.filter((id) => id !== mediaId);

        if (rating === 'like') {
          liked.push(mediaId);
        } else if (rating === 'dislike') {
          disliked.push(mediaId);
        }

        return { ...p, liked, disliked };
      })
    );
  };

  const getMediaRating = (mediaId: string): 'like' | 'dislike' | 'neutral' => {
    if (currentProfile.liked.includes(mediaId)) return 'like';
    if (currentProfile.disliked.includes(mediaId)) return 'dislike';
    return 'neutral';
  };

  const updateWatchProgress = (
    mediaId: string,
    progressPercentage: number,
    season?: number,
    episode?: number
  ) => {
    setProfiles((prev) =>
      prev.map((p) => {
        if (p.id !== currentProfileId) return p;
        const history = p.watchHistory.filter((h) => h.mediaId !== mediaId);
        history.unshift({
          mediaId,
          watchedAt: Date.now(),
          progressPercentage,
          season,
          episode,
        });
        return { ...p, watchHistory: history };
      })
    );
  };

  return (
    <ProfileContext.Provider
      value={{
        currentProfile,
        profiles,
        switchProfile,
        createProfile,
        deleteProfile,
        toggleWatchlist,
        isInWatchlist,
        rateMedia,
        getMediaRating,
        updateWatchProgress,
        activeMood,
        setActiveMood,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
};
