/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { KeyRound, Clock, Trash2, Menu, X, Smartphone, Sun, Moon, ArrowLeft } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { useTheme } from '../../context/ThemeContext';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { MobileInstallModal } from '../mobile/MobileInstallModal';
import { VAULT_CATEGORIES } from '../../core/constants';

export const Header: React.FC = () => {
  const {
    status,
    activeView,
    selectedCategory,
    selectedRecord,
    clipboardSeconds,
    clearClipboardNow,
    setIsGeneratorModalOpen,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    canGoBack,
    navigateBack,
    setActiveView,
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

  const getHeaderPageTitle = (): string | null => {
    if (status !== 'unlocked' || activeView === 'dashboard') {
      return null;
    }

    switch (activeView) {
      case 'items': {
        if (selectedRecord) {
          return selectedRecord.title || 'Record Details';
        }
        if (selectedCategory === 'trash') {
          return 'Trash';
        }
        const catDef = VAULT_CATEGORIES.find((c) => c.id === selectedCategory);
        if (catDef) {
          return catDef.name;
        }
        if (selectedCategory === 'card') return 'Cards';
        if (selectedCategory === 'note') return 'Secure Notes';
        return 'All Items';
      }
      case 'categories':
        return 'Categories';
      case 'security_center':
        return 'Security Center';
      case 'generator':
        return 'Password Generator';
      case 'audit':
        return 'Audit Suite';
      case 'settings':
        return 'Settings';
      case 'search':
        return 'Search';
      default:
        return null;
    }
  };

  const pageTitle = getHeaderPageTitle();

  return (
    <header className="sticky top-0 z-40 bg-[#03152F] border-b border-[#1D3855] text-white">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Back Button (when navigated) OR Drawer Icon (on Dashboard) + Page Name / Brand Identity */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {status === 'unlocked' && (
            canGoBack ? (
              <button
                id="header-back-btn"
                type="button"
                onClick={navigateBack}
                className="p-2 -ml-1 text-[#B8C6D8] hover:text-white hover:bg-[#062A63]/70 active:bg-[#062A63] rounded-full transition-colors h-10 w-10 flex items-center justify-center shrink-0 cursor-pointer"
                title="Go Back"
                aria-label="Go Back"
              >
                <ArrowLeft className="w-5 h-5 text-white shrink-0" />
              </button>
            ) : (
              <button
                id="sidebar-toggle-btn"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden p-2 -ml-1 text-[#B8C6D8] hover:text-white hover:bg-[#062A63]/70 active:bg-[#062A63] rounded-full transition-colors h-10 w-10 flex items-center justify-center shrink-0 cursor-pointer"
                title={isMobileMenuOpen ? 'Close Navigation' : 'Open Navigation'}
                aria-label="Toggle Sidebar Menu"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            )
          )}

          {pageTitle ? (
            <h1 className="font-bold text-base sm:text-lg text-white tracking-tight truncate leading-tight">
              {pageTitle}
            </h1>
          ) : (
            <div
              onClick={() => status === 'unlocked' && setActiveView('dashboard')}
              className={`flex items-center gap-2 sm:gap-2.5 shrink-0 ${
                status === 'unlocked' ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''
              }`}
              title={status === 'unlocked' ? 'Go to Dashboard' : undefined}
            >
              <span className="font-bold text-base sm:text-lg text-white tracking-tight whitespace-nowrap block leading-tight">
                Lotus<span className="text-[#08BBD4] font-extrabold">X</span>
              </span>
            </div>
          )}
        </div>

        {/* Right: Actions and Status */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Clipboard Auto-Clear Status */}
          {clipboardSeconds > 0 && (
            <div
              id="clipboard-status-badge"
              className="flex items-center gap-1 bg-[#062A63] border border-[#08BBD4]/40 text-white pl-2.5 pr-1 py-1 rounded-full text-[11px] font-medium tabular-nums"
              title="Clipboard will automatically be wiped"
            >
              <Clock className="w-3.5 h-3.5 text-[#08BBD4] shrink-0" />
              <span>{clipboardSeconds}s</span>
              <button
                id="clipboard-wipe-btn"
                onClick={clearClipboardNow}
                className="text-[#B8C6D8] hover:text-white hover:bg-[#03152F]/60 p-1 rounded-full transition-colors h-6 w-6 flex items-center justify-center cursor-pointer"
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
            className="p-2 rounded-full text-[#B8C6D8] hover:text-[#08BBD4] hover:bg-[#062A63]/70 active:bg-[#062A63] transition-colors h-10 w-10 flex items-center justify-center shrink-0 cursor-pointer"
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDark ? <Sun className="w-5 h-5 text-[#08BBD4]" /> : <Moon className="w-5 h-5 text-[#B8C6D8]" />}
          </button>

          {/* Install Mobile App Button (auto-suppressed when already running in standalone mode) */}
          {!isInstalled && (
            <button
              id="header-install-btn"
              onClick={handleInstallClick}
              disabled={isInstalling}
              className="flex items-center justify-center gap-1.5 p-2 sm:px-3.5 sm:py-2 rounded-full hover:bg-[#062A63]/80 sm:bg-[#062A63]/70 sm:border sm:border-[#1D3855] sm:hover:border-[#08BBD4]/60 text-white text-xs font-medium transition-colors h-10 w-10 sm:w-auto whitespace-nowrap shrink-0 cursor-pointer"
              title="Directly install LotusX on your device"
              aria-label="Install mobile app"
            >
              <Smartphone className="w-5 h-5 sm:w-4 sm:h-4 text-[#08BBD4] shrink-0" />
              <span className="hidden sm:inline">{isInstalling ? 'Opening...' : 'Install App'}</span>
            </button>
          )}

          {/* Quick Generator Button (Desktop) */}
          {status === 'unlocked' && (
            <button
              id="quick-generator-btn"
              onClick={() => setIsGeneratorModalOpen(true)}
              className="hidden md:flex items-center gap-1.5 px-4 py-2 rounded-full border border-[#1D3855] hover:border-[#08BBD4]/60 bg-[#062A63]/70 hover:bg-[#08357A] text-xs font-medium text-white transition-colors h-10 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <KeyRound className="w-4 h-4 text-[#08BBD4]" />
              <span>Generator</span>
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
