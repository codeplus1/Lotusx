/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
  Sliders,
  KeyRound,
  Sparkles,
} from 'lucide-react';
import {
  passwordGenerator,
  PasswordGeneratorOptions,
  PassphraseOptions,
} from '../../security/PasswordGeneratorService';
import { useVault } from '../../context/VaultContext';

interface PasswordGeneratorViewProps {
  isModal?: boolean;
  onSelectPassword?: (password: string) => void;
}

export const PasswordGeneratorView: React.FC<PasswordGeneratorViewProps> = ({
  isModal = false,
  onSelectPassword,
}) => {
  const { copyToClipboard, copiedFieldLabel } = useVault();

  const [mode, setMode] = useState<'password' | 'passphrase'>('password');
  const [generatedSecret, setGeneratedSecret] = useState('');

  // Random character password options
  const [pwOptions, setPwOptions] = useState<PasswordGeneratorOptions>({
    length: 20,
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: true,
    excludeAmbiguous: false,
  });

  // Diceware passphrase options
  const [phraseOptions, setPhraseOptions] = useState<PassphraseOptions>({
    wordCount: 5,
    separator: '-',
    capitalize: true,
    includeNumber: true,
  });

  const handleGenerate = useCallback(() => {
    if (mode === 'password') {
      setGeneratedSecret(passwordGenerator.generatePassword(pwOptions));
    } else {
      setGeneratedSecret(passwordGenerator.generatePassphrase(phraseOptions));
    }
  }, [mode, pwOptions, phraseOptions]);

  useEffect(() => {
    handleGenerate();
  }, [handleGenerate]);

  const strength = passwordGenerator.evaluateStrength(generatedSecret);
  const isCopied = copiedFieldLabel === 'generator-output';

  return (
    <div className={isModal ? 'space-y-5' : 'max-w-3xl mx-auto space-y-6'}>
      {!isModal && (
        <div className="bg-bg-surface p-6 rounded-xl border border-border shadow-xs">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-primary font-semibold mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            Web Crypto CSPRNG Engine
          </div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Cryptographic Secret Generator
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Generates high-entropy passwords and EFF-inspired passphrases using rejection-sampled{' '}
            <code className="font-mono bg-bg-secondary px-1.5 py-0.5 rounded text-text-primary">
              crypto.getRandomValues()
            </code>{' '}
            with zero modulo bias.
          </p>
        </div>
      )}

      <div className="bg-bg-surface p-6 rounded-xl border border-border shadow-xs space-y-6">
        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-bg-secondary rounded-xl border border-border">
          <button
            type="button"
            onClick={() => setMode('password')}
            className={`py-2.5 px-4 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              mode === 'password'
                ? 'bg-primary text-white shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            Random Characters
          </button>
          <button
            type="button"
            onClick={() => setMode('passphrase')}
            className={`py-2.5 px-4 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer ${
              mode === 'passphrase'
                ? 'bg-primary text-white shadow-xs'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Memorable Passphrase
          </button>
        </div>

        {/* Output Display Box (Dark Navy Security Surface) */}
        <div className="p-5 rounded-xl bg-[#03152F] text-white border border-[#1D3855] space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="font-mono text-lg sm:text-xl font-bold tracking-wider break-all select-all text-[#F5F9FF]">
              {generatedSecret}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleGenerate}
                className="p-2.5 rounded-lg bg-[#062A63] hover:bg-[#08357A] text-[#B8C6D8] hover:text-white border border-[#1D3855] transition-colors cursor-pointer"
                title="Regenerate"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => copyToClipboard(generatedSecret, 'generator-output')}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  isCopied
                    ? 'bg-[#16A56B] text-white'
                    : 'bg-[#08BBD4] hover:bg-[#0797AD] text-white'
                }`}
              >
                {isCopied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Entropy & Crack Time Bar */}
          <div className="pt-3 border-t border-[#1D3855] flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-4">
              <span className="text-[#B8C6D8]">
                Entropy: <strong className="text-white font-mono">{strength.entropyBits} bits</strong>
              </span>
              <span className="text-[#B8C6D8]">
                Est. Crack Time:{' '}
                <strong className="text-[#08BBD4] font-mono">{strength.estimatedCrackTime}</strong>
              </span>
            </div>

            <span
              className="px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider"
              style={{
                backgroundColor: `${strength.color}25`,
                color: strength.color,
              }}
            >
              {strength.label}
            </span>
          </div>
        </div>

        {/* Configuration Controls */}
        {mode === 'password' ? (
          <div className="space-y-5">
            {/* Length Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-text-primary uppercase tracking-wider">
                  Password Length
                </label>
                <span className="font-mono font-bold text-sm text-primary bg-primary/10 border border-primary/25 px-2.5 py-0.5 rounded-md">
                  {pwOptions.length} characters
                </span>
              </div>
              <input
                type="range"
                min={8}
                max={64}
                value={pwOptions.length}
                onChange={(e) =>
                  setPwOptions({ ...pwOptions, length: Number(e.target.value) })
                }
                className="w-full accent-primary cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-text-muted font-mono">
                <span>8</span>
                <span>16</span>
                <span>32</span>
                <span>48</span>
                <span>64</span>
              </div>
            </div>

            {/* Character Set Checkboxes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {[
                { key: 'uppercase', label: 'Uppercase (A-Z)' },
                { key: 'lowercase', label: 'Lowercase (a-z)' },
                { key: 'numbers', label: 'Numbers (0-9)' },
                { key: 'symbols', label: 'Symbols (!@#$%^&*)' },
                { key: 'excludeAmbiguous', label: 'Exclude Ambiguous (i, l, 1, O, 0)' },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-bg-secondary/60 cursor-pointer select-none transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={(pwOptions as any)[item.key]}
                    onChange={(e) =>
                      setPwOptions({
                        ...pwOptions,
                        [item.key]: e.target.checked,
                      })
                    }
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <span className="text-xs font-medium text-text-primary">{item.label}</span>
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Word Count Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-text-primary uppercase tracking-wider">
                  Word Count
                </label>
                <span className="font-mono font-bold text-sm text-primary bg-primary/10 border border-primary/25 px-2.5 py-0.5 rounded-md">
                  {phraseOptions.wordCount} words
                </span>
              </div>
              <input
                type="range"
                min={3}
                max={10}
                value={phraseOptions.wordCount}
                onChange={(e) =>
                  setPhraseOptions({
                    ...phraseOptions,
                    wordCount: Number(e.target.value),
                  })
                }
                className="w-full accent-primary cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-bg-secondary/60 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={phraseOptions.capitalize}
                  onChange={(e) =>
                    setPhraseOptions({
                      ...phraseOptions,
                      capitalize: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-xs font-medium text-text-primary">Capitalize Words</span>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-bg-secondary/60 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={phraseOptions.includeNumber}
                  onChange={(e) =>
                    setPhraseOptions({
                      ...phraseOptions,
                      includeNumber: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-xs font-medium text-text-primary">Append Random Number</span>
              </label>
            </div>
          </div>
        )}

        {onSelectPassword && (
          <div className="pt-4 border-t border-border flex justify-end">
            <button
              type="button"
              onClick={() => onSelectPassword(generatedSecret)}
              className="btn-primary px-5 py-2.5 rounded-lg text-xs flex items-center gap-2 cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              Use This Secret
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
