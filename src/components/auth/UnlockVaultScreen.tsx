/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Lock, Unlock, Eye, EyeOff, AlertCircle, Upload, RefreshCw, Fingerprint, CloudDownload, QrCode } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { LotusXLogo } from '../common/LotusXLogo';
import { biometricService } from '../../security/BiometricService';

interface UnlockVaultScreenProps {
  onRestoreBackup: () => void;
  onRestoreFromGoogleDrive?: () => void;
  onScanRecoveryKitQr?: () => void;
}

export const UnlockVaultScreen: React.FC<UnlockVaultScreenProps> = ({
  onRestoreBackup,
  onRestoreFromGoogleDrive,
  onScanRecoveryKitQr,
}) => {
  const { unlock } = useVault();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isBiometricUnlocking, setIsBiometricUnlocking] = useState(false);
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [hardwareAvailable, setHardwareAvailable] = useState(false);
  const [enableBiometricsAfterUnlock, setEnableBiometricsAfterUnlock] = useState(false);
  const [platformBioLabel, setPlatformBioLabel] = useState('Fingerprint / Face ID');
  const [error, setError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    const enabled = biometricService.isBiometricEnabled();
    setHasBiometrics(enabled);
    setPlatformBioLabel(biometricService.getPlatformBiometricLabel());
    biometricService.isHardwareAvailable().then((avail) => {
      setHardwareAvailable(avail);
    });
  }, []);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const handleBiometricUnlock = async () => {
    if (isBiometricUnlocking || isUnlocking || cooldownSeconds > 0) return;

    setIsBiometricUnlocking(true);
    setError(null);

    try {
      const recoveredPassword = await biometricService.authenticateAndGetPassword();
      const result = await unlock(recoveredPassword);

      if (!result.success) {
        setError(result.error || 'Biometric unlock failed. Please enter your Master Password.');
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Biometric authentication was cancelled or failed.'
      );
    } finally {
      setIsBiometricUnlocking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || isUnlocking || cooldownSeconds > 0) return;

    setIsUnlocking(true);
    setError(null);

    await new Promise((r) => setTimeout(r, 60));

    const result = await unlock(password);

    if (result.success && enableBiometricsAfterUnlock && !hasBiometrics) {
      try {
        await biometricService.enableBiometricUnlock(password);
        setHasBiometrics(true);
      } catch {
        // Proceed with standard password unlock even if user cancelled biometric prompt
      }
    }

    setIsUnlocking(false);

    if (!result.success) {
      setError(result.error || 'Invalid master password');
      if (result.remainingLockoutMs && result.remainingLockoutMs > 0) {
        setCooldownSeconds(Math.ceil(result.remainingLockoutMs / 1000));
      }
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen bg-[#03152F] text-[#F5F9FF] flex flex-col justify-between p-4 sm:p-6 relative overflow-x-hidden">
      {/* Subtle Top Highlight */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full pointer-events-none opacity-20"
        style={{
          background: 'radial-gradient(circle, rgba(8, 187, 212, 0.22) 0%, rgba(6, 42, 99, 0) 70%)',
        }}
      />

      <div />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full mx-auto my-auto bg-[#0D223D] border border-[#1D3855] rounded-2xl p-6 sm:p-8 shadow-xl relative z-10"
      >
        <div className="flex flex-col items-center text-center mb-7">
          <div className="w-16 h-16 rounded-2xl bg-[#062A63] border border-[#1D3855] flex items-center justify-center mb-4 shadow-sm">
            <LotusXLogo size="xl" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Vault Locked</h1>
          <p className="text-xs text-[#B8C6D8] mt-1">
            Enter your Master Password to unlock.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#B8C6D8]">
              Master Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter Master Password..."
                autoFocus
                disabled={isUnlocking || cooldownSeconds > 0}
                className="w-full bg-[#061426] border border-[#1D3855] focus:border-[#08BBD4] focus:ring-2 focus:ring-[#08BBD4]/20 rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder:text-[#8493A5] focus:outline-none transition-all font-mono disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8493A5] hover:text-white p-1 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {!hasBiometrics && hardwareAvailable && (
            <label className="flex items-center gap-2.5 p-3 rounded-xl bg-[#061426]/80 border border-[#1D3855] cursor-pointer select-none hover:border-[#08BBD4]/50 transition-colors">
              <input
                type="checkbox"
                checked={enableBiometricsAfterUnlock}
                onChange={(e) => setEnableBiometricsAfterUnlock(e.target.checked)}
                disabled={isUnlocking || cooldownSeconds > 0}
                className="w-4 h-4 rounded border-[#1D3855] bg-[#03152F] text-[#08BBD4] focus:ring-[#08BBD4]"
              />
              <div className="flex items-center gap-2 text-xs text-[#F5F9FF]">
                <Fingerprint className="w-4 h-4 text-[#08BBD4] shrink-0" />
                <span>Enable {platformBioLabel} for future unlocks</span>
              </div>
            </label>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="p-3 rounded-xl bg-[#D64545]/15 border border-[#D64545]/40 flex items-start gap-2.5 text-xs text-[#F5F9FF]"
            >
              <AlertCircle className="w-4 h-4 text-[#D64545] shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-[#D64545]">{error}</p>
                {cooldownSeconds > 0 && (
                  <p className="text-[11px] text-[#B8C6D8] mt-1 font-mono">
                    Exponential backoff active: Wait {cooldownSeconds}s
                  </p>
                )}
              </div>
            </motion.div>
          )}

          <button
            type="submit"
            disabled={!password || isUnlocking || isBiometricUnlocking || cooldownSeconds > 0}
            className="w-full py-3.5 px-6 rounded-xl bg-[#08BBD4] hover:bg-[#0797AD] disabled:bg-[#112B4A] disabled:text-[#8493A5] text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shadow-sm"
          >
            {isUnlocking ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Decrypting AES-256-GCM Payload...
              </>
            ) : cooldownSeconds > 0 ? (
              <>
                <Lock className="w-4 h-4" />
                Locked ({cooldownSeconds}s)
              </>
            ) : (
              <>
                <Unlock className="w-4 h-4" />
                Unlock Vault
              </>
            )}
          </button>

          {hasBiometrics && (
            <button
              type="button"
              onClick={handleBiometricUnlock}
              disabled={isUnlocking || isBiometricUnlocking || cooldownSeconds > 0}
              className="w-full py-3 px-5 rounded-xl bg-[#062A63] hover:bg-[#08357A] border border-[#1D3855] text-white font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isBiometricUnlocking ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-[#08BBD4]" />
                  Verifying Device Biometrics...
                </>
              ) : (
                <>
                  <Fingerprint className="w-4 h-4 text-[#08BBD4]" />
                  Unlock with {platformBioLabel}
                </>
              )}
            </button>
          )}
        </form>

        {/* Secondary Recovery Actions */}
        <div className="mt-6 pt-5 border-t border-[#1D3855] flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-y-3 gap-x-4 text-xs">
            <button
              type="button"
              onClick={onRestoreBackup}
              className="inline-flex items-center gap-1.5 text-[#B8C6D8] hover:text-white transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-[#08BBD4] shrink-0" />
              <span>Restore .vault File</span>
            </button>

            {onRestoreFromGoogleDrive && (
              <button
                type="button"
                onClick={onRestoreFromGoogleDrive}
                className="inline-flex items-center gap-1.5 text-[#B8C6D8] hover:text-white transition-colors cursor-pointer"
              >
                <CloudDownload className="w-3.5 h-3.5 text-[#08BBD4] shrink-0" />
                <span>Google Drive</span>
              </button>
            )}

            {onScanRecoveryKitQr && (
              <button
                type="button"
                onClick={onScanRecoveryKitQr}
                className="inline-flex items-center gap-1.5 text-[#B8C6D8] hover:text-white transition-colors cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5 text-[#08BBD4] shrink-0" />
                <span>Scan QR Kit</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>

      <div className="relative z-10 h-8 select-none pointer-events-none" aria-hidden="true" />
    </div>
  );
};
