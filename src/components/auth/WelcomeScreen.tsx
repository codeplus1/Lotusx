/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { Plus, Upload, CloudDownload, QrCode, Sun, Moon } from 'lucide-react';
import { LotusXLogo } from '../common/LotusXLogo';
import { useTheme } from '../../context/ThemeContext';

interface WelcomeScreenProps {
  onCreateVault: () => void;
  onRestoreBackup: () => void;
  onRestoreFromGoogleDrive?: () => void;
  onScanRecoveryKitQr?: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onCreateVault,
  onRestoreBackup,
  onRestoreFromGoogleDrive,
  onScanRecoveryKitQr,
}) => {
  const { isDark, toggleDarkMode } = useTheme();

  return (
    <div className="min-h-screen bg-[#03152F] text-[#F5F9FF] flex flex-col justify-between p-4 sm:p-6 md:p-12 relative overflow-x-hidden">
      {/* Subtle Radial Top Highlight */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[360px] rounded-full pointer-events-none opacity-20"
        style={{
          background: 'radial-gradient(circle, rgba(8, 187, 212, 0.25) 0%, rgba(6, 42, 99, 0) 70%)',
        }}
      />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between max-w-6xl w-full mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#062A63] border border-[#1D3855] flex items-center justify-center shadow-xs">
            <LotusXLogo size="md" />
          </div>
          <div>
            <span className="font-bold text-lg tracking-tight text-white">LotusX</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg bg-[#0B1F38] hover:bg-[#112B4A] text-[#B8C6D8] hover:text-white border border-[#1D3855] transition-colors cursor-pointer"
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {isDark ? <Sun className="w-4 h-4 text-[#08BBD4]" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Hero Center */}
      <main className="relative z-10 max-w-4xl w-full mx-auto my-auto py-4 sm:py-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center space-y-3"
        >
          <div className="space-y-2">
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-tight">
              Secure Your <span className="text-[#08BBD4]">Passwords.</span>
            </h1>

            <p className="text-sm sm:text-base text-[#B8C6D8] max-w-lg mx-auto leading-relaxed px-2">
              Store and protect your passwords safely on your device.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={onCreateVault}
              className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-[#08BBD4] hover:bg-[#0797AD] text-white font-semibold text-sm shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              Create New Encrypted Vault
            </button>

            <button
              onClick={onRestoreBackup}
              className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl bg-[#062A63] hover:bg-[#08357A] border border-[#1D3855] text-white font-semibold text-sm transition-all cursor-pointer"
            >
              <Upload className="w-4 h-4 text-[#08BBD4]" />
              Restore from .vault File
            </button>
          </div>

          {/* Disaster Recovery Options */}
          {(onRestoreFromGoogleDrive || onScanRecoveryKitQr) && (
            <div className="pt-1 grid grid-cols-2 sm:flex sm:flex-nowrap items-center justify-center gap-2.5 max-w-md mx-auto">
              {onRestoreFromGoogleDrive && (
                <button
                  onClick={onRestoreFromGoogleDrive}
                  className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-lg bg-[#0B1F38] hover:bg-[#112B4A] border border-[#1D3855] text-xs font-medium text-[#B8C6D8] hover:text-white transition-all cursor-pointer whitespace-nowrap"
                >
                  <CloudDownload className="w-3.5 h-3.5 text-[#08BBD4] shrink-0" />
                  <span>Google Drive</span>
                </button>
              )}
              {onScanRecoveryKitQr && (
                <button
                  onClick={onScanRecoveryKitQr}
                  className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-lg bg-[#0B1F38] hover:bg-[#112B4A] border border-[#1D3855] text-xs font-medium text-[#B8C6D8] hover:text-white transition-all cursor-pointer whitespace-nowrap"
                >
                  <QrCode className="w-3.5 h-3.5 text-[#08BBD4] shrink-0" />
                  <span>Scan Recovery QR</span>
                </button>
              )}
            </div>
          )}
        </motion.div>
      </main>

      {/* Footer Spacer */}
      <footer className="relative z-10 max-w-6xl w-full mx-auto h-6 select-none pointer-events-none" aria-hidden="true" />
    </div>
  );
};
