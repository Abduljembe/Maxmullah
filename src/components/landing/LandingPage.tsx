import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Film,
  Tv,
  Users,
  HardDrive,
  Play,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { MEDIA_CATALOG } from '../../data/mediaData';
import { fetchLiveTrending } from '../../services/tmdbService';
import { MediaItem } from '../../types';
import heroCinemaImg from '../../assets/images/hero_cinema_lounge_1795748328270.jpg';
import showcaseProfilesImg from '../../assets/images/showcase_multi_profile_1795748330570.jpg';
import showcaseOfflineImg from '../../assets/images/showcase_offline_travel_1795748328565.jpg';

interface LandingPageProps {
  onContinueAsGuest: () => void;
}

function isSafeCinemaImageUrl(url: string | undefined): url is string {
  if (!url) return false;
  return !url.includes('unsplash.com') && !url.includes('placeholder.com');
}

export const LandingPage: React.FC<LandingPageProps> = ({ onContinueAsGuest }) => {
  const {
    signInWithGoogle,
    signInWithGoogleRedirect,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
  } = useAuth();

  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRedirectFallback, setShowRedirectFallback] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [selectedTitlePrompt, setSelectedTitlePrompt] = useState<string | null>(null);

  const [liveItems, setLiveItems] = useState<MediaItem[]>([]);
  const [heroSlideIndex, setHeroSlideIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [profilesImgFailed, setProfilesImgFailed] = useState(false);
  const [offlineImgFailed, setOfflineImgFailed] = useState(false);

  const authCardRef = useRef<HTMLDivElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetchLiveTrending('all')
      .then((items) => {
        if (active && Array.isArray(items) && items.length > 0) {
          setLiveItems(items);
        }
      })
      .catch(() => {
        // Keep curated catalog banners when offline
      });
    return () => {
      active = false;
    };
  }, []);

  const showcaseItems = useMemo(() => {
    const merged = new Map<string, MediaItem>();
    for (const item of MEDIA_CATALOG) {
      merged.set(item.id, item);
    }
    for (const item of liveItems) {
      if (!merged.has(item.id)) {
        merged.set(item.id, item);
      }
    }
    return Array.from(merged.values());
  }, [liveItems]);

  const widescreenBanners = useMemo(() => {
    const withBackdrop = showcaseItems.filter((item) => isSafeCinemaImageUrl(item.backdropUrl));
    const movies = withBackdrop.filter((item) => item.type === 'movie').slice(0, 4);
    const series = withBackdrop.filter((item) => item.type === 'series').slice(0, 2);
    const combined = [...movies, ...series];
    if (combined.length < 6) {
      for (const item of withBackdrop) {
        if (!combined.some((c) => c.id === item.id)) {
          combined.push(item);
        }
        if (combined.length >= 6) break;
      }
    }
    return combined;
  }, [showcaseItems]);

  const posterLineup = useMemo(() => {
    const withPoster = showcaseItems.filter((item) => isSafeCinemaImageUrl(item.posterUrl));
    const seriesFirst = withPoster.filter((item) => item.type === 'series').slice(0, 5);
    const movies = withPoster.filter((item) => item.type === 'movie').slice(0, 5);
    return [...seriesFirst, ...movies].slice(0, 10);
  }, [showcaseItems]);

  const heroSlides = useMemo(() => {
    const slides = widescreenBanners.slice(0, 4).map((item) => ({
      id: item.id,
      src: item.backdropUrl,
      title: item.title,
      meta: `${item.type === 'series' ? 'Series' : 'Film'} · ${item.year}`,
    }));
    return [
      ...slides,
      {
        id: 'cinema-lounge',
        src: heroCinemaImg,
        title: 'Private Screening Room',
        meta: 'MullahMax 1080p HD',
      },
    ];
  }, [widescreenBanners]);

  useEffect(() => {
    if (heroSlides.length <= 1) return;
    const timer = window.setInterval(() => {
      setHeroSlideIndex((prev) => (prev + 1) % heroSlides.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [heroSlides.length]);

  const activeSlide = heroSlides[heroSlideIndex % heroSlides.length] || heroSlides[0];
  const heroBgSrc =
    activeSlide && !failedImages[`hero-${activeSlide.id}`] ? activeSlide.src : heroCinemaImg;

  const focusAuthMode = (nextMode: 'login' | 'signup', titleForPrompt?: string) => {
    setMode(nextMode);
    setErrorMsg('');
    setStatusMsg('');
    if (titleForPrompt) {
      setSelectedTitlePrompt(titleForPrompt);
    }
    authCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      emailInputRef.current?.focus();
    }, 180);
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setStatusMsg('');
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      setErrorMsg(msg);
      if (msg.toLowerCase().includes('popup') || msg.toLowerCase().includes('redirect')) {
        setShowRedirectFallback(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleRedirect = async () => {
    setErrorMsg('');
    setStatusMsg('');
    setIsSubmitting(true);
    try {
      await signInWithGoogleRedirect();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google redirect sign-in failed.');
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
        setStatusMsg('Password reset link sent. Check your inbox to choose a new password.');
      } else if (mode === 'signup') {
        await signUpWithEmail(email, password, displayName);
      } else {
        await signInWithEmail(email, password);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080A0F] text-slate-100 flex flex-col font-sans selection:bg-rose-600 selection:text-white">
      {/* 3-Zone Top Bar */}
      <header className="sticky top-0 z-40 w-full glass-nav py-4">
        <div className="w-full px-4 sm:px-8 md:px-12 lg:px-16 max-w-[1400px] mx-auto flex items-center justify-between gap-8">
          <a
            href="#top"
            className="text-xl sm:text-2xl font-black tracking-tight text-white font-display whitespace-nowrap shrink-0"
          >
            <span className="text-white">MULLAH</span>
            <span className="text-rose-600">MAX</span>
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
            <a
              href="#banners"
              className="whitespace-nowrap shrink-0 hover:text-white hover:underline underline-offset-4 transition-colors"
            >
              Movies &amp; Series
            </a>
            <a
              href="#capabilities"
              className="whitespace-nowrap shrink-0 hover:text-white hover:underline underline-offset-4 transition-colors"
            >
              Capabilities
            </a>
            <a
              href="#profiles"
              className="whitespace-nowrap shrink-0 hover:text-white hover:underline underline-offset-4 transition-colors"
            >
              Profiles
            </a>
            <a
              href="#offline"
              className="whitespace-nowrap shrink-0 hover:text-white hover:underline underline-offset-4 transition-colors"
            >
              Offline Vault
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => focusAuthMode(mode === 'signup' ? 'login' : 'signup')}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {mode === 'signup' ? 'Sign In' : 'Create Account'}
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="flex-1">
        {/* Hero Split with Rotating Cinema Banner Backdrop & Sign In / Sign Up Panel */}
        <section id="access" className="relative overflow-hidden border-b border-white/10">
          <div className="absolute inset-0">
            {!failedImages['hero-fallback'] ? (
              <img
                key={activeSlide?.id}
                src={heroBgSrc}
                alt={activeSlide?.title || 'Cinema backdrop'}
                referrerPolicy="no-referrer"
                onError={() => {
                  if (activeSlide && heroBgSrc !== heroCinemaImg) {
                    setFailedImages((prev) => ({ ...prev, [`hero-${activeSlide.id}`]: true }));
                  } else {
                    setFailedImages((prev) => ({ ...prev, 'hero-fallback': true }));
                  }
                }}
                className="w-full h-full object-cover object-center opacity-50 transition-opacity duration-700"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#0F1523] via-[#080A0F] to-[#170A10]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#080A0F] via-[#080A0F]/80 to-[#080A0F]/55" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#080A0F] via-[#080A0F]/80 to-[#080A0F]/55" />
          </div>

          <div className="relative w-full px-4 sm:px-8 md:px-12 lg:px-16 max-w-[1400px] mx-auto py-12 sm:py-16 lg:py-20">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
              {/* Left Column: Value Proposition & Live Banner Preview Strip */}
              <div className="lg:col-span-7 flex flex-col justify-between gap-8 py-2">
                <div className="space-y-6">
                  <p className="text-xs font-semibold tracking-wide text-slate-300">
                    MullahMax Cinema · 720p &amp; 1080p Streaming · Household Profiles
                  </p>

                  <h1
                    className="font-black font-display tracking-tight text-white leading-[1.06] max-w-2xl"
                    style={{
                      fontSize: 'clamp(2.25rem, 4vw, 3.75rem)',
                      textWrap: 'balance',
                    }}
                  >
                    Every film and series, tailored to each viewer in your home.
                  </h1>

                  <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
                    Sign in to sync multiple profiles under one account, resume series across devices, and download features in full 1080p HD for offline viewing.
                  </p>

                  <div className="flex flex-wrap items-center gap-4 pt-1">
                    <button
                      type="button"
                      onClick={() => focusAuthMode('signup')}
                      className="px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer shadow-lg"
                    >
                      <span>Create Free Account</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={onContinueAsGuest}
                      className="px-5 py-3 rounded-xl border border-white/15 bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Preview as Guest
                    </button>
                  </div>
                </div>

                {/* Hero Backdrop Switcher & Unboxed Metadata Strip */}
                <div className="pt-6 border-t border-white/10 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-300 font-medium">
                      <span>Featured Backdrop: </span>
                      <span className="text-white font-semibold">{activeSlide?.title}</span>
                      <span className="text-slate-400"> · {activeSlide?.meta}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {heroSlides.map((slide, idx) => (
                        <button
                          key={slide.id}
                          type="button"
                          onClick={() => setHeroSlideIndex(idx)}
                          aria-label={`Show ${slide.title} backdrop`}
                          className={`h-1.5 rounded-full transition-all cursor-pointer ${
                            idx === heroSlideIndex % heroSlides.length
                              ? 'w-6 bg-rose-500'
                              : 'w-2.5 bg-white/25 hover:bg-white/50'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Sign In / Sign Up Card */}
              <div ref={authCardRef} className="lg:col-span-5 flex">
                <div className="w-full rounded-2xl bg-[#0E121B]/95 border border-white/12 p-6 sm:p-7 shadow-2xl flex flex-col justify-center space-y-5">
                  <div>
                    <h2 className="text-xl font-bold text-white font-display tracking-tight">
                      {mode === 'signup'
                        ? 'Create your account'
                        : mode === 'reset'
                          ? 'Reset your password'
                          : 'Sign in to continue'}
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      {selectedTitlePrompt
                        ? `Sign in or create a free account to stream ${selectedTitlePrompt} in 1080p HD.`
                        : 'Access your household profiles, watchlist, and playback progress.'}
                    </p>
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

                  {mode !== 'reset' && (
                    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
                      <button
                        type="button"
                        onClick={() => {
                          setMode('login');
                          setErrorMsg('');
                          setStatusMsg('');
                        }}
                        className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          mode === 'login'
                            ? 'bg-white text-slate-950'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Sign In
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMode('signup');
                          setErrorMsg('');
                          setStatusMsg('');
                        }}
                        className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          mode === 'signup'
                            ? 'bg-white text-slate-950'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Sign Up
                      </button>
                    </div>
                  )}

                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={handleGoogleSignIn}
                      className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-60 text-slate-950 text-xs font-bold flex items-center justify-center gap-2.5 transition-colors cursor-pointer shadow-sm"
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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

                    {showRedirectFallback && (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={handleGoogleRedirect}
                        className="w-full py-2 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Popup blocked? Sign in with Google Redirect instead
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-slate-500">
                    <div className="flex-1 h-px bg-white/10" />
                    <span>Or with email</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>

                  <form onSubmit={handleEmailSubmit} className="space-y-3.5">
                    {mode === 'signup' && (
                      <div>
                        <label
                          htmlFor="landing-name"
                          className="text-xs font-semibold text-slate-300 block mb-1"
                        >
                          Full Name
                        </label>
                        <div className="relative">
                          <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            id="landing-name"
                            type="text"
                            required
                            maxLength={100}
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Alex Morgan"
                            className="w-full bg-white/5 border border-white/15 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-rose-500"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="landing-email"
                        className="text-xs font-semibold text-slate-300 block mb-1"
                      >
                        Email Address
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          ref={emailInputRef}
                          id="landing-email"
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
                          <label
                            htmlFor="landing-password"
                            className="text-xs font-semibold text-slate-300"
                          >
                            Password
                          </label>
                          {mode === 'login' && (
                            <button
                              type="button"
                              onClick={() => {
                                setMode('reset');
                                setErrorMsg('');
                                setStatusMsg('');
                              }}
                              className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                            >
                              Forgot password?
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                          <input
                            id="landing-password"
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
                            {showPassword ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-lg"
                    >
                      {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                      <span>
                        {mode === 'signup'
                          ? 'Create Account'
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
                        Back to Sign In
                      </button>
                    )}
                  </form>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Widescreen Movie & Series Banners + Poster Showcase */}
        <section
          id="banners"
          className="w-full px-4 sm:px-8 md:px-12 lg:px-16 max-w-[1400px] mx-auto py-14 sm:py-18 space-y-12"
        >
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1.5">
              <h2 className="text-2xl sm:text-3xl font-black text-white font-display tracking-tight">
                Movies &amp; Series Now Streaming
              </h2>
              <p className="text-sm text-slate-400 max-w-xl">
                Blockbuster cinema, acclaimed original series, and restored classics ready in 720p and 1080p Full HD.
              </p>
            </div>
            <button
              type="button"
              onClick={() => focusAuthMode('signup')}
              className="text-xs font-bold text-rose-400 hover:text-rose-300 inline-flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
            >
              <span>Unlock Full Library</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Widescreen 16:9 Cinema Banners */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {widescreenBanners.map((item) => {
              const imgErrorKey = `banner-${item.id}`;
              const hasFailed = Boolean(failedImages[imgErrorKey]);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => focusAuthMode('login', item.title)}
                  className="group relative aspect-[16/9] rounded-2xl overflow-hidden border border-white/10 bg-[#0E121B] text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                >
                  {!hasFailed ? (
                    <img
                      src={item.backdropUrl}
                      alt={`${item.title} (${item.year}) banner`}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setFailedImages((prev) => ({ ...prev, [imgErrorKey]: true }))
                      }
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-900 to-[#140A10] text-slate-400">
                      {item.type === 'series' ? (
                        <Tv className="w-7 h-7 text-rose-500" />
                      ) : (
                        <Film className="w-7 h-7 text-rose-500" />
                      )}
                      <span className="text-xs font-semibold text-slate-300">{item.title}</span>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-[#080A0F] via-[#080A0F]/45 to-transparent" />

                  <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base sm:text-lg font-bold text-white font-display truncate">
                        {item.title}
                      </p>
                      <p className="text-xs text-slate-300 truncate mt-0.5 tabular-nums">
                        {item.type === 'series' ? 'Series' : 'Film'} · {item.year} ·{' '}
                        {item.genres.slice(0, 2).join(' / ')}
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-full bg-rose-600/90 group-hover:bg-rose-600 flex items-center justify-center text-white shrink-0 transition-colors shadow-lg">
                      <Play className="w-4 h-4 fill-white translate-x-0.5" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Poster Showcase Row (Series & Films) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base sm:text-lg font-bold text-white font-display">
                Acclaimed Series &amp; Cinema Picks
              </h3>
              <span className="text-xs text-slate-400">
                Click any title to sign in and watch
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 sm:gap-5">
              {posterLineup.map((item) => {
                const imgErrorKey = `poster-${item.id}`;
                const hasFailed = Boolean(failedImages[imgErrorKey]);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => focusAuthMode('login', item.title)}
                    className="group text-left space-y-2 cursor-pointer focus:outline-none"
                  >
                    <div className="relative aspect-[2/3] rounded-xl overflow-hidden border border-white/10 bg-[#0E121B]">
                      {!hasFailed ? (
                        <img
                          src={item.posterUrl}
                          alt={`${item.title} poster`}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setFailedImages((prev) => ({ ...prev, [imgErrorKey]: true }))
                          }
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-3 text-center bg-gradient-to-br from-slate-900 to-slate-950 text-slate-400">
                          <Film className="w-6 h-6 text-rose-500" />
                          <span className="text-xs font-semibold text-slate-200">
                            {item.title}
                          </span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Play className="w-3.5 h-3.5 fill-white" />
                          <span>Watch in HD</span>
                        </span>
                      </div>
                    </div>

                    <div className="space-y-0.5 px-0.5">
                      <p className="text-xs sm:text-sm font-bold text-white truncate">
                        {item.title}
                      </p>
                      <p className="text-xs text-slate-400 truncate tabular-nums">
                        {item.type === 'series' ? 'Series' : 'Film'} · {item.year}
                        {item.imdbScore > 0 ? ` · ${item.imdbScore.toFixed(1)} IMDb` : ''}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Full-Width 4-Column Capability Strip */}
        <section
          id="capabilities"
          className="border-y border-white/10 bg-[#0B0E16]"
        >
          <div className="w-full px-4 sm:px-8 md:px-12 lg:px-16 max-w-[1400px] mx-auto py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="space-y-2">
              <p className="text-xs font-mono tabular-nums text-rose-400">01.</p>
              <h3 className="text-base font-bold text-white font-display">
                Multiple Household Profiles
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Create dedicated profiles with independent watchlists, taste preferences, and Kids filtering.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-mono tabular-nums text-rose-400">02.</p>
              <h3 className="text-base font-bold text-white font-display">
                720p &amp; 1080p HD Playback
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Automatic high-definition server selection with manual stream switching when needed.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-mono tabular-nums text-rose-400">03.</p>
              <h3 className="text-base font-bold text-white font-display">
                Offline Device Vault
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Download movies and full seasons directly to your device for flights and commutes.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-mono tabular-nums text-rose-400">04.</p>
              <h3 className="text-base font-bold text-white font-display">
                Cross-Device Resume
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Every profile syncs watch progress and saved queues in real time across your screens.
              </p>
            </div>
          </div>
        </section>

        {/* Asymmetric Household & Offline Showcase */}
        <section
          id="profiles"
          className="w-full px-4 sm:px-8 md:px-12 lg:px-16 max-w-[1400px] mx-auto py-14 sm:py-20"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-7 rounded-2xl bg-[#0E121B] border border-white/10 overflow-hidden flex flex-col">
              <div className="relative aspect-[4/3] sm:aspect-[16/10] bg-slate-900 overflow-hidden">
                {!profilesImgFailed ? (
                  <img
                    src={showcaseProfilesImg}
                    alt="Living room cinema screen and tablet synced to household profiles"
                    referrerPolicy="no-referrer"
                    onError={() => setProfilesImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-900 to-slate-950 text-slate-400">
                    <Users className="w-8 h-8 text-rose-400" />
                    <span className="text-sm font-semibold">Household Multi-Profile Sync</span>
                  </div>
                )}
              </div>
              <div className="p-6 sm:p-7 space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-white font-display">
                    One account, separate cinema rooms for everyone
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Keep your late-night thriller queue separate from family animation and weekend watchlists. Switch viewer profiles in a single click from any screen.
                  </p>
                </div>
                <div className="pt-3 border-t border-white/10 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 tabular-nums">
                  <span>Independent watchlists</span>
                  <span aria-hidden="true">·</span>
                  <span>Kids profile flag</span>
                  <span aria-hidden="true">·</span>
                  <span>Per-profile genre tuning</span>
                </div>
              </div>
            </div>

            <div
              id="offline"
              className="lg:col-span-5 rounded-2xl bg-[#0E121B] border border-white/10 overflow-hidden flex flex-col"
            >
              <div className="relative aspect-[4/3] bg-slate-900 overflow-hidden">
                {!offlineImgFailed ? (
                  <img
                    src={showcaseOfflineImg}
                    alt="Laptop and smartphone set up for offline movie playback on a train"
                    referrerPolicy="no-referrer"
                    onError={() => setOfflineImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-900 to-slate-950 text-slate-400">
                    <HardDrive className="w-8 h-8 text-rose-400" />
                    <span className="text-sm font-semibold">1080p Offline Downloads</span>
                  </div>
                )}
              </div>
              <div className="p-6 sm:p-7 space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-white font-display">
                    Ready offline, whenever signal drops
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Save 720p or 1080p editions directly into your Offline Vault and keep watching without buffering on trains, planes, or low-bandwidth connections.
                  </p>
                </div>
                <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-400 tabular-nums">
                    720p &amp; 1080p local storage
                  </span>
                  <button
                    type="button"
                    onClick={() => focusAuthMode('signup')}
                    className="text-xs font-bold text-rose-400 hover:text-rose-300 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Start free account</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-white/10 bg-[#080A0F]">
        <div className="w-full px-4 sm:px-8 md:px-12 lg:px-16 max-w-[1400px] mx-auto py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-3">
            <Film className="w-4 h-4 text-rose-500" />
            <span className="font-bold text-white font-display">MULLAHMAX</span>
            <span aria-hidden="true">·</span>
            <span>All rights reserved</span>
          </div>

          <div className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => focusAuthMode('login')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => focusAuthMode('signup')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Create Account
            </button>
            <button
              type="button"
              onClick={onContinueAsGuest}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Guest Preview
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
