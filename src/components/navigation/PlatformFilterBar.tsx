import React from 'react';
import { StreamingPlatform } from '../../types';
import { PLATFORM_INFO } from '../../data/mediaData';

interface PlatformFilterBarProps {
  selectedPlatform: StreamingPlatform | 'ALL';
  onSelectPlatform: (platform: StreamingPlatform | 'ALL') => void;
}

export const PlatformFilterBar: React.FC<PlatformFilterBarProps> = ({
  selectedPlatform,
  onSelectPlatform,
}) => {
  const platforms = Object.keys(PLATFORM_INFO) as StreamingPlatform[];

  return (
    <div className="w-full border-y border-white/5 bg-[#0A0D14]/80 py-4 backdrop-blur-md">
      <div className="w-full px-4 sm:px-8 md:px-12 lg:px-16 xl:px-20 max-w-[2400px] mx-auto">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">
            Filter by Streaming Network
          </span>
          <span className="text-xs text-rose-400 font-medium hidden sm:inline">
            Unified in 1 Interface
          </span>
        </div>

        {/* Horizontal scrollable platforms */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <button
            onClick={() => onSelectPlatform('ALL')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer shrink-0 border ${
              selectedPlatform === 'ALL'
                ? 'bg-white text-slate-950 border-white shadow-md'
                : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white'
            }`}
          >
            All Platforms Combined
          </button>

          {platforms.map((plat) => {
            const info = PLATFORM_INFO[plat];
            const isSelected = selectedPlatform === plat;

            return (
              <button
                key={plat}
                onClick={() => onSelectPlatform(plat)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer shrink-0 border flex items-center gap-2 ${
                  isSelected
                    ? 'shadow-md ring-1 ring-white/50 text-white'
                    : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10 hover:text-white'
                }`}
                style={
                  isSelected
                    ? {
                        backgroundColor: info.bgColor,
                        borderColor: info.borderColor,
                      }
                    : {}
                }
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: info.color }}
                />
                <span>{info.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
