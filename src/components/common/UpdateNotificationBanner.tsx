/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Sparkles, X } from 'lucide-react';

export const UpdateNotificationBanner: React.FC = () => {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const registerAndMonitorServiceWorker = useCallback(async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return;

      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
        setShowUpdateBanner(true);
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
            setShowUpdateBanner(true);
          }
        });
      });
    } catch (err) {
      console.warn('[LotusX SW] Could not check for updates:', err);
    }
  }, []);

  useEffect(() => {
    registerAndMonitorServiceWorker();

    if ('serviceWorker' in navigator) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });

      const interval = setInterval(async () => {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) await reg.update();
        } catch {
          // Ignore network errors while offline
        }
      }, 30 * 60 * 1000);

      return () => clearInterval(interval);
    }
  }, [registerAndMonitorServiceWorker]);

  const handleApplyUpdate = () => {
    setIsUpdating(true);
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } else {
      window.location.reload();
    }
  };

  if (!showUpdateBanner) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-[#03152F] text-white rounded-xl p-4 shadow-lg border border-[#1D3855] flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-lg bg-[#08BBD4]/15 border border-[#08BBD4]/30 flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles className="w-5 h-5 text-[#08BBD4]" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-white">New Update Available</h4>
            <button
              onClick={() => setShowUpdateBanner(false)}
              className="p-1 rounded-lg text-[#B8C6D8] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Dismiss update notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-[#B8C6D8] mt-1 leading-relaxed">
            A newer version of LotusX Vault has been downloaded. Your encrypted vault data is completely safe and untouched.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleApplyUpdate}
              disabled={isUpdating}
              className="btn-primary flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
              {isUpdating ? 'Updating...' : 'Reload to Update'}
            </button>
            <button
              onClick={() => setShowUpdateBanner(false)}
              className="px-3 py-2 rounded-lg bg-[#062A63] hover:bg-[#08357A] text-[#B8C6D8] hover:text-white text-xs font-medium transition-colors cursor-pointer"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
