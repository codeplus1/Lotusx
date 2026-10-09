/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  QrCode,
  Lock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Upload,
} from 'lucide-react';
import jsQR from 'jsqr';
import { Modal } from '../common/Modal';
import { emergencyKitService } from '../../services/RecoveryKitService';
import { RestoreBackupResult } from '../../storage/BackupService';
import { useVault } from '../../context/VaultContext';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (recordCount: number, restored?: RestoreBackupResult) => void;
}

const isValidLotusXQr = (text: string): boolean => {
  const trimmed = text.trim();
  return (
    trimmed.startsWith('LOTUSX_BACKUP_V1:') ||
    trimmed.startsWith('LOTUSX_KEY_V1:') ||
    trimmed.startsWith('LOTUSX_QR_V1:') ||
    trimmed.startsWith('LXK1:') ||
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
  );
};

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { applyRestoredVault } = useVault();
  const [scannedPayload, setScannedPayload] = useState<string | null>(null);
  const [manualPayloadInput, setManualPayloadInput] = useState('');
  const [password, setPassword] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setScannedPayload(null);
      setPassword('');
      setError(null);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, stopCamera]);

  const scanVideoFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data) {
          if (isValidLotusXQr(code.data)) {
            setScannedPayload(code.data.trim());
            stopCamera();
            return;
          } else {
            setError('Invalid QR code: Not a LotusX Emergency Recovery Kit.');
          }
        }
      }
    }

    rafRef.current = requestAnimationFrame(scanVideoFrame);
  }, [stopCamera]);

  const startCameraScan = async () => {
    setError(null);
    setIsScanning(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        rafRef.current = requestAnimationFrame(scanVideoFrame);
      }
    } catch (err: unknown) {
      stopCamera();
      const msg = err instanceof Error ? err.message : '';
      setError(
        msg ||
          'Could not access camera. You can also upload a saved QR code image below.'
      );
    }
  };

  const handleScanImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas 2D context unavailable');
      }
      ctx.drawImage(bitmap, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });

      if (code && code.data && isValidLotusXQr(code.data)) {
        setScannedPayload(code.data.trim());
      } else {
        setError('Could not detect a valid LotusX Recovery Kit QR code in the uploaded image.');
      }
    } catch {
      setError('Could not decode the uploaded QR code image.');
    }
  };

  const handleRestoreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedPayload || !password) return;

    setIsRestoring(true);
    setError(null);

    try {
      const result = await emergencyKitService.restoreFromQrPayload(
        scannedPayload,
        password
      );
      applyRestoredVault(result);
      setPassword('');
      onSuccess(result.recordCount, result);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to decrypt QR Recovery Kit. Please check your password.';
      setError(msg);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Scan Emergency Recovery QR"
      subtitle="Restore your encrypted vault offline using your camera or saved QR image"
      maxWidth="md"
    >
      <div className="space-y-5">
        {!scannedPayload ? (
          <div className="space-y-4">
            {/* Camera Viewport */}
            <div className="relative rounded-xl overflow-hidden bg-[#03152F] border border-[#1D3855] min-h-[240px] flex flex-col items-center justify-center">
              <video
                ref={videoRef}
                playsInline
                muted
                className={`w-full max-h-[280px] object-cover ${isScanning ? 'block' : 'hidden'}`}
              />
              <canvas ref={canvasRef} className="hidden" />

              {!isScanning && (
                <div className="p-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-[#062A63] border border-[#1D3855] flex items-center justify-center mx-auto text-[#08BBD4]">
                    <QrCode className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-white">
                      Point Camera at Recovery QR Code
                    </h4>
                    <p className="text-xs text-[#B8C6D8] max-w-xs mx-auto">
                      All QR decoding and AES-256-GCM decryption happens 100% locally in your browser.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={startCameraScan}
                    className="btn-primary px-5 py-2.5 rounded-xl text-xs inline-flex items-center gap-2 cursor-pointer shadow-xs"
                  >
                    <Camera className="w-4 h-4" />
                    Start Camera Scanner
                  </button>
                </div>
              )}
            </div>

            {isScanning && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={stopCamera}
                  className="px-4 py-2 rounded-lg border border-border text-xs font-medium text-text-secondary hover:bg-bg-secondary cursor-pointer"
                >
                  Stop Camera
                </button>
              </div>
            )}

            {/* Or Upload QR Image File */}
            <div className="pt-3 border-t border-border flex items-center justify-between gap-3">
              <span className="text-xs text-text-secondary">
                Have a saved QR PNG image?
              </span>
              <label className="px-3.5 py-2 rounded-lg border border-border hover:bg-bg-secondary text-xs font-semibold text-text-primary inline-flex items-center gap-1.5 cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5 text-primary" />
                Upload QR Image
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleScanImageFile}
                  className="hidden"
                />
              </label>
            </div>

            {/* Or Paste Recovery QR String */}
            <div className="pt-3 border-t border-border space-y-2">
              <label className="block text-[11px] font-semibold text-text-secondary">
                Or paste Emergency Kit QR payload string (`LOTUSX_BACKUP_V1:...`):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={manualPayloadInput}
                  onChange={(e) => setManualPayloadInput(e.target.value)}
                  placeholder="LOTUSX_BACKUP_V1:..."
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs font-mono focus:outline-none focus:border-primary"
                />
                <button
                  type="button"
                  disabled={!manualPayloadInput.trim()}
                  onClick={() => {
                    const trimmed = manualPayloadInput.trim();
                    if (isValidLotusXQr(trimmed)) {
                      setError(null);
                      setScannedPayload(trimmed);
                    } else {
                      setError('Invalid Recovery Kit string. Expected LOTUSX_BACKUP_V1:... or encrypted JSON.');
                    }
                  }}
                  className="px-3.5 py-2 rounded-lg border border-border hover:bg-bg-secondary text-xs font-semibold text-text-primary cursor-pointer disabled:opacity-50"
                >
                  Use Payload
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleRestoreSubmit} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-success/10 border border-success/30 flex items-center gap-2.5 text-xs text-text-primary">
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
              <span>
                Encrypted LotusX Recovery QR detected! Enter its password below to decrypt.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1.5">
                Recovery QR Decryption Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter Master / Recovery Kit password..."
                autoFocus
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-surface text-text-primary text-xs font-mono focus:outline-none focus:border-primary"
                required
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => {
                  setScannedPayload(null);
                  setPassword('');
                  setError(null);
                }}
                className="text-xs text-text-secondary hover:text-text-primary font-medium cursor-pointer"
              >
                ← Scan Different QR
              </button>

              <button
                type="submit"
                disabled={isRestoring || !password}
                className="btn-primary px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isRestoring ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Decrypting Vault...
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    Decrypt & Restore Vault
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {error && (
          <div className="p-3 rounded-xl bg-error/10 border border-error/30 flex items-start gap-2 text-xs text-error">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </Modal>
  );
};
