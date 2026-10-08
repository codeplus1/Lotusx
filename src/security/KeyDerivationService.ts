/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { argon2id } from 'hash-wasm';
import { KdfParams } from '../types/vault';
import { DEFAULT_ARGON2_PARAMS } from '../core/constants';

export interface IKeyDerivationService {
  generateSalt(length?: number): string;
  deriveKey(password: string, params: KdfParams): Promise<{ rawKey: Uint8Array; cryptoKey: CryptoKey }>;
  createDefaultKdfParams(securityLevel?: 'standard' | 'high'): KdfParams;
}

export class KeyDerivationService implements IKeyDerivationService {
  /**
   * Generates a cryptographically secure random salt encoded in Base64
   */
  generateSalt(length = 16): string {
    const saltBytes = new Uint8Array(length);
    window.crypto.getRandomValues(saltBytes);
    return this.uint8ArrayToBase64(saltBytes);
  }

  /**
   * Creates default KDF parameters with a fresh CSPRNG salt
   */
  createDefaultKdfParams(securityLevel: 'standard' | 'high' = 'high'): KdfParams {
    const config = DEFAULT_ARGON2_PARAMS[securityLevel];
    return {
      algorithm: 'argon2id',
      memorySize: config.memorySize,
      iterations: config.iterations,
      parallelism: config.parallelism,
      hashLength: config.hashLength,
      salt: this.generateSalt(16),
    };
  }

  /**
   * Derives a 256-bit encryption key from master password using Argon2id
   */
  async deriveKey(
    password: string,
    params: KdfParams
  ): Promise<{ rawKey: Uint8Array; cryptoKey: CryptoKey }> {
    if (!password) {
      throw new Error('Password cannot be empty');
    }

    const saltBytes = this.base64ToUint8Array(params.salt);

    // Run memory-hard Argon2id in WebAssembly
    const rawHashHex = await argon2id({
      password,
      salt: saltBytes,
      iterations: params.iterations,
      memorySize: params.memorySize,
      hashLength: params.hashLength,
      parallelism: params.parallelism,
      outputType: 'hex',
    });

    // Convert hex string to Uint8Array (32 bytes = 256 bits)
    const rawKey = this.hexToUint8Array(rawHashHex);

    // Import into Web Cryptography API as AES-GCM key
    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM', length: 256 },
      false, // non-extractable from WebCrypto context for extra security
      ['encrypt', 'decrypt']
    );

    return { rawKey, cryptoKey };
  }

  // --- Utility Byte Converters ---

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private hexToUint8Array(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }
}

export const keyDerivationService = new KeyDerivationService();
