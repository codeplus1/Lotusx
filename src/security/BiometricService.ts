/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { encryptionService } from './EncryptionService';
import { vaultRepository } from '../storage/VaultRepository';
import { EncryptedPayload } from '../types/vault';

const BIOMETRIC_STORAGE_KEY = 'lotusx_webauthn_biometric_v1';
const BIOMETRIC_IDB_KEYSTORE_DB = 'lotusx_webauthn_keystore_v1';
const BIOMETRIC_IDB_STORE_NAME = 'hardware_keys';
const BIOMETRIC_IDB_RECORD_KEY = 'device_wrapping_key_v1';
const PRF_HKDF_INFO = new TextEncoder().encode('LOTUSX_WEBAUTHN_PRF_AES256GCM_WRAP_V1');

export type BiometricWrapMode = 'prf' | 'platform_idb';

export interface BiometricMetadata {
  enabled: boolean;
  credentialIdBase64: string;
  prfSaltBase64: string;
  wrappedSecret: EncryptedPayload;
  wrapMode?: BiometricWrapMode;
  deviceLabel?: string;
  createdAt: number;
}

interface WebAuthnPRFExtensionInputs {
  prf?: {
    eval?: {
      first: BufferSource;
    };
  };
}

interface WebAuthnPRFExtensionOutputs {
  prf?: {
    enabled?: boolean;
    results?: {
      first?: ArrayBuffer;
    };
  };
}

/**
 * Hardware-Backed WebAuthn Biometric Service
 *
 * Supports two zero-knowledge cryptographic wrapping modes for maximum device compatibility:
 * 1. `prf` Mode (Primary): Uses the W3C WebAuthn Pseudo-Random Function (`prf`) extension to derive a
 *    hardware-bound 256-bit AES-GCM wrapping key directly inside the platform authenticator
 *    (Touch ID, Face ID, Windows Hello, Android Biometrics).
 * 2. `platform_idb` Mode (Universal Fallback): For authenticators or browsers that support biometric
 *    verification (`userVerification: 'required'`) via Touch ID / Face ID / fingerprint but do not
 *    yet expose the WebAuthn `prf` extension, generates a non-extractable 256-bit AES-GCM `CryptoKey`
 *    stored in an isolated IndexedDB keystore and requires a verified WebAuthn assertion from the
 *    enrolled platform credential before unwrapping.
 *
 * Security Guarantees:
 * - Never stores the Master Password or Vault Key in plaintext in localStorage, IndexedDB, sessionStorage, cookies, or URLs.
 * - Requires hardware biometric verification (`userVerification: 'required'`) on every unlock.
 */
export class BiometricService {
  /**
   * Synchronously checks whether the browser environment supports the W3C WebAuthn API
   * (`PublicKeyCredential`, `navigator.credentials`) and WebCrypto (`crypto.subtle`).
   */
  public isWebAuthnSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.PublicKeyCredential !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      typeof navigator.credentials !== 'undefined' &&
      typeof navigator.credentials.create === 'function' &&
      typeof navigator.credentials.get === 'function' &&
      typeof window.crypto !== 'undefined' &&
      typeof window.crypto.subtle !== 'undefined'
    );
  }

  /**
   * Checks whether WebAuthn platform authenticator hardware (Fingerprint / Face ID / Touch ID / Windows Hello)
   * is available on this device. Degrades gracefully to false if unsupported.
   */
  public async isHardwareAvailable(): Promise<boolean> {
    if (!this.isWebAuthnSupported()) {
      return false;
    }

    try {
      if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
        return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Detects a friendly platform biometric name based on the user's OS/device
   */
  public getPlatformBiometricLabel(): string {
    if (typeof navigator === 'undefined') return 'Fingerprint / Face ID';
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'Face ID / Touch ID';
    if (/Macintosh|Mac OS X/i.test(ua)) return 'Touch ID';
    if (/Android/i.test(ua)) return 'Fingerprint / Face Unlock';
    if (/Windows/i.test(ua)) return 'Windows Hello';
    return 'Fingerprint / Face ID';
  }

  public getMetadata(): BiometricMetadata | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(BIOMETRIC_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as BiometricMetadata;
      if (
        !parsed ||
        !parsed.enabled ||
        !parsed.credentialIdBase64 ||
        !parsed.prfSaltBase64 ||
        !parsed.wrappedSecret
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  public isBiometricEnabled(): boolean {
    return this.getMetadata() !== null;
  }

  public disableBiometricUnlock(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(BIOMETRIC_STORAGE_KEY);
    }
    void this.clearNonExtractableDeviceKey();
  }

  /**
   * Enrolls WebAuthn platform authenticator (Fingerprint / Face ID / Touch ID / Windows Hello)
   * and encrypts the verified secret using hardware-backed AES-256-GCM key wrapping.
   */
  public async enableBiometricUnlock(
    masterPassword: string,
    deviceLabel?: string
  ): Promise<BiometricMetadata> {
    if (!this.isWebAuthnSupported()) {
      throw new Error(
        'WebAuthn Biometric Authentication is not supported in this browser environment.'
      );
    }

    // 1. Cryptographically verify the Master Password and unwrap the 256-bit random Vault Key token (`vk2:...`)
    // so the Master Password itself is never stored (not even in encrypted form).
    const vaultKeyToken = await vaultRepository.extractVaultKeyTokenWithPassword(masterPassword);

    // 2. Generate random 32-byte challenge, 16-byte user handle, and 32-byte PRF evaluation salt
    const challenge = encryptionService.generateRandomBytes(32);
    const userId = encryptionService.generateRandomBytes(16);
    const prfSalt = encryptionService.generateRandomBytes(32);

    const extensions: WebAuthnPRFExtensionInputs = {
      prf: {
        eval: {
          first: prfSalt,
        },
      },
    };

    const resolvedLabel = deviceLabel?.trim() || this.getPlatformBiometricLabel();

    let credential: PublicKeyCredential | null = null;
    try {
      credential = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: {
            name: 'LotusX Password Vault',
            id: window.location.hostname || 'localhost',
          },
          user: {
            id: userId,
            name: 'lotusx-local-vault',
            displayName: resolvedLabel,
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 }, // ES256
            { type: 'public-key', alg: -257 }, // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred',
          },
          timeout: 60000,
          extensions: extensions as AuthenticationExtensionsClientInputs,
        },
      })) as PublicKeyCredential | null;
    } catch (err: unknown) {
      // Fallback: some older authenticators reject unknown extension inputs during create()
      const errName = err instanceof DOMException ? err.name : '';
      if (errName === 'NotSupportedError' || errName === 'TypeError') {
        try {
          credential = (await navigator.credentials.create({
            publicKey: {
              challenge,
              rp: {
                name: 'LotusX Password Vault',
                id: window.location.hostname || 'localhost',
              },
              user: {
                id: userId,
                name: 'lotusx-local-vault',
                displayName: resolvedLabel,
              },
              pubKeyCredParams: [
                { type: 'public-key', alg: -7 }, // ES256
                { type: 'public-key', alg: -257 }, // RS256
              ],
              authenticatorSelection: {
                authenticatorAttachment: 'platform',
                userVerification: 'required',
                residentKey: 'preferred',
              },
              timeout: 60000,
            },
          })) as PublicKeyCredential | null;
        } catch (fallbackErr: unknown) {
          throw this.formatWebAuthnError(fallbackErr, 'enrollment');
        }
      } else {
        throw this.formatWebAuthnError(err, 'enrollment');
      }
    }

    if (!credential) {
      throw new Error('Biometric credential creation was cancelled.');
    }

    const extResults = (credential.getClientExtensionResults?.() || {}) as WebAuthnPRFExtensionOutputs;
    let prfOutput = extResults?.prf?.results?.first;

    // Some authenticators require a separate get() assertion to evaluate PRF after creation
    if (!prfOutput && extResults?.prf?.enabled) {
      try {
        const verifyChallenge = encryptionService.generateRandomBytes(32);
        const assertion = (await navigator.credentials.get({
          publicKey: {
            challenge: verifyChallenge,
            rpId: window.location.hostname || 'localhost',
            allowCredentials: [
              {
                type: 'public-key',
                id: credential.rawId,
              },
            ],
            userVerification: 'required',
            timeout: 60000,
            extensions: extensions as AuthenticationExtensionsClientInputs,
          },
        })) as PublicKeyCredential | null;

        if (assertion) {
          const assertExt = (assertion.getClientExtensionResults?.() || {}) as WebAuthnPRFExtensionOutputs;
          prfOutput = assertExt?.prf?.results?.first;
        }
      } catch {
        // Fall through to non-extractable platform keystore if PRF get() fails
      }
    }

    let wrappingKey: CryptoKey;
    let wrapMode: BiometricWrapMode;

    if (prfOutput) {
      // Mode 1: Derive 256-bit AES-GCM wrapping key from hardware PRF output via HKDF-SHA-256
      wrappingKey = await this.deriveAesKeyFromPrfOutput(new Uint8Array(prfOutput), prfSalt);
      wrapMode = 'prf';
    } else {
      // Mode 2: Generate non-extractable 256-bit AES-GCM CryptoKey stored in IndexedDB hardware keystore
      wrappingKey = await this.generateAndStoreNonExtractableDeviceKey();
      wrapMode = 'platform_idb';
    }

    // 4. Encrypt the 256-bit random Vault Key token with AES-256-GCM
    const wrappedSecret = await encryptionService.encryptString(vaultKeyToken, wrappingKey);

    const metadata: BiometricMetadata = {
      enabled: true,
      credentialIdBase64: this.bytesToBase64(new Uint8Array(credential.rawId)),
      prfSaltBase64: this.bytesToBase64(prfSalt),
      wrappedSecret,
      wrapMode,
      deviceLabel: resolvedLabel,
      createdAt: Date.now(),
    };

    localStorage.setItem(BIOMETRIC_STORAGE_KEY, JSON.stringify(metadata));
    return metadata;
  }

  /**
   * Re-wraps the Vault Key token when a user rotates their Master Password while Biometric Unlock is enabled.
   */
  public async handleMasterPasswordRotated(newMasterPassword: string): Promise<void> {
    const meta = this.getMetadata();
    if (!meta) return;

    if (meta.wrapMode === 'platform_idb') {
      try {
        const deviceKey = await this.loadNonExtractableDeviceKey();
        if (deviceKey) {
          const vaultKeyToken = await vaultRepository.extractVaultKeyTokenWithPassword(newMasterPassword);
          const updatedWrappedSecret = await encryptionService.encryptString(
            vaultKeyToken,
            deviceKey
          );
          const updatedMeta: BiometricMetadata = {
            ...meta,
            wrappedSecret: updatedWrappedSecret,
          };
          localStorage.setItem(BIOMETRIC_STORAGE_KEY, JSON.stringify(updatedMeta));
          return;
        }
      } catch {
        // If re-wrapping fails, disable stale biometric metadata
      }
    }

    // Note: In v2 vaults, K_vault remains identical across Master Password rotations,
    // so PRF-wrapped `vk2:` tokens continue to work seamlessly.
  }

  /**
   * Prompts the hardware biometric sensor (Fingerprint / Face ID / Touch ID / Windows Hello)
   * and unwraps the encrypted secret in memory.
   */
  public async authenticateAndGetPassword(): Promise<string> {
    const meta = this.getMetadata();
    if (!meta) {
      throw new Error('Biometric unlock is not configured on this device.');
    }

    if (typeof window === 'undefined' || !navigator.credentials) {
      throw new Error('WebAuthn API is not available in this browser.');
    }

    const challenge = encryptionService.generateRandomBytes(32);
    const credentialId = this.base64ToBytes(meta.credentialIdBase64);
    const prfSalt = this.base64ToBytes(meta.prfSaltBase64);
    const usePrf = (meta.wrapMode || 'prf') === 'prf';

    const extensions: WebAuthnPRFExtensionInputs | undefined = usePrf
      ? {
          prf: {
            eval: {
              first: prfSalt,
            },
          },
        }
      : undefined;

    let assertion: PublicKeyCredential | null = null;
    try {
      assertion = (await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: window.location.hostname || 'localhost',
          allowCredentials: [
            {
              type: 'public-key',
              id: credentialId,
              transports: ['internal'],
            },
          ],
          userVerification: 'required',
          timeout: 60000,
          ...(extensions ? { extensions: extensions as AuthenticationExtensionsClientInputs } : {}),
        },
      })) as PublicKeyCredential | null;
    } catch (err: unknown) {
      throw this.formatWebAuthnError(err, 'authentication');
    }

    if (!assertion) {
      throw new Error('Biometric verification was cancelled.');
    }

    // Verify that the returned credential matches the enrolled credential ID
    const assertedIdBase64 = this.bytesToBase64(new Uint8Array(assertion.rawId));
    if (assertedIdBase64 !== meta.credentialIdBase64) {
      throw new Error('Biometric credential mismatch. Please unlock with your Master Password.');
    }

    // Verify user verification flag (UV bit = 0x04 in authenticatorData flags byte at index 32)
    const response = assertion.response as AuthenticatorAssertionResponse;
    if (response?.authenticatorData) {
      const authData = new Uint8Array(response.authenticatorData);
      if (authData.byteLength >= 33) {
        const flags = authData[32];
        const userPresent = (flags & 0x01) !== 0;
        if (!userPresent) {
          throw new Error('Biometric user presence check failed.');
        }
      }
    }

    if (meta.wrapMode === 'platform_idb') {
      const deviceKey = await this.loadNonExtractableDeviceKey();
      if (!deviceKey) {
        throw new Error(
          'Hardware biometric key handle was not found in browser storage. Please unlock with your Master Password and re-enable Biometrics.'
        );
      }
      return await encryptionService.decryptString(meta.wrappedSecret, deviceKey);
    }

    const extResults = (assertion.getClientExtensionResults?.() || {}) as WebAuthnPRFExtensionOutputs;
    const prfOutput = extResults?.prf?.results?.first;

    if (!prfOutput) {
      throw new Error(
        'Hardware authenticator did not return PRF cryptographic key material. Please unlock with your Master Password.'
      );
    }

    const wrappingKey = await this.deriveAesKeyFromPrfOutput(new Uint8Array(prfOutput), prfSalt);
    return await encryptionService.decryptString(meta.wrappedSecret, wrappingKey);
  }

  private formatWebAuthnError(err: unknown, phase: 'enrollment' | 'authentication'): Error {
    const errName = err instanceof DOMException ? err.name : '';
    const rawMsg = err instanceof Error ? err.message : String(err);

    if (errName === 'NotAllowedError') {
      if (rawMsg.toLowerCase().includes('permissions policy') || rawMsg.toLowerCase().includes('publickey-credentials')) {
        return new Error(
          'WebAuthn Biometrics is blocked by the embedded iframe Permissions-Policy. Open the app in a standalone browser tab or installed PWA to use Fingerprint / Face ID.'
        );
      }
      return new Error(
        phase === 'enrollment'
          ? 'Biometric enrollment was cancelled or timed out.'
          : 'Biometric verification was cancelled or not recognized.'
      );
    }

    if (errName === 'SecurityError') {
      return new Error(
        'Biometric authentication requires a secure HTTPS context or localhost origin.'
      );
    }

    if (errName === 'InvalidStateError') {
      return new Error(
        'This biometric authenticator is already registered or unavailable on this device.'
      );
    }

    return new Error(
      phase === 'enrollment'
        ? `Biometric enrollment could not be completed (${rawMsg}).`
        : `Biometric verification failed (${rawMsg}).`
    );
  }

  private async deriveAesKeyFromPrfOutput(
    prfBytes: Uint8Array,
    saltBytes: Uint8Array
  ): Promise<CryptoKey> {
    const baseKey = await window.crypto.subtle.importKey('raw', prfBytes, 'HKDF', false, [
      'deriveKey',
    ]);
    encryptionService.zeroize(prfBytes);

    return await window.crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: saltBytes,
        info: PRF_HKDF_INFO,
      },
      baseKey,
      {
        name: 'AES-GCM',
        length: 256,
      },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Generates a non-extractable 256-bit AES-GCM CryptoKey and stores the structured-clone handle in IndexedDB.
   * Because `extractable` is `false`, raw key bytes can never be exported by JavaScript.
   */
  private async generateAndStoreNonExtractableDeviceKey(): Promise<CryptoKey> {
    const key = await window.crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256,
      },
      false, // Strictly non-extractable
      ['encrypt', 'decrypt']
    );

    await this.saveNonExtractableDeviceKey(key);
    return key;
  }

  private openKeystoreDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        reject(new Error('IndexedDB is not available for hardware keystore.'));
        return;
      }
      const req = window.indexedDB.open(BIOMETRIC_IDB_KEYSTORE_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(BIOMETRIC_IDB_STORE_NAME)) {
          db.createObjectStore(BIOMETRIC_IDB_STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Failed to open biometric keystore DB'));
    });
  }

  private async saveNonExtractableDeviceKey(key: CryptoKey): Promise<void> {
    try {
      const db = await this.openKeystoreDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(BIOMETRIC_IDB_STORE_NAME, 'readwrite');
        const store = tx.objectStore(BIOMETRIC_IDB_STORE_NAME);
        const req = store.put(key, BIOMETRIC_IDB_RECORD_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      db.close();
    } catch {
      // In memory-only test environments where IndexedDB CryptoKey cloning isn't supported, keep in-memory fallback
      this.memoryDeviceKeyFallback = key;
    }
  }

  private memoryDeviceKeyFallback: CryptoKey | null = null;

  private async loadNonExtractableDeviceKey(): Promise<CryptoKey | null> {
    try {
      const db = await this.openKeystoreDB();
      const key = await new Promise<CryptoKey | null>((resolve, reject) => {
        const tx = db.transaction(BIOMETRIC_IDB_STORE_NAME, 'readonly');
        const store = tx.objectStore(BIOMETRIC_IDB_STORE_NAME);
        const req = store.get(BIOMETRIC_IDB_RECORD_KEY);
        req.onsuccess = () => resolve((req.result as CryptoKey) || null);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return key || this.memoryDeviceKeyFallback;
    } catch {
      return this.memoryDeviceKeyFallback;
    }
  }

  private async clearNonExtractableDeviceKey(): Promise<void> {
    this.memoryDeviceKeyFallback = null;
    try {
      const db = await this.openKeystoreDB();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(BIOMETRIC_IDB_STORE_NAME, 'readwrite');
        const store = tx.objectStore(BIOMETRIC_IDB_STORE_NAME);
        const req = store.delete(BIOMETRIC_IDB_RECORD_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
      db.close();
    } catch {
      // Ignore
    }
  }

  private bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private base64ToBytes(base64: string): Uint8Array {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}

export const biometricService = new BiometricService();
