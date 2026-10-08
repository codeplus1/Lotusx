/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTheme } from '../../context/ThemeContext';

interface LotusXLogoProps {
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showWordmark?: boolean;
  showSubtitle?: boolean;
  wordmarkClassName?: string;
  variant?: 'squircle' | 'minimal';
}

const sizeMap = {
  xs: { icon: 24, box: 'w-6 h-6 rounded-lg' },
  sm: { icon: 32, box: 'w-8 h-8 rounded-lg' },
  md: { icon: 40, box: 'w-10 h-10 rounded-xl' },
  lg: { icon: 56, box: 'w-14 h-14 rounded-2xl' },
  xl: { icon: 64, box: 'w-16 h-16 rounded-2xl' },
  '2xl': { icon: 80, box: 'w-20 h-20 rounded-2xl' },
};

/**
 * LotusX Brand Squircle Padlock Icon
 * Features the signature Cyan (#08BBD4) upper sky, White (#FFFFFF) padlock shackle & curved horizon arch,
 * and Deep Navy (#062A63) security vault body with centered white keyhole.
 */
export const LotusXIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 32,
  className = '',
}) => {
  const uid = React.useId().replace(/:/g, '');
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`lx-upper-${uid}`} x1="15%" y1="0%" x2="85%" y2="85%">
          <stop offset="0%" stopColor="#2CE8FA" />
          <stop offset="35%" stopColor="#08BBD4" />
          <stop offset="75%" stopColor="#0677B8" />
          <stop offset="100%" stopColor="#06539A" />
        </linearGradient>

        <linearGradient id={`lx-lower-${uid}`} x1="50%" y1="30%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#053582" />
          <stop offset="50%" stopColor="#062A63" />
          <stop offset="100%" stopColor="#03152F" />
        </linearGradient>

        <linearGradient id={`lx-shackle-${uid}`} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="70%" stopColor="#F2FAFE" />
          <stop offset="100%" stopColor="#BCE9F7" />
        </linearGradient>

        <linearGradient id={`lx-arch-${uid}`} x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#D4F2FC" />
          <stop offset="50%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#C8ECFA" />
        </linearGradient>

        <filter id={`lx-shadow-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#020E24" floodOpacity="0.38" />
        </filter>

        <clipPath id={`lx-clip-${uid}`}>
          <rect x="0" y="0" width="512" height="512" rx="116" ry="116" />
        </clipPath>
      </defs>

      <g clipPath={`url(#lx-clip-${uid})`}>
        {/* 1. Upper Vibrant Cyan-Blue Background */}
        <rect x="0" y="0" width="512" height="512" fill={`url(#lx-upper-${uid})`} />
        <ellipse cx="140" cy="90" rx="220" ry="140" fill="#5DF3FF" opacity="0.18" />

        {/* 2. Padlock Shackle */}
        <path
          d="M 182 260 L 182 190 A 74 74 0 0 1 330 190 L 330 260"
          fill="none"
          stroke={`url(#lx-shackle-${uid})`}
          strokeWidth="36"
          strokeLinecap="butt"
          filter={`url(#lx-shadow-${uid})`}
        />

        {/* 3. Lower Deep Navy Curved Mound */}
        <path
          d="M -20 335 C 110 250, 185 216, 256 216 C 327 216, 402 250, 532 335 L 532 532 L -20 532 Z"
          fill={`url(#lx-lower-${uid})`}
        />

        {/* 4. Crisp White Curved Horizon Ridge */}
        <path
          d="M -20 335 C 110 250, 185 216, 256 216 C 327 216, 402 250, 532 335"
          fill="none"
          stroke={`url(#lx-arch-${uid})`}
          strokeWidth="24"
          strokeLinecap="round"
          filter={`url(#lx-shadow-${uid})`}
        />

        {/* 5. White Keyhole */}
        <g filter={`url(#lx-shadow-${uid})`}>
          <circle cx="256" cy="292" r="28" fill="#FFFFFF" />
          <path
            d="M 241 308 L 271 308 L 284 378 C 284.5 381 282 384 279 384 L 233 384 C 230 384 227.5 381 228 378 Z"
            fill="#FFFFFF"
          />
        </g>
      </g>
    </svg>
  );
};

export const LotusXLogo: React.FC<LotusXLogoProps> = ({
  className = '',
  size = 'md',
  showWordmark = false,
  showSubtitle = false,
  wordmarkClassName = '',
}) => {
  const config = sizeMap[size];

  let logoMode = 'default';
  let customLogoUrl: string | null = null;
  let accentColor = '#08BBD4';

  try {
    const theme = useTheme();
    if (theme) {
      logoMode = theme.logoMode;
      customLogoUrl = theme.customLogoUrl;
      accentColor = theme.palette.primary || '#08BBD4';
    }
  } catch {
    // Fallback if rendered outside ThemeProvider
  }

  const renderGraphic = () => {
    if (logoMode === 'uploaded') {
      return (
        <img
          src="/icon.svg"
          alt="LotusX App Logo"
          className="w-full h-full object-contain rounded-inherit"
          loading="lazy"
        />
      );
    }

    if (logoMode === 'custom' && customLogoUrl) {
      return (
        <img
          src={customLogoUrl}
          alt="App Custom Logo"
          className="w-full h-full object-contain rounded-inherit"
          loading="lazy"
        />
      );
    }

    return <LotusXIcon size={config.icon} className="w-full h-full" />;
  };

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <div
        className={`${config.box} flex items-center justify-center shrink-0 relative overflow-hidden shadow-xs`}
      >
        {renderGraphic()}
      </div>

      {showWordmark && (
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-0.5">
            <span
              className={`font-bold tracking-tight text-[var(--color-text-primary)] leading-none ${
                size === 'lg' || size === 'xl' || size === '2xl'
                  ? 'text-2xl sm:text-3xl'
                  : 'text-base sm:text-lg'
              } ${wordmarkClassName}`}
            >
              Lotus
              <span style={{ color: accentColor }} className="font-extrabold">
                X
              </span>
            </span>
          </div>
          {showSubtitle && (
            <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--color-text-muted)] mt-0.5">
              YOUR DATA. YOUR CONTROL.
            </span>
          )}
        </div>
      )}
    </div>
  );
};
