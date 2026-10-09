/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Cloud,
  CloudUpload,
  CloudDownload,
  Lock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  LogOut,
  ShieldCheck,
  FileKey,
  Calendar,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { googleDriveService, DriveBackupFileMetadata } from '../../services/GoogleDriveBackupService';
import { backupService } from '../../storage/BackupService';

interface GoogleDriveBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultBackupPassword?: string;
  onRestoreSuccess?: (recordCount: number) => void;
}

export const GoogleDriveBackupModal: React.FC<GoogleDriveBackupModalProps> = ({
  isOpen,
  onClose,
  defaultBackupPassword = '',
  onRestoreSuccess,
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [backups, setBackups] = useState<DriveBackupFileMetadata[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);

  // Backup Upload State
  const [backupPassword, setBackupPassword] = useState(defaultBackupPassword);
  const [isUploading, setIsUploading] = useState(false);

  // Restore State
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);

  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const fetchBackups = useCallback(async () => {
    if (!googleDriveService.isAuthenticated()) return;
    setIsLoadingBackups(true);
    try {
      const list = await googleDriveService.listEncryptedBackups();
      setBackups(list);
      if (list.length > 0 && !selectedFileId) {
        setSelectedFileId(list[0].id);
      }
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to fetch backups from Google Drive.',
      });
    } finally {
      setIsLoadingBackups(false);
    }
  }, [selectedFileId]);

  useEffect(() => {
    if (isOpen) {
      setStatusMessage(null);
      const authed = googleDriveService.isAuthenticated();
      setIsConnected(authed);
      if (authed) {
        fetchBackups();
      }
    }
  }, [isOpen, fetchBackups]);

  const handleConnectGoogleDrive = async () => {
    setIsAuthenticating(true);
    setStatusMessage(null);
    try {
      await googleDriveService.authenticate();
      setIsConnected(true);
      await fetchBackups();
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Google Drive authentication failed.',
      });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleDisconnect = () => {
    googleDriveService.disconnect();
    setIsConnected(false);
    setBackups([]);
    setSelectedFileId(null);
    setStatusMessage(null);
  };

  const handleUploadEncryptedBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupPassword || backupPassword.length < 8) {
      setStatusMessage({
        type: 'error',
        text: 'Backup password must be at least 8 characters.',
      });
      return;
    }

    setIsUploading(true);
    setStatusMessage(null);
    try {
      const jsonString = await backupService.createEncryptedBackupString(backupPassword);
      const uploaded = await googleDriveService.uploadEncryptedBackup(jsonString);
      setStatusMessage({
        type: 'success',
        text: `Encrypted backup "${uploaded.name}" uploaded to Google Drive!`,
      });
      setBackupPassword('');
      await fetchBackups();
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Failed to upload encrypted backup to Google Drive.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRestoreFromDrive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFileId || !restorePassword) return;

    setIsRestoring(true);
    setStatusMessage(null);
    try {
      const encryptedContent = await googleDriveService.downloadEncryptedBackup(selectedFileId);
      const result = await backupService.restoreEncryptedBackup(encryptedContent, restorePassword);
      setStatusMessage({
        type: 'success',
        text: `Successfully decrypted and restored ${result.recordCount} credentials from Google Drive!`,
      });
      setRestorePassword('');
      if (onRestoreSuccess) {
        onRestoreSuccess(result.recordCount);
      }
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Failed to restore backup. Please verify your backup password.',
      });
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Zero-Knowledge Google Drive Sync"
      subtitle="Client-side AES-256-GCM encrypted cloud backup & disaster recovery"
      maxWidth="lg"
    >
      <div className="space-y-5">
        {/* Zero-Knowledge Security Guarantee Banner */}
        <div className="p-3.5 rounded-xl bg-success/10 border border-success/25 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-success shrink-0 mt-0.5" />
          <div className="text-xs text-text-secondary leading-relaxed">
            <strong className="font-bold text-text-primary block mb-0.5">
              End-to-End Encrypted Before Upload
            </strong>
            Your vault is encrypted locally on your device using AES-256-GCM and PBKDF2-SHA256 (600,000 iterations) before touching Google Drive. Google never sees your Master Password or plaintext data.
          </div>
        </div>

        {statusMessage && (
          <div
            className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
              statusMessage.type === 'success'
                ? 'bg-success/10 border-success/30 text-success'
                : 'bg-error/10 border-error/30 text-error'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {!isConnected ? (
          <div className="p-6 rounded-xl bg-bg-secondary border border-border text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-secondary text-primary flex items-center justify-center mx-auto shadow-xs">
              <Cloud className="w-6 h-6" />
            </div>
            <div className="space-y-1 max-w-md mx-auto">
              <h4 className="text-sm font-bold text-text-primary">
                Connect Your Google Drive Account
              </h4>
              <p className="text-xs text-text-secondary">
                LotusX uses the restricted <code className="font-mono text-[11px] bg-bg-surface px-1.5 py-0.5 rounded border border-border">drive.file</code> scope, meaning it can only access the encrypted <code className="font-mono text-[11px]">.vault</code> files it creates.
              </p>
            </div>
            <button
              type="button"
              onClick={handleConnectGoogleDrive}
              disabled={isAuthenticating}
              className="btn-primary inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isAuthenticating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Connecting to Google Drive...
                </>
              ) : (
                <>
                  <Cloud className="w-4 h-4" />
                  Authorize Google Drive Access
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Connected Header Bar */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-bg-secondary border border-border">
              <div className="flex items-center gap-2 text-xs font-semibold text-text-primary">
                <span className="w-2 h-2 rounded-full bg-success" />
                Google Drive Connected (drive.file scope)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchBackups}
                  disabled={isLoadingBackups}
                  className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-surface transition-colors cursor-pointer"
                  title="Refresh backup list"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBackups ? 'animate-spin' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="inline-flex items-center gap-1 text-xs text-error hover:opacity-80 font-medium cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Disconnect
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Column: Upload New Encrypted Backup */}
              <form
                onSubmit={handleUploadEncryptedBackup}
                className="p-4 rounded-xl bg-bg-app border border-border space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CloudUpload className="w-4 h-4 text-primary" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                      Backup Current Vault to Drive
                    </h4>
                  </div>
                  <p className="text-[11px] text-text-secondary leading-relaxed">
                    Encrypts your current vault snapshot and uploads a timestamped <code className="font-mono">.vault</code> file to your Google Drive.
                  </p>
                  <div>
                    <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                      Backup Encryption Password
                    </label>
                    <input
                      type="password"
                      value={backupPassword}
                      onChange={(e) => setBackupPassword(e.target.value)}
                      placeholder="Min 8 chars (e.g. Master Password)"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs font-mono focus:outline-none focus:border-primary"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isUploading || backupPassword.length < 8}
                  className="btn-primary w-full py-2.5 px-4 rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Encrypting & Uploading...
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      Upload Encrypted Backup
                    </>
                  )}
                </button>
              </form>

              {/* Right Column: Restore from Drive */}
              <form
                onSubmit={handleRestoreFromDrive}
                className="p-4 rounded-xl bg-bg-app border border-border space-y-3 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CloudDownload className="w-4 h-4 text-primary" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                      Restore Vault from Drive
                    </h4>
                  </div>

                  {isLoadingBackups ? (
                    <div className="py-6 text-center text-xs text-text-muted">
                      Loading cloud backups...
                    </div>
                  ) : backups.length === 0 ? (
                    <div className="py-6 text-center text-xs text-text-muted bg-bg-surface rounded-lg border border-border">
                      No LotusX backups found in your Google Drive yet.
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                        Select Cloud Snapshot ({backups.length} available)
                      </label>
                      <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
                        {backups.map((file) => (
                          <label
                            key={file.id}
                            className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                              selectedFileId === file.id
                                ? 'bg-primary/10 border-primary text-text-primary font-semibold'
                                : 'bg-bg-surface border-border text-text-secondary hover:border-primary/40'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <input
                                type="radio"
                                name="driveBackupFile"
                                value={file.id}
                                checked={selectedFileId === file.id}
                                onChange={() => setSelectedFileId(file.id)}
                                className="text-primary focus:ring-primary"
                              />
                              <FileKey className="w-3.5 h-3.5 text-primary shrink-0" />
                              <span className="truncate text-[11px]">{file.name}</span>
                            </div>
                            <span className="text-[10px] text-text-muted shrink-0 ml-2 flex items-center gap-1">
                              <Calendar className="w-2.5 h-2.5" />
                              {new Date(file.createdTime).toLocaleDateString()}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {backups.length > 0 && (
                    <div>
                      <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                        Decryption Password
                      </label>
                      <input
                        type="password"
                        value={restorePassword}
                        onChange={(e) => setRestorePassword(e.target.value)}
                        placeholder="Password used for this backup..."
                        className="w-full px-3 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs font-mono focus:outline-none focus:border-primary"
                        required
                      />
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isRestoring || !selectedFileId || !restorePassword}
                  className="btn-secondary w-full py-2.5 px-4 rounded-lg text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isRestoring ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Downloading & Decrypting...
                    </>
                  ) : (
                    <>
                      <CloudDownload className="w-3.5 h-3.5" />
                      Download & Restore Vault
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
