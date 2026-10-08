/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { encryptionService } from './EncryptionService';
import { vaultRepository } from '../storage/VaultRepository';
import { EncryptedPayload } from '../types/vault';

const BIOMETRIC_STORAGE_KEY = 'lotusx_webauthn_biometric_v1';
const PRF_HKDF_INFO = new TextEncoder().encode('LOTUSX_WEBAUTHN_PRF_AES256GCM_WRAP_V1');

export interface BiometricMetadata {
  enabled: boolean;
  credentialIdBase64: string;
  prfSaltBase64: string;
  wrappedSecret: EncryptedPayload;
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
 * Hardware-Backed WebAuthn PRF Biometric Service
 *
 * Uses the W3C WebAuthn Pseudo-Random Function (PRF) extension (`prf`) to derive a
 * hardware-bound 256-bit AES-GCM wrapping key inside the platform authenticator
 * (Touch ID, Face ID, Windows Hello, Android Biometrics).
 *
 * Security Guarantees:
 * - Never stores the Master Password in plaintext in localStorage, IndexedDB, sessionStorage, cookies, or URLs.
 * - Requires hardware biometric verification + PRF evaluation to derive the AES-256-GCM unwrapping key.
 * - Gracefully disables enrollment if the browser or authenticator does not support WebAuthn or PRF key derivation.
 */
export class BiometricService {
  /**
   * Checks whether WebAuthn platform authenticator hardware is available in this browser context
   */
  public async isHardwareAvailable(): Promise<boolean> {
    if (
      typeof window === 'undefined' ||
      typeof window.PublicKeyCredential === 'undefined' ||
      typeof navigator.credentials === 'undefined'
    ) {
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
  }

  /**
   * Enrolls WebAuthn platform authenticator and encrypts the verified secret using the hardware PRF output
   */
  public async enableBiometricUnlock(
    masterPassword: string,
    deviceLabel?: string
  ): Promise<BiometricMetadata> {
    if (
      typeof window === 'undefined' ||
      typeof window.PublicKeyCredential === 'undefined' ||
      !navigator.credentials
    ) {
      throw new Error(
        'WebAuthn Biometric Authentication is not supported in this browser environment.'
      );
    }

    // 1. Cryptographically verify the Master Password against the local vault before enrolling
    await vaultRepository.unlockWithPassword(masterPassword);

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

    let credential: PublicKeyCredential | null = null;
    try {
      credential = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: {
            name: 'LotusX Password Vault',
            id: window.location.hostname,
          },
          user: {
            id: userId,
            name: 'lotusx-local-vault',
            displayName: deviceLabel || 'LotusX Vault Owner',
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
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Biometric enrollment could not be completed (${msg}). Ensure your device supports Passkeys and is not restricted by an iframe policy.`
      );
    }

    if (!credential) {
      throw new Error('Biometric credential creation was cancelled.');
    }

    const extResults = credential.getClientExtensionResults() as WebAuthnPRFExtensionOutputs;
    let prfOutput = extResults?.prf?.results?.first;

    // Some authenticators require a separate get() assertion to evaluate PRF after creation
    if (!prfOutput && extResults?.prf?.enabled) {
      const verifyChallenge = encryptionService.generateRandomBytes(32);
      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: verifyChallenge,
          rpId: window.location.hostname,
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
        const assertExt = assertion.getClientExtensionResults() as WebAuthnPRFExtensionOutputs;
        prfOutput = assertExt?.prf?.results?.first;
      }
    }

    if (!prfOutput) {
      throw new Error(
        'Your browser or hardware authenticator does not support the WebAuthn PRF cryptographic extension required for zero-knowledge biometric key wrapping. Please use your Master Password.'
      );
    }

    // 3. Derive 256-bit AES-GCM wrapping key from the hardware PRF output via HKDF-SHA-256
    const wrappingKey = await this.deriveAesKeyFromPrfOutput(new Uint8Array(prfOutput), prfSalt);

    // 4. Encrypt with AES-256-GCM
    const wrappedSecret = await encryptionService.encryptString(masterPassword, wrappingKey);

    const metadata: BiometricMetadata = {
      enabled: true,
      credentialIdBase64: this.bytesToBase64(new Uint8Array(credential.rawId)),
      prfSaltBase64: this.bytesToBase64(prfSalt),
      wrappedSecret,
      deviceLabel: deviceLabel || 'Platform Biometric Sensor',
      createdAt: Date.now(),
    };

    localStorage.setItem(BIOMETRIC_STORAGE_KEY, JSON.stringify(metadata));
    return metadata;
  }

  /**
   * Prompts the hardware biometric sensor and unwraps the encrypted secret in memory
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

    const extensions: WebAuthnPRFExtensionInputs = {
      prf: {
        eval: {
          first: prfSalt,
        },
      },
    };

    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: window.location.hostname,
        allowCredentials: [
          {
            type: 'public-key',
            id: credentialId,
          },
        ],
        userVerification: 'required',
        timeout: 60000,
        extensions: extensions as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) {
      throw new Error('Biometric verification was cancelled.');
    }

    const extResults = assertion.getClientExtensionResults() as WebAuthnPRFExtensionOutputs;
    const prfOutput = extResults?.prf?.results?.first;

    if (!prfOutput) {
      throw new Error(
        'Hardware authenticator did not return PRF cryptographic key material. Please unlock with your Master Password.'
      );
    }

    const wrappingKey = await this.deriveAesKeyFromPrfOutput(new Uint8Array(prfOutput), prfSalt);
    return await encryptionService.decryptString(meta.wrappedSecret, wrappingKey);
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
