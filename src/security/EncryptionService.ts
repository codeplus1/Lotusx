/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EncryptedPayload } from '../types/vault';
import { DecryptionError, EncryptionError } from '../core/errors';

export interface IEncryptionService {
  encryptData<T>(data: T, key: CryptoKey): Promise<EncryptedPayload>;
  decryptData<T>(payload: EncryptedPayload, key: CryptoKey): Promise<T>;
  encryptString(plainText: string, key: CryptoKey): Promise<EncryptedPayload>;
  decryptString(payload: EncryptedPayload, key: CryptoKey): Promise<string>;
  encryptBinary(data: Uint8Array, key: CryptoKey): Promise<EncryptedPayload>;
  decryptBinary(payload: EncryptedPayload, key: CryptoKey): Promise<Uint8Array>;
  computeHmacSha256(data: string, secretBytes: Uint8Array): Promise<string>;
  verifyHmacSha256(data: string, signatureBase64: string, secretBytes: Uint8Array): Promise<boolean>;
  generateRandomBytes(length: number): Uint8Array;
  zeroize(buffer: Uint8Array): void;
}

export class EncryptionService implements IEncryptionService {
  private static readonly CURRENT_VERSION = 1;
  private static readonly IV_LENGTH_BYTES = 12; // 96 bits standard for AES-GCM
  private static readonly TAG_LENGTH_BITS = 128; // 128-bit authentication tag

  /**
   * Overwrites sensitive memory buffers with zeroes immediately
   */
  zeroize(buffer: Uint8Array): void {
    if (buffer && buffer.fill) {
      buffer.fill(0);
    }
  }

  /**
   * Generates cryptographically secure random bytes
   */
  generateRandomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    window.crypto.getRandomValues(bytes);
    return bytes;
  }

  /**
   * Encrypts raw binary buffers (e.g. 256-bit Vault Key) using AES-256-GCM
   */
  async encryptBinary(data: Uint8Array, key: CryptoKey): Promise<EncryptedPayload> {
    try {
      const iv = this.generateRandomBytes(EncryptionService.IV_LENGTH_BYTES);
      const encryptedBuffer = await window.crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv,
          tagLength: EncryptionService.TAG_LENGTH_BITS,
        },
        key,
        data
      );

      return {
        version: EncryptionService.CURRENT_VERSION,
        iv: this.uint8ArrayToBase64(iv),
        ciphertext: this.arrayBufferToBase64(encryptedBuffer),
        tagLength: EncryptionService.TAG_LENGTH_BITS,
      };
    } catch {
      throw new EncryptionError('Cryptographic key wrapping operation failed');
    }
  }

  /**
   * Decrypts raw binary buffers using AES-256-GCM with authentication tag check
   */
  async decryptBinary(payload: EncryptedPayload, key: CryptoKey): Promise<Uint8Array> {
    if (!payload || !payload.iv || !payload.ciphertext) {
      throw new DecryptionError('Corrupted or incomplete ciphertext envelope');
    }

    try {
      const ivBytes = this.base64ToUint8Array(payload.iv);
      const ciphertextBuffer = this.base64ToArrayBuffer(payload.ciphertext);

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: ivBytes,
          tagLength: payload.tagLength || EncryptionService.TAG_LENGTH_BITS,
        },
        key,
        ciphertextBuffer
      );

      return new Uint8Array(decryptedBuffer);
    } catch {
      throw new DecryptionError('Authentication tag mismatch or invalid key');
    }
  }

  /**
   * Computes an HMAC-SHA256 signature for authenticated backup integrity
   */
  async computeHmacSha256(data: string, secretBytes: Uint8Array): Promise<string> {
    const hmacKey = await window.crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const encoder = new TextEncoder();
    const signature = await window.crypto.subtle.sign('HMAC', hmacKey, encoder.encode(data));
    return this.uint8ArrayToBase64(new Uint8Array(signature));
  }

  /**
   * Constant-time verification of an HMAC-SHA256 tag
   */
  async verifyHmacSha256(data: string, signatureBase64: string, secretBytes: Uint8Array): Promise<boolean> {
    try {
      const hmacKey = await window.crypto.subtle.importKey(
        'raw',
        secretBytes,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );
      const encoder = new TextEncoder();
      const sigBytes = this.base64ToUint8Array(signatureBase64);
      return await window.crypto.subtle.verify('HMAC', hmacKey, sigBytes, encoder.encode(data));
    } catch {
      return false;
    }
  }

  /**
   * Encrypts any serializable object using AES-256-GCM with fresh CSPRNG IV
   */
  async encryptData<T>(data: T, key: CryptoKey): Promise<EncryptedPayload> {
    try {
      const json = JSON.stringify(data);
      return await this.encryptString(json, key);
    } catch (err) {
      if (err instanceof EncryptionError) throw err;
      throw new EncryptionError('Failed to serialize and encrypt object');
    }
  }

  /**
   * Encrypts a UTF-8 string using AES-256-GCM
   */
  async encryptString(plainText: string, key: CryptoKey): Promise<EncryptedPayload> {
    try {
      // 1. Fresh unique 12-byte IV for EVERY single encryption operation
      const iv = this.generateRandomBytes(EncryptionService.IV_LENGTH_BYTES);

      const encoder = new TextEncoder();
      const plaintextBuffer = encoder.encode(plainText);

      // 2. Perform authenticated AES-GCM encryption
      const encryptedBuffer = await window.crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv,
          tagLength: EncryptionService.TAG_LENGTH_BITS,
        },
        key,
        plaintextBuffer
      );

      // 3. Return versioned envelope
      return {
        version: EncryptionService.CURRENT_VERSION,
        iv: this.uint8ArrayToBase64(iv),
        ciphertext: this.arrayBufferToBase64(encryptedBuffer),
        tagLength: EncryptionService.TAG_LENGTH_BITS,
      };
    } catch {
      throw new EncryptionError('Cryptographic encryption operation failed');
    }
  }

  /**
   * Decrypts payload into a deserialized object, verifying authentication tag
   */
  async decryptData<T>(payload: EncryptedPayload, key: CryptoKey): Promise<T> {
    const json = await this.decryptString(payload, key);
    try {
      return JSON.parse(json) as T;
    } catch {
      throw new DecryptionError('Malformed payload after decryption');
    }
  }

  /**
   * Decrypts payload into UTF-8 string with full cryptographic authentication
   */
  async decryptString(payload: EncryptedPayload, key: CryptoKey): Promise<string> {
    if (!payload || !payload.iv || !payload.ciphertext) {
      throw new DecryptionError('Corrupted or incomplete ciphertext envelope');
    }

    try {
      const ivBytes = this.base64ToUint8Array(payload.iv);
      const ciphertextBuffer = this.base64ToArrayBuffer(payload.ciphertext);

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: ivBytes,
          tagLength: payload.tagLength || EncryptionService.TAG_LENGTH_BITS,
        },
        key,
        ciphertextBuffer
      );

      const decoder = new TextDecoder();
      return decoder.decode(decryptedBuffer);
    } catch {
      // Intentionally generic error to prevent oracle timing or padding attacks
      throw new DecryptionError('Authentication tag mismatch or invalid key');
    }
  }

  // --- Utility Base64 and Buffer helpers ---

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    return this.uint8ArrayToBase64(new Uint8Array(buffer));
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const bytes = this.base64ToUint8Array(base64);
    return bytes.buffer as ArrayBuffer;
  }
}

export const encryptionService = new EncryptionService();
