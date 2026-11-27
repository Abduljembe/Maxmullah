import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { StreamingPlatform, UserProfile } from '../types';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from './AuthContext';

interface ProfileContextType {
  currentProfile: UserProfile;
  profiles: UserProfile[];
  isCloudSynced: boolean;
  isLoadingProfiles: boolean;
  switchProfile: (profileId: string) => Promise<void>;
  createProfile: (
    profile: Omit<UserProfile, 'id' | 'watchlist' | 'liked' | 'disliked' | 'watchHistory'>
  ) => Promise<void>;
  updateProfileDetails: (
    profileId: string,
    updates: Partial<Pick<UserProfile, 'name' | 'avatar' | 'avatarColor' | 'isKids' | 'favoriteGenres' | 'preferredPlatforms'>>
  ) => Promise<void>;
  deleteProfile: (profileId: string) => Promise<void>;
  toggleWatchlist: (mediaId: string) => Promise<void>;
  isInWatchlist: (mediaId: string) => boolean;
  rateMedia: (mediaId: string, rating: 'like' | 'dislike' | 'neutral') => Promise<void>;
  getMediaRating: (mediaId: string) => 'like' | 'dislike' | 'neutral';
  updateWatchProgress: (
    mediaId: string,
    progressPercentage: number,
    season?: number,
    episode?: number
  ) => Promise<void>;
  activeMood: string | undefined;
  setActiveMood: (mood: string | undefined) => void;
}

const DEFAULT_GUEST_PROFILES: UserProfile[] = [
  {
    id: 'profile-guest',
    name: 'Guest',
    avatar: 'G',
    avatarColor: 'from-amber-500 to-rose-600',
    isKids: false,
    favoriteGenres: ['Sci-Fi', 'Action', 'Thriller', 'Drama'],
    preferredPlatforms: ['Netflix', 'Max', 'Apple TV+'],
    watchlist: [],
    liked: [],
    disliked: [],
    watchHistory: [],
  },
];

const PROFILES_STORAGE_KEY = 'mullahmax_profiles_v1';
const CURRENT_PROFILE_KEY = 'mullahmax_active_profile_id_v1';

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

function sanitizeProfileId(rawId: string): string {
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned && VALID_ID_REGEX.test(cleaned) ? cleaned : `profile_${Date.now()}`;
}

function sanitizeStringArray(arr: string[] | undefined, maxItems: number): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 128))
    .slice(0, maxItems);
}

function sanitizeWatchHistory(
  history: UserProfile['watchHistory'] | undefined
): UserProfile['watchHistory'] {
  if (!Array.isArray(history)) return [];
  return history
    .filter((entry) => entry && typeof entry.mediaId === 'string' && entry.mediaId.trim().length > 0)
    .slice(0, 200)
    .map((entry) => {
      const cleaned: UserProfile['watchHistory'][number] = {
        mediaId: String(entry.mediaId).slice(0, 128),
        watchedAt: Number.isFinite(entry.watchedAt) ? entry.watchedAt : Date.now(),
        progressPercentage: Math.max(0, Math.min(100, Math.round(Number(entry.progressPercentage) || 0))),
      };
      if (typeof entry.season === 'number' && Number.isFinite(entry.season)) {
        cleaned.season = Math.max(1, Math.floor(entry.season));
      }
      if (typeof entry.episode === 'number' && Number.isFinite(entry.episode)) {
        cleaned.episode = Math.max(1, Math.floor(entry.episode));
      }
      return cleaned;
    });
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthReady, isEmailVerified } = useAuth();
  const canUseCloud = Boolean(isAuthReady && user && isEmailVerified);

  const [guestProfiles, setGuestProfiles] = useState<UserProfile[]>(() => {
    try {
      const stored = localStorage.getItem(PROFILES_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_GUEST_PROFILES;
  });

  const [guestProfileId, setGuestProfileId] = useState<string>(() => {
    try {
      const storedId = localStorage.getItem(CURRENT_PROFILE_KEY);
      if (storedId) return storedId;
    } catch {}
    return DEFAULT_GUEST_PROFILES[0].id;
  });

  const [cloudProfiles, setCloudProfiles] = useState<UserProfile[]>([]);
  const [cloudActiveProfileId, setCloudActiveProfileId] = useState<string>('');
  const [isLoadingProfiles, setIsLoadingProfiles] = useState<boolean>(false);
  const [activeMood, setActiveMood] = useState<string | undefined>(undefined);

  const bootstrappingUidRef = useRef<string | null>(null);

  // Sync guest profiles to localStorage when not using cloud
  useEffect(() => {
    try {
      localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(guestProfiles));
    } catch {}
  }, [guestProfiles]);

  useEffect(() => {
    try {
      localStorage.setItem(CURRENT_PROFILE_KEY, guestProfileId);
    } catch {}
  }, [guestProfileId]);

  // Real-time Firestore listener for authenticated verified account + multiple profiles
  useEffect(() => {
    if (!canUseCloud || !user) {
      setCloudProfiles([]);
      setCloudActiveProfileId('');
      setIsLoadingProfiles(false);
      bootstrappingUidRef.current = null;
      return;
    }

    const uid = user.uid;
    setIsLoadingProfiles(true);

    let accountExists: boolean | null = null;
    let profilesSnapshotSeen = false;
    let latestProfiles: UserProfile[] = [];

    const maybeBootstrapAccount = async () => {
      if (accountExists === null || !profilesSnapshotSeen) return;
      if (accountExists && latestProfiles.length > 0) return;
      if (bootstrappingUidRef.current === uid) return;
      bootstrappingUidRef.current = uid;

      const defaultName = (user.displayName || user.email?.split('@')[0] || 'Viewer')
        .trim()
        .slice(0, 50) || 'Viewer';
      const defaultAvatar = defaultName.charAt(0).toUpperCase() || 'V';
      const firstProfileId = sanitizeProfileId(`profile_${uid.slice(0, 8)}_main`);

      try {
        const batch = writeBatch(db);
        if (!accountExists) {
          batch.set(doc(db, 'users', uid), {
            uid,
            email: (user.email || `${uid}@mullahmax.local`).slice(0, 200),
            displayName: (user.displayName || defaultName).slice(0, 100),
            activeProfileId: firstProfileId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        if (latestProfiles.length === 0) {
          batch.set(doc(db, 'users', uid, 'profiles', firstProfileId), {
            id: firstProfileId,
            ownerId: uid,
            name: defaultName,
            avatar: defaultAvatar.slice(0, 8),
            avatarColor: 'from-amber-500 to-rose-600',
            isKids: false,
            favoriteGenres: ['Action', 'Sci-Fi', 'Drama', 'Thriller'],
            preferredPlatforms: ['Netflix', 'Max', 'Apple TV+'],
            watchlist: [],
            liked: [],
            disliked: [],
            watchHistory: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
      } catch (err) {
        bootstrappingUidRef.current = null;
        handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
      }
    };

    const unsubAccount = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        accountExists = snap.exists();
        if (snap.exists()) {
          const data = snap.data() as { activeProfileId?: string };
          if (typeof data.activeProfileId === 'string') {
            setCloudActiveProfileId(data.activeProfileId);
          }
        }
        void maybeBootstrapAccount();
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `users/${uid}`);
      }
    );

    const profilesQuery = query(
      collection(db, 'users', uid, 'profiles'),
      where('ownerId', '==', uid)
    );

    const unsubProfiles = onSnapshot(
      profilesQuery,
      (snap) => {
        profilesSnapshotSeen = true;
        const nextProfiles: UserProfile[] = snap.docs.map((d) => {
          const raw = d.data() as Partial<UserProfile>;
          return {
            id: raw.id || d.id,
            name: (raw.name || 'Viewer').slice(0, 50),
            avatar: (raw.avatar || 'V').slice(0, 8),
            avatarColor: raw.avatarColor || 'from-amber-500 to-rose-600',
            isKids: Boolean(raw.isKids),
            favoriteGenres: Array.isArray(raw.favoriteGenres) ? raw.favoriteGenres : [],
            preferredPlatforms: Array.isArray(raw.preferredPlatforms)
              ? (raw.preferredPlatforms as StreamingPlatform[])
              : [],
            watchlist: Array.isArray(raw.watchlist) ? raw.watchlist : [],
            liked: Array.isArray(raw.liked) ? raw.liked : [],
            disliked: Array.isArray(raw.disliked) ? raw.disliked : [],
            watchHistory: Array.isArray(raw.watchHistory) ? raw.watchHistory : [],
          };
        });
        latestProfiles = nextProfiles;
        setCloudProfiles(nextProfiles);
        setIsLoadingProfiles(false);
        void maybeBootstrapAccount();
      },
      (err) => {
        setIsLoadingProfiles(false);
        handleFirestoreError(err, OperationType.LIST, `users/${uid}/profiles`);
      }
    );

    return () => {
      unsubAccount();
      unsubProfiles();
    };
  }, [canUseCloud, user]);

  const profiles =
    canUseCloud && cloudProfiles.length > 0
      ? cloudProfiles
      : canUseCloud
        ? guestProfiles
        : guestProfiles;

  const activeId =
    canUseCloud && cloudProfiles.length > 0
      ? cloudActiveProfileId
      : guestProfileId;

  const currentProfile = profiles.find((p) => p.id === activeId) || profiles[0];

  const switchProfile = async (profileId: string) => {
    if (!profiles.some((p) => p.id === profileId)) return;
    if (canUseCloud && user) {
      setCloudActiveProfileId(profileId);
      const path = `users/${user.uid}`;
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          activeProfileId: sanitizeProfileId(profileId),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
      return;
    }
    setGuestProfileId(profileId);
  };

  const createProfile = async (
    data: Omit<UserProfile, 'id' | 'watchlist' | 'liked' | 'disliked' | 'watchHistory'>
  ) => {
    const cleanName = data.name.trim().slice(0, 50) || 'Viewer';
    const cleanAvatar = (data.avatar || cleanName.charAt(0).toUpperCase() || 'V').slice(0, 8);
    const cleanColor = (data.avatarColor || 'from-amber-500 to-rose-600').slice(0, 80);
    const cleanGenres = sanitizeStringArray(data.favoriteGenres, 20);
    const cleanPlatforms = sanitizeStringArray(data.preferredPlatforms, 15) as StreamingPlatform[];
    const newId = sanitizeProfileId(`profile_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);

    if (canUseCloud && user) {
      const profilePath = `users/${user.uid}/profiles/${newId}`;
      try {
        const batch = writeBatch(db);
        batch.set(doc(db, 'users', user.uid, 'profiles', newId), {
          id: newId,
          ownerId: user.uid,
          name: cleanName,
          avatar: cleanAvatar,
          avatarColor: cleanColor,
          isKids: Boolean(data.isKids),
          favoriteGenres: cleanGenres,
          preferredPlatforms: cleanPlatforms,
          watchlist: [],
          liked: [],
          disliked: [],
          watchHistory: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.update(doc(db, 'users', user.uid), {
          activeProfileId: newId,
          updatedAt: serverTimestamp(),
        });
        await batch.commit();
        setCloudActiveProfileId(newId);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, profilePath);
      }
      return;
    }

    const newProfile: UserProfile = {
      id: newId,
      name: cleanName,
      avatar: cleanAvatar,
      avatarColor: cleanColor,
      isKids: Boolean(data.isKids),
      favoriteGenres: cleanGenres,
      preferredPlatforms: cleanPlatforms,
      watchlist: [],
      liked: [],
      disliked: [],
      watchHistory: [],
    };
    setGuestProfiles((prev) => [...prev, newProfile]);
    setGuestProfileId(newId);
  };

  const updateProfileDetails = async (
    profileId: string,
    updates: Partial<Pick<UserProfile, 'name' | 'avatar' | 'avatarColor' | 'isKids' | 'favoriteGenres' | 'preferredPlatforms'>>
  ) => {
    const cleanName = updates.name?.trim().slice(0, 50);
    const cleanAvatar = updates.avatar?.trim().slice(0, 8);
    const cleanColor = updates.avatarColor?.trim().slice(0, 80);
    const cleanGenres = updates.favoriteGenres
      ? sanitizeStringArray(updates.favoriteGenres, 20)
      : undefined;
    const cleanPlatforms = updates.preferredPlatforms
      ? (sanitizeStringArray(updates.preferredPlatforms, 15) as StreamingPlatform[])
      : undefined;

    if (canUseCloud && user) {
      const targetPath = `users/${user.uid}/profiles/${profileId}`;
      const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (cleanName) payload.name = cleanName;
      if (cleanAvatar) payload.avatar = cleanAvatar;
      if (cleanColor) payload.avatarColor = cleanColor;
      if (typeof updates.isKids === 'boolean') payload.isKids = updates.isKids;
      if (cleanGenres) payload.favoriteGenres = cleanGenres;
      if (cleanPlatforms) payload.preferredPlatforms = cleanPlatforms;

      try {
        await updateDoc(doc(db, 'users', user.uid, 'profiles', profileId), payload);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, targetPath);
      }
      return;
    }

    setGuestProfiles((prev) =>
      prev.map((p) =>
        p.id === profileId
          ? {
              ...p,
              ...(cleanName ? { name: cleanName } : {}),
              ...(cleanAvatar ? { avatar: cleanAvatar } : {}),
              ...(cleanColor ? { avatarColor: cleanColor } : {}),
              ...(typeof updates.isKids === 'boolean' ? { isKids: updates.isKids } : {}),
              ...(cleanGenres ? { favoriteGenres: cleanGenres } : {}),
              ...(cleanPlatforms ? { preferredPlatforms: cleanPlatforms } : {}),
            }
          : p
      )
    );
  };

  const deleteProfile = async (profileId: string) => {
    if (profiles.length <= 1) return;
    const remaining = profiles.filter((p) => p.id !== profileId);
    const nextActiveId = activeId === profileId ? remaining[0].id : activeId;

    if (canUseCloud && user) {
      const targetPath = `users/${user.uid}/profiles/${profileId}`;
      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'users', user.uid, 'profiles', profileId));
        if (activeId === profileId) {
          batch.update(doc(db, 'users', user.uid), {
            activeProfileId: nextActiveId,
            updatedAt: serverTimestamp(),
          });
          setCloudActiveProfileId(nextActiveId);
        }
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, targetPath);
      }
      return;
    }

    setGuestProfiles(remaining);
    if (guestProfileId === profileId) {
      setGuestProfileId(nextActiveId);
    }
  };

  const toggleWatchlist = async (mediaId: string) => {
    const cleanId = String(mediaId).slice(0, 128);
    const exists = currentProfile.watchlist.includes(cleanId);
    const nextWatchlist = sanitizeStringArray(
      exists
        ? currentProfile.watchlist.filter((id) => id !== cleanId)
        : [cleanId, ...currentProfile.watchlist],
      500
    );

    if (canUseCloud && user) {
      const targetPath = `users/${user.uid}/profiles/${currentProfile.id}`;
      try {
        await updateDoc(doc(db, 'users', user.uid, 'profiles', currentProfile.id), {
          watchlist: nextWatchlist,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, targetPath);
      }
      return;
    }

    setGuestProfiles((prev) =>
      prev.map((p) => (p.id === currentProfile.id ? { ...p, watchlist: nextWatchlist } : p))
    );
  };

  const isInWatchlist = (mediaId: string) => {
    return currentProfile.watchlist.includes(mediaId);
  };

  const rateMedia = async (mediaId: string, rating: 'like' | 'dislike' | 'neutral') => {
    const cleanId = String(mediaId).slice(0, 128);
    const liked = currentProfile.liked.filter((id) => id !== cleanId);
    const disliked = currentProfile.disliked.filter((id) => id !== cleanId);
    if (rating === 'like') liked.unshift(cleanId);
    if (rating === 'dislike') disliked.unshift(cleanId);

    const boundedLiked = sanitizeStringArray(liked, 500);
    const boundedDisliked = sanitizeStringArray(disliked, 500);

    if (canUseCloud && user) {
      const targetPath = `users/${user.uid}/profiles/${currentProfile.id}`;
      try {
        await updateDoc(doc(db, 'users', user.uid, 'profiles', currentProfile.id), {
          liked: boundedLiked,
          disliked: boundedDisliked,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, targetPath);
      }
      return;
    }

    setGuestProfiles((prev) =>
      prev.map((p) =>
        p.id === currentProfile.id
          ? { ...p, liked: boundedLiked, disliked: boundedDisliked }
          : p
      )
    );
  };

  const getMediaRating = (mediaId: string): 'like' | 'dislike' | 'neutral' => {
    if (currentProfile.liked.includes(mediaId)) return 'like';
    if (currentProfile.disliked.includes(mediaId)) return 'dislike';
    return 'neutral';
  };

  const updateWatchProgress = async (
    mediaId: string,
    progressPercentage: number,
    season?: number,
    episode?: number
  ) => {
    const cleanId = String(mediaId).slice(0, 128);
    const history = currentProfile.watchHistory.filter((h) => h.mediaId !== cleanId);
    history.unshift({
      mediaId: cleanId,
      watchedAt: Date.now(),
      progressPercentage,
      season,
      episode,
    });
    const boundedHistory = sanitizeWatchHistory(history);

    if (canUseCloud && user) {
      const targetPath = `users/${user.uid}/profiles/${currentProfile.id}`;
      try {
        await setDoc(
          doc(db, 'users', user.uid, 'profiles', currentProfile.id),
          {
            watchHistory: boundedHistory,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, targetPath);
      }
      return;
    }

    setGuestProfiles((prev) =>
      prev.map((p) => (p.id === currentProfile.id ? { ...p, watchHistory: boundedHistory } : p))
    );
  };

  return (
    <ProfileContext.Provider
      value={{
        currentProfile,
        profiles,
        isCloudSynced: canUseCloud && cloudProfiles.length > 0,
        isLoadingProfiles,
        switchProfile,
        createProfile,
        updateProfileDetails,
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
