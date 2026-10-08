/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { KeyRound, RefreshCw, ShieldCheck, X, ArrowRight } from 'lucide-react';
import { DetectedPasswordChange } from '../../types/vault';

interface PasswordChangePromptModalProps {
  change: DetectedPasswordChange | null;
  onConfirm: (change: DetectedPasswordChange) => Promise<void>;
  onDismiss: () => void;
  isUpdating?: boolean;
}

export const PasswordChangePromptModal: React.FC<PasswordChangePromptModalProps> = ({
  change,
  onConfirm,
  onDismiss,
  isUpdating = false,
}) => {
  if (!change) return null;

  const isUpdate = Boolean(change.oldPassword);
  const displayTitle = change.recordTitle || 'Credential';

  const maskSecret = (secret: string) => {
    if (!secret) return '••••••••';
    if (secret.length <= 4) return '••••••••';
    return `${secret.slice(0, 2)}${'•'.repeat(Math.min(10, secret.length - 4))}${secret.slice(-2)}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-[#03152F]/75 backdrop-blur-xs animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="password-change-prompt-title"
    >
      <div className="w-full max-w-md bg-bg-surface rounded-2xl shadow-xl border border-border overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
        {/* Top Accent Banner */}
        <div className="bg-[#03152F] px-5 py-4 flex items-center justify-between border-b border-[#1D3855]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#062A63] border border-[#1D3855] flex items-center justify-center text-[#08BBD4] shrink-0">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#08BBD4] block">
                Credential Change Detected
              </span>
              <h3 id="password-change-prompt-title" className="text-sm font-bold text-white">
                {isUpdate ? 'Update Saved Password?' : 'Save New Credential?'}
              </h3>
            </div>
          </div>
          <button
            onClick={onDismiss}
            disabled={isUpdating}
            className="p-1.5 rounded-lg text-[#B8C6D8] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Close prompt"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-xs text-text-secondary leading-relaxed">
            {isUpdate ? (
              <>
                LotusX detected a new password for{' '}
                <span className="font-semibold text-text-primary">{displayTitle}</span>. Would you
                like to update your encrypted vault record and archive the old password in history?
              </>
            ) : (
              <>
                LotusX detected a new credential for{' '}
                <span className="font-semibold text-text-primary">{displayTitle}</span>. Would you
                like to save it to your encrypted vault?
              </>
            )}
          </p>

          {/* Diff Preview Box */}
          <div className="p-3.5 rounded-xl bg-bg-secondary border border-border space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-secondary font-medium">Account / Login</span>
              <span className="font-semibold text-text-primary truncate max-w-[200px]">
                {change.username || change.website || displayTitle}
              </span>
            </div>

            {isUpdate && change.oldPassword && (
              <div className="pt-2 border-t border-border flex items-center justify-between gap-2 text-xs">
                <div className="flex-1 min-w-0">
                  <span className="text-[10px] uppercase tracking-wider text-text-muted block">
                    Previous
                  </span>
                  <code className="font-mono text-text-secondary text-xs truncate block">
                    {maskSecret(change.oldPassword)}
                  </code>
                </div>

                <ArrowRight className="w-4 h-4 text-text-muted shrink-0" />

                <div className="flex-1 min-w-0 text-right">
                  <span className="text-[10px] uppercase tracking-wider text-success font-semibold block">
                    New Password
                  </span>
                  <code className="font-mono text-success font-semibold text-xs truncate block">
                    {maskSecret(change.newPassword)}
                  </code>
                </div>
              </div>
            )}

            {!isUpdate && (
              <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                <span className="text-text-secondary font-medium">Password</span>
                <code className="font-mono text-success font-semibold">
                  {maskSecret(change.newPassword)}
                </code>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-text-secondary bg-success/10 border border-success/25 px-3 py-2 rounded-lg">
            <ShieldCheck className="w-4 h-4 text-success shrink-0" />
            <span>
              Encrypted locally with AES-256-GCM before saving to IndexedDB.
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onDismiss}
              disabled={isUpdating}
              className="px-4 py-2 rounded-lg border border-border text-xs font-semibold text-text-secondary hover:bg-bg-secondary transition-colors cursor-pointer"
            >
              Not Now
            </button>
            <button
              type="button"
              onClick={() => onConfirm(change)}
              disabled={isUpdating}
              className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs shadow-xs cursor-pointer disabled:opacity-50"
            >
              <KeyRound className="w-3.5 h-3.5" />
              {isUpdating
                ? 'Encrypting...'
                : isUpdate
                ? 'Update Password'
                : 'Save to Vault'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
