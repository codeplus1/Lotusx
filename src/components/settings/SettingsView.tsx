/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Sun,
  Moon,
  Monitor,
  Shield,
  Lock,
  KeyRound,
  Fingerprint,
  Cloud,
  CloudUpload,
  CloudDownload,
  Database,
  QrCode,
  Download,
  Upload,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  LogOut,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileJson,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { useTheme } from '../../context/ThemeContext';
import { ThemeMode } from '../../types/theme';
import { backupService } from '../../storage/BackupService';
import { passwordGenerator } from '../../security/PasswordGeneratorService';
import { biometricService, BiometricMetadata } from '../../security/BiometricService';
import {
  googleDriveService,
  DriveBackupFileMetadata,
} from '../../services/GoogleDriveBackupService';
import { EmergencyRecoveryKitModal } from '../recovery/EmergencyRecoveryKitModal';
import { GoogleDriveBackupModal } from '../recovery/GoogleDriveBackupModal';
import { QRScannerModal } from '../recovery/QRScannerModal';
import { Modal } from '../common/Modal';

const LAST_BACKUP_STORAGE_KEY = 'lotusx_last_backup_at';

export const SettingsView: React.FC = () => {
  const {
    updateSettings,
    autoLockMinutes,
    setAutoLockMinutes,
    changeMasterPassword,
    wipeVault,
    importMultipleRecords,
    applyRestoredVault,
    records,
  } = useVault();

  const { themeMode, setThemeMode } = useTheme();

  // --- A. Appearance ---
  const handleThemeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
    updateSettings({ theme: mode });
  };

  // --- B. Security ---
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmNewPw, setConfirmNewPw] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [rotateStatus, setRotateStatus] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);

  // Biometric Unlock State (only shown when supported or already enabled)
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricMeta, setBiometricMeta] = useState<BiometricMetadata | null>(null);
  const [isBiometricEnrollOpen, setIsBiometricEnrollOpen] = useState(false);
  const [biometricMasterPw, setBiometricMasterPw] = useState('');
  const [showBiometricPw, setShowBiometricPw] = useState(false);
  const [biometricDeviceLabel, setBiometricDeviceLabel] = useState('');
  const [isEnrollingBiometric, setIsEnrollingBiometric] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);

  // --- C. Backup & Restore ---
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [connectedDriveEmail, setConnectedDriveEmail] = useState<string | null>(null);
  const [driveBackups, setDriveBackups] = useState<DriveBackupFileMetadata[]>([]);
  const [isDriveBusy, setIsDriveBusy] = useState(false);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(() => {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(LAST_BACKUP_STORAGE_KEY);
  });
  const [isDisconnectConfirmOpen, setIsDisconnectConfirmOpen] = useState(false);
  const [isGoogleDriveModalOpen, setIsGoogleDriveModalOpen] = useState(false);

  // Local Encrypted Backup (.vault) State
  const [isLocalBackupOpen, setIsLocalBackupOpen] = useState(false);
  const [backupPw, setBackupPw] = useState('');
  const [showBackupPw, setShowBackupPw] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);

  const [isLocalRestoreOpen, setIsLocalRestoreOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePw, setRestorePw] = useState('');
  const [showRestorePw, setShowRestorePw] = useState(false);
  const [confirmLocalRestoreOverwrite, setConfirmLocalRestoreOverwrite] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);

  const [backupBanner, setBackupBanner] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);

  // --- E. Data & Recovery ---
  const [isEmergencyKitOpen, setIsEmergencyKitOpen] = useState(false);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [isPlaintextExportModalOpen, setIsPlaintextExportModalOpen] = useState(false);
  const [dataFeedback, setDataFeedback] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);

  // Delete All Vault Data Modal State
  const [isDeleteVaultModalOpen, setIsDeleteVaultModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingVault, setIsDeletingVault] = useState(false);

  const recordLastBackupNow = useCallback(() => {
    const iso = new Date().toISOString();
    setLastBackupDate(iso);
    try {
      localStorage.setItem(LAST_BACKUP_STORAGE_KEY, iso);
    } catch {
      // Ignored
    }
  }, []);

  const refreshDriveState = useCallback(async () => {
    const authed = googleDriveService.isAuthenticated();
    setIsDriveConnected(authed);
    setConnectedDriveEmail(googleDriveService.getUserProfile().email);
    if (authed) {
      try {
        const list = await googleDriveService.listEncryptedBackups();
        setDriveBackups(list);
        if (list.length > 0 && list[0].createdTime) {
          setLastBackupDate((prev) => {
            if (!prev || new Date(list[0].createdTime!) > new Date(prev)) {
              return list[0].createdTime!;
            }
            return prev;
          });
        }
      } catch {
        setIsDriveConnected(googleDriveService.isAuthenticated());
      }
    } else {
      setDriveBackups([]);
    }
  }, []);

  useEffect(() => {
    biometricService.isHardwareAvailable().then(setBiometricAvailable);
    setBiometricMeta(biometricService.getMetadata());
    refreshDriveState();
  }, [refreshDriveState]);

  // --- Handlers: Security ---
  const handleRotatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 10 || newPw !== confirmNewPw) return;

    setIsRotating(true);
    setRotateStatus(null);
    const res = await changeMasterPassword(currentPw, newPw);
    setIsRotating(false);

    if (res.success) {
      setBiometricMeta(biometricService.getMetadata());
      setRotateStatus({
        type: 'success',
        msg: 'Your master password has been updated.',
      });
      setCurrentPw('');
      setNewPw('');
      setConfirmNewPw('');
      setIsChangePasswordOpen(false);
    } else {
      setRotateStatus({
        type: 'error',
        msg: res.error || 'Current master password is incorrect.',
      });
    }
  };

  const handleEnrollBiometric = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!biometricMasterPw || isEnrollingBiometric) return;

    setIsEnrollingBiometric(true);
    setBiometricStatus(null);

    try {
      const meta = await biometricService.enableBiometricUnlock(
        biometricMasterPw,
        biometricDeviceLabel.trim() || undefined
      );
      setBiometricMeta(meta);
      setBiometricMasterPw('');
      setBiometricDeviceLabel('');
      setIsBiometricEnrollOpen(false);
      setBiometricStatus({
        type: 'success',
        msg: 'Biometric unlock is now enabled on this device.',
      });
    } catch (err: unknown) {
      setBiometricStatus({
        type: 'error',
        msg: err instanceof Error ? err.message : 'Could not enable biometric unlock.',
      });
    } finally {
      setIsEnrollingBiometric(false);
    }
  };

  const handleDisableBiometric = () => {
    biometricService.disableBiometricUnlock();
    setBiometricMeta(null);
    setBiometricStatus({
      type: 'success',
      msg: 'Biometric unlock has been turned off.',
    });
  };

  // --- Handlers: Backup & Restore ---
  const handleConnectDrive = async () => {
    setIsDriveBusy(true);
    setBackupBanner(null);
    try {
      await googleDriveService.authenticate();
      await refreshDriveState();
      setBackupBanner({
        type: 'success',
        msg: 'Google Drive connected.',
      });
    } catch (err: unknown) {
      setBackupBanner({
        type: 'error',
        msg: err instanceof Error ? err.message : 'Could not connect to Google Drive.',
      });
    } finally {
      setIsDriveBusy(false);
    }
  };

  const handleConfirmDisconnectDrive = async () => {
    await googleDriveService.disconnect();
    setIsDriveConnected(false);
    setConnectedDriveEmail(null);
    setDriveBackups([]);
    setIsDisconnectConfirmOpen(false);
    setBackupBanner({
      type: 'success',
      msg: 'Google Drive has been disconnected.',
    });
  };

  const handleExportLocalBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupPw || backupPw.length < 8) return;

    setIsExportingBackup(true);
    setBackupBanner(null);
    try {
      await backupService.exportEncryptedBackup(backupPw);
      recordLastBackupNow();
      setBackupPw('');
      setIsLocalBackupOpen(false);
      setBackupBanner({
        type: 'success',
        msg: 'Encrypted backup file (.vault) downloaded to your device.',
      });
    } catch (err: unknown) {
      setBackupBanner({
        type: 'error',
        msg: err instanceof Error ? err.message : 'Could not create backup file.',
      });
    } finally {
      setIsExportingBackup(false);
    }
  };

  const activeRecordCount = records.filter((r) => !r.deletedAt).length;

  const handleRestoreLocalBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreFile || !restorePw) return;

    if (activeRecordCount > 0 && !confirmLocalRestoreOverwrite) {
      setConfirmLocalRestoreOverwrite(true);
      return;
    }

    setIsRestoringBackup(true);
    setBackupBanner(null);
    try {
      const text = await restoreFile.text();
      const res = await backupService.restoreEncryptedBackup(text, restorePw);
      applyRestoredVault(res);
      setBackupBanner({
        type: 'success',
        msg: `Restored ${res.recordCount} items from backup.`,
      });
      setRestorePw('');
      setRestoreFile(null);
      setConfirmLocalRestoreOverwrite(false);
      setIsLocalRestoreOpen(false);
    } catch (err: unknown) {
      setBackupBanner({
        type: 'error',
        msg:
          err instanceof Error
            ? err.message
            : 'Could not restore backup. Please check your password and try again.',
      });
    } finally {
      setIsRestoringBackup(false);
    }
  };

  // --- Handlers: Data & Recovery ---
  const handleFileImport = async (
    e: React.ChangeEvent<HTMLInputElement>,
    format: 'json' | 'csv'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setDataFeedback(null);
    try {
      const content = await file.text();
      if (format === 'json') {
        const parsed = backupService.parsePlaintextJsonImport(content);
        const count = await importMultipleRecords(parsed);
        setDataFeedback({
          type: 'success',
          msg: `Imported ${count} items from JSON (${parsed.length - count} duplicates skipped).`,
        });
      } else {
        const report = await backupService.parseCsvImportWithReport(content, records);
        const savedCount = await importMultipleRecords(report.records);
        const skippedExisting = report.records.length - savedCount;
        const totalSkipped = report.skippedCount + report.duplicateCount + skippedExisting;
        setDataFeedback({
          type: 'success',
          msg: `Imported ${savedCount} passwords from CSV${
            totalSkipped > 0 ? ` (${totalSkipped} duplicate or empty rows skipped)` : ''
          }.`,
        });
      }
    } catch (err: unknown) {
      setDataFeedback({
        type: 'error',
        msg: err instanceof Error ? err.message : 'Could not import file. Please check the file format.',
      });
    } finally {
      e.target.value = '';
    }
  };

  const handleConfirmPlaintextExport = () => {
    const activeItems = records.filter((r) => !r.deletedAt);
    backupService.exportPlaintextJson(activeItems);
    setIsPlaintextExportModalOpen(false);
    setDataFeedback({
      type: 'success',
      msg: `Exported ${activeItems.length} items as unencrypted JSON. Keep this file safe and delete it when done.`,
    });
  };

  const handleConfirmDeleteVault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteConfirmText !== 'DELETE') return;
    setIsDeletingVault(true);
    try {
      await wipeVault();
    } finally {
      setIsDeletingVault(false);
      setIsDeleteVaultModalOpen(false);
      setDeleteConfirmText('');
    }
  };

  const newPwStrength = passwordGenerator.evaluateStrength(newPw);
  const showBiometricSection = biometricAvailable || Boolean(biometricMeta?.enabled);

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Page Title & Subtitle */}
      <div className="px-1">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">Settings</h1>
        <p className="text-sm text-text-secondary mt-1">
          Manage your security, appearance, and backups.
        </p>
      </div>

      {/* A. Appearance */}
      <section
        aria-labelledby="settings-appearance-heading"
        className="bg-bg-surface rounded-xl border border-border p-6 space-y-4"
      >
        <div className="flex items-center gap-2.5">
          <Sun className="w-4 h-4 text-primary shrink-0" />
          <h2 id="settings-appearance-heading" className="text-base font-semibold text-text-primary">
            Appearance
          </h2>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-text-primary">Theme</div>
            <p className="text-xs text-text-secondary mt-0.5">
              Choose how Lotusx looks on your device.
            </p>
          </div>

          <div
            role="radiogroup"
            aria-label="Theme preference"
            className="inline-flex items-center p-1 rounded-xl bg-bg-secondary border border-border self-start sm:self-auto"
          >
            {(
              [
                { id: 'system', label: 'System', icon: Monitor },
                { id: 'light', label: 'Light', icon: Sun },
                { id: 'dark', label: 'Dark', icon: Moon },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const isSelected = themeMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => handleThemeChange(opt.id)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'bg-primary text-white font-semibold'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* B. Security */}
      <section
        aria-labelledby="settings-security-heading"
        className="bg-bg-surface rounded-xl border border-border p-6 space-y-5"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-primary shrink-0" />
            <h2 id="settings-security-heading" className="text-base font-semibold text-text-primary">
              Security
            </h2>
          </div>
          <span className="text-xs text-text-secondary">
            Vault unlocked · Encrypted on this device
          </span>
        </div>

        {rotateStatus && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
              rotateStatus.type === 'success'
                ? 'bg-success/10 text-success border-success/25'
                : 'bg-error/10 text-error border-error/25'
            }`}
          >
            {rotateStatus.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{rotateStatus.msg}</span>
          </div>
        )}

        {/* Auto-lock after inactivity */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <label
              htmlFor="settings-autolock-select"
              className="text-sm font-medium text-text-primary block"
            >
              Auto-lock after inactivity
            </label>
            <p className="text-xs text-text-secondary mt-0.5">
              Automatically lock your vault when you step away.
            </p>
          </div>
          <select
            id="settings-autolock-select"
            value={autoLockMinutes}
            onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
            className="px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-xs font-medium text-text-primary focus:outline-none focus:border-primary cursor-pointer self-start sm:self-auto"
          >
            <option value={1}>1 minute</option>
            <option value={5}>5 minutes</option>
            <option value={15}>15 minutes</option>
            <option value={30}>30 minutes</option>
            <option value={0}>Never</option>
          </select>
        </div>

        {/* Change master password */}
        <div className="pt-4 border-t border-border space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-text-primary">Master password</div>
              <p className="text-xs text-text-secondary mt-0.5">
                Update the main password used to unlock your vault.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsChangePasswordOpen(!isChangePasswordOpen);
                setRotateStatus(null);
              }}
              className="px-4 py-2 rounded-xl border border-border hover:bg-bg-secondary text-xs font-medium text-text-primary inline-flex items-center gap-2 transition-colors cursor-pointer self-start sm:self-auto whitespace-nowrap"
            >
              <KeyRound className="w-3.5 h-3.5 text-primary" />
              <span>{isChangePasswordOpen ? 'Cancel' : 'Change Master Password'}</span>
            </button>
          </div>

          {isChangePasswordOpen && (
            <form
              onSubmit={handleRotatePassword}
              className="p-4 rounded-xl bg-bg-app border border-border space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">
                    Current password
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPw ? 'text' : 'password'}
                      value={currentPw}
                      onChange={(e) => setCurrentPw(e.target.value)}
                      placeholder="Current password"
                      className="w-full pl-3 pr-9 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs focus:outline-none focus:border-primary"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPw(!showCurrentPw)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
                      aria-label={showCurrentPw ? 'Hide current password' : 'Show current password'}
                    >
                      {showCurrentPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">
                    New password (10+ chars)
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPw ? 'text' : 'password'}
                      value={newPw}
                      onChange={(e) => setNewPw(e.target.value)}
                      placeholder="New password"
                      className="w-full pl-3 pr-9 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs focus:outline-none focus:border-primary"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw(!showNewPw)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
                      aria-label={showNewPw ? 'Hide new password' : 'Show new password'}
                    >
                      {showNewPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {newPw && (
                    <span
                      className="text-[11px] font-medium mt-1 block"
                      style={{ color: newPwStrength.color }}
                    >
                      Strength: {newPwStrength.label}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-primary mb-1">
                    Confirm new password
                  </label>
                  <input
                    type={showNewPw ? 'text' : 'password'}
                    value={confirmNewPw}
                    onChange={(e) => setConfirmNewPw(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs focus:outline-none focus:border-primary"
                    required
                  />
                  {confirmNewPw && newPw !== confirmNewPw && (
                    <span className="text-[11px] text-error mt-1 block">
                      Passwords do not match
                    </span>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="submit"
                  disabled={isRotating || !currentPw || newPw.length < 10 || newPw !== confirmNewPw}
                  className="btn-primary px-4 py-2 rounded-lg text-xs font-medium inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isRotating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    <span>Save New Password</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Biometric Unlock (only shown when supported by device or currently enrolled) */}
        {showBiometricSection && (
          <div className="pt-4 border-t border-border space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-text-primary">Biometric unlock</div>
                <p className="text-xs text-text-secondary mt-0.5">
                  {biometricMeta?.enabled
                    ? `Enabled on ${biometricMeta.deviceLabel || 'this device'}.`
                    : 'Unlock your vault with fingerprint, Face ID, or Windows Hello.'}
                </p>
              </div>

              {biometricMeta?.enabled ? (
                <button
                  type="button"
                  onClick={handleDisableBiometric}
                  className="px-4 py-2 rounded-xl border border-border hover:bg-bg-secondary text-xs font-medium text-error inline-flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto whitespace-nowrap"
                >
                  <span>Turn Off Biometrics</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsBiometricEnrollOpen(!isBiometricEnrollOpen);
                    setBiometricStatus(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-border hover:bg-bg-secondary text-xs font-medium text-text-primary inline-flex items-center gap-2 transition-colors cursor-pointer self-start sm:self-auto whitespace-nowrap"
                >
                  <Fingerprint className="w-3.5 h-3.5 text-primary" />
                  <span>{isBiometricEnrollOpen ? 'Cancel' : 'Set Up Biometrics'}</span>
                </button>
              )}
            </div>

            {isBiometricEnrollOpen && !biometricMeta?.enabled && (
              <form
                onSubmit={handleEnrollBiometric}
                className="p-4 rounded-xl bg-bg-app border border-border space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-text-primary mb-1">
                      Confirm master password
                    </label>
                    <div className="relative">
                      <input
                        type={showBiometricPw ? 'text' : 'password'}
                        value={biometricMasterPw}
                        onChange={(e) => setBiometricMasterPw(e.target.value)}
                        placeholder="Enter master password"
                        className="w-full pl-3 pr-9 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs focus:outline-none focus:border-primary"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowBiometricPw(!showBiometricPw)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
                        aria-label={showBiometricPw ? 'Hide password' : 'Show password'}
                      >
                        {showBiometricPw ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-text-primary mb-1">
                      Device name (optional)
                    </label>
                    <input
                      type="text"
                      value={biometricDeviceLabel}
                      onChange={(e) => setBiometricDeviceLabel(e.target.value)}
                      placeholder="e.g., My Laptop"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={!biometricMasterPw || isEnrollingBiometric}
                    className="btn-primary px-4 py-2 rounded-lg text-xs font-medium inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Fingerprint className="w-3.5 h-3.5" />
                    <span>{isEnrollingBiometric ? 'Waiting for sensor...' : 'Enable Biometrics'}</span>
                  </button>
                </div>
              </form>
            )}

            {biometricStatus && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
                  biometricStatus.type === 'success'
                    ? 'bg-success/10 text-success border-success/25'
                    : 'bg-error/10 text-error border-error/25'
                }`}
              >
                {biometricStatus.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{biometricStatus.msg}</span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* C. Backup & Restore */}
      <section
        aria-labelledby="settings-backup-heading"
        className="bg-bg-surface rounded-xl border border-border p-6 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Cloud className="w-4 h-4 text-primary shrink-0" />
            <h2 id="settings-backup-heading" className="text-base font-semibold text-text-primary">
              Backup &amp; Restore
            </h2>
          </div>
          {lastBackupDate && (
            <span className="text-xs text-text-secondary tabular-nums">
              Last backup: {new Date(lastBackupDate).toLocaleDateString()} at{' '}
              {new Date(lastBackupDate).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>

        <p className="text-xs text-text-secondary leading-relaxed">
          Your backups are encrypted on your device before they are saved or uploaded to Google Drive. Only someone with your backup password can unlock them.
        </p>

        {backupBanner && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
              backupBanner.type === 'success'
                ? 'bg-success/10 text-success border-success/25'
                : 'bg-error/10 text-error border-error/25'
            }`}
          >
            {backupBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{backupBanner.msg}</span>
          </div>
        )}

        {/* Google Drive Connection Row */}
        <div className="p-4 rounded-xl bg-bg-app border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-medium text-text-primary">
              Google Drive{' '}
              <span className="text-xs font-normal text-text-secondary">
                ·{' '}
                {isDriveConnected
                  ? `Connected${connectedDriveEmail ? ` (${connectedDriveEmail})` : ''}`
                  : 'Not connected'}
              </span>
            </div>
            <p className="text-xs text-text-secondary">
              {isDriveConnected
                ? `${driveBackups.length} encrypted cloud backup${driveBackups.length === 1 ? '' : 's'} stored in your Google Drive.`
                : 'Connect your Google account to save or restore encrypted backups in Google Drive.'}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-nowrap items-center gap-2 w-full sm:w-auto shrink-0">
            {!isDriveConnected ? (
              <button
                type="button"
                onClick={handleConnectDrive}
                disabled={isDriveBusy}
                className="col-span-2 btn-primary px-4 py-2 rounded-xl text-xs font-medium inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                {isDriveBusy ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <Cloud className="w-3.5 h-3.5" />
                    <span>Connect Google Drive</span>
                  </>
                )}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setIsGoogleDriveModalOpen(true)}
                  className="btn-primary px-3.5 py-2 rounded-xl text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <CloudUpload className="w-3.5 h-3.5 shrink-0" />
                  <span>Manage Backups</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsDisconnectConfirmOpen(true)}
                  className="px-3.5 py-2 rounded-xl border border-border hover:bg-bg-surface text-xs font-medium text-text-secondary hover:text-error inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <LogOut className="w-3.5 h-3.5 shrink-0" />
                  <span>Disconnect</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Local File Backup & Restore Actions */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-text-primary">Encrypted backup file</div>
            <p className="text-xs text-text-secondary mt-0.5">
              Save an encrypted backup file to your device or restore from a saved backup.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-nowrap items-center gap-2 w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={() => {
                setIsLocalBackupOpen(!isLocalBackupOpen);
                setIsLocalRestoreOpen(false);
                setBackupBanner(null);
              }}
              className="px-3.5 py-2 rounded-xl border border-border hover:bg-bg-secondary text-xs font-medium text-text-primary inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>Back Up Vault</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsLocalRestoreOpen(!isLocalRestoreOpen);
                setIsLocalBackupOpen(false);
                setConfirmLocalRestoreOverwrite(false);
                setBackupBanner(null);
              }}
              className="px-3.5 py-2 rounded-xl border border-border hover:bg-bg-secondary text-xs font-medium text-text-primary inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <CloudDownload className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>Restore Backup</span>
            </button>
          </div>
        </div>

        {/* Local Backup Form */}
        {isLocalBackupOpen && (
          <form
            onSubmit={handleExportLocalBackup}
            className="p-4 rounded-xl bg-bg-app border border-border space-y-3"
          >
            <div className="text-xs font-semibold text-text-primary">
              Create Encrypted Backup File (.vault)
            </div>
            <p className="text-xs text-text-secondary">
              Choose a password (at least 8 characters) to protect this backup file. You will need this password when restoring.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  type={showBackupPw ? 'text' : 'password'}
                  value={backupPw}
                  onChange={(e) => setBackupPw(e.target.value)}
                  placeholder="Enter backup password (8+ characters)"
                  className="w-full pl-3 pr-9 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs focus:outline-none focus:border-primary"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowBackupPw(!showBackupPw)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
                  aria-label={showBackupPw ? 'Hide backup password' : 'Show backup password'}
                >
                  {showBackupPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button
                type="submit"
                disabled={isExportingBackup || backupPw.length < 8}
                className="btn-primary px-4 py-2 rounded-lg text-xs font-medium inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>{isExportingBackup ? 'Encrypting...' : 'Download Backup'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Local Restore Form */}
        {isLocalRestoreOpen && (
          <form
            onSubmit={handleRestoreLocalBackup}
            className="p-4 rounded-xl bg-bg-app border border-border space-y-3"
          >
            <div className="text-xs font-semibold text-text-primary">
              Restore from Encrypted Backup File (.vault)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Backup file
                </label>
                <input
                  type="file"
                  accept=".vault,.json"
                  onChange={(e) => {
                    setRestoreFile(e.target.files?.[0] || null);
                    setConfirmLocalRestoreOverwrite(false);
                  }}
                  className="w-full text-xs text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-border file:text-xs file:font-medium file:bg-bg-surface file:text-text-primary cursor-pointer"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Backup password
                </label>
                <div className="relative">
                  <input
                    type={showRestorePw ? 'text' : 'password'}
                    value={restorePw}
                    onChange={(e) => {
                      setRestorePw(e.target.value);
                      setConfirmLocalRestoreOverwrite(false);
                    }}
                    placeholder="Password used for this backup"
                    className="w-full pl-3 pr-9 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs focus:outline-none focus:border-primary"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowRestorePw(!showRestorePw)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
                    aria-label={showRestorePw ? 'Hide restore password' : 'Show restore password'}
                  >
                    {showRestorePw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {confirmLocalRestoreOverwrite && (
              <div className="p-3 rounded-lg bg-warning/15 border border-warning/30 text-xs text-text-primary flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold text-warning block">
                    Replace current vault items?
                  </strong>
                  Restoring this backup will replace the {activeRecordCount} item
                  {activeRecordCount === 1 ? '' : 's'} currently in your vault. Click{' '}
                  <strong>Confirm &amp; Restore</strong> below to continue.
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="submit"
                disabled={isRestoringBackup || !restoreFile || !restorePw}
                className="btn-primary px-4 py-2 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>
                  {isRestoringBackup
                    ? 'Restoring...'
                    : confirmLocalRestoreOverwrite
                    ? 'Confirm & Restore'
                    : 'Restore Vault'}
                </span>
              </button>
            </div>
          </form>
        )}
      </section>

      {/* E. Data & Recovery */}
      <section
        aria-labelledby="settings-data-recovery-heading"
        className="bg-bg-surface rounded-xl border border-border p-6 space-y-5"
      >
        <div className="flex items-center gap-2.5">
          <Database className="w-4 h-4 text-primary shrink-0" />
          <h2
            id="settings-data-recovery-heading"
            className="text-base font-semibold text-text-primary"
          >
            Data &amp; Recovery
          </h2>
        </div>

        {dataFeedback && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${
              dataFeedback.type === 'success'
                ? 'bg-success/10 text-success border-success/25'
                : 'bg-error/10 text-error border-error/25'
            }`}
          >
            {dataFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{dataFeedback.msg}</span>
          </div>
        )}

        {/* Emergency Recovery Kit */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-text-primary">Emergency Recovery Kit</div>
            <p className="text-xs text-text-secondary mt-0.5">
              Create or scan a printable recovery QR code to recover your vault if you lose your device.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-nowrap items-center gap-2 w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={() => setIsEmergencyKitOpen(true)}
              className="px-3.5 py-2 rounded-xl border border-border hover:bg-bg-secondary text-xs font-medium text-text-primary inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <QrCode className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>Create Recovery Kit</span>
            </button>
            <button
              type="button"
              onClick={() => setIsQRScannerOpen(true)}
              className="px-3.5 py-2 rounded-xl border border-border hover:bg-bg-secondary text-xs font-medium text-text-primary inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>Scan Recovery QR</span>
            </button>
          </div>
        </div>

        {/* Import / Export Vault Data */}
        <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-text-primary">Import or export data</div>
            <p className="text-xs text-text-secondary mt-0.5">
              Import passwords from another password manager (CSV or JSON) or export your items.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <label className="px-3.5 py-2 rounded-xl border border-border hover:bg-bg-secondary text-xs font-medium text-text-primary inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap">
              <FileSpreadsheet className="w-3.5 h-3.5 text-success" />
              <span>Import CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => handleFileImport(e, 'csv')}
                className="hidden"
              />
            </label>

            <label className="px-3.5 py-2 rounded-xl border border-border hover:bg-bg-secondary text-xs font-medium text-text-primary inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap">
              <FileJson className="w-3.5 h-3.5 text-primary" />
              <span>Import JSON</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={(e) => handleFileImport(e, 'json')}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={() => setIsPlaintextExportModalOpen(true)}
              className="px-3.5 py-2 rounded-xl border border-border hover:bg-bg-secondary text-xs font-medium text-text-secondary hover:text-text-primary inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Data</span>
            </button>
          </div>
        </div>

        {/* Delete All Vault Data */}
        <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-error">Delete all vault data</div>
            <p className="text-xs text-text-secondary mt-0.5">
              Permanently remove all saved passwords and settings from this device.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setDeleteConfirmText('');
              setIsDeleteVaultModalOpen(true);
            }}
            className="px-4 py-2 rounded-xl border border-error/40 bg-error/10 hover:bg-error/20 text-xs font-medium text-error inline-flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Vault Data</span>
          </button>
        </div>
      </section>

      {/* Confirmation Modal: Disconnect Google Drive */}
      <Modal
        isOpen={isDisconnectConfirmOpen}
        onClose={() => setIsDisconnectConfirmOpen(false)}
        title="Disconnect Google Drive?"
        subtitle="You can reconnect your account at any time."
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-text-secondary leading-relaxed">
            Disconnecting Google Drive will sign out of your Google session in LotusX. Existing encrypted backup files in your Google Drive will not be deleted.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsDisconnectConfirmOpen(false)}
              className="px-4 py-2 rounded-lg border border-border text-xs font-medium text-text-secondary hover:bg-bg-secondary cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDisconnectDrive}
              className="btn-danger px-4 py-2 rounded-lg text-xs font-medium cursor-pointer"
            >
              Disconnect
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal: Unencrypted JSON Export */}
      <Modal
        isOpen={isPlaintextExportModalOpen}
        onClose={() => setIsPlaintextExportModalOpen(false)}
        title="Export Unencrypted Data?"
        subtitle="Security warning before exporting your passwords"
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-warning/15 border border-warning/30 flex items-start gap-2.5 text-xs text-text-primary">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="font-semibold text-warning block mb-0.5">
                This file is not encrypted
              </strong>
              Anyone with access to the exported JSON file will be able to read your passwords in plain text. For safe backups, use <strong>Back Up Vault</strong> instead.
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsPlaintextExportModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-border text-xs font-medium text-text-secondary hover:bg-bg-secondary cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmPlaintextExport}
              className="px-4 py-2 rounded-lg bg-warning text-white hover:opacity-90 text-xs font-semibold cursor-pointer"
            >
              Export Unencrypted File
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal: Delete All Vault Data */}
      <Modal
        isOpen={isDeleteVaultModalOpen}
        onClose={() => setIsDeleteVaultModalOpen(false)}
        title="Delete All Vault Data?"
        subtitle="This action permanently deletes your local vault and cannot be undone."
        maxWidth="sm"
      >
        <form onSubmit={handleConfirmDeleteVault} className="space-y-4">
          <div className="p-3.5 rounded-xl bg-error/10 border border-error/30 flex items-start gap-2.5 text-xs text-text-primary">
            <AlertTriangle className="w-4 h-4 text-error shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              All saved passwords, notes, cards, and settings stored on this device will be permanently erased. Unless you have a backup file or Emergency Recovery Kit, your data cannot be recovered.
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-primary mb-1.5">
              Type <strong className="font-mono text-error">DELETE</strong> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full px-3.5 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs font-mono focus:outline-none focus:border-error"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsDeleteVaultModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-border text-xs font-medium text-text-secondary hover:bg-bg-secondary cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={deleteConfirmText !== 'DELETE' || isDeletingVault}
              className="btn-danger px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-40"
            >
              {isDeletingVault ? 'Deleting...' : 'Permanently Delete Vault'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Google Drive Cloud Backup & Restore Modal */}
      <GoogleDriveBackupModal
        isOpen={isGoogleDriveModalOpen}
        onClose={() => {
          setIsGoogleDriveModalOpen(false);
          refreshDriveState();
        }}
        onRestoreSuccess={(count) => {
          setIsGoogleDriveModalOpen(false);
          refreshDriveState();
          setBackupBanner({
            type: 'success',
            msg: `Restored ${count} items from Google Drive.`,
          });
        }}
      />

      {/* Emergency Recovery Kit Modal */}
      <EmergencyRecoveryKitModal
        isOpen={isEmergencyKitOpen}
        onClose={() => setIsEmergencyKitOpen(false)}
      />

      {/* QR Scanner Modal */}
      <QRScannerModal
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        onSuccess={(count) => {
          setIsQRScannerOpen(false);
          setDataFeedback({
            type: 'success',
            msg: `Restored ${count} items from your Emergency Recovery QR code.`,
          });
        }}
      />
    </div>
  );
};
