/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

// Module-level global store to catch beforeinstallprompt even before React finishes mounting
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<(prompt: BeforeInstallPromptEvent | null) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    // Prevent the default mini-infobar on mobile so our in-app triggers have full control
    e.preventDefault();
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    promptListeners.forEach((listener) => listener(globalDeferredPrompt));
  });

  window.addEventListener('appinstalled', () => {
    globalDeferredPrompt = null;
    promptListeners.forEach((listener) => listener(null));
  });
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(
    () => globalDeferredPrompt
  );
  const [isInstallable, setIsInstallable] = useState<boolean>(() => !!globalDeferredPrompt);
  const [isInstalled, setIsInstalled] = useState<boolean>(false);
  const [isAndroid, setIsAndroid] = useState<boolean>(false);
  const [isIOS, setIsIOS] = useState<boolean>(false);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    const isAndroidDevice = /Android/i.test(ua);
    const isIOSDevice = /iPhone|iPad|iPod/i.test(ua);
    setIsAndroid(isAndroidDevice);
    setIsIOS(isIOSDevice);

    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandaloneMode);

    if (globalDeferredPrompt) {
      setDeferredPrompt(globalDeferredPrompt);
      setIsInstallable(true);
    }

    const listener = (prompt: BeforeInstallPromptEvent | null) => {
      setDeferredPrompt(prompt);
      setIsInstallable(!!prompt);
    };
    promptListeners.add(listener);

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      globalDeferredPrompt = null;
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      promptListeners.delete(listener);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unsupported'> => {
    let promptEvent = deferredPrompt || globalDeferredPrompt;

    if (!promptEvent) {
      promptEvent = await new Promise<BeforeInstallPromptEvent | null>((resolve) => {
        if (globalDeferredPrompt) return resolve(globalDeferredPrompt);
        const timer = setTimeout(() => resolve(null), 600);
        const handler = (p: BeforeInstallPromptEvent | null) => {
          if (p) {
            clearTimeout(timer);
            promptListeners.delete(handler);
            resolve(p);
          }
        };
        promptListeners.add(handler);
      });
    }

    if (!promptEvent) {
      return 'unsupported';
    }

    try {
      await promptEvent.prompt();
      const choiceResult = await promptEvent.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsInstalled(true);
        setIsInstallable(false);
        globalDeferredPrompt = null;
      }
      setDeferredPrompt(null);
      return choiceResult.outcome;
    } catch (err) {
      console.warn('Install prompt error:', err);
      return 'dismissed';
    }
  }, [deferredPrompt]);

  const canPromptNative = isInstallable || !!globalDeferredPrompt;
  const platform: 'ios' | 'android' | 'desktop' = isIOS
    ? 'ios'
    : isAndroid
    ? 'android'
    : 'desktop';

  return {
    isInstallable: canPromptNative,
    canPromptNative,
    canInstallPrompt: canPromptNative,
    isInstalled,
    isStandalone: isInstalled,
    isAndroid,
    isIOS,
    platform,
    triggerInstall,
    promptInstall: triggerInstall,
  };
}
