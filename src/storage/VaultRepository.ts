/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  VaultRecord,
  EncryptedVaultRecord,
  VaultMetadata,
  KdfParams,
} from '../types/vault';
import { STORAGE_KEYS, VERIFICATION_SENTINEL } from '../core/constants';
import { AuthenticationError, VaultLockedError, VaultIntegrityError } from '../core/errors';
import { keyDerivationService } from '../security/KeyDerivationService';
import { encryptionService } from '../security/EncryptionService';
import { secureStorageService, ISecureStorageService } from './SecureStorageService';

export const VAULT_HKDF_KEY_MAP = new WeakMap<CryptoKey, CryptoKey>();

export interface IVaultRepository {
  isInitialized(): Promise<boolean>;
  getMetadata(): Promise<VaultMetadata | null>;
  createVault(
    masterPassword: string,
    securityLevel?: 'standard' | 'high',
    passwordHint?: string
  ): Promise<{ metadata: VaultMetadata; cryptoKey: CryptoKey; recoveryKey: string }>;
  updatePasswordHint(hint: string): Promise<boolean>;
  getFailedUnlockAttempts(): Promise<number>;
  incrementFailedUnlockAttempts(): Promise<number>;
  resetFailedUnlockAttempts(): Promise<void>;
  unlockWithPassword(
    masterPassword: string
  ): Promise<{ cryptoKey: CryptoKey; records: VaultRecord[] }>;
  extractVaultKeyTokenWithPassword(masterPassword: string): Promise<string>;
  unlockWithRecoveryKey(
    recoveryKey: string
  ): Promise<{ cryptoKey: CryptoKey; records: VaultRecord[] }>;
  saveRecord(record: VaultRecord, key: CryptoKey): Promise<void>;
  deleteRecord(id: string): Promise<void>;
  getDecryptedRecords(key: CryptoKey, options?: { throwOnError?: boolean }): Promise<VaultRecord[]>;
  getAllEncryptedRecords(): Promise<EncryptedVaultRecord[]>;
  replaceEncryptedRecords(records: EncryptedVaultRecord[]): Promise<void>;
  replaceSnapshot(metadata: VaultMetadata, records: EncryptedVaultRecord[]): Promise<void>;
  changeMasterPassword(oldPassword: string, newPassword: string): Promise<boolean>;
  wipeVault(): Promise<void>;
  getActiveKey(): CryptoKey | null;
  getActiveHkdfKey(): CryptoKey | null;
  setActiveKey(key: CryptoKey | null, hkdfKey?: CryptoKey | null): void;
  getIntegrityWarning(): string | null;
  getCorruptedRecordIds(): string[];
  clearIntegrityWarning(): void;
}

export class VaultRepository implements IVaultRepository {
  private activeKey: CryptoKey | null = null;
  private activeHkdfKey: CryptoKey | null = null;
  private integrityWarning: string | null = null;
  private corruptedRecordIds: string[] = [];

  constructor(private storage: ISecureStorageService = secureStorageService) {}

  getActiveKey(): CryptoKey | null {
    return this.activeKey;
  }

  getActiveHkdfKey(): CryptoKey | null {
    return this.activeHkdfKey || (this.activeKey ? VAULT_HKDF_KEY_MAP.get(this.activeKey) || null : null);
  }

  setActiveKey(key: CryptoKey | null, hkdfKey?: CryptoKey | null): void {
    this.activeKey = key;
    this.activeHkdfKey = hkdfKey || (key ? VAULT_HKDF_KEY_MAP.get(key) || null : null);
  }

  getIntegrityWarning(): string | null {
    return this.integrityWarning;
  }

  getCorruptedRecordIds(): string[] {
    return [...this.corruptedRecordIds];
  }

  clearIntegrityWarning(): void {
    this.integrityWarning = null;
    this.corruptedRecordIds = [];
  }

  async isInitialized(): Promise<boolean> {
    const meta = await this.storage.getItem<VaultMetadata>(STORAGE_KEYS.METADATA);
    return meta !== null;
  }

  async getMetadata(): Promise<VaultMetadata | null> {
    return await this.storage.getItem<VaultMetadata>(STORAGE_KEYS.METADATA);
  }

  /**
   * Initializes a brand new vault with cryptographic key hierarchy:
   * - Generates 256-bit random Vault Key (K_vault)
   * - Wraps K_vault with Argon2id Master Key (K_master)
   * - Wraps K_vault with Argon2id Emergency Recovery Key (K_recovery)
   * - Stores K_vault strictly as non-extractable CryptoKey in memory
   */
  async createVault(
    masterPassword: string,
    securityLevel: 'standard' | 'high' = 'high',
    passwordHint?: string
  ): Promise<{ metadata: VaultMetadata; cryptoKey: CryptoKey; recoveryKey: string }> {
    const kdfParams: KdfParams = keyDerivationService.createDefaultKdfParams(securityLevel);

    // 1. Derive master key from password
    const { rawKey: masterRawKey, cryptoKey: masterCryptoKey } = await keyDerivationService.deriveKey(
      masterPassword,
      kdfParams
    );

    // 2. Generate random 256-bit Vault Key (K_vault)
    const vaultKeyRaw = new Uint8Array(32);
    window.crypto.getRandomValues(vaultKeyRaw);

    // 3. Import K_vault as non-extractable CryptoKey (AES-GCM for encryption/decryption)
    const vaultCryptoKey = await window.crypto.subtle.importKey(
      'raw',
      vaultKeyRaw,
      { name: 'AES-GCM', length: 256 },
      false, // Non-extractable in JS
      ['encrypt', 'decrypt']
    );

    // Import K_vault as non-extractable HKDF key for RFC 5869 key derivation
    const vaultHkdfKey = await window.crypto.subtle.importKey(
      'raw',
      vaultKeyRaw,
      'HKDF',
      false, // Non-extractable in JS
      ['deriveKey', 'deriveBits']
    );
    VAULT_HKDF_KEY_MAP.set(vaultCryptoKey, vaultHkdfKey);
    this.activeHkdfKey = vaultHkdfKey;

    // 4. Wrap K_vault with Master Key
    const encryptedVaultKey = await encryptionService.encryptBinary(vaultKeyRaw, masterCryptoKey);
    encryptionService.zeroize(masterRawKey);

    // 5. Generate Emergency Recovery Key (formatted 20-byte / 160-bit CSPRNG token)
    const recoveryBytes = new Uint8Array(20);
    window.crypto.getRandomValues(recoveryBytes);
    const recoveryKey = Array.from(recoveryBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
      .match(/.{1,4}/g)!
      .join('-');

    const recoveryKdfParams: KdfParams = keyDerivationService.createDefaultKdfParams('standard');
    const { rawKey: recoveryRawKey, cryptoKey: recoveryCryptoKey } = await keyDerivationService.deriveKey(
      recoveryKey,
      recoveryKdfParams
    );

    // 6. Wrap the SAME K_vault with Recovery Key
    const encryptedVaultKeyWithRecovery = await encryptionService.encryptBinary(
      vaultKeyRaw,
      recoveryCryptoKey
    );
    encryptionService.zeroize(recoveryRawKey);

    // Zeroize raw vault key buffer immediately
    encryptionService.zeroize(vaultKeyRaw);

    // 7. Encrypt sentinel verification token with K_vault
    const verificationToken = await encryptionService.encryptString(VERIFICATION_SENTINEL, vaultCryptoKey);

    const vaultId = 'v_' + window.crypto.randomUUID();
    const metadata: VaultMetadata = {
      version: 2,
      vaultId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      kdfParams,
      encryptedVaultKey,
      encryptedVaultKeyWithRecovery,
      recoveryKdfParams,
      verificationToken,
      passwordHint: passwordHint?.trim() || undefined,
    };

    // 8. Save metadata and initialize empty records table
    await this.storage.setItem(STORAGE_KEYS.METADATA, metadata);
    await this.storage.setItem(STORAGE_KEYS.RECORDS, []);
    await this.resetFailedUnlockAttempts();

    this.activeKey = vaultCryptoKey;
    this.clearIntegrityWarning();

    return { metadata, cryptoKey: vaultCryptoKey, recoveryKey };
  }

  async updatePasswordHint(hint: string): Promise<boolean> {
    const meta = await this.getMetadata();
    if (!meta) return false;
    meta.passwordHint = hint.trim() || undefined;
    meta.updatedAt = Date.now();
    await this.storage.setItem(STORAGE_KEYS.METADATA, meta);
    return true;
  }

  async getFailedUnlockAttempts(): Promise<number> {
    const count = await this.storage.getItem<number>(STORAGE_KEYS.FAILED_UNLOCK_ATTEMPTS);
    return typeof count === 'number' && !isNaN(count) ? count : 0;
  }

  async incrementFailedUnlockAttempts(): Promise<number> {
    const current = await this.getFailedUnlockAttempts();
    const next = current + 1;
    await this.storage.setItem(STORAGE_KEYS.FAILED_UNLOCK_ATTEMPTS, next);
    return next;
  }

  async resetFailedUnlockAttempts(): Promise<void> {
    await this.storage.removeItem(STORAGE_KEYS.FAILED_UNLOCK_ATTEMPTS);
  }

  /**
   * Verifies the Master Password and returns a Base64-encoded wrapped vault key token (`vk2:<base64>`)
   * so WebAuthn Biometric Unlock can wrap the 256-bit Vault Key without storing the Master Password.
   */
  async extractVaultKeyTokenWithPassword(masterPassword: string): Promise<string> {
    const metadata = await this.getMetadata();
    if (!metadata) {
      throw new AuthenticationError('Vault not initialized');
    }

    const { rawKey: masterRawKey, cryptoKey: masterCryptoKey } = await keyDerivationService.deriveKey(
      masterPassword,
      metadata.kdfParams
    );

    let vaultKeyRaw: Uint8Array;
    if (metadata.encryptedVaultKey) {
      try {
        vaultKeyRaw = await encryptionService.decryptBinary(
          metadata.encryptedVaultKey,
          masterCryptoKey
        );
      } catch {
        encryptionService.zeroize(masterRawKey);
        throw new AuthenticationError('Invalid master password');
      }
      encryptionService.zeroize(masterRawKey);
    } else {
      vaultKeyRaw = new Uint8Array(masterRawKey);
      encryptionService.zeroize(masterRawKey);
    }

    const vaultCryptoKey = await window.crypto.subtle.importKey(
      'raw',
      vaultKeyRaw,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    try {
      const decryptedSentinel = await encryptionService.decryptString(
        metadata.verificationToken,
        vaultCryptoKey
      );
      if (decryptedSentinel !== VERIFICATION_SENTINEL) {
        encryptionService.zeroize(vaultKeyRaw);
        throw new AuthenticationError('Invalid master password');
      }
    } catch {
      encryptionService.zeroize(vaultKeyRaw);
      throw new AuthenticationError('Invalid master password');
    }

    let binary = '';
    for (let i = 0; i < vaultKeyRaw.byteLength; i++) {
      binary += String.fromCharCode(vaultKeyRaw[i]);
    }
    const base64Key = window.btoa(binary);
    encryptionService.zeroize(vaultKeyRaw);
    return `vk2:${base64Key}`;
  }

  /**
   * Derives master key from password (or unwraps a `vk2:` biometric vault key token),
   * unwraps K_vault, and validates against verification sentinel
   */
  async unlockWithPassword(
    masterPassword: string
  ): Promise<{ cryptoKey: CryptoKey; records: VaultRecord[] }> {
    const metadata = await this.getMetadata();
    if (!metadata) {
      throw new AuthenticationError('Vault not initialized');
    }

    try {
      let vaultCryptoKey: CryptoKey;

      if (masterPassword.startsWith('vk2:')) {
        const base64Part = masterPassword.slice(4);
        const binary = window.atob(base64Part);
        const vaultKeyRaw = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          vaultKeyRaw[i] = binary.charCodeAt(i);
        }

        vaultCryptoKey = await window.crypto.subtle.importKey(
          'raw',
          vaultKeyRaw,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
        const vaultHkdfKey = await window.crypto.subtle.importKey(
          'raw',
          vaultKeyRaw,
          'HKDF',
          false,
          ['deriveKey', 'deriveBits']
        );
        VAULT_HKDF_KEY_MAP.set(vaultCryptoKey, vaultHkdfKey);
        this.activeHkdfKey = vaultHkdfKey;
        encryptionService.zeroize(vaultKeyRaw);
      } else {
        const { rawKey: masterRawKey, cryptoKey: masterCryptoKey } = await keyDerivationService.deriveKey(
          masterPassword,
          metadata.kdfParams
        );

        if (metadata.encryptedVaultKey) {
          // Modern key hierarchy: unwrap K_vault
          const vaultKeyRaw = await encryptionService.decryptBinary(
            metadata.encryptedVaultKey,
            masterCryptoKey
          );
          encryptionService.zeroize(masterRawKey);

          vaultCryptoKey = await window.crypto.subtle.importKey(
            'raw',
            vaultKeyRaw,
            { name: 'AES-GCM', length: 256 },
            false, // Non-extractable
            ['encrypt', 'decrypt']
          );
          const vaultHkdfKey = await window.crypto.subtle.importKey(
            'raw',
            vaultKeyRaw,
            'HKDF',
            false,
            ['deriveKey', 'deriveBits']
          );
          VAULT_HKDF_KEY_MAP.set(vaultCryptoKey, vaultHkdfKey);
          this.activeHkdfKey = vaultHkdfKey;
          encryptionService.zeroize(vaultKeyRaw);
        } else {
          // Legacy v1 fallback: master key acts directly as vault key
          vaultCryptoKey = masterCryptoKey;
          encryptionService.zeroize(masterRawKey);
        }
      }

      // Verify the sentinel verification token
      const decryptedSentinel = await encryptionService.decryptString(
        metadata.verificationToken,
        vaultCryptoKey
      );

      if (decryptedSentinel !== VERIFICATION_SENTINEL) {
        throw new AuthenticationError('Invalid master password');
      }

      this.activeKey = vaultCryptoKey;

      // Reset consecutive failed unlock counter on successful unlock
      await this.resetFailedUnlockAttempts();

      // Key is valid! Decrypt all records into application memory
      const records = await this.getDecryptedRecords(vaultCryptoKey);

      return { cryptoKey: vaultCryptoKey, records };
    } catch (err) {
      // Track failed unlock attempt
      const failed = await this.incrementFailedUnlockAttempts();
      if (failed >= 10) {
        await this.wipeVault();
        await this.resetFailedUnlockAttempts();
        throw new AuthenticationError('Vault permanently wiped: 10 consecutive failed master password attempts.');
      }
      if (err instanceof AuthenticationError) throw err;
      throw new AuthenticationError('Incorrect master password or corrupted vault.');
    }
  }

  /**
   * Unlocks using the Emergency Recovery Key by unwrapping the same Vault Key
   */
  async unlockWithRecoveryKey(
    recoveryKey: string
  ): Promise<{ cryptoKey: CryptoKey; records: VaultRecord[] }> {
    const metadata = await this.getMetadata();
    if (!metadata) {
      throw new AuthenticationError('Vault not initialized');
    }

    const cleanRecoveryKey = recoveryKey.trim().toUpperCase();

    try {
      let vaultCryptoKey: CryptoKey;

      if (metadata.encryptedVaultKeyWithRecovery && metadata.recoveryKdfParams) {
        // Modern key hierarchy: derive K_recovery and unwrap K_vault
        const { rawKey: recoveryRawKey, cryptoKey: recoveryCryptoKey } =
          await keyDerivationService.deriveKey(cleanRecoveryKey, metadata.recoveryKdfParams);

        const vaultKeyRaw = await encryptionService.decryptBinary(
          metadata.encryptedVaultKeyWithRecovery,
          recoveryCryptoKey
        );
        encryptionService.zeroize(recoveryRawKey);

        vaultCryptoKey = await window.crypto.subtle.importKey(
          'raw',
          vaultKeyRaw,
          { name: 'AES-GCM', length: 256 },
          false, // Non-extractable
          ['encrypt', 'decrypt']
        );
        const vaultHkdfKey = await window.crypto.subtle.importKey(
          'raw',
          vaultKeyRaw,
          'HKDF',
          false,
          ['deriveKey', 'deriveBits']
        );
        VAULT_HKDF_KEY_MAP.set(vaultCryptoKey, vaultHkdfKey);
        this.activeHkdfKey = vaultHkdfKey;
        encryptionService.zeroize(vaultKeyRaw);
      } else if (metadata.recoveryVerificationToken && metadata.recoverySalt) {
        // Legacy fallback
        const legacyParams: KdfParams = {
          algorithm: 'argon2id',
          memorySize: 32768,
          iterations: 3,
          parallelism: 1,
          hashLength: 32,
          salt: metadata.recoverySalt,
        };
        const { rawKey, cryptoKey } = await keyDerivationService.deriveKey(
          cleanRecoveryKey,
          legacyParams
        );
        encryptionService.zeroize(rawKey);
        vaultCryptoKey = cryptoKey;
      } else {
        throw new AuthenticationError('Recovery key not configured for this vault');
      }

      const decryptedSentinel = await encryptionService.decryptString(
        metadata.verificationToken,
        vaultCryptoKey
      );

      if (decryptedSentinel !== VERIFICATION_SENTINEL) {
        throw new AuthenticationError('Invalid recovery key');
      }

      this.activeKey = vaultCryptoKey;

      // Reset failed attempts counter on recovery unlock
      await this.resetFailedUnlockAttempts();

      const records = await this.getDecryptedRecords(vaultCryptoKey);
      return { cryptoKey: vaultCryptoKey, records };
    } catch (err) {
      if (err instanceof AuthenticationError) throw err;
      throw new AuthenticationError('Invalid emergency recovery key or tag mismatch.');
    }
  }

  /**
   * Encrypts and persists a single record
   */
  async saveRecord(record: VaultRecord, key: CryptoKey): Promise<void> {
    if (!key) throw new VaultLockedError();

    // 1. Encrypt the entire record payload (title, username, password, notes, etc.)
    const encryptedPayload = await encryptionService.encryptData(record, key);

    const encryptedRecord: EncryptedVaultRecord = {
      id: record.id,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt || Date.now(),
      payload: encryptedPayload,
    };

    const records = (await this.storage.getItem<EncryptedVaultRecord[]>(STORAGE_KEYS.RECORDS)) || [];
    const existingIndex = records.findIndex((r) => r.id === record.id);

    if (existingIndex >= 0) {
      records[existingIndex] = encryptedRecord;
    } else {
      records.unshift(encryptedRecord);
    }

    await this.storage.setItem(STORAGE_KEYS.RECORDS, records);
  }

  /**
   * Removes a record by ID
   */
  async deleteRecord(id: string): Promise<void> {
    if (!this.activeKey) {
      throw new VaultLockedError('Cannot delete record while vault is locked');
    }
    const records = (await this.storage.getItem<EncryptedVaultRecord[]>(STORAGE_KEYS.RECORDS)) || [];
    const filtered = records.filter((r) => r.id !== id);
    await this.storage.setItem(STORAGE_KEYS.RECORDS, filtered);
  }

  /**
   * Decrypts all records currently in storage.
   * Cryptographic authentication failures are detected, corrupted records are rejected/quarantined,
   * and a vault integrity warning is surfaced.
   */
  async getDecryptedRecords(
    key: CryptoKey,
    options?: { throwOnError?: boolean }
  ): Promise<VaultRecord[]> {
    if (!key) throw new VaultLockedError();

    const encryptedRecords =
      (await this.storage.getItem<EncryptedVaultRecord[]>(STORAGE_KEYS.RECORDS)) || [];
    const decryptedList: VaultRecord[] = [];
    const corruptedIds: string[] = [];

    for (const item of encryptedRecords) {
      try {
        const decrypted = await encryptionService.decryptData<VaultRecord>(item.payload, key);
        decryptedList.push(decrypted);
      } catch {
        // Record failed cryptographic authentication (tag mismatch or corrupted ciphertext)
        corruptedIds.push(item.id);
      }
    }

    if (corruptedIds.length > 0) {
      this.corruptedRecordIds = corruptedIds;
      this.integrityWarning = `Vault integrity warning: ${corruptedIds.length} record(s) [${corruptedIds.join(', ')}] failed cryptographic authentication and may be corrupted or tampered with. Corrupted data was quarantined.`;
      if (options?.throwOnError) {
        throw new VaultIntegrityError(this.integrityWarning);
      }
    } else {
      this.clearIntegrityWarning();
    }

    return decryptedList;
  }

  async getAllEncryptedRecords(): Promise<EncryptedVaultRecord[]> {
    return (await this.storage.getItem<EncryptedVaultRecord[]>(STORAGE_KEYS.RECORDS)) || [];
  }

  async replaceEncryptedRecords(records: EncryptedVaultRecord[]): Promise<void> {
    if (!this.activeKey) {
      throw new VaultLockedError('Cannot replace records while vault is locked');
    }
    await this.storage.setItem(STORAGE_KEYS.RECORDS, records);
  }

  async replaceSnapshot(metadata: VaultMetadata, records: EncryptedVaultRecord[]): Promise<void> {
    await this.storage.setItem(STORAGE_KEYS.METADATA, metadata);
    await this.storage.setItem(STORAGE_KEYS.RECORDS, records);
  }

  /**
   * Re-wraps the Vault Key with a newly derived Master Key when user changes master password
   */
  async changeMasterPassword(oldPassword: string, newPassword: string): Promise<boolean> {
    const metadata = await this.getMetadata();
    if (!metadata) return false;

    try {
      // 1. Verify old password
      const { rawKey: oldMasterRawKey, cryptoKey: oldMasterCryptoKey } =
        await keyDerivationService.deriveKey(oldPassword, metadata.kdfParams);

      let vaultKeyRaw: Uint8Array;
      if (metadata.encryptedVaultKey) {
        vaultKeyRaw = await encryptionService.decryptBinary(
          metadata.encryptedVaultKey,
          oldMasterCryptoKey
        );
      } else {
        vaultKeyRaw = new Uint8Array(oldMasterRawKey);
      }
      encryptionService.zeroize(oldMasterRawKey);

      // Verify the sentinel with the unwrapped vault key
      const vaultKey = await window.crypto.subtle.importKey(
        'raw',
        vaultKeyRaw,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
      const vaultHkdfKey = await window.crypto.subtle.importKey(
        'raw',
        vaultKeyRaw,
        'HKDF',
        false,
        ['deriveKey', 'deriveBits']
      );
      VAULT_HKDF_KEY_MAP.set(vaultKey, vaultHkdfKey);
      this.activeHkdfKey = vaultHkdfKey;
      const sentinel = await encryptionService.decryptString(metadata.verificationToken, vaultKey);
      if (sentinel !== VERIFICATION_SENTINEL) {
        encryptionService.zeroize(vaultKeyRaw);
        return false;
      }

      // 2. Derive new master key with fresh CSPRNG salt
      const newKdfParams = keyDerivationService.createDefaultKdfParams(
        metadata.kdfParams.memorySize > 32768 ? 'high' : 'standard'
      );
      const { rawKey: newMasterRawKey, cryptoKey: newMasterCryptoKey } =
        await keyDerivationService.deriveKey(newPassword, newKdfParams);

      // 3. Encrypt the same Vault Key with the new Master Key
      const newEncryptedVaultKey = await encryptionService.encryptBinary(
        vaultKeyRaw,
        newMasterCryptoKey
      );
      encryptionService.zeroize(vaultKeyRaw);
      encryptionService.zeroize(newMasterRawKey);

      // 4. Update metadata
      const updatedMetadata: VaultMetadata = {
        ...metadata,
        version: 2,
        kdfParams: newKdfParams,
        encryptedVaultKey: newEncryptedVaultKey,
        updatedAt: Date.now(),
      };

      await this.storage.setItem(STORAGE_KEYS.METADATA, updatedMetadata);
      this.activeKey = vaultKey;
      return true;
    } catch {
      return false;
    }
  }

  async wipeVault(): Promise<void> {
    this.activeKey = null;
    this.activeHkdfKey = null;
    this.clearIntegrityWarning();
    await this.storage.removeItem(STORAGE_KEYS.METADATA);
    await this.storage.removeItem(STORAGE_KEYS.RECORDS);
    await this.storage.removeItem(STORAGE_KEYS.SETTINGS);
    await this.storage.removeItem(STORAGE_KEYS.EMERGENCY_STATUS);
    await this.storage.removeItem(STORAGE_KEYS.FAILED_UNLOCK_ATTEMPTS);
    await this.storage.removeItem(STORAGE_KEYS.PENDING_CHANGE_SESSION);
    await this.storage.removeItem('secure_vault_bio_token_v1');
    await this.storage.removeItem('secure_vault_bio_enc_token_v1');
    await this.storage.removeItem('secure_vault_bio_salt_v1');
  }
}

export const vaultRepository = new VaultRepository();
