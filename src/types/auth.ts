/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MasterPasswordStrength {
  score: number; // 0 to 4
  entropyBits: number;
  label: 'Very Weak' | 'Weak' | 'Fair' | 'Strong' | 'Very Strong';
  color: string;
  feedback: string[];
  estimatedCrackTime: string;
  meetsPolicy: boolean;
}

export type VaultStatus = 'uninitialized' | 'locked' | 'unlocked' | 'error';

export interface VaultSession {
  status: VaultStatus;
  derivedKey: CryptoKey | null;
  unlockedAt: number | null;
  lastActivityAt: number | null;
}
