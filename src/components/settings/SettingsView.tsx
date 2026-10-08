/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  Shield,
  Lock,
  Clock,
  Download,
  Upload,
  Trash2,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  FileJson,
  FileSpreadsheet,
  RefreshCw,
  Fingerprint,
  Smartphone,
  ShieldCheck,
  QrCode,
  Cloud,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { backupService } from '../../storage/BackupService';
import { passwordGenerator } from '../../security/PasswordGeneratorService';
import { biometricService, BiometricMetadata } from '../../security/BiometricService';
import { EmergencyRecoveryKitModal } from '../recovery/EmergencyRecoveryKitModal';
import { GoogleDriveBackupModal } from '../recovery/GoogleDriveBackupModal';
import { QRScannerModal } from '../recovery/QRScannerModal';
import { StorageSettingsSection } from './StorageSettingsSection';

export const SettingsView: React.FC = () => {
  const {
    autoLockMinutes,
    setAutoLockMinutes,
    clipboardClearSeconds,
    setClipboardClearSeconds,
    changeMasterPassword,
    wipeVault,
    importMultipleRecords,
    records,
  } = useVault();

  // Master Password Rotation State
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmNewPw, setConfirmNewPw] = useState('');
  const [isRotating, setIsRotating] = useState(false);
  const [rotateStatus, setRotateStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(
    null
  );

  // Encrypted Backup Export State
  const [backupPw, setBackupPw] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [backupStatus, setBackupStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(
    null
  );

  // Encrypted Backup Restore State
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePw, setRestorePw] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);

  // Plaintext CSV/JSON Import State
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Wipe Confirmation State
  const [wipeConfirmText, setWipeConfirmText] = useState('');

  // Disaster Recovery Modals State
  const [isEmergencyKitOpen, setIsEmergencyKitOpen] = useState(false);
  const [isGoogleDriveOpen, setIsGoogleDriveOpen] = useState(false);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);

  // Biometric State
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricMeta, setBiometricMeta] = useState<BiometricMetadata | null>(null);
  const [biometricMasterPw, setBiometricMasterPw] = useState('');
  const [biometricDeviceLabel, setBiometricDeviceLabel] = useState('');
  const [isEnrollingBiometric, setIsEnrollingBiometric] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);

  React.useEffect(() => {
    biometricService.isHardwareAvailable().then(setBiometricAvailable);
    setBiometricMeta(biometricService.getMetadata());
  }, []);

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
      setBiometricStatus({
        type: 'success',
        msg: 'Biometric unlock enabled! You can now unlock LotusX with Fingerprint or Face ID.',
      });
    } catch (err: any) {
      setBiometricStatus({
        type: 'error',
        msg: err.message || 'Failed to enroll biometric credential.',
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
      msg: 'Biometric unlock has been removed from this device.',
    });
  };

  const handleRotatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPw.length < 10 || newPw !== confirmNewPw) return;

    setIsRotating(true);
    setRotateStatus(null);
    const res = await changeMasterPassword(currentPw, newPw);
    setIsRotating(false);

    if (res.success) {
      setRotateStatus({
        type: 'success',
        msg: 'Master password rotated & vault re-encrypted with fresh salt and 600,000 PBKDF2 rounds.',
      });
      setCurrentPw('');
      setNewPw('');
      setConfirmNewPw('');
    } else {
      setRotateStatus({ type: 'error', msg: res.error || 'Failed to rotate password.' });
    }
  };

  const handleExportEncryptedBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupPw || backupPw.length < 8) return;

    setIsExporting(true);
    setBackupStatus(null);
    try {
      await backupService.exportEncryptedBackup(backupPw);
      setBackupStatus({
        type: 'success',
        msg: 'Encrypted .vault backup downloaded successfully.',
      });
      setBackupPw('');
    } catch (err: any) {
      setBackupStatus({ type: 'error', msg: err.message || 'Export failed.' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleRestoreEncryptedBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreFile || !restorePw) return;

    setIsRestoring(true);
    setBackupStatus(null);
    try {
      const text = await restoreFile.text();
      const res = await backupService.restoreEncryptedBackup(text, restorePw);
      setBackupStatus({
        type: 'success',
        msg: `Successfully restored ${res.recordCount} records! Please re-unlock your vault.`,
      });
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      setBackupStatus({ type: 'error', msg: err.message || 'Decryption failed.' });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>, format: 'json' | 'csv') => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      const parsed =
        format === 'json'
          ? backupService.parsePlaintextJsonImport(content)
          : backupService.parseCsvImport(content);

      const count = await importMultipleRecords(parsed);
      setImportStatus(`Imported and encrypted ${count} records into your vault.`);
    } catch (err: any) {
      setImportStatus(`Import error: ${err.message}`);
    }
  };

  const newPwStrength = passwordGenerator.evaluateStrength(newPw);

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="bg-bg-surface p-6 rounded-xl border border-border shadow-xs">
        <h1 className="text-2xl font-bold text-text-primary tracking-tight">
          Security & Vault Settings
        </h1>
        <p className="text-xs text-text-secondary mt-1">
          Configure session timeouts, key rotation, encrypted backups, and storage policies.
        </p>
      </div>

      {/* 1. Offline Storage & Redundancy Engine */}
      <StorageSettingsSection />

      {/* 2. Session & Memory Protection */}
      <div className="bg-bg-surface rounded-xl border border-border shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-sm text-text-primary">
            Session & Memory Protection Policies
          </h2>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Inactivity Auto-Lock Timer
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Automatically purges decrypted records and CryptoKey handles from RAM when idle.
              </p>
            </div>
            <select
              value={autoLockMinutes}
              onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
              className="px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-xs font-semibold text-text-primary focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value={1}>1 Minute (Maximum Security)</option>
              <option value={5}>5 Minutes (Recommended)</option>
              <option value={15}>15 Minutes</option>
              <option value={30}>30 Minutes</option>
              <option value={0}>Never (Not Recommended)</option>
            </select>
          </div>

          <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-text-primary">
                Clipboard Auto-Scrubbing Delay
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Overwrites your system clipboard after copying a password or card number.
              </p>
            </div>
            <select
              value={clipboardClearSeconds}
              onChange={(e) => setClipboardClearSeconds(Number(e.target.value))}
              className="px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-xs font-semibold text-text-primary focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value={10}>10 Seconds</option>
              <option value={20}>20 Seconds (Default)</option>
              <option value={30}>30 Seconds</option>
              <option value={60}>60 Seconds</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Biometric Authentication (Fingerprint / Face ID) */}
      <div className="bg-bg-surface rounded-xl border border-border shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Fingerprint className="w-4 h-4 text-primary" />
            <h2 className="font-bold text-sm text-text-primary">
              Biometric Unlock (Fingerprint / Face ID / Windows Hello)
            </h2>
          </div>
          {biometricMeta?.enabled ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-success/15 text-success border border-success/30">
              <ShieldCheck className="w-3.5 h-3.5" />
              Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-bg-secondary text-text-secondary">
              Not Enrolled
            </span>
          )}
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-text-secondary leading-relaxed">
            Unlock your vault using your device&apos;s hardware-backed authenticator (WebAuthn / Passkey). Your Master Password is encrypted with a 256-bit AES-GCM key bound to your biometric sensor.
          </p>

          {!biometricAvailable && !biometricMeta?.enabled && (
            <div className="p-3.5 rounded-xl bg-warning/15 border border-warning/30 flex items-start gap-2.5 text-xs text-text-primary">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-warning">Platform Biometrics Not Detected</p>
                <p className="text-[11px] text-text-secondary mt-0.5">
                  Your current browser or environment may not expose a built-in Fingerprint/Face ID sensor, or it may be restricted by an embedded preview frame. You can still test enrollment if your OS supports Passkeys.
                </p>
              </div>
            </div>
          )}

          {biometricMeta?.enabled ? (
            <div className="p-4 rounded-xl bg-bg-app border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-text-primary">
                    {biometricMeta.deviceLabel || 'Enrolled Biometric Authenticator'}
                  </h4>
                  <p className="text-[11px] text-text-secondary mt-0.5">
                    Enrolled on {new Date(biometricMeta.createdAt).toLocaleDateString()} at{' '}
                    {new Date(biometricMeta.createdAt).toLocaleTimeString()}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDisableBiometric}
                className="btn-danger px-4 py-2 rounded-xl text-xs cursor-pointer self-start sm:self-center"
              >
                Disable Biometric Unlock
              </button>
            </div>
          ) : (
            <form onSubmit={handleEnrollBiometric} className="space-y-4 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">
                    Confirm Master Password
                  </label>
                  <input
                    type="password"
                    value={biometricMasterPw}
                    onChange={(e) => setBiometricMasterPw(e.target.value)}
                    placeholder="Enter your Master Password..."
                    className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-xs font-mono focus:outline-none focus:border-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">
                    Device Label (Optional)
                  </label>
                  <input
                    type="text"
                    value={biometricDeviceLabel}
                    onChange={(e) => setBiometricDeviceLabel(e.target.value)}
                    placeholder="e.g., iPhone Face ID, MacBook Touch ID"
                    className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-xs focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!biometricMasterPw || isEnrollingBiometric}
                  className="btn-primary px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isEnrollingBiometric ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Waiting for Sensor...
                    </>
                  ) : (
                    <>
                      <Fingerprint className="w-4 h-4" />
                      Enable Fingerprint / Face ID
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {biometricStatus && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                biometricStatus.type === 'success'
                  ? 'bg-success/10 text-success border border-success/25'
                  : 'bg-error/10 text-error border border-error/25'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{biometricStatus.msg}</span>
            </div>
          )}
        </div>
      </div>

      {/* 4. Master Password Rotation */}
      <div className="bg-bg-surface rounded-xl border border-border shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-2.5">
          <KeyRound className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-sm text-text-primary">
            Rotate Master Password & Re-Key Vault
          </h2>
        </div>

        <form onSubmit={handleRotatePassword} className="p-6 space-y-4">
          <p className="text-xs text-text-secondary">
            Rotating your Master Password generates a brand-new 128-bit cryptographic salt, derives a new 256-bit key via 600,000 PBKDF2 rounds, and re-encrypts your entire vault.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1">
                Current Master Password
              </label>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-xs font-mono focus:outline-none focus:border-primary"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1">
                New Master Password (min 10)
              </label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-xs font-mono focus:outline-none focus:border-primary"
                required
              />
              {newPw && (
                <span className="text-[10px] font-semibold mt-1 block" style={{ color: newPwStrength.color }}>
                  {newPwStrength.label} ({newPwStrength.entropyBits} bits)
                </span>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmNewPw}
                onChange={(e) => setConfirmNewPw(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-xs font-mono focus:outline-none focus:border-primary"
                required
              />
            </div>
          </div>

          {rotateStatus && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                rotateStatus.type === 'success'
                  ? 'bg-success/10 text-success border border-success/25'
                  : 'bg-error/10 text-error border border-error/25'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{rotateStatus.msg}</span>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isRotating || !currentPw || newPw.length < 10 || newPw !== confirmNewPw}
              className="btn-secondary px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isRotating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Re-Encrypting Vault...
                </>
              ) : (
                <>
                  <Shield className="w-3.5 h-3.5" />
                  Rotate Master Key
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* 5. Disaster Recovery Center (Google Drive Sync & Offline QR Recovery Kit) */}
      <div className="bg-bg-surface rounded-xl border border-border shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-primary" />
            <h2 className="font-bold text-sm text-text-primary">
              Disaster Recovery Center (Cloud & Offline QR)
            </h2>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/25">
            Zero-Knowledge Recovery
          </span>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-xs text-text-secondary leading-relaxed">
            Protect your credentials against phone loss, hardware damage, or accidental browser data clearing. Both options use 100% client-side AES-256-GCM encryption before your data ever leaves memory.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Option A: Google Drive Zero-Knowledge Cloud Backup */}
            <div className="p-5 rounded-xl bg-bg-app border border-border flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-secondary text-primary flex items-center justify-center shadow-2xs">
                  <Cloud className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-text-primary">
                  Google Drive Encrypted Sync
                </h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Automatically upload or restore encrypted <code className="font-mono text-[11px]">.vault</code> snapshots to your personal Google Drive using restricted file-only permissions.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsGoogleDriveOpen(true)}
                className="btn-primary w-full py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs"
              >
                <Cloud className="w-4 h-4" />
                Open Google Drive Backup & Restore
              </button>
            </div>

            {/* Option B: Printable Emergency Recovery Kit (QR Code) */}
            <div className="p-5 rounded-xl bg-bg-app border border-border flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-secondary text-primary flex items-center justify-center shadow-2xs">
                  <QrCode className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-text-primary">
                  Printable Emergency QR Kit
                </h3>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Generate a printable recovery sheet with an encrypted high-density QR code. Scan the QR code with your phone camera to restore offline.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => setIsEmergencyKitOpen(true)}
                  className="btn-secondary flex-1 py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  Generate QR Kit
                </button>
                <button
                  type="button"
                  onClick={() => setIsQRScannerOpen(true)}
                  className="btn-outline py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  Scan QR
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Encrypted Backups & Portability */}
      <div className="bg-bg-surface rounded-xl border border-border shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-2.5">
          <Download className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-sm text-text-primary">
            Encrypted Vault Backup & Restore (.vault)
          </h2>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Export Encrypted Backup */}
            <form
              onSubmit={handleExportEncryptedBackup}
              className="p-4 rounded-xl bg-bg-app border border-border space-y-3"
            >
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                1. Export Encrypted Snapshot
              </h3>
              <p className="text-xs text-text-secondary">
                Creates a standalone <code className="font-mono">.vault</code> file protected with AES-256-GCM and a backup password of your choice.
              </p>
              <input
                type="password"
                value={backupPw}
                onChange={(e) => setBackupPw(e.target.value)}
                placeholder="Enter backup encryption password (min 8 chars)..."
                className="w-full px-3 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs font-mono"
                required
              />
              <button
                type="submit"
                disabled={isExporting || backupPw.length < 8}
                className="btn-primary w-full py-2.5 px-4 rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Lock className="w-3.5 h-3.5" />
                {isExporting ? 'Encrypting Snapshot...' : 'Download Encrypted .vault'}
              </button>
            </form>

            {/* Restore Encrypted Backup */}
            <form
              onSubmit={handleRestoreEncryptedBackup}
              className="p-4 rounded-xl bg-bg-app border border-border space-y-3"
            >
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                2. Restore from .vault File
              </h3>
              <input
                type="file"
                accept=".vault,.json"
                onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-border file:text-xs file:font-semibold file:bg-bg-surface file:text-text-primary cursor-pointer"
                required
              />
              <input
                type="password"
                value={restorePw}
                onChange={(e) => setRestorePw(e.target.value)}
                placeholder="Backup decryption password..."
                className="w-full px-3 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs font-mono"
                required
              />
              <button
                type="submit"
                disabled={isRestoring || !restoreFile || !restorePw}
                className="btn-secondary w-full py-2.5 px-4 rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" />
                {isRestoring ? 'Decrypting & Restoring...' : 'Verify & Restore Backup'}
              </button>
            </form>
          </div>

          {backupStatus && (
            <div
              className={`p-3 rounded-xl text-xs ${
                backupStatus.type === 'success'
                  ? 'bg-success/10 text-success border border-success/25'
                  : 'bg-error/10 text-error border border-error/25'
              }`}
            >
              {backupStatus.msg}
            </div>
          )}

          {/* Migration Import / Export */}
          <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h4 className="text-xs font-bold text-text-primary">
                Migrate from Another Password Manager (CSV / JSON)
              </h4>
              <p className="text-[11px] text-text-secondary">
                Imported records are immediately encrypted into your active vault.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="px-3 py-2 rounded-lg border border-border hover:bg-bg-secondary text-xs font-semibold text-text-primary flex items-center gap-1.5 cursor-pointer">
                <FileSpreadsheet className="w-3.5 h-3.5 text-success" />
                Import CSV
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => handleFileImport(e, 'csv')}
                  className="hidden"
                />
              </label>

              <label className="px-3 py-2 rounded-lg border border-border hover:bg-bg-secondary text-xs font-semibold text-text-primary flex items-center gap-1.5 cursor-pointer">
                <FileJson className="w-3.5 h-3.5 text-info" />
                Import JSON
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => handleFileImport(e, 'json')}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={() => backupService.exportPlaintextJson(records.filter((r) => !r.deletedAt))}
                className="px-3 py-2 rounded-lg border border-warning/40 bg-warning/10 hover:bg-warning/20 text-xs font-semibold text-warning cursor-pointer"
                title="Warning: Exports unencrypted JSON"
              >
                Export Unencrypted JSON
              </button>
            </div>
          </div>

          {importStatus && (
            <p className="text-xs font-medium text-primary bg-primary/10 p-2.5 rounded-lg border border-primary/25">
              {importStatus}
            </p>
          )}
        </div>
      </div>

      {/* 7. Danger Zone */}
      <div className="bg-bg-surface rounded-xl border border-error/30 shadow-xs overflow-hidden">
        <div className="px-6 py-4 bg-error/10 border-b border-error/20 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-error" />
          <h2 className="font-bold text-sm text-error">
            Danger Zone — Cryptographic Vault Destruction
          </h2>
        </div>

        <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-text-primary">
              Permanently Wipe Local Encrypted Vault
            </h3>
            <p className="text-xs text-text-secondary">
              Destroys all IndexedDB ciphertext envelopes, salts, and in-memory keys. Type{' '}
              <strong className="font-mono text-error">WIPE</strong> to confirm.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <input
              type="text"
              value={wipeConfirmText}
              onChange={(e) => setWipeConfirmText(e.target.value)}
              placeholder="Type WIPE"
              className="w-28 px-3 py-2 rounded-lg border border-error/40 bg-bg-surface text-text-primary text-xs font-mono focus:outline-none focus:border-error"
            />
            <button
              type="button"
              disabled={wipeConfirmText !== 'WIPE'}
              onClick={wipeVault}
              className="btn-danger px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Wipe Vault
            </button>
          </div>
        </div>
      </div>

      {/* Disaster Recovery Modals */}
      <GoogleDriveBackupModal
        isOpen={isGoogleDriveOpen}
        onClose={() => setIsGoogleDriveOpen(false)}
        onRestoreSuccess={() => {
          setTimeout(() => window.location.reload(), 1200);
        }}
      />

      <EmergencyRecoveryKitModal
        isOpen={isEmergencyKitOpen}
        onClose={() => setIsEmergencyKitOpen(false)}
      />

      <QRScannerModal
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        onSuccess={() => {
          setIsQRScannerOpen(false);
          setTimeout(() => window.location.reload(), 800);
        }}
      />
    </div>
  );
};
