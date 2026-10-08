/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { Lock, KeyRound, Plus, Upload, Cpu, CheckCircle2, CloudDownload, QrCode, Sun, Moon, Shield } from 'lucide-react';
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
            <span className="ml-2 text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded bg-[#062A63] text-[#08BBD4] border border-[#08BBD4]/30">
              Zero-Knowledge Vault
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs text-[#B8C6D8] font-mono bg-[#0B1F38] px-3 py-1.5 rounded-lg border border-[#1D3855]">
            <span className="w-2 h-2 rounded-full bg-[#16A56B]" />
            AES-256-GCM • PBKDF2-SHA256
          </div>
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
      <main className="relative z-10 max-w-4xl w-full mx-auto my-auto py-8 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center space-y-6"
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#062A63] border border-[#1D3855] text-[#08BBD4] text-xs font-medium">
            <Lock className="w-3.5 h-3.5" />
            <span>100% Client-Side Cryptographic Architecture</span>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white leading-[1.12]">
            Uncompromising Security for Your{' '}
            <span className="text-[#08BBD4]">Digital Identity.</span>
          </h1>

          <p className="text-sm sm:text-base md:text-lg text-[#B8C6D8] max-w-2xl mx-auto leading-relaxed px-2">
            LotusX encrypts your credentials locally on your device before they ever touch storage.
            Your master password never leaves memory, and no unencrypted secrets are ever persisted.
          </p>

          {/* Action Buttons */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
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
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              {onRestoreFromGoogleDrive && (
                <button
                  onClick={onRestoreFromGoogleDrive}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0B1F38] hover:bg-[#112B4A] border border-[#1D3855] text-xs font-medium text-[#B8C6D8] hover:text-white transition-all cursor-pointer"
                >
                  <CloudDownload className="w-3.5 h-3.5 text-[#08BBD4]" />
                  Restore from Google Drive
                </button>
              )}
              {onScanRecoveryKitQr && (
                <button
                  onClick={onScanRecoveryKitQr}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0B1F38] hover:bg-[#112B4A] border border-[#1D3855] text-xs font-medium text-[#B8C6D8] hover:text-white transition-all cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5 text-[#08BBD4]" />
                  Scan Recovery QR Code
                </button>
              )}
            </div>
          )}
        </motion.div>

        {/* Architecture Pillars */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12 sm:mt-16"
        >
          <div className="p-6 rounded-xl bg-[#0B1F38] border border-[#1D3855] space-y-3">
            <div className="w-10 h-10 rounded-lg bg-[#062A63] border border-[#1D3855] flex items-center justify-center text-[#08BBD4]">
              <KeyRound className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-white text-base">600,000 PBKDF2 Iterations</h3>
            <p className="text-xs text-[#B8C6D8] leading-relaxed">
              Master keys are derived using OWASP-recommended PBKDF2-HMAC-SHA256 stretching with a cryptographically random 128-bit salt.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-[#0B1F38] border border-[#1D3855] space-y-3">
            <div className="w-10 h-10 rounded-lg bg-[#062A63] border border-[#1D3855] flex items-center justify-center text-[#08BBD4]">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-white text-base">Authenticated AES-256-GCM</h3>
            <p className="text-xs text-[#B8C6D8] leading-relaxed">
              Every vault save generates a fresh 96-bit IV and 128-bit authentication tag, preventing any unauthorized ciphertext tampering.
            </p>
          </div>

          <div className="p-6 rounded-xl bg-[#0B1F38] border border-[#1D3855] space-y-3">
            <div className="w-10 h-10 rounded-lg bg-[#062A63] border border-[#1D3855] flex items-center justify-center text-[#08BBD4]">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-white text-base">Zero-Plaintext Memory Policy</h3>
            <p className="text-xs text-[#B8C6D8] leading-relaxed">
              Derived keys reside strictly as non-extractable CryptoKey handles in volatile RAM and are wiped immediately on lock or inactivity.
            </p>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 max-w-6xl w-full mx-auto pt-6 border-t border-[#1D3855] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#8493A5]">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[#B8C6D8]">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#16A56B]" /> Web Crypto API Verified
          </span>
          <span className="flex items-center gap-1.5 text-[#B8C6D8]">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#16A56B]" /> IndexedDB Local Persistence
          </span>
        </div>
        <div>LotusX Security Engineering • Zero-Knowledge Architecture</div>
      </footer>
    </div>
  );
};
