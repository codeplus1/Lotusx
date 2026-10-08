/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MasterPasswordStrength } from '../types/auth';

export interface PasswordGeneratorOptions {
  length: number;
  useUppercase?: boolean;
  useLowercase?: boolean;
  useNumbers?: boolean;
  useSymbols?: boolean;
  avoidAmbiguous?: boolean; // e.g. 0, O, 1, l, I
  uppercase?: boolean;
  lowercase?: boolean;
  numbers?: boolean;
  symbols?: boolean;
  excludeAmbiguous?: boolean;
}

export interface PassphraseGeneratorOptions {
  wordCount: number;
  separator: string;
  capitalize: boolean;
  includeNumber: boolean;
}

export type PassphraseOptions = PassphraseGeneratorOptions;

export interface ExtendedPasswordStrength extends MasterPasswordStrength {
  entropy: number;
  crackTimeDisplay: string;
}

// Curated list of 100 memorable words for Diceware-style offline passphrase generation
const WORD_LIST = [
  'anchor', 'beacon', 'breeze', 'canvas', 'canyon', 'castle', 'cedar', 'cliff',
  'clover', 'comet', 'coral', 'crater', 'crystal', 'delta', 'desert', 'diamond',
  'drift', 'eagle', 'echo', 'ember', 'falcon', 'feather', 'forest', 'fossil',
  'galaxy', 'glacier', 'granite', 'grove', 'harbor', 'haven', 'horizon', 'island',
  'jaguar', 'journey', 'jungle', 'lagoon', 'lantern', 'meadow', 'meteor', 'mineral',
  'mirage', 'monarch', 'mountain', 'nebula', 'oasis', 'ocean', 'orchid', 'pebble',
  'phoenix', 'pillar', 'planet', 'prairie', 'prism', 'pyramid', 'quartz', 'quiver',
  'radiant', 'rainforest', 'rapids', 'ravine', 'reef', 'ridge', 'ripple', 'river',
  'safari', 'sahara', 'sandstone', 'sapphire', 'sequoia', 'shadow', 'silicon',
  'silver', 'skyline', 'solstice', 'spark', 'summit', 'sunrise', 'sunset', 'tempest',
  'timber', 'topaz', 'torrent', 'tundra', 'twilight', 'valley', 'velvet', 'vessel',
  'volcano', 'voyage', 'waterfall', 'whisper', 'wilderness', 'willow', 'zenith',
  'zephyr', 'zodiac', 'acorn', 'basalt', 'boulder', 'cascade', 'cypress'
];

export class PasswordGeneratorService {
  private readonly UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  private readonly LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
  private readonly NUMBERS = '0123456789';
  private readonly SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  private readonly AMBIGUOUS = '0O1lI';

  /**
   * Generates a cryptographically secure random password using Web Crypto CSPRNG
   */
  generatePassword(options: PasswordGeneratorOptions): { password: string; entropy: number } {
    let charset = '';
    const guaranteedChars: string[] = [];

    const useUpper = options.useUppercase ?? options.uppercase ?? true;
    const useLower = options.useLowercase ?? options.lowercase ?? true;
    const useNums = options.useNumbers ?? options.numbers ?? true;
    const useSyms = options.useSymbols ?? options.symbols ?? true;
    const avoidAmb = options.avoidAmbiguous ?? options.excludeAmbiguous ?? false;

    let upper = this.UPPERCASE;
    let lower = this.LOWERCASE;
    let nums = this.NUMBERS;
    let syms = this.SYMBOLS;

    if (avoidAmb) {
      const filterAmbiguous = (str: string) =>
        str.split('').filter((c) => !this.AMBIGUOUS.includes(c)).join('');
      upper = filterAmbiguous(upper);
      lower = filterAmbiguous(lower);
      nums = filterAmbiguous(nums);
      syms = filterAmbiguous(syms);
    }

    if (useUpper) {
      charset += upper;
      guaranteedChars.push(this.getRandomChar(upper));
    }
    if (useLower) {
      charset += lower;
      guaranteedChars.push(this.getRandomChar(lower));
    }
    if (useNums) {
      charset += nums;
      guaranteedChars.push(this.getRandomChar(nums));
    }
    if (useSyms) {
      charset += syms;
      guaranteedChars.push(this.getRandomChar(syms));
    }

    if (charset.length === 0) {
      charset = lower + nums;
    }

    const length = Math.max(8, Math.min(128, options.length));
    const resultChars: string[] = [...guaranteedChars];

    while (resultChars.length < length) {
      resultChars.push(this.getRandomChar(charset));
    }

    // Cryptographic Fisher-Yates shuffle
    this.cryptoShuffle(resultChars);
    const password = resultChars.join('');
    const entropy = Math.round(length * Math.log2(charset.length));

    return { password, entropy };
  }

  /**
   * Generates a multi-word Diceware passphrase
   */
  generatePassphrase(options: PassphraseGeneratorOptions): { passphrase: string; entropy: number } {
    const wordCount = Math.max(3, Math.min(12, options.wordCount));
    const selectedWords: string[] = [];

    for (let i = 0; i < wordCount; i++) {
      const randomIndex = this.getSecureRandomInt(0, WORD_LIST.length - 1);
      let word = WORD_LIST[randomIndex];
      if (options.capitalize) {
        word = word.charAt(0).toUpperCase() + word.slice(1);
      }
      selectedWords.push(word);
    }

    if (options.includeNumber) {
      const num = this.getSecureRandomInt(10, 99);
      selectedWords.push(num.toString());
    }

    const passphrase = selectedWords.join(options.separator);
    const entropy = Math.round(
      wordCount * Math.log2(WORD_LIST.length) + (options.includeNumber ? Math.log2(90) : 0)
    );

    return { passphrase, entropy };
  }

  /**
   * Calculates password strength, entropy bits, and crack time
   */
  evaluateStrength(password: string): ExtendedPasswordStrength {
    if (!password || password.length === 0) {
      return {
        score: 0,
        entropyBits: 0,
        entropy: 0,
        label: 'Very Weak',
        color: '#D64545',
        feedback: ['Please enter a password or passphrase.'],
        estimatedCrackTime: 'Instant',
        crackTimeDisplay: 'Instant',
        meetsPolicy: false,
      };
    }

    let poolSize = 0;
    if (/[a-z]/.test(password)) poolSize += 26;
    if (/[A-Z]/.test(password)) poolSize += 26;
    if (/[0-9]/.test(password)) poolSize += 10;
    if (/[^a-zA-Z0-9]/.test(password)) poolSize += 32;

    const entropyBits = Math.round(password.length * (poolSize > 0 ? Math.log2(poolSize) : 1));

    const feedback: string[] = [];
    if (password.length < 12) feedback.push('Password should be at least 12 characters.');
    if (!/[A-Z]/.test(password)) feedback.push('Add uppercase letters.');
    if (!/[a-z]/.test(password)) feedback.push('Add lowercase letters.');
    if (!/[0-9]/.test(password)) feedback.push('Add numbers.');
    if (!/[^a-zA-Z0-9]/.test(password)) feedback.push('Add special symbols.');

    if (/^[0-9]+$/.test(password)) feedback.push('Avoid purely numeric passwords.');
    if (/(.)\1{2,}/.test(password)) feedback.push('Avoid repeating identical characters.');

    let score = 0;
    let label: MasterPasswordStrength['label'] = 'Very Weak';
    let color = '#D64545';

    if (entropyBits >= 80 && password.length >= 14) {
      score = 4;
      label = 'Very Strong';
      color = '#16A56B';
    } else if (entropyBits >= 60 && password.length >= 12) {
      score = 3;
      label = 'Strong';
      color = '#16A56B';
    } else if (entropyBits >= 45 && password.length >= 10) {
      score = 2;
      label = 'Fair';
      color = '#E6A23C';
    } else if (entropyBits >= 28) {
      score = 1;
      label = 'Weak';
      color = '#E6A23C';
    } else {
      score = 0;
      label = 'Very Weak';
      color = '#D64545';
    }

    const crackTime = this.estimateCrackTime(entropyBits);

    return {
      score,
      entropyBits,
      entropy: entropyBits,
      label,
      color,
      feedback: feedback.length > 0 ? feedback : ['Meets high security standards.'],
      estimatedCrackTime: crackTime,
      crackTimeDisplay: crackTime,
      meetsPolicy: score >= 3 && password.length >= 12,
    };
  }

  private estimateCrackTime(entropyBits: number): string {
    if (entropyBits < 28) return 'Less than a second';
    if (entropyBits < 38) return 'Few seconds to minutes';
    if (entropyBits < 48) return 'Few hours to days';
    if (entropyBits < 60) return 'Several months';
    if (entropyBits < 70) return 'Several decades';
    if (entropyBits < 85) return 'Centuries';
    return 'Millions of years';
  }

  private getRandomChar(charset: string): string {
    const rand = this.getSecureRandomInt(0, charset.length - 1);
    return charset[rand];
  }

  private getSecureRandomInt(min: number, max: number): number {
    const range = max - min + 1;
    const maxUint32 = 0xffffffff;
    const limit = maxUint32 - (maxUint32 % range);
    const buffer = new Uint32Array(1);

    do {
      window.crypto.getRandomValues(buffer);
    } while (buffer[0] >= limit);

    return min + (buffer[0] % range);
  }

  private cryptoShuffle(array: string[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = this.getSecureRandomInt(0, i);
      const temp = array[i];
      array[i] = array[j];
      array[j] = temp;
    }
  }
}

export const passwordGeneratorService = new PasswordGeneratorService();

export const passwordGenerator = {
  generatePassword(options: PasswordGeneratorOptions): string {
    return passwordGeneratorService.generatePassword(options).password;
  },
  generatePassphrase(options: PassphraseGeneratorOptions): string {
    return passwordGeneratorService.generatePassphrase(options).passphrase;
  },
  evaluateStrength(password: string): ExtendedPasswordStrength {
    return passwordGeneratorService.evaluateStrength(password);
  },
};
