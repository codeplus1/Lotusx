/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ColorPalette {
  primary: string;      // #08BBD4 - Primary buttons, active nav, important actions, links, selected states, progress
  primaryDark: string;  // #0797AD - Button hover, button pressed, focus states, strong accents
  secondary: string;    // #062A63 - Secondary buttons, navigation elements, security visuals, headers, cards
  darkNavy: string;     // #03152F - Dark mode bg, top/bottom nav, secure vault areas, modal bgs, security sections
  accent: string;       // #08BBD4 - Main brand accent (Cyan)
  background: string;   // #F5F8FC (Light) / #061426 (Dark)
  backgroundSecondary: string; // #EDF3F9 (Light) / #0B1F38 (Dark)
  surface: string;      // #FFFFFF (Light) / #0D223D (Dark)
  surfaceElevated: string; // #FFFFFF (Light) / #112B4A (Dark)
  textPrimary: string;  // #10233F (Light) / #F5F9FF (Dark)
  textSecondary: string;// #53657A (Light) / #B8C6D8 (Dark)
  textMuted: string;    // #8493A5
  border: string;       // #DCE5EF (Light) / #1D3855 (Dark)
  success: string;      // #16A56B - Password saved, secure status, successful login, vault unlocked
  warning: string;      // #E6A23C - Weak passwords, attention needed, recommendations, expiring info
  error: string;        // #D64545 - Invalid password, failed auth, delete warnings, security errors
  info: string;         // #3B82C4 - Helpful information, tips, explanations, notifications
}

export type LogoMode = 'default' | 'uploaded' | 'custom';
export type ThemeMode = 'system' | 'light' | 'dark';

export interface ThemeConfig {
  palette: ColorPalette;
  logoMode: LogoMode;
  customLogoUrl: string | null;
  customLogoName: string | null;
  presetId?: string;
  themeMode?: ThemeMode;
  isCustomized: boolean;
}

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  palette: ColorPalette;
  isDark?: boolean;
}

/**
 * Centralized LotusX Brand Design Tokens (Light Mode Default)
 */
export const DEFAULT_PALETTE: ColorPalette = {
  primary: '#08BBD4',             // LotusX Cyan
  primaryDark: '#0797AD',         // LotusX Cyan Dark (Hover/Pressed/Focus)
  secondary: '#062A63',           // LotusX Deep Navy
  darkNavy: '#03152F',            // LotusX Rich Dark Navy
  accent: '#08BBD4',              // LotusX Cyan Accent
  background: '#F5F8FC',          // Light Background
  backgroundSecondary: '#EDF3F9', // Secondary Light Background
  surface: '#FFFFFF',             // Light Surface
  surfaceElevated: '#FFFFFF',     // Elevated Light Surface
  textPrimary: '#10233F',         // Primary Text
  textSecondary: '#53657A',       // Secondary Text & Light Icons
  textMuted: '#8493A5',           // Muted Text
  border: '#DCE5EF',              // Light Border
  success: '#16A56B',             // Semantic Success
  warning: '#E6A23C',             // Semantic Warning
  error: '#D64545',               // Semantic Error
  info: '#3B82C4',                // Semantic Info
};

/**
 * Centralized LotusX Brand Design Tokens (Dark Mode)
 */
export const DARK_PALETTE: ColorPalette = {
  primary: '#08BBD4',             // LotusX Cyan
  primaryDark: '#0797AD',         // LotusX Cyan Dark
  secondary: '#062A63',           // LotusX Deep Navy
  darkNavy: '#03152F',            // LotusX Rich Dark Navy
  accent: '#08BBD4',              // LotusX Cyan Accent
  background: '#061426',          // Dark Background
  backgroundSecondary: '#0B1F38', // Secondary Dark Surface
  surface: '#0D223D',             // Dark Card Surface
  surfaceElevated: '#112B4A',     // Elevated Dark Surface
  textPrimary: '#F5F9FF',         // Dark Mode Primary Text
  textSecondary: '#B8C6D8',       // Dark Mode Secondary Text & Dark Icons
  textMuted: '#8493A5',           // Muted Text
  border: '#1D3855',              // Dark Border
  success: '#16A56B',             // Semantic Success
  warning: '#E6A23C',             // Semantic Warning
  error: '#D64545',               // Semantic Error
  info: '#3B82C4',                // Semantic Info
};

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  palette: DEFAULT_PALETTE,
  logoMode: 'default',
  customLogoUrl: null,
  customLogoName: null,
  presetId: 'lotusx-cyan-light',
  themeMode: 'light',
  isCustomized: false,
};

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'lotusx-cyan-light',
    name: 'LotusX Security Light (Default)',
    description: 'Signature LotusX Deep Navy, Vibrant Cyan, and crisp White clarity.',
    isDark: false,
    palette: DEFAULT_PALETTE,
  },
  {
    id: 'lotusx-cyan-dark',
    name: 'LotusX Security Dark',
    description: 'Rich Dark Navy surfaces with Vibrant Cyan action highlights and high-contrast legibility.',
    isDark: true,
    palette: DARK_PALETTE,
  },
];

export const THEME_STORAGE_KEY = 'lotusx_theme_config';
