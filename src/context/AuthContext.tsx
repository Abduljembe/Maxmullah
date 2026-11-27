import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { allowNextUserPopup } from '../utils/adBlocker';

interface AuthContextType {
  user: User | null;
  isAuthReady: boolean;
  isEmailVerified: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithGoogleRedirect: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshUserSession: () => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapFirebaseAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'this domain';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password. Please check your credentials and try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters long.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before completing. Try again or allow popups for this site.';
    case 'auth/cancelled-popup-request':
      return 'Another sign-in popup was already open. Please try again.';
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by your browser. Allow popups for this site or use Redirect Sign-In.';
    case 'auth/unauthorized-domain':
      return `Domain "${hostname}" is not authorized in Firebase Auth. Add "${hostname}" under Firebase Console → Authentication → Settings → Authorized domains.`;
    case 'auth/account-exists-with-different-credential':
      return 'An account with this email already exists with a different sign-in provider.';
    case 'auth/network-request-failed':
      return 'Network request failed. Please check your connection and try again.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment before trying again.';
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found':
      return 'Email/Password sign-in is not enabled in Firebase Console yet. Use Continue with Google, or enable Email/Password under Authentication → Sign-in method.';
    default:
      return err instanceof Error ? err.message : 'Authentication failed. Please try again.';
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    void getRedirectResult(auth).catch((err) => {
      console.warn('Google redirect sign-in notice:', err);
    });

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setIsEmailVerified(Boolean(firebaseUser?.emailVerified));
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      allowNextUserPopup();
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const signInWithGoogleRedirect = async () => {
    try {
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      await signInWithRedirect(auth, googleProvider);
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const signUpWithEmail = async (email: string, password: string, displayName: string) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const cleanName = displayName.trim().slice(0, 100);
      if (cleanName) {
        await updateProfile(cred.user, { displayName: cleanName });
      }
      try {
        await sendEmailVerification(cred.user);
      } catch (verifyErr) {
        console.warn('Could not send verification email immediately:', verifyErr);
      }
      setUser(cred.user);
      setIsEmailVerified(Boolean(cred.user.emailVerified));
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const resendVerificationEmail = async () => {
    if (!auth.currentUser) return;
    try {
      await sendEmailVerification(auth.currentUser);
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const refreshUserSession = async (): Promise<boolean> => {
    if (!auth.currentUser) return false;
    try {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      const verified = Boolean(auth.currentUser.emailVerified);
      setUser(auth.currentUser);
      setIsEmailVerified(verified);
      return verified;
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const sendPasswordReset = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (err) {
      throw new Error(mapFirebaseAuthError(err));
    }
  };

  const logout = async () => {
    try {
      sessionStorage.removeItem('mullahmax_guest_preview');
    } catch {}
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthReady,
        isEmailVerified,
        signInWithGoogle,
        signInWithGoogleRedirect,
        signInWithEmail,
        signUpWithEmail,
        resendVerificationEmail,
        refreshUserSession,
        sendPasswordReset,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
};
