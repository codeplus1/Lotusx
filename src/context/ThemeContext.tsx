/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  ColorPalette,
  LogoMode,
  ThemeConfig,
  DEFAULT_THEME_CONFIG,
  DEFAULT_PALETTE,
  DARK_PALETTE,
  THEME_PRESETS,
  THEME_STORAGE_KEY,
} from '../types/theme';
import { applyThemeToDom, normalizeHex, isValidHex, getLuminance } from '../utils/colorUtils';

interface ThemeContextType {
  config: ThemeConfig;
  palette: ColorPalette;
  logoMode: LogoMode;
  customLogoUrl: string | null;
  customLogoName: string | null;
  presetId?: string;
  isCustomized: boolean;
  isSaved: boolean;
  isDark: boolean;
  toggleDarkMode: () => void;
  setDarkMode: (dark: boolean) => void;
  updateColor: (key: keyof ColorPalette, value: string) => void;
  applyPreset: (presetId: string) => void;
  setLogoMode: (mode: LogoMode) => void;
  setCustomLogo: (dataUrl: string, name?: string) => void;
  restoreDefaultLogo: () => void;
  resetToDefault: () => void;
  saveTheme: (partial?: Partial<ThemeConfig>) => void;
}

const ThemeContext = createContext<ThemeContextType | null>(null);

function loadSavedTheme(): ThemeConfig {
  if (typeof window === 'undefined') return DEFAULT_THEME_CONFIG;

  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME_CONFIG;

    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.palette) {
      // Automatically migrate legacy burgundy/magenta defaults if not explicitly customized
      const isLegacyDefault =
        !parsed.isCustomized &&
        (parsed.presetId === 'lotusx-burgundy' ||
          parsed.palette.primary?.toLowerCase() === '#800020');

      if (isLegacyDefault) {
        return DEFAULT_THEME_CONFIG;
      }

      const bgLum = getLuminance(parsed.palette.background || DEFAULT_PALETTE.background);
      const baseTokens = bgLum < 0.2 ? DARK_PALETTE : DEFAULT_PALETTE;

      return {
        palette: {
          ...baseTokens,
          ...parsed.palette,
        },
        logoMode: parsed.logoMode || 'default',
        customLogoUrl: parsed.customLogoUrl || null,
        customLogoName: parsed.customLogoName || null,
        presetId: parsed.presetId || (bgLum < 0.2 ? 'lotusx-cyan-dark' : 'lotusx-cyan-light'),
        isCustomized: !!parsed.isCustomized,
      };
    }
  } catch (err) {
    console.warn('Failed to load saved theme, falling back to default:', err);
  }

  return DEFAULT_THEME_CONFIG;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<ThemeConfig>(() => {
    const initial = loadSavedTheme();
    applyThemeToDom(initial);
    return initial;
  });

  const [isSaved, setIsSaved] = useState(true);

  useEffect(() => {
    applyThemeToDom(config);
  }, [config]);

  const isDark = getLuminance(config.palette.background || DEFAULT_PALETTE.background) < 0.2;

  const setDarkMode = useCallback((dark: boolean) => {
    setConfig((prev) => {
      const nextPalette = dark ? DARK_PALETTE : DEFAULT_PALETTE;
      const nextConfig: ThemeConfig = {
        ...prev,
        palette: { ...nextPalette },
        presetId: dark ? 'lotusx-cyan-dark' : 'lotusx-cyan-light',
        isCustomized: false,
      };
      try {
        localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(nextConfig));
      } catch (err) {
        console.warn('Failed to persist dark mode:', err);
      }
      setIsSaved(true);
      return nextConfig;
    });
  }, []);

  const toggleDarkMode = useCallback(() => {
    setDarkMode(!isDark);
  }, [isDark, setDarkMode]);

  const updateColor = useCallback((key: keyof ColorPalette, rawValue: string) => {
    const value = isValidHex(rawValue) ? normalizeHex(rawValue) : rawValue;
    setConfig((prev) => {
      const nextConfig: ThemeConfig = {
        ...prev,
        palette: {
          ...prev.palette,
          [key]: value,
        },
        isCustomized: true,
        presetId: undefined,
      };
      setIsSaved(false);
      return nextConfig;
    });
  }, []);

  const applyPreset = useCallback((presetId: string) => {
    const preset = THEME_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    setConfig((prev) => {
      const nextConfig: ThemeConfig = {
        ...prev,
        palette: { ...preset.palette },
        presetId: preset.id,
        isCustomized: preset.id !== 'lotusx-cyan-light',
      };
      try {
        localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(nextConfig));
      } catch (err) {
        console.warn('Failed to persist preset selection:', err);
      }
      setIsSaved(true);
      return nextConfig;
    });
  }, []);

  const setLogoMode = useCallback((mode: LogoMode) => {
    setConfig((prev) => {
      const nextConfig: ThemeConfig = {
        ...prev,
        logoMode: mode,
      };
      try {
        localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(nextConfig));
      } catch (err) {
        console.warn('Failed to persist logoMode change:', err);
      }
      setIsSaved(true);
      return nextConfig;
    });
  }, []);

  const setCustomLogo = useCallback((dataUrl: string, name = 'custom-logo.png') => {
    setConfig((prev) => {
      const nextConfig: ThemeConfig = {
        ...prev,
        logoMode: 'custom',
        customLogoUrl: dataUrl,
        customLogoName: name,
      };
      try {
        localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(nextConfig));
      } catch (err) {
        console.warn('Failed to persist custom logo:', err);
      }
      setIsSaved(true);
      return nextConfig;
    });
  }, []);

  const restoreDefaultLogo = useCallback(() => {
    setConfig((prev) => {
      const nextConfig: ThemeConfig = {
        ...prev,
        logoMode: 'default',
        customLogoUrl: null,
        customLogoName: null,
      };
      try {
        localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(nextConfig));
      } catch (err) {
        console.warn('Failed to persist restoreDefaultLogo:', err);
      }
      setIsSaved(true);
      return nextConfig;
    });
  }, []);

  const resetToDefault = useCallback(() => {
    setConfig(DEFAULT_THEME_CONFIG);
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } catch (err) {
      console.warn('Failed to reset theme storage:', err);
    }
    setIsSaved(true);
  }, []);

  const saveTheme = useCallback((partial?: Partial<ThemeConfig>) => {
    setConfig((prev) => {
      const nextConfig: ThemeConfig = {
        ...prev,
        ...partial,
        palette: {
          ...prev.palette,
          ...(partial?.palette || {}),
        },
      };
      try {
        localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(nextConfig));
      } catch (err) {
        console.warn('Failed to persist theme config:', err);
      }
      setIsSaved(true);
      return nextConfig;
    });
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        config,
        palette: config.palette,
        logoMode: config.logoMode,
        customLogoUrl: config.customLogoUrl,
        customLogoName: config.customLogoName,
        presetId: config.presetId,
        isCustomized: config.isCustomized,
        isSaved,
        isDark,
        toggleDarkMode,
        setDarkMode,
        updateColor,
        applyPreset,
        setLogoMode,
        setCustomLogo,
        restoreDefaultLogo,
        resetToDefault,
        saveTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
