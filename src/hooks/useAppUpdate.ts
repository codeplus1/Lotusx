/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { registerSW } from 'virtual:pwa-register';

export interface AppUpdateState {
  needRefresh: boolean;
  isChecking: boolean;
  lastChecked: Date | null;
  updateMessage: string | null;
  checkForUpdates: () => Promise<boolean>;
  applyUpdate: () => void;
  dismissUpdate: () => void;
}

let globalUpdateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
let globalRegistration: ServiceWorkerRegistration | null = null;

export function useAppUpdate(): AppUpdateState {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    // Register Service Worker with instant auto-update triggers
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true);
        setUpdateMessage('A new version of LotusX is ready.');
      },
      onOfflineReady() {
        // App is cached for zero-knowledge offline use
      },
      onRegisteredSW(_swScriptUrl, registration) {
        if (registration) {
          globalRegistration = registration;
          registrationRef.current = registration;

          // Proactive periodic check every 30 minutes while running
          const intervalId = setInterval(() => {
            if (navigator.onLine) {
              registration.update().catch(() => {});
            }
          }, 30 * 60 * 1000);

          return () => clearInterval(intervalId);
        }
      },
      onRegisterError(error) {
        console.warn('LotusX service worker registration error:', error);
      },
    });

    globalUpdateSW = updateSW;

    // Instant update trigger: When an installed user re-opens the app from background (visibilitychange)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        const reg = registrationRef.current || globalRegistration;
        if (reg) {
          reg.update().catch(() => {});
        }
      }
    };

    // Instant update trigger: When window receives focus
    const handleFocus = () => {
      if (navigator.onLine) {
        const reg = registrationRef.current || globalRegistration;
        if (reg) {
          reg.update().catch(() => {});
        }
      }
    };

    // Instant update trigger: When device comes back online
    const handleOnline = () => {
      const reg = registrationRef.current || globalRegistration;
      if (reg) {
        reg.update().catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    // Listen for controller changes (when new SW activates)
    let refreshing = false;
    const handleControllerChange = () => {
      if (!refreshing) {
        refreshing = true;
        // With autoUpdate, controllerchange means new SW is ready
        setNeedRefresh(true);
        setUpdateMessage('LotusX has been updated to the latest version.');
      }
    };

    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      if (navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      }
    };
  }, []);

  // Manual Check for Updates
  const checkForUpdates = useCallback(async (): Promise<boolean> => {
    setIsChecking(true);
    setLastChecked(new Date());

    try {
      const reg = registrationRef.current || globalRegistration;
      if (!reg) {
        if ('serviceWorker' in navigator) {
          const currentReg = await navigator.serviceWorker.getRegistration();
          if (currentReg) {
            await currentReg.update();
            const hasUpdate = !!(currentReg.waiting || currentReg.installing);
            if (hasUpdate) {
              setNeedRefresh(true);
              setUpdateMessage('A new version of LotusX is ready to install.');
            }
            return hasUpdate;
          }
        }
        return false;
      }

      await reg.update();
      const hasUpdate = !!(reg.waiting || reg.installing);
      if (hasUpdate) {
        setNeedRefresh(true);
        setUpdateMessage('A new version of LotusX is ready to install.');
      }
      return hasUpdate;
    } catch (err) {
      console.warn('Manual update check failed:', err);
      return false;
    } finally {
      setIsChecking(false);
    }
  }, []);

  const applyUpdate = useCallback(() => {
    if (globalUpdateSW) {
      globalUpdateSW(true).catch(() => {
        window.location.reload();
      });
    } else {
      window.location.reload();
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    setNeedRefresh(false);
    setUpdateMessage(null);
  }, []);

  return {
    needRefresh,
    isChecking,
    lastChecked,
    updateMessage,
    checkForUpdates,
    applyUpdate,
    dismissUpdate,
  };
}
