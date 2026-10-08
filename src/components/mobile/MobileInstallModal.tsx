/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Smartphone,
  Share,
  PlusSquare,
  MoreVertical,
  Download,
  CheckCircle2,
  ShieldCheck,
  WifiOff,
  Fingerprint,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { LotusXLogo } from '../common/LotusXLogo';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface MobileInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileInstallModal: React.FC<MobileInstallModalProps> = ({ isOpen, onClose }) => {
  const { platform, isStandalone, canInstallPrompt, triggerInstall } = usePWAInstall();

  const handleNativeInstall = async () => {
    const installed = await triggerInstall();
    if (installed) {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Install LotusX Mobile App"
      subtitle="Run LotusX as a dedicated, full-screen offline vault on your phone"
      maxWidth="lg"
    >
      <div className="space-y-5">
        {/* Top Feature Highlight Banner */}
        <div className="p-4 rounded-xl bg-[#03152F] text-white border border-[#1D3855] flex items-center gap-4">
          <LotusXLogo size="lg" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-white">LotusX Native-Grade Vault</h4>
              {isStandalone && (
                <span className="px-2 py-0.5 rounded-full bg-[#16A56B]/20 text-[#16A56B] text-[10px] font-semibold">
                  Installed
                </span>
              )}
            </div>
            <p className="text-xs text-[#B8C6D8] leading-relaxed">
              Installing to your home screen isolates your vault from browser tabs and enables instant offline launch.
            </p>
          </div>
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-bg-secondary border border-border flex items-start gap-2.5">
            <WifiOff className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-text-primary">100% Offline Ready</p>
              <p className="text-[11px] text-text-secondary">Works without internet or cellular signal</p>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-bg-secondary border border-border flex items-start gap-2.5">
            <Fingerprint className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-text-primary">Biometric Ready</p>
              <p className="text-[11px] text-text-secondary">Unlock with Face ID or Fingerprint</p>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-bg-secondary border border-border flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-success shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-text-primary">Zero Cloud Sync</p>
              <p className="text-[11px] text-text-secondary">Encrypted data stays on your device</p>
            </div>
          </div>
        </div>

        {/* Direct One-Tap Install if supported by Chrome/Android */}
        {canInstallPrompt && !isStandalone && (
          <div className="p-4 rounded-xl bg-primary/10 border border-primary/25 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="space-y-0.5 text-center sm:text-left">
              <p className="text-xs font-bold text-text-primary">
                Direct One-Tap Installation Available
              </p>
              <p className="text-[11px] text-text-secondary">
                Your browser supports instant home screen app installation.
              </p>
            </div>
            <button
              onClick={handleNativeInstall}
              className="btn-primary w-full sm:w-auto px-5 py-2.5 rounded-lg text-xs shadow-xs transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Install App Now
            </button>
          </div>
        )}

        {/* Step-by-Step Instructions for iOS & Android */}
        <div className="space-y-4">
          {/* iOS Safari Instructions */}
          <div
            className={`p-4 rounded-xl border transition-all ${
              platform === 'ios'
                ? 'bg-primary/5 border-primary/40 ring-1 ring-primary/20'
                : 'bg-bg-surface border-border'
            }`}
          >
            <div className="flex items-center justify-between mb-2.5">
              <h5 className="text-xs font-bold text-text-primary flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-primary" />
                iPhone & iPad (Safari)
              </h5>
              {platform === 'ios' && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-primary text-white">
                  Detected Device
                </span>
              )}
            </div>
            <ol className="space-y-2 text-xs text-text-secondary">
              <li className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-bg-secondary text-text-primary font-bold text-[11px] flex items-center justify-center shrink-0">
                  1
                </span>
                <span>
                  Tap the <strong className="text-text-primary">Share</strong> button{' '}
                  <Share className="w-3.5 h-3.5 inline text-primary mx-0.5" /> at the bottom of Safari.
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-bg-secondary text-text-primary font-bold text-[11px] flex items-center justify-center shrink-0">
                  2
                </span>
                <span>
                  Scroll down and tap{' '}
                  <strong className="text-text-primary">Add to Home Screen</strong>{' '}
                  <PlusSquare className="w-3.5 h-3.5 inline text-primary mx-0.5" />.
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-bg-secondary text-text-primary font-bold text-[11px] flex items-center justify-center shrink-0">
                  3
                </span>
                <span>
                  Tap <strong className="text-text-primary">Add</strong> in the top-right corner to launch LotusX from your home screen.
                </span>
              </li>
            </ol>
          </div>

          {/* Android Chrome Instructions */}
          <div
            className={`p-4 rounded-xl border transition-all ${
              platform === 'android'
                ? 'bg-primary/5 border-primary/40 ring-1 ring-primary/20'
                : 'bg-bg-surface border-border'
            }`}
          >
            <div className="flex items-center justify-between mb-2.5">
              <h5 className="text-xs font-bold text-text-primary flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-primary" />
                Android (Chrome / Edge / Brave)
              </h5>
              {platform === 'android' && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-primary text-white">
                  Detected Device
                </span>
              )}
            </div>
            <ol className="space-y-2 text-xs text-text-secondary">
              <li className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-bg-secondary text-text-primary font-bold text-[11px] flex items-center justify-center shrink-0">
                  1
                </span>
                <span>
                  Tap the browser menu icon{' '}
                  <MoreVertical className="w-3.5 h-3.5 inline text-primary mx-0.5" /> in the top-right corner.
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-bg-secondary text-text-primary font-bold text-[11px] flex items-center justify-center shrink-0">
                  2
                </span>
                <span>
                  Select <strong className="text-text-primary">Install app</strong> or{' '}
                  <strong className="text-text-primary">Add to Home screen</strong>.
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <span className="w-5 h-5 rounded-full bg-bg-secondary text-text-primary font-bold text-[11px] flex items-center justify-center shrink-0">
                  3
                </span>
                <span>
                  Confirm <strong className="text-text-primary">Install</strong> to add the LotusX Vault app icon to your phone.
                </span>
              </li>
            </ol>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="btn-secondary px-5 py-2.5 rounded-lg text-xs cursor-pointer"
          >
            Got It
          </button>
        </div>
      </div>
    </Modal>
  );
};
