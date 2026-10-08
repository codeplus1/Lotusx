/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Lock, Plus, KeyRound, Clock, Trash2, Menu, X, Smartphone, Sun, Moon } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { useTheme } from '../../context/ThemeContext';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { MobileInstallModal } from '../mobile/MobileInstallModal';
import { LotusXLogo } from '../common/LotusXLogo';

export const Header: React.FC = () => {
  const {
    status,
    lockVault,
    clipboardSeconds,
    clearClipboardNow,
    setIsCreateModalOpen,
    setIsGeneratorModalOpen,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
  } = useVault();

  const { isDark, toggleDarkMode } = useTheme();
  const { triggerInstall, isInstalled } = usePWAInstall();
  const [isInstallModalOpen, setIsInstallModalOpen] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  const handleInstallClick = async () => {
    setIsInstalling(true);
    try {
      const outcome = await triggerInstall();
      if (outcome === 'unsupported') {
        setIsInstallModalOpen(true);
      }
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-[#03152F] border-b border-[#1D3855] text-white">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Hamburger (Mobile) + Brand Identity */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {status === 'unlocked' && (
            <button
              id="sidebar-toggle-btn"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 -ml-1 text-[#B8C6D8] hover:text-white hover:bg-[#062A63]/60 active:bg-[#062A63] rounded-xl transition-colors h-10 w-10 sm:h-11 sm:w-11 flex items-center justify-center shrink-0 cursor-pointer"
              title={isMobileMenuOpen ? 'Close Navigation' : 'Open Navigation'}
              aria-label="Toggle Sidebar Menu"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          )}

          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            <LotusXLogo size="md" />
            <div>
              <span className="font-bold text-base sm:text-lg text-white tracking-tight whitespace-nowrap block leading-tight">
                Lotus<span className="text-[#08BBD4] font-extrabold">X</span>
              </span>
              <p className="text-[11px] text-[#B8C6D8] hidden md:block">Local-first AES-256-GCM &amp; Argon2id</p>
            </div>
          </div>
        </div>

        {/* Right: Actions and Status */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Clipboard Auto-Clear Status */}
          {clipboardSeconds > 0 && (
            <div
              id="clipboard-status-badge"
              className="flex items-center gap-1 bg-[#062A63] border border-[#08BBD4]/40 text-white px-2 sm:px-2.5 py-1 rounded-lg text-[11px] font-medium tabular-nums"
              title="Clipboard will automatically be wiped"
            >
              <Clock className="w-3.5 h-3.5 text-[#08BBD4] shrink-0" />
              <span>{clipboardSeconds}s</span>
              <button
                id="clipboard-wipe-btn"
                onClick={clearClipboardNow}
                className="text-[#B8C6D8] hover:text-white hover:bg-[#03152F]/60 p-1 rounded transition-colors h-7 w-7 flex items-center justify-center cursor-pointer"
                title="Wipe clipboard now"
                aria-label="Wipe clipboard"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Light / Dark Mode Toggle */}
          <button
            id="theme-mode-toggle-btn"
            type="button"
            onClick={toggleDarkMode}
            className="p-2 rounded-xl border border-[#1D3855] bg-[#062A63]/50 hover:bg-[#062A63] text-[#B8C6D8] hover:text-[#08BBD4] transition-colors h-10 w-10 sm:h-11 sm:w-11 flex items-center justify-center shrink-0 cursor-pointer"
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDark ? <Sun className="w-4 h-4 text-[#08BBD4]" /> : <Moon className="w-4 h-4 text-[#B8C6D8]" />}
          </button>

          {/* Install Mobile App Button (auto-suppressed when already running in standalone mode) */}
          {!isInstalled && (
            <button
              id="header-install-btn"
              onClick={handleInstallClick}
              disabled={isInstalling}
              className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl border border-[#1D3855] hover:border-[#08BBD4]/60 bg-[#062A63] hover:bg-[#08357A] text-white text-xs font-medium transition-colors h-10 min-w-[40px] sm:h-11 sm:min-w-[44px] whitespace-nowrap shrink-0 cursor-pointer"
              title="Directly install LotusX on your device"
              aria-label="Install mobile app"
            >
              <Smartphone className="w-4 h-4 text-[#08BBD4] shrink-0" />
              <span className="hidden sm:inline">{isInstalling ? 'Opening...' : 'Install App'}</span>
            </button>
          )}

          {/* Quick Generator Button (Desktop) */}
          {status === 'unlocked' && (
            <button
              id="quick-generator-btn"
              onClick={() => setIsGeneratorModalOpen(true)}
              className="hidden md:flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#1D3855] hover:border-[#08BBD4]/60 bg-[#062A63] hover:bg-[#08357A] text-xs font-medium text-white transition-colors h-11 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <KeyRound className="w-4 h-4 text-[#08BBD4]" />
              <span>Generator</span>
            </button>
          )}

          {/* New Credential Button (Primary Action) */}
          {status === 'unlocked' && (
            <button
              id="header-add-btn"
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-2 rounded-xl bg-[#08BBD4] hover:bg-[#0797AD] active:bg-[#0797AD] text-white text-xs font-semibold shadow-xs transition-colors h-10 min-w-[40px] sm:h-11 sm:min-w-[44px] whitespace-nowrap shrink-0 cursor-pointer"
              title="Add new vault credential"
              aria-label="Add new vault credential"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">New Item</span>
            </button>
          )}

          {/* Lock Vault Button */}
          {status === 'unlocked' && (
            <button
              id="header-lock-btn"
              onClick={lockVault}
              className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl border border-[#1D3855] hover:border-[#D64545] bg-[#062A63]/40 hover:bg-[#D64545] text-[#F5F9FF] hover:text-white text-xs font-medium transition-colors h-10 min-w-[40px] sm:h-11 sm:min-w-[44px] whitespace-nowrap shrink-0 cursor-pointer group"
              title="Immediately lock vault and scrub encryption keys from memory"
              aria-label="Lock Vault"
            >
              <Lock className="w-4 h-4 text-[#D64545] group-hover:text-white transition-colors shrink-0" />
              <span className="hidden sm:inline">Lock</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile App (.apk / PWA) Install Dialog */}
      <MobileInstallModal
        isOpen={isInstallModalOpen}
        onClose={() => setIsInstallModalOpen(false)}
      />
    </header>
  );
};
