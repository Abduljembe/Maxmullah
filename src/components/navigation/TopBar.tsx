import React, { useState } from 'react';
import {
  HardDrive,
  Search,
  Menu,
  X,
  LogIn,
} from 'lucide-react';
import { useProfile } from '../../context/ProfileContext';
import { useOffline } from '../../context/OfflineContext';
import { useAuth } from '../../context/AuthContext';

interface TopBarProps {
  currentTab: 'home' | 'movies' | 'series' | 'networks' | 'downloads';
  onSelectTab: (tab: 'home' | 'movies' | 'series' | 'networks' | 'downloads') => void;
  onOpenProfile: () => void;
  onOpenAuth: () => void;
  onOpenVibeMatcher?: () => void;
  onToggleSearch: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentTab,
  onSelectTab,
  onOpenProfile,
  onOpenAuth,
  onToggleSearch,
}) => {
  const { currentProfile } = useProfile();
  const { downloads } = useOffline();
  const { user, isEmailVerified } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const completedDownloadsCount = downloads.filter((d) => d.status === 'completed').length;

  return (
    <header className="sticky top-0 z-40 w-full glass-nav py-3.5">
      <div className="w-full px-4 sm:px-8 md:px-12 lg:px-16 xl:px-20 max-w-[2400px] mx-auto flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <a
          href="#home"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('home');
          }}
          className="text-xl sm:text-2xl font-black tracking-tight text-white font-display whitespace-nowrap shrink-0 flex items-center"
        >
          <span className="text-white">MULLAH</span>
          <span className="text-rose-600">MAX</span>
        </a>

        {/* Zone 2: Clean Single-Line Nav Links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
          <button
            onClick={() => onSelectTab('home')}
            className={`whitespace-nowrap shrink-0 transition-colors hover:text-white cursor-pointer ${
              currentTab === 'home' ? 'text-white font-bold border-b-2 border-rose-600 pb-0.5' : ''
            }`}
          >
            Home
          </button>

          <button
            onClick={() => onSelectTab('movies')}
            className={`whitespace-nowrap shrink-0 transition-colors hover:text-white cursor-pointer ${
              currentTab === 'movies' ? 'text-white font-bold border-b-2 border-rose-600 pb-0.5' : ''
            }`}
          >
            Movies
          </button>

          <button
            onClick={() => onSelectTab('series')}
            className={`whitespace-nowrap shrink-0 transition-colors hover:text-white cursor-pointer ${
              currentTab === 'series' ? 'text-white font-bold border-b-2 border-rose-600 pb-0.5' : ''
            }`}
          >
            Series
          </button>

          <button
            onClick={() => onSelectTab('networks')}
            className={`whitespace-nowrap shrink-0 transition-colors hover:text-white cursor-pointer ${
              currentTab === 'networks' ? 'text-white font-bold border-b-2 border-rose-600 pb-0.5' : ''
            }`}
          >
            Browse
          </button>

          <button
            onClick={() => onSelectTab('downloads')}
            className={`whitespace-nowrap shrink-0 transition-colors hover:text-white flex items-center gap-1.5 cursor-pointer ${
              currentTab === 'downloads'
                ? 'text-white font-bold border-b-2 border-rose-600 pb-0.5'
                : ''
            }`}
          >
            <span>Downloads</span>
            {completedDownloadsCount > 0 && (
              <span className="text-xs text-slate-400 font-mono tabular-nums">
                ({completedDownloadsCount})
              </span>
            )}
          </button>
        </nav>

        {/* Zone 3: Search, Auth & Profile */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <button
            onClick={onToggleSearch}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Search"
            aria-label="Search movies and series"
          >
            <Search className="w-4 h-4" />
          </button>

          {!user && (
            <button
              onClick={onOpenAuth}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer shadow-md"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}

          <button
            onClick={onOpenProfile}
            className="flex items-center gap-2 p-1 pl-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer group relative"
            title={
              user
                ? `Account: ${user.email || 'Signed In'} · Profile: ${currentProfile.name}`
                : `Profile: ${currentProfile.name}`
            }
          >
            <span className="text-xs font-semibold text-slate-200 hidden lg:inline max-w-[90px] truncate">
              {currentProfile.name}
            </span>
            <div
              className={`w-7 h-7 rounded-lg bg-gradient-to-br ${currentProfile.avatarColor} flex items-center justify-center text-white text-xs font-bold font-display shadow-sm group-hover:scale-105 transition-transform relative`}
            >
              {currentProfile.avatar}
              {user && (
                <span
                  className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-[#080A0F] ${
                    isEmailVerified ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
              )}
            </div>
          </button>

          {/* Mobile Menu Hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl text-slate-300 hover:text-white cursor-pointer"
            aria-label="Toggle Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Flyout */}
      {mobileMenuOpen && (
        <div className="md:hidden px-4 pt-4 pb-2 border-t border-white/10 mt-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="grid grid-cols-2 gap-2 text-xs font-medium">
            <button
              onClick={() => {
                onSelectTab('home');
                setMobileMenuOpen(false);
              }}
              className={`p-2.5 rounded-xl text-left ${
                currentTab === 'home' ? 'bg-rose-600 text-white font-bold' : 'bg-white/5 text-slate-300'
              }`}
            >
              Home
            </button>
            <button
              onClick={() => {
                onSelectTab('movies');
                setMobileMenuOpen(false);
              }}
              className={`p-2.5 rounded-xl text-left ${
                currentTab === 'movies' ? 'bg-rose-600 text-white font-bold' : 'bg-white/5 text-slate-300'
              }`}
            >
              Movies
            </button>
            <button
              onClick={() => {
                onSelectTab('series');
                setMobileMenuOpen(false);
              }}
              className={`p-2.5 rounded-xl text-left ${
                currentTab === 'series' ? 'bg-rose-600 text-white font-bold' : 'bg-white/5 text-slate-300'
              }`}
            >
              Series
            </button>
            <button
              onClick={() => {
                onSelectTab('networks');
                setMobileMenuOpen(false);
              }}
              className={`p-2.5 rounded-xl text-left ${
                currentTab === 'networks' ? 'bg-rose-600 text-white font-bold' : 'bg-white/5 text-slate-300'
              }`}
            >
              Browse
            </button>
            <button
              onClick={() => {
                onSelectTab('downloads');
                setMobileMenuOpen(false);
              }}
              className={`p-2.5 rounded-xl text-left col-span-2 flex items-center justify-between ${
                currentTab === 'downloads' ? 'bg-rose-600 text-white font-bold' : 'bg-white/5 text-slate-300'
              }`}
            >
              <span className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-rose-400" />
                Downloads
              </span>
              <span className="font-mono text-[11px] text-white/70 tabular-nums">
                {completedDownloadsCount}
              </span>
            </button>

            {!user && (
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAuth();
                }}
                className="p-2.5 rounded-xl text-left col-span-2 bg-rose-600 text-white font-bold flex items-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                <span>Sign In / Create Account</span>
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
