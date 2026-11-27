import React, { useState } from 'react';
import {
  X,
  Mail,
  Lock,
  User,
  Loader2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface AuthModalProps {
  onClose: () => void;
  initialMode?: 'login' | 'signup';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  onClose,
  initialMode = 'login',
}) => {
  const {
    user,
    isEmailVerified,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    resendVerificationEmail,
    refreshUserSession,
    sendPasswordReset,
    logout,
  } = useAuth();

  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setStatusMsg('');
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google sign-in failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setStatusMsg('');
    setIsSubmitting(true);
    try {
      if (mode === 'reset') {
        await sendPasswordReset(email);
        setStatusMsg('Password reset link sent to your email.');
      } else if (mode === 'signup') {
        await signUpWithEmail(email, password, displayName);
        setStatusMsg('Account created! Please check your inbox and verify your email to sync profiles.');
      } else {
        await signInWithEmail(email, password);
        onClose();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCheck = async () => {
    setErrorMsg('');
    setStatusMsg('');
    setIsSubmitting(true);
    try {
      const verified = await refreshUserSession();
      if (verified) {
        onClose();
      } else {
        setStatusMsg('Email is not verified yet. Please click the verification link in your inbox.');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to check verification.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    setErrorMsg('');
    setStatusMsg('');
    setIsSubmitting(true);
    try {
      await resendVerificationEmail();
      setStatusMsg('Verification email resent! Check your inbox and spam folder.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to resend verification email.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl bg-[#0E121B] border border-white/15 p-6 sm:p-7 shadow-2xl text-slate-100 space-y-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-white font-display tracking-tight">
              {user && !isEmailVerified
                ? 'Verify Your Email'
                : mode === 'signup'
                  ? 'Create Your Account'
                  : mode === 'reset'
                    ? 'Reset Password'
                    : 'Sign In to MullahMax'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {user && !isEmailVerified
                ? `Signed in as ${user.email}`
                : 'Sync your profiles, watchlist, and playback progress across devices.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-xs text-rose-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {statusMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-xs text-emerald-200 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{statusMsg}</span>
          </div>
        )}

        {user && !isEmailVerified ? (
          <div className="space-y-3 pt-1">
            <p className="text-xs text-slate-300 leading-relaxed">
              We sent a verification link to <strong className="text-white">{user.email}</strong>. Click the link, then press refresh below to activate cloud multi-profile sync.
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleVerifyCheck}
                className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                <span>I Verified My Email</span>
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleResend}
                className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer transition-colors"
              >
                Resend Verification Email
              </button>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="w-full py-2.5 rounded-xl bg-white text-slate-950 hover:bg-slate-200 text-xs font-bold cursor-pointer transition-colors"
              >
                Or Continue with Google Instead
              </button>
              <button
                type="button"
                onClick={async () => {
                  await logout();
                  setStatusMsg('');
                  setErrorMsg('');
                }}
                className="text-xs text-slate-400 hover:text-white pt-1 cursor-pointer"
              >
                Sign out and switch account
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Mode Switcher */}
            {mode !== 'reset' && (
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg('');
                    setStatusMsg('');
                  }}
                  className={`py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    mode === 'login'
                      ? 'bg-white text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setErrorMsg('');
                    setStatusMsg('');
                  }}
                  className={`py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    mode === 'signup'
                      ? 'bg-white text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Sign Up
                </button>
              </div>
            )}

            {/* Google Sign-In */}
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleGoogleSignIn}
              className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-60 text-slate-950 text-xs font-bold flex items-center justify-center gap-2.5 cursor-pointer transition-colors shadow-md"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.37 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.37 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <div className="flex-1 h-px bg-white/10" />
              <span>OR EMAIL &amp; PASSWORD</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            {/* Email / Password Form */}
            <form onSubmit={handleEmailSubmit} className="space-y-3.5">
              {mode === 'signup' && (
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      maxLength={100}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                      className="w-full bg-white/5 border border-white/15 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    maxLength={200}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-white/5 border border-white/15 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {mode !== 'reset' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-300">Password</label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode('reset');
                          setErrorMsg('');
                          setStatusMsg('');
                        }}
                        className="text-[11px] text-rose-400 hover:text-rose-300 cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full bg-white/5 border border-white/15 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-lg"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>
                  {mode === 'signup'
                    ? 'Create Account & Profiles'
                    : mode === 'reset'
                      ? 'Send Reset Link'
                      : 'Sign In'}
                </span>
              </button>

              {mode === 'reset' && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setErrorMsg('');
                    setStatusMsg('');
                  }}
                  className="w-full text-center text-xs text-slate-400 hover:text-white pt-1 cursor-pointer"
                >
                  Back to Login
                </button>
              )}
            </form>
          </>
        )}
      </div>
    </div>
  );
};
