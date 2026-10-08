/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ColorPalette, ThemeConfig, DEFAULT_PALETTE, DARK_PALETTE } from '../types/theme';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * Validates whether a string is a valid 3 or 6 digit hex code
 */
export function isValidHex(hex: string): boolean {
  return /^#([0-9A-Fa-f]{3}){1,2}$/.test(hex.trim());
}

/**
 * Normalizes hex string (adds # prefix if missing, expands 3-char hex)
 */
export function normalizeHex(hex: string): string {
  let clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    clean = clean.split('').map(c => c + c).join('');
  }
  return '#' + clean.toLowerCase();
}

/**
 * Parses Hex color to RGB
 */
export function hexToRgb(hex: string): RGB | null {
  if (!isValidHex(hex)) return null;
  const clean = normalizeHex(hex).slice(1);
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Converts RGB to Hex
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(c)));
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Adjusts lightness of a hex color by a percentage (-100 to 100)
 */
export function adjustLightness(hex: string, percent: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;

  const factor = percent / 100;
  if (factor > 0) {
    return rgbToHex(
      rgb.r + (255 - rgb.r) * factor,
      rgb.g + (255 - rgb.g) * factor,
      rgb.b + (255 - rgb.b) * factor
    );
  } else {
    const absFactor = Math.abs(factor);
    return rgbToHex(
      rgb.r * (1 - absFactor),
      rgb.g * (1 - absFactor),
      rgb.b * (1 - absFactor)
    );
  }
}

/**
 * Converts Hex to rgba string
 */
export function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * Calculates WCAG relative luminance of a color
 */
export function getLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;

  const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(v => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculates WCAG 2.1 contrast ratio between two hex colors (1:1 to 21:1)
 */
export function getContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const l1 = getLuminance(foregroundHex);
  const l2 = getLuminance(backgroundHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Math.round(ratio * 10) / 10;
}

export interface WcagRating {
  ratio: number;
  grade: 'AAA' | 'AA' | 'AA Large' | 'Fail';
  pass: boolean;
  textColor: string;
}

/**
 * Evaluates WCAG rating and recommends optimal text color (white vs black)
 */
export function evaluateContrast(colorHex: string, backgroundHex = '#ffffff'): WcagRating {
  const whiteRatio = getContrastRatio('#ffffff', colorHex);
  const blackRatio = getContrastRatio('#000000', colorHex);

  const bestTextColor = whiteRatio >= blackRatio ? '#ffffff' : '#000000';
  const ratio = Math.max(whiteRatio, blackRatio);

  let grade: 'AAA' | 'AA' | 'AA Large' | 'Fail' = 'Fail';
  if (ratio >= 7.0) {
    grade = 'AAA';
  } else if (ratio >= 4.5) {
    grade = 'AA';
  } else if (ratio >= 3.0) {
    grade = 'AA Large';
  }

  return {
    ratio,
    grade,
    pass: ratio >= 4.5,
    textColor: bestTextColor,
  };
}

/**
 * Injects centralized LotusX CSS variables and properties into the DOM document root
 */
export function applyThemeToDom(config: ThemeConfig): void {
  if (typeof document === 'undefined') return;

  const { palette } = config;
  const root = document.documentElement;

  const bgLuminance = getLuminance(palette.background || DEFAULT_PALETTE.background);
  const isDark = bgLuminance < 0.2;
  const fallbackPalette = isDark ? DARK_PALETTE : DEFAULT_PALETTE;

  const primary = palette.primary || fallbackPalette.primary;
  const primaryDark = palette.primaryDark || '#0797AD';
  const secondary = palette.secondary || fallbackPalette.secondary;
  const darkNavy = palette.darkNavy || fallbackPalette.darkNavy;
  const accent = palette.accent || primary;
  const background = palette.background || fallbackPalette.background;
  const backgroundSecondary = palette.backgroundSecondary || fallbackPalette.backgroundSecondary;
  const surface = palette.surface || fallbackPalette.surface;
  const surfaceElevated = palette.surfaceElevated || fallbackPalette.surfaceElevated;
  const textPrimary = palette.textPrimary || fallbackPalette.textPrimary;
  const textSecondary = palette.textSecondary || fallbackPalette.textSecondary;
  const textMuted = palette.textMuted || fallbackPalette.textMuted;
  const border = palette.border || fallbackPalette.border;

  const primaryRgb = hexToRgb(primary) || { r: 8, g: 187, b: 212 };
  const secRgb = hexToRgb(secondary) || { r: 6, g: 42, b: 99 };
  const accentRgb = hexToRgb(accent) || { r: 8, g: 187, b: 212 };

  const primaryLight = adjustLightness(primary, 15);
  const primarySubtle = hexToRgba(primary, 0.08);
  const primaryMuted = hexToRgba(primary, 0.16);

  // Set centralized CSS Custom Properties on :root
  root.style.setProperty('--color-primary', primary);
  root.style.setProperty('--color-primary-rgb', `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}`);
  root.style.setProperty('--color-primary-hover', primaryDark);
  root.style.setProperty('--color-primary-dark', primaryDark);
  root.style.setProperty('--color-primary-light', primaryLight);
  root.style.setProperty('--color-primary-subtle', primarySubtle);
  root.style.setProperty('--color-primary-muted', primaryMuted);

  root.style.setProperty('--color-secondary', secondary);
  root.style.setProperty('--color-secondary-rgb', `${secRgb.r}, ${secRgb.g}, ${secRgb.b}`);
  root.style.setProperty('--color-dark-navy', darkNavy);

  root.style.setProperty('--color-accent', accent);
  root.style.setProperty('--color-accent-rgb', `${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}`);

  root.style.setProperty('--color-bg-app', background);
  root.style.setProperty('--color-bg-secondary', backgroundSecondary);
  root.style.setProperty('--color-bg-surface', surface);
  root.style.setProperty('--color-bg-elevated', surfaceElevated);

  root.style.setProperty('--color-text-primary', textPrimary);
  root.style.setProperty('--color-text-secondary', textSecondary);
  root.style.setProperty('--color-text-muted', textMuted);
  root.style.setProperty('--color-border', border);

  root.style.setProperty('--color-success', palette.success || fallbackPalette.success);
  root.style.setProperty('--color-warning', palette.warning || fallbackPalette.warning);
  root.style.setProperty('--color-error', palette.error || fallbackPalette.error);
  root.style.setProperty('--color-info', palette.info || fallbackPalette.info);

  // Set body background and primary text color
  document.body.style.backgroundColor = background;
  document.body.style.color = textPrimary;

  if (isDark) {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }
}
