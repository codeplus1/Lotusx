/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  onFinish: () => void;
  durationMs?: number;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onFinish,
  durationMs = 2000,
}) => {
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const startTime = performance.now();

    const interval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / (durationMs - 300)) * 100));
      setProgress(pct);

      if (elapsed >= durationMs) {
        clearInterval(interval);
        setVisible(false);
        onFinish();
      }
    }, 30);

    return () => clearInterval(interval);
  }, [durationMs, onFinish]);

  if (!visible) return null;

  return (
    <div
      key="lotusx-splash"
      className="fixed inset-0 z-[9999] bg-[#03152F] text-[#F5F9FF] flex flex-col items-center justify-between py-10 px-6 select-none overflow-hidden"
    >
      {/* Top spacer for vertical balance */}
      <div className="h-6" />

      {/* Center Avatar, Brand Title, Tagline & Progress Bar */}
      <div className="relative flex flex-col items-center text-center max-w-sm w-full">
        {/* Soft radial cyan-teal ambient glow behind circular avatar */}
        <div
          className="absolute -top-16 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full pointer-events-none"
          style={{
            background:
              'radial-gradient(circle, rgba(8, 187, 212, 0.24) 0%, rgba(7, 151, 173, 0.10) 42%, rgba(3, 21, 47, 0) 72%)',
          }}
        />

        {/* Concentric Circular Avatar Frame (No animation on original file) */}
        <div className="relative z-10 flex items-center justify-center mb-7">
          {/* Outer subtle cyan ring */}
          <div className="w-44 h-44 sm:w-48 sm:h-48 rounded-full border border-[#08BBD4]/30 flex items-center justify-center p-2.5 shadow-[0_0_40px_rgba(8,187,212,0.18)]">
            {/* Inner vibrant cyan ring */}
            <div className="w-full h-full rounded-full border-[2.5px] border-[#08BBD4] bg-[#062A63] overflow-hidden flex items-center justify-center shadow-inner">
              <img
                src="/newprofile.png"
                alt="Profile Avatar"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-[center_8%] rounded-full"
              />
            </div>
          </div>
        </div>

        {/* Brand Title: Lotus (White) + X (Cyan) */}
        <h1 className="relative z-10 text-3xl sm:text-4xl font-bold tracking-tight text-white">
          Lotus<span className="text-[#08BBD4]">X</span>
        </h1>

        {/* Spaced All-Caps Tagline */}
        <p className="relative z-10 mt-2.5 text-[11px] sm:text-xs font-medium uppercase tracking-[0.26em] text-[#8493A5]">
          ZERO-KNOWLEDGE. STAY SECURE.
        </p>

        {/* Minimal Horizontal Cyan Progress Bar */}
        <div className="relative z-10 mt-8 w-48 sm:w-56 h-[3px] rounded-full bg-[#1D3855]/80 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#08BBD4] transition-all duration-75 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Bottom Attribution Footer */}
      <div className="relative z-10 text-xs sm:text-sm text-[#8493A5] font-normal tracking-wide flex items-center gap-1.5">
        <span>made with Love</span>
        <span className="text-[#D64545] text-sm leading-none" aria-label="love">
          ❤️
        </span>
        <span>by Saroj Yadav</span>
      </div>
    </div>
  );
};
