/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Download, X, Smartphone, Share } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { LotusXLogo } from '../common/LotusXLogo';
import { MobileInstallModal } from './MobileInstallModal';

const BANNER_DISMISSED_KEY = 'lotusx_install_banner_dismissed';

export const InstallAppPromptBanner: React.FC = () => {
  const { isStandalone, canInstallPrompt, platform, triggerInstall } = usePWAInstall();
  const [isDismissed, setIsDismissed] = useState(true);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem(BANNER_DISMISSED_KEY);
    if (!dismissed && !isStandalone) {
      if (canInstallPrompt || platform === 'ios' || platform === 'android') {
        setIsDismissed(false);
      }
    }
  }, [isStandalone, canInstallPrompt, platform]);

  const handleDismiss = () => {
    sessionStorage.setItem(BANNER_DISMISSED_KEY, 'true');
    setIsDismissed(true);
  };

  const handleInstallClick = async () => {
    if (canInstallPrompt) {
      const accepted = await triggerInstall();
      if (accepted) {
        setIsDismissed(true);
      }
    } else {
      setIsGuideOpen(true);
    }
  };

  if (isStandalone) return null;

  return (
    <>
      {!isDismissed && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-40 bg-[#03152F] text-white p-4 rounded-xl shadow-lg border border-[#1D3855] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <LotusXLogo size="md" />
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-white truncate">Install LotusX App</h4>
              <p className="text-[11px] text-[#B8C6D8] truncate">
                {platform === 'ios'
                  ? 'Add to iPhone Home Screen for offline access'
                  : 'Install native-grade offline vault on your phone'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleInstallClick}
              className="btn-primary px-3 py-2 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              {canInstallPrompt ? (
                <>
                  <Download className="w-3.5 h-3.5" />
                  Install
                </>
              ) : platform === 'ios' ? (
                <>
                  <Share className="w-3.5 h-3.5" />
                  How to Add
                </>
              ) : (
                <>
                  <Smartphone className="w-3.5 h-3.5" />
                  Install
                </>
              )}
            </button>
            <button
              onClick={handleDismiss}
              aria-label="Dismiss install banner"
              className="p-1.5 rounded-lg text-[#B8C6D8] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <MobileInstallModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </>
  );
};
