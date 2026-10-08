/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export type TotpAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512';

export interface ParsedTotpParams {
  secret: string;
  issuer?: string;
  account?: string;
  algorithm: TotpAlgorithm;
  digits: number;
  period: number;
}

export class TotpService {
  /**
   * Parses either a raw Base32 secret or an RFC-compatible otpauth://totp/... URI
   * Supports SHA-1, SHA-256, SHA-512, configurable digits (6-8), and configurable period (default 30s).
   */
  public parseInput(input: string): ParsedTotpParams {
    const trimmed = input.trim();
    if (trimmed.toLowerCase().startsWith('otpauth://')) {
      try {
        const url = new URL(trimmed);
        const secretParam = url.searchParams.get('secret') || '';
        const issuer = url.searchParams.get('issuer') || undefined;
        const rawAlg = (url.searchParams.get('algorithm') || 'SHA1').toUpperCase().replace('-', '');
        const algorithm: TotpAlgorithm =
          rawAlg === 'SHA256' ? 'SHA-256' : rawAlg === 'SHA512' ? 'SHA-512' : 'SHA-1';

        const rawDigits = parseInt(url.searchParams.get('digits') || '6', 10);
        const digits = [6, 7, 8].includes(rawDigits) ? rawDigits : 6;

        const rawPeriod = parseInt(url.searchParams.get('period') || '30', 10);
        const period = !isNaN(rawPeriod) && rawPeriod >= 10 && rawPeriod <= 120 ? rawPeriod : 30;

        const cleanSecret = secretParam.replace(/[\s-]/g, '').toUpperCase();
        return { secret: cleanSecret, issuer, algorithm, digits, period };
      } catch {
        throw new Error('Malformed otpauth:// URI');
      }
    }
    const cleanSecret = trimmed.replace(/[\s-]/g, '').toUpperCase();
    return {
      secret: cleanSecret,
      algorithm: 'SHA-1',
      digits: 6,
      period: 30,
    };
  }

  public isValidBase32(secret: string): boolean {
    if (!secret || secret.length < 8) return false;
    const clean = secret.replace(/=+$/, '').toUpperCase();
    for (let i = 0; i < clean.length; i++) {
      if (!BASE32_ALPHABET.includes(clean[i])) {
        return false;
      }
    }
    return true;
  }

  public isValidSecret(secretOrUri: string): boolean {
    try {
      const parsed = this.parseInput(secretOrUri);
      return this.isValidBase32(parsed.secret);
    } catch {
      return false;
    }
  }

  public async generateTotp(
    secretOrUri: string
  ): Promise<{ code: string; remainingSeconds: number; period: number; digits: number } | null> {
    try {
      return await this.generateCode(secretOrUri);
    } catch {
      return null;
    }
  }

  private base32ToBytes(base32: string): Uint8Array {
    const clean = base32.replace(/[\s-=]/g, '').toUpperCase();
    let bits = '';
    for (let i = 0; i < clean.length; i++) {
      const val = BASE32_ALPHABET.indexOf(clean[i]);
      if (val === -1) continue;
      bits += val.toString(2).padStart(5, '0');
    }
    const bytes = new Uint8Array(Math.floor(bits.length / 8));
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
    }
    return bytes;
  }

  /**
   * Generates an RFC 6238 TOTP code locally using Web Crypto API (SHA-1 / SHA-256 / SHA-512)
   */
  public async generateCode(
    secretOrUri: string,
    overridePeriodSeconds?: number,
    overrideDigits?: number,
    overrideAlgorithm?: TotpAlgorithm
  ): Promise<{ code: string; remainingSeconds: number; period: number; digits: number }> {
    const parsed = this.parseInput(secretOrUri);
    if (!this.isValidBase32(parsed.secret)) {
      throw new Error('Invalid Base32 TOTP secret');
    }

    const periodSeconds = overridePeriodSeconds || parsed.period || 30;
    const digits = overrideDigits || parsed.digits || 6;
    const algorithm = overrideAlgorithm || parsed.algorithm || 'SHA-1';

    const keyBytes = this.base32ToBytes(parsed.secret);
    const epochSeconds = Math.floor(Date.now() / 1000);
    const timeStep = Math.floor(epochSeconds / periodSeconds);
    const remainingSeconds = periodSeconds - (epochSeconds % periodSeconds);

    const counterBuffer = new ArrayBuffer(8);
    const counterView = new DataView(counterBuffer);
    counterView.setUint32(0, Math.floor(timeStep / 0x100000000), false);
    counterView.setUint32(4, timeStep >>> 0, false);

    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: algorithm },
      false,
      ['sign']
    );

    const signature = await window.crypto.subtle.sign('HMAC', cryptoKey, counterBuffer);
    const hmac = new Uint8Array(signature);
    const offset = hmac[hmac.length - 1] & 0x0f;

    const binary =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const modulo = Math.pow(10, digits);
    const otp = (binary % modulo).toString().padStart(digits, '0');
    return { code: otp, remainingSeconds, period: periodSeconds, digits };
  }
}

export const totpService = new TotpService();
