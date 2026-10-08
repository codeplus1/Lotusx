/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, Eye, EyeOff, ArrowLeft, CheckCircle2, AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { passwordGenerator } from '../../security/PasswordGeneratorService';
import { useVault } from '../../context/VaultContext';
import { LotusXLogo } from '../common/LotusXLogo';

interface CreateVaultScreenProps {
  onCancel: () => void;
  onSuccess: () => void;
}

export const CreateVaultScreen: React.FC<CreateVaultScreenProps> = ({ onCancel, onSuccess }) => {
  const { createNewVault } = useVault();

  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [understoodZeroKnowledge, setUnderstoodZeroKnowledge] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = passwordGenerator.evaluateStrength(masterPassword);
  const passwordsMatch = masterPassword.length > 0 && masterPassword === confirmPassword;
  const isFormValid = masterPassword.length >= 10 && passwordsMatch && understoodZeroKnowledge;

  const handleGenerateStrongMaster = () => {
    const generated = passwordGenerator.generatePassphrase({
      wordCount: 5,
      separator: '-',
      capitalize: true,
      includeNumber: true,
    });
    setMasterPassword(generated);
    setConfirmPassword(generated);
    setShowPassword(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || isInitializing) return;

    setIsInitializing(true);
    setError(null);

    try {
      await new Promise((r) => setTimeout(r, 80));
      await createNewVault(masterPassword, true);
      setMasterPassword('');
      setConfirmPassword('');
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to initialize encrypted vault.');
      setIsInitializing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#03152F] text-[#F5F9FF] flex items-center justify-center p-4 sm:p-6 relative overflow-x-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-xl w-full bg-[#0D223D] border border-[#1D3855] rounded-2xl p-6 sm:p-8 shadow-xl relative z-10"
      >
        <button
          onClick={onCancel}
          disabled={isInitializing}
          className="inline-flex items-center gap-1.5 text-xs text-[#B8C6D8] hover:text-white mb-6 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Welcome
        </button>

        <div className="flex items-center gap-3.5 mb-6">
          <div className="w-12 h-12 rounded-xl bg-[#062A63] border border-[#1D3855] flex items-center justify-center shrink-0">
            <LotusXLogo size="lg" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Initialize Master Vault</h1>
            <p className="text-xs text-[#B8C6D8]">
              Create your primary encryption key (PBKDF2-HMAC-SHA256 • 600,000 iterations)
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Master Password Field */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-[#B8C6D8]">
                Master Password
              </label>
              <button
                type="button"
                onClick={handleGenerateStrongMaster}
                className="inline-flex items-center gap-1 text-xs text-[#08BBD4] hover:text-[#39CBE0] font-medium cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                Suggest Diceware Passphrase
              </button>
            </div>

            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                placeholder="Enter a strong master password (min 10 characters)..."
                className="w-full bg-[#061426] border border-[#1D3855] focus:border-[#08BBD4] focus:ring-2 focus:ring-[#08BBD4]/20 rounded-xl px-4 py-3 pr-11 text-sm text-white placeholder:text-[#8493A5] focus:outline-none transition-all font-mono"
                required
                disabled={isInitializing}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8493A5] hover:text-white p-1 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Strength Meter */}
            {masterPassword.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#B8C6D8]">
                    Entropy: <strong className="text-white font-mono">{strength.entropyBits} bits</strong>
                  </span>
                  <span className="font-semibold" style={{ color: strength.color }}>
                    {strength.label} (Crack time: {strength.estimatedCrackTime})
                  </span>
                </div>
                <div className="h-1.5 w-full bg-[#061426] rounded-full overflow-hidden flex gap-1">
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className="h-full flex-1 rounded-full transition-all duration-300"
                      style={{
                        backgroundColor: idx < strength.score ? strength.color : '#1D3855',
                      }}
                    />
                  ))}
                </div>
                {strength.feedback.length > 0 && (
                  <p className="text-[11px] text-[#8493A5]">{strength.feedback[0]}</p>
                )}
              </div>
            )}
          </div>

          {/* Confirm Master Password */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#B8C6D8]">
              Confirm Master Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your master password..."
                className={`w-full bg-[#061426] border rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#8493A5] focus:outline-none transition-all font-mono ${
                  confirmPassword.length > 0
                    ? passwordsMatch
                      ? 'border-[#16A56B]/60 focus:border-[#16A56B]'
                      : 'border-[#D64545]/60 focus:border-[#D64545]'
                    : 'border-[#1D3855] focus:border-[#08BBD4]'
                }`}
                required
                disabled={isInitializing}
              />
              {confirmPassword.length > 0 && passwordsMatch && (
                <CheckCircle2 className="w-4 h-4 text-[#16A56B] absolute right-3.5 top-1/2 -translate-y-1/2" />
              )}
            </div>
          </div>

          {/* Zero-Knowledge Warning Box */}
          <div className="p-4 rounded-xl bg-[#0B1F38] border border-[#E6A23C]/40 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-[#E6A23C] shrink-0 mt-0.5" />
              <div className="text-xs text-[#B8C6D8] leading-relaxed">
                <strong className="font-semibold block text-[#E6A23C] mb-0.5">
                  Zero-Knowledge Architecture Notice
                </strong>
                LotusX never stores or transmits your Master Password. If you forget this password and do not have an encrypted backup, your vault cannot be recovered by anyone.
              </div>
            </div>

            <label className="flex items-center gap-2.5 pt-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={understoodZeroKnowledge}
                onChange={(e) => setUnderstoodZeroKnowledge(e.target.checked)}
                className="w-4 h-4 rounded border-[#1D3855] bg-[#061426] text-[#08BBD4] focus:ring-[#08BBD4]"
                disabled={isInitializing}
              />
              <span className="text-xs font-medium text-white">
                I understand that I am solely responsible for remembering my Master Password.
              </span>
            </label>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-[#D64545]/15 border border-[#D64545]/40 text-xs text-[#D64545]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!isFormValid || isInitializing}
            className="w-full py-3.5 px-6 rounded-xl bg-[#08BBD4] hover:bg-[#0797AD] disabled:bg-[#112B4A] disabled:text-[#8493A5] text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shadow-sm"
          >
            {isInitializing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Deriving 256-bit Key (600,000 PBKDF2 rounds)...
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                Encrypt & Initialize Vault
              </>
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
};
