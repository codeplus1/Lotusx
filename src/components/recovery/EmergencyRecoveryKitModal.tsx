/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  QrCode,
  Printer,
  Download,
  Lock,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  FileKey,
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { Modal } from '../common/Modal';
import { emergencyKitService, EmergencyKitData } from '../../services/RecoveryKitService';
import { backupService } from '../../storage/BackupService';

interface EmergencyRecoveryKitModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EmergencyRecoveryKitModal: React.FC<EmergencyRecoveryKitModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [password, setPassword] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [kitData, setKitData] = useState<EmergencyKitData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateKit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || password.length < 8) {
      setError('Please enter a password of at least 8 characters to encrypt the QR payload.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    try {
      const data = await emergencyKitService.generateKit(password);
      setKitData(data);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Failed to generate Emergency Recovery Kit.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (kitData && kitData.fitsInQr && !kitData.qrDataUrl) {
      const timer = setTimeout(() => {
        const canvas = document.querySelector(
          '#lotusx-emergency-qr-container canvas'
        ) as HTMLCanvasElement | null;
        if (canvas) {
          const url = canvas.toDataURL('image/png');
          setKitData((prev) => (prev ? { ...prev, qrDataUrl: url } : null));
        }
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [kitData]);

  const handleClose = () => {
    setKitData(null);
    setPassword('');
    setError(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Printable Emergency Recovery Kit"
      subtitle="100% offline physical paper & QR code disaster recovery"
      maxWidth="lg"
    >
      <div className="space-y-5">
        {!kitData ? (
          <form onSubmit={handleGenerateKit} className="space-y-4">
            <div className="p-4 rounded-xl bg-bg-secondary border border-border flex items-start gap-3">
              <QrCode className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="text-xs text-text-secondary leading-relaxed">
                <strong className="font-bold text-text-primary block mb-0.5">
                  How the Offline Recovery Kit Works
                </strong>
                LotusX compresses and encrypts your entire vault using AES-256-GCM into a high-density QR code. You can print this sheet or save it offline. If your phone is ever lost or damaged, simply scan the QR code with any new device to restore your vault.
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1.5">
                Encryption Password for Recovery QR
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your Master Password or a dedicated backup password..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-surface text-text-primary text-xs font-mono focus:outline-none focus:border-primary"
                required
              />
              <p className="text-[11px] text-text-muted mt-1">
                The QR code contains only AES-256-GCM ciphertext. Without this password, the QR code cannot be decrypted.
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-error/10 border border-error/30 text-xs text-error flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-lg border border-border text-text-secondary hover:bg-bg-secondary text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isGenerating || password.length < 8}
                className="btn-primary px-5 py-2 rounded-lg text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Generating Encrypted QR...
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    Generate Recovery Kit
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-5">
            <div className="p-3.5 rounded-xl bg-success/10 border border-success/25 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-xs text-text-primary">
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                <span>
                  Encrypted Recovery Kit ready ({kitData.recordCount} credentials • Fingerprint:{' '}
                  <code className="font-mono font-bold text-primary">{kitData.fingerprint}</code>)
                </span>
              </div>
            </div>

            {kitData.fitsInQr && kitData.qrPayload ? (
              <div className="flex flex-col sm:flex-row items-center gap-5 p-4 rounded-xl bg-bg-secondary border border-border">
                <div
                  id="lotusx-emergency-qr-container"
                  className="bg-white p-3 rounded-xl border border-border shadow-xs shrink-0 flex items-center justify-center"
                >
                  <QRCodeCanvas
                    value={kitData.qrPayload}
                    size={176}
                    level="M"
                    bgColor="#FFFFFF"
                    fgColor="#03152F"
                    marginSize={2}
                  />
                </div>
                <div className="space-y-2.5 text-xs text-text-secondary">
                  <h4 className="font-bold text-sm text-text-primary flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    {kitData.isDisasterKeyOnly
                      ? 'Cryptographic Key QR (Large Vault Mode)'
                      : 'Zero-Knowledge Full Optical Backup'}
                  </h4>
                  {kitData.isDisasterKeyOnly ? (
                    <p className="leading-relaxed">
                      Your vault has {kitData.recordCount} credentials ({kitData.payloadSizeBytes} bytes), which exceeds the capacity of a single optical QR code. This QR stores your encrypted cryptographic keys; pair it with the downloaded <code className="font-mono">.vault</code> file to restore all credentials.
                    </p>
                  ) : (
                    <p className="leading-relaxed">
                      Scan this QR code from the LotusX Welcome, Unlock, or Settings screen using your camera or saved QR PNG to restore all {kitData.recordCount} credentials offline.
                    </p>
                  )}
                  <div className="p-2.5 rounded-lg bg-warning/15 border border-warning/30 text-text-primary text-[11px]">
                    <strong className="text-warning">Tip:</strong> Write down your encryption password on the printed sheet and store it in a physical safe or locked drawer.
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-warning/15 border border-warning/30 text-xs text-text-primary">
                Your vault is large ({kitData.payloadSizeBytes} bytes), which exceeds a single standard QR code capacity. Please download the encrypted <code className="font-mono">.vault</code> file alongside your printed recovery sheet.
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setKitData(null)}
                className="text-xs text-text-secondary hover:text-text-primary font-medium cursor-pointer"
              >
                ← Generate Again
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => backupService.exportEncryptedBackup(password)}
                  className="px-3.5 py-2 rounded-lg border border-border hover:bg-bg-secondary text-xs font-semibold text-text-primary flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FileKey className="w-3.5 h-3.5 text-primary" />
                  Download .vault
                </button>
                {kitData.fitsInQr && (
                  <button
                    type="button"
                    onClick={() => {
                      const canvas = document.querySelector(
                        '#lotusx-emergency-qr-container canvas'
                      ) as HTMLCanvasElement | null;
                      if (canvas) {
                        const url = canvas.toDataURL('image/png');
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `lotusx-recovery-qr-${kitData.fingerprint}.png`;
                        a.click();
                      }
                    }}
                    className="px-3.5 py-2 rounded-lg border border-border hover:bg-bg-secondary text-xs font-semibold text-text-primary flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Save QR Image
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => emergencyKitService.openPrintableWindow(kitData)}
                  className="btn-primary px-4 py-2 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print / Save as PDF
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
