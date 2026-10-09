/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EncryptedBackupEnvelope,
  VaultRecord,
  EncryptedVaultRecord,
  RecordCategory,
  RecordType,
  VaultMetadata,
} from '../types/vault';
import { BackupIntegrityError, AuthenticationError, VaultLockedError } from '../core/errors';
import { STORAGE_KEYS, VERIFICATION_SENTINEL } from '../core/constants';
import { vaultRepository, IVaultRepository, VAULT_HKDF_KEY_MAP, VAULT_RAW_KEY_MAP } from './VaultRepository';
import { encryptionService } from '../security/EncryptionService';
import { keyDerivationService } from '../security/KeyDerivationService';

export const BACKUP_HMAC_INFO_V3 = new TextEncoder().encode('LOTUSX_AUTHENTICATED_BACKUP_HMAC_V3');

export interface RestoreBackupResult {
  recordCount: number;
  metadata: VaultMetadata;
  records: VaultRecord[];
  cryptoKey: CryptoKey;
}

export interface CsvImportReport {
  records: VaultRecord[];
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  duplicateCount: number;
  detectedFormat: string;
}

export interface IBackupService {
  createEncryptedBackup(activeKey?: CryptoKey, backupPassword?: string): Promise<string>;
  createEncryptedBackupFromStorage(): Promise<string>;
  createEncryptedBackupString(backupPassword?: string): Promise<string>;
  exportEncryptedBackup(backupPassword?: string): Promise<void>;
  verifyBackupIntegrity(
    backupJson: string,
    credentials?: { masterPassword?: string; activeKey?: CryptoKey }
  ): Promise<boolean>;
  restoreEncryptedBackup(
    backupJson: string,
    masterPassword?: string,
    activeKey?: CryptoKey
  ): Promise<RestoreBackupResult>;
  parseCsvImport(csvContent: string): Promise<VaultRecord[]>;
  parseCsvImportWithReport(csvContent: string, existingRecords?: VaultRecord[]): Promise<CsvImportReport>;
  parsePlaintextJsonImport(jsonContent: string): VaultRecord[];
  downloadBackup(backupJson: string, filename?: string): void;
  exportToPlaintextCsv(records: VaultRecord[]): string;
  exportPlaintextJson(records: VaultRecord[]): void;
}

export class BackupService implements IBackupService {
  public static readonly MAX_BACKUP_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
  public static readonly MAX_CSV_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
  public static readonly CURRENT_BACKUP_VERSION = 3;
  public static readonly MIN_SUPPORTED_VERSION = 1;
  public static readonly MAX_SUPPORTED_VERSION = 3;

  constructor(private repo: IVaultRepository = vaultRepository) {}

  /**
   * Deeply cleans parsed JSON to prevent prototype pollution attacks (__proto__, constructor, prototype)
   */
  private sanitizeObjectKeys<T>(obj: T): T {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObjectKeys(item)) as unknown as T;
    }
    const clean: Record<string, unknown> = Object.create(null);
    const source = obj as Record<string, unknown>;
    for (const key of Object.keys(source)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }
      clean[key] = this.sanitizeObjectKeys(source[key]);
    }
    return clean as T;
  }

  /**
   * Safely migrates and validates versioned backup format.
   * Never silently interprets incompatible or unknown formats.
   */
  migrateBackupEnvelope(rawEnvelope: unknown): EncryptedBackupEnvelope {
    if (!rawEnvelope || typeof rawEnvelope !== 'object') {
      throw new BackupIntegrityError('Malformed backup object: envelope must be a valid JSON object.');
    }

    const envelope = this.sanitizeObjectKeys(rawEnvelope) as EncryptedBackupEnvelope;

    if (
      envelope.format !== 'LOTUSX_AUTHENTICATED_BACKUP_V3' &&
      envelope.format !== 'SECURA_AUTHENTICATED_BACKUP_V2' &&
      envelope.format !== 'PASSWORD_VAULT_BACKUP'
    ) {
      throw new BackupIntegrityError(`Unrecognized backup format: ${envelope.format}`);
    }

    if (typeof envelope.version !== 'number' || isNaN(envelope.version)) {
      throw new BackupIntegrityError('Invalid or missing backup version identifier');
    }

    if (envelope.version > BackupService.MAX_SUPPORTED_VERSION) {
      throw new BackupIntegrityError(
        `Unsupported backup format version: v${envelope.version}. This backup was created by a newer version of LotusX. Please update the application.`
      );
    }

    if (envelope.version < BackupService.MIN_SUPPORTED_VERSION) {
      throw new BackupIntegrityError(`Unsupported legacy backup version: v${envelope.version}`);
    }

    if (
      !envelope.kdfParams ||
      !envelope.verificationToken ||
      !Array.isArray(envelope.records)
    ) {
      throw new BackupIntegrityError(
        'Backup file structure is invalid: missing required cryptographic envelope fields.'
      );
    }

    // Safe migration from v1 legacy envelope to v2 standard
    if (envelope.version === 1 || envelope.format === 'PASSWORD_VAULT_BACKUP') {
      return {
        ...envelope,
        format: 'SECURA_AUTHENTICATED_BACKUP_V2',
        version: 2,
      };
    }

    return envelope;
  }

  /**
   * Generates a fully authenticated and encrypted .vault export.
   * HMAC key is derived from the secret Vault Key using standard HKDF-SHA-256 with proper salt and domain separation.
   * If a dedicated backupPassword is supplied, a fresh Argon2id KDF salt is generated and the Vault Key is wrapped
   * specifically for this backup snapshot without altering the active vault metadata.
   */
  async createEncryptedBackup(activeKey?: CryptoKey, backupPassword?: string): Promise<string> {
    const metadata = await this.repo.getMetadata();
    if (!metadata) {
      throw new Error('Vault not initialized');
    }

    const vaultKey = activeKey || this.repo.getActiveKey();
    if (!vaultKey) {
      throw new VaultLockedError('Active vault key is required to sign backup HMAC.');
    }

    const hkdfKey = (vaultKey ? VAULT_HKDF_KEY_MAP.get(vaultKey) : null) || this.repo.getActiveHkdfKey?.();
    if (!hkdfKey) {
      throw new VaultLockedError('Active vault HKDF key is required to sign backup HMAC.');
    }

    let exportKdfParams = metadata.kdfParams;
    let exportEncryptedVaultKey = metadata.encryptedVaultKey;

    if (backupPassword && backupPassword.trim().length > 0) {
      const trimmedPw = backupPassword.trim();
      let vaultKeyRaw: Uint8Array | null = null;

      // 1. Try unwrapping existing encryptedVaultKey with provided password (if user entered their Master Password)
      if (metadata.encryptedVaultKey) {
        try {
          const { rawKey: masterRaw, cryptoKey: masterCrypto } = await keyDerivationService.deriveKey(
            trimmedPw,
            metadata.kdfParams
          );
          vaultKeyRaw = await encryptionService.decryptBinary(metadata.encryptedVaultKey, masterCrypto);
          encryptionService.zeroize(masterRaw);
        } catch {
          vaultKeyRaw = null;
        }
      }

      // 2. If user entered a custom backup password different from Master Password, wrap the active vault key
      // (or re-encrypt records if raw key bytes are not cached)
      if (!vaultKeyRaw) {
        const cachedVaultKeyRaw = VAULT_RAW_KEY_MAP.get(vaultKey);
        if (cachedVaultKeyRaw) {
          const customKdfParams = keyDerivationService.createDefaultKdfParams('standard');
          const { rawKey: backupMasterRaw, cryptoKey: backupMasterCrypto } =
            await keyDerivationService.deriveKey(trimmedPw, customKdfParams);
          exportKdfParams = customKdfParams;
          exportEncryptedVaultKey = await encryptionService.encryptBinary(
            cachedVaultKeyRaw,
            backupMasterCrypto
          );
          encryptionService.zeroize(backupMasterRaw);
        } else {
          const decryptedRecords = await this.repo.getDecryptedRecords(vaultKey, { throwOnError: true });
        const customKdfParams = keyDerivationService.createDefaultKdfParams('standard');
        const { rawKey: backupMasterRaw, cryptoKey: backupMasterCrypto } =
          await keyDerivationService.deriveKey(trimmedPw, customKdfParams);

        const freshVaultKeyRaw = encryptionService.generateRandomBytes(32);
        const freshVaultCryptoKey = await window.crypto.subtle.importKey(
          'raw',
          freshVaultKeyRaw,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
        const freshHkdfKey = await window.crypto.subtle.importKey(
          'raw',
          freshVaultKeyRaw,
          'HKDF',
          false,
          ['deriveKey', 'deriveBits']
        );
        const freshEncryptedVaultKey = await encryptionService.encryptBinary(
          freshVaultKeyRaw,
          backupMasterCrypto
        );
        encryptionService.zeroize(backupMasterRaw);
        encryptionService.zeroize(freshVaultKeyRaw);

        const freshVerificationToken = await encryptionService.encryptString(
          VERIFICATION_SENTINEL,
          freshVaultCryptoKey
        );

        const reEncryptedRecords: EncryptedVaultRecord[] = [];
        for (const rec of decryptedRecords) {
          const payload = await encryptionService.encryptData(rec, freshVaultCryptoKey);
          reEncryptedRecords.push({
            id: rec.id,
            createdAt: rec.createdAt,
            updatedAt: rec.updatedAt || Date.now(),
            payload,
          });
        }

        const hmacSaltBytes = encryptionService.generateRandomBytes(32);
        const hmacSalt = this.bytesToBase64(hmacSaltBytes);

        const payloadWithoutIntegrity: Omit<EncryptedBackupEnvelope, 'checksum' | 'hmacTag' | 'hmacSalt'> = {
          format: 'LOTUSX_AUTHENTICATED_BACKUP_V3',
          version: 3,
          createdAt: Date.now(),
          vaultId: metadata.vaultId,
          kdfParams: customKdfParams,
          encryptedVaultKey: freshEncryptedVaultKey,
          encryptedVaultKeyWithRecovery: metadata.encryptedVaultKeyWithRecovery,
          recoveryKdfParams: metadata.recoveryKdfParams,
          verificationToken: freshVerificationToken,
          records: reEncryptedRecords,
        };

        const canonicalJson = JSON.stringify(payloadWithoutIntegrity);
        const hmacKey = await this.deriveHkdfHmacKey(freshHkdfKey, hmacSaltBytes);
        const hmacTag = await this.computeHkdfHmacTag(canonicalJson, hmacKey);
        const checksum = await this.calculateSha256(canonicalJson);

        const fullEnvelope: EncryptedBackupEnvelope = {
          ...payloadWithoutIntegrity,
          hmacSalt,
          hmacTag,
          checksum,
        };

          return JSON.stringify(fullEnvelope, null, 2);
        }
      } else {
        encryptionService.zeroize(vaultKeyRaw);
      }
    }

    const records = await this.repo.getAllEncryptedRecords();

    // 1. Generate fresh CSPRNG salt (32 bytes) for backup HKDF-HMAC authentication
    const hmacSaltBytes = encryptionService.generateRandomBytes(32);
    const hmacSalt = this.bytesToBase64(hmacSaltBytes);

    const payloadWithoutIntegrity: Omit<EncryptedBackupEnvelope, 'checksum' | 'hmacTag' | 'hmacSalt'> = {
      format: 'LOTUSX_AUTHENTICATED_BACKUP_V3',
      version: 3,
      createdAt: Date.now(),
      vaultId: metadata.vaultId,
      kdfParams: exportKdfParams,
      encryptedVaultKey: exportEncryptedVaultKey,
      encryptedVaultKeyWithRecovery: metadata.encryptedVaultKeyWithRecovery,
      recoveryKdfParams: metadata.recoveryKdfParams,
      verificationToken: metadata.verificationToken,
      records: records,
    };

    const canonicalJson = JSON.stringify(payloadWithoutIntegrity);

    // 2. Derive HMAC key from the secret vault key via standard HKDF-SHA-256
    const hmacKey = await this.deriveHkdfHmacKey(hkdfKey, hmacSaltBytes);
    const hmacTag = await this.computeHkdfHmacTag(canonicalJson, hmacKey);

    // 3. Include SHA-256 checksum for defense-in-depth and format verification
    const checksum = await this.calculateSha256(canonicalJson);

    const fullEnvelope: EncryptedBackupEnvelope = {
      ...payloadWithoutIntegrity,
      hmacSalt,
      hmacTag,
      checksum,
    };

    return JSON.stringify(fullEnvelope, null, 2);
  }

  /**
   * Creates an encrypted .vault JSON string directly from stored encrypted records & metadata
   * even when the vault is locked (used for silent emergency cloud backup before wipe).
   */
  async createEncryptedBackupFromStorage(): Promise<string> {
    const activeKey = this.repo.getActiveKey();
    if (activeKey) {
      return await this.createEncryptedBackup(activeKey);
    }

    const metadata = await this.repo.getMetadata();
    if (!metadata) {
      throw new Error('Vault not initialized');
    }

    const records = await this.repo.getAllEncryptedRecords();
    const hmacSaltBytes = encryptionService.generateRandomBytes(32);
    const hmacSalt = this.bytesToBase64(hmacSaltBytes);

    const payloadWithoutIntegrity: Omit<EncryptedBackupEnvelope, 'checksum' | 'hmacTag' | 'hmacSalt'> = {
      format: 'LOTUSX_AUTHENTICATED_BACKUP_V3',
      version: 3,
      createdAt: Date.now(),
      vaultId: metadata.vaultId,
      kdfParams: metadata.kdfParams,
      encryptedVaultKey: metadata.encryptedVaultKey,
      encryptedVaultKeyWithRecovery: metadata.encryptedVaultKeyWithRecovery,
      recoveryKdfParams: metadata.recoveryKdfParams,
      verificationToken: metadata.verificationToken,
      records,
    };

    const canonicalJson = JSON.stringify(payloadWithoutIntegrity);
    const checksum = await this.calculateSha256(canonicalJson);

    const fullEnvelope: EncryptedBackupEnvelope = {
      ...payloadWithoutIntegrity,
      hmacSalt,
      hmacTag: checksum,
      checksum,
    };

    return JSON.stringify(fullEnvelope, null, 2);
  }

  /**
   * Creates an encrypted .vault JSON string using either the active vault key or a provided password
   */
  async createEncryptedBackupString(backupPassword?: string): Promise<string> {
    const activeKey = this.repo.getActiveKey();
    if (activeKey) {
      return await this.createEncryptedBackup(activeKey, backupPassword);
    }
    if (backupPassword) {
      const { cryptoKey } = await this.repo.unlockWithPassword(backupPassword);
      return await this.createEncryptedBackup(cryptoKey, backupPassword);
    }
    throw new VaultLockedError('Vault must be unlocked or a password provided to create an encrypted backup.');
  }

  /**
   * Creates and triggers a download of an encrypted .vault backup snapshot
   */
  async exportEncryptedBackup(backupPassword?: string): Promise<void> {
    const backupJson = await this.createEncryptedBackupString(backupPassword);
    this.downloadBackup(backupJson);
  }

  /**
   * Parses a plaintext JSON export into validated VaultRecord items
   */
  parsePlaintextJsonImport(jsonContent: string): VaultRecord[] {
    if (!jsonContent) return [];
    const parsed = this.sanitizeObjectKeys(JSON.parse(jsonContent));
    const rawList = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.records)
      ? parsed.records
      : Array.isArray(parsed?.items)
      ? parsed.items
      : [];

    const now = Date.now();
    return rawList.map((item: Partial<VaultRecord>) => ({
      id: item.id && typeof item.id === 'string' ? item.id : 'rec_' + window.crypto.randomUUID(),
      title: String(item.title || 'Imported Credential').slice(0, 500),
      type: item.type || 'login',
      category: item.category || 'passwords',
      username: item.username ? String(item.username) : undefined,
      email: item.email ? String(item.email) : undefined,
      password: item.password ? String(item.password) : undefined,
      website: item.website || item.url ? String(item.website || item.url) : undefined,
      url: item.url || item.website ? String(item.url || item.website) : undefined,
      notes: item.notes ? String(item.notes) : undefined,
      favorite: Boolean(item.favorite),
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : now,
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : now,
      tags: [],
      customFields: Array.isArray(item.customFields) ? item.customFields : undefined,
    }));
  }

  /**
   * Exports records to a downloadable JSON file
   */
  exportPlaintextJson(records: VaultRecord[]): void {
    const jsonString = JSON.stringify(records, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lotusx_export_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  /**
   * Verifies that the backup file structure and HMAC/SHA-256 integrity tag are valid
   */
  async verifyBackupIntegrity(
    backupJson: string,
    credentials?: { masterPassword?: string; activeKey?: CryptoKey }
  ): Promise<boolean> {
    if (!backupJson || backupJson.length > BackupService.MAX_BACKUP_SIZE_BYTES) {
      return false;
    }
    try {
      const raw = JSON.parse(backupJson);
      const envelope = this.migrateBackupEnvelope(raw);

      // Check SHA-256 checksum if provided
      const { checksum, hmacTag, hmacSalt, ...rest } = envelope;
      const canonicalJson = JSON.stringify(rest);

      if (envelope.checksum) {
        const computed = await this.calculateSha256(canonicalJson);
        if (computed !== checksum) return false;
      }

      // If envelope contains authenticated HMAC-SHA256, resolve vault key to verify HMAC
      if (envelope.hmacTag && envelope.hmacSalt) {
        let vaultKey: CryptoKey | null = credentials?.activeKey || this.repo.getActiveKey();
        let hkdfKey: CryptoKey | null =
          (vaultKey ? VAULT_HKDF_KEY_MAP.get(vaultKey) : null) || this.repo.getActiveHkdfKey?.() || null;

        if (!vaultKey && credentials?.masterPassword) {
          try {
            const { rawKey: masterRawKey, cryptoKey: masterCryptoKey } =
              await keyDerivationService.deriveKey(credentials.masterPassword, envelope.kdfParams);

            if (envelope.encryptedVaultKey) {
              const rawVaultKey = await encryptionService.decryptBinary(
                envelope.encryptedVaultKey,
                masterCryptoKey
              );
              encryptionService.zeroize(masterRawKey);

              vaultKey = await window.crypto.subtle.importKey(
                'raw',
                rawVaultKey,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
              );
              hkdfKey = await window.crypto.subtle.importKey(
                'raw',
                rawVaultKey,
                'HKDF',
                false,
                ['deriveKey', 'deriveBits']
              );
              VAULT_HKDF_KEY_MAP.set(vaultKey, hkdfKey);
              encryptionService.zeroize(rawVaultKey);
            } else {
              vaultKey = masterCryptoKey;
              encryptionService.zeroize(masterRawKey);
            }

            const sentinel = await encryptionService.decryptString(
              envelope.verificationToken,
              vaultKey
            );
            if (sentinel !== VERIFICATION_SENTINEL && sentinel !== 'SECURE_VAULT_AUTHENTICATED_V1') {
              return false;
            }
          } catch {
            return false;
          }
        }

        if (!vaultKey) {
          // Without the authenticated credential or active key, an attacker cannot forge or verify HMAC
          return false;
        }

        const saltBytes = this.base64ToBytes(hmacSalt);

        if (envelope.version >= 3 && envelope.format === 'LOTUSX_AUTHENTICATED_BACKUP_V3') {
          if (!hkdfKey) return false;
          const hmacCryptoKey = await this.deriveHkdfHmacKey(hkdfKey, saltBytes);
          const isValidHmac = await this.verifyHkdfHmacTag(canonicalJson, hmacTag, hmacCryptoKey);
          if (!isValidHmac) return false;
        } else {
          // Backward compatibility for legacy V2 backups
          const legacyHmacSecret = await this.deriveLegacyV2HmacSecret(vaultKey, saltBytes);
          const isValidHmac = await encryptionService.verifyHmacSha256(canonicalJson, hmacTag, legacyHmacSecret);
          encryptionService.zeroize(legacyHmacSecret);
          if (!isValidHmac) return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Restores an encrypted backup into local storage after full cryptographic validation,
   * schema validation of decrypted records, and persistence verification.
   */
  async restoreEncryptedBackup(
    backupJson: string,
    masterPassword?: string,
    activeKey?: CryptoKey
  ): Promise<RestoreBackupResult> {
    if (!backupJson) {
      throw new BackupIntegrityError('Backup content is empty.');
    }
    if (backupJson.length > BackupService.MAX_BACKUP_SIZE_BYTES) {
      throw new BackupIntegrityError('Backup file exceeds maximum allowed size (25MB).');
    }

    let envelope: EncryptedBackupEnvelope;
    try {
      const raw = JSON.parse(backupJson);
      envelope = this.migrateBackupEnvelope(raw);
    } catch (err: unknown) {
      if (err instanceof BackupIntegrityError) throw err;
      throw new BackupIntegrityError('Backup file is malformed JSON.');
    }

    const { checksum, hmacTag, hmacSalt, ...rest } = envelope;
    const canonicalJson = JSON.stringify(rest);

    // Verify SHA-256 checksum if present
    if (envelope.checksum) {
      const computed = await this.calculateSha256(canonicalJson);
      if (computed !== envelope.checksum) {
        throw new BackupIntegrityError('Backup checksum mismatch. File was tampered with.');
      }
    }

    // Resolve authenticated vault key and hkdf key
    let vaultKey: CryptoKey | null = null;
    let hkdfKey: CryptoKey | null = null;

    if (masterPassword) {
      const trimmedPw = masterPassword.trim();
      const pwCandidates =
        trimmedPw && trimmedPw !== masterPassword
          ? [masterPassword, trimmedPw]
          : [trimmedPw || masterPassword];
      let unlockedViaPassword = false;

      // 1. Try unwrapping with Master / Backup Password (exact and trimmed)
      for (const candidatePw of pwCandidates) {
        try {
          const { rawKey: masterRawKey, cryptoKey: masterCryptoKey } =
            await keyDerivationService.deriveKey(candidatePw, envelope.kdfParams);

          if (envelope.encryptedVaultKey) {
            const rawVaultKey = await encryptionService.decryptBinary(
              envelope.encryptedVaultKey,
              masterCryptoKey
            );
            encryptionService.zeroize(masterRawKey);

            vaultKey = await window.crypto.subtle.importKey(
              'raw',
              rawVaultKey,
              { name: 'AES-GCM', length: 256 },
              false,
              ['encrypt', 'decrypt']
            );
            hkdfKey = await window.crypto.subtle.importKey(
              'raw',
              rawVaultKey,
              'HKDF',
              false,
              ['deriveKey', 'deriveBits']
            );
            VAULT_HKDF_KEY_MAP.set(vaultKey, hkdfKey);
            VAULT_RAW_KEY_MAP.set(vaultKey, new Uint8Array(rawVaultKey));
            encryptionService.zeroize(rawVaultKey);
          } else {
            vaultKey = masterCryptoKey;
            hkdfKey = await window.crypto.subtle.importKey(
              'raw',
              masterRawKey,
              'HKDF',
              false,
              ['deriveKey', 'deriveBits']
            );
            VAULT_HKDF_KEY_MAP.set(vaultKey, hkdfKey);
            VAULT_RAW_KEY_MAP.set(vaultKey, new Uint8Array(masterRawKey));
            encryptionService.zeroize(masterRawKey);
          }

          const sentinel = await encryptionService.decryptString(
            envelope.verificationToken,
            vaultKey
          );
          if (sentinel !== VERIFICATION_SENTINEL && sentinel !== 'SECURE_VAULT_AUTHENTICATED_V1') {
            throw new Error('Invalid sentinel');
          }
          unlockedViaPassword = true;
          break;
        } catch {
          unlockedViaPassword = false;
        }
      }

      // 2. Fallback: Check if user entered their 160-bit Emergency Recovery Key
      if (!unlockedViaPassword && envelope.encryptedVaultKeyWithRecovery && envelope.recoveryKdfParams) {
        try {
          const cleanRecoveryKey = trimmedPw.toUpperCase();
          const { rawKey: recRawKey, cryptoKey: recCryptoKey } =
            await keyDerivationService.deriveKey(cleanRecoveryKey, envelope.recoveryKdfParams);
          const rawVaultKey = await encryptionService.decryptBinary(
            envelope.encryptedVaultKeyWithRecovery,
            recCryptoKey
          );
          encryptionService.zeroize(recRawKey);

          vaultKey = await window.crypto.subtle.importKey(
            'raw',
            rawVaultKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
          );
          hkdfKey = await window.crypto.subtle.importKey(
            'raw',
            rawVaultKey,
            'HKDF',
            false,
            ['deriveKey', 'deriveBits']
          );
          VAULT_HKDF_KEY_MAP.set(vaultKey, hkdfKey);
          encryptionService.zeroize(rawVaultKey);

          const sentinel = await encryptionService.decryptString(
            envelope.verificationToken,
            vaultKey
          );
          if (sentinel !== VERIFICATION_SENTINEL && sentinel !== 'SECURE_VAULT_AUTHENTICATED_V1') {
            throw new Error('Invalid sentinel');
          }
          unlockedViaPassword = true;
        } catch {
          unlockedViaPassword = false;
        }
      }

      if (!unlockedViaPassword || !vaultKey) {
        throw new AuthenticationError(
          'Master password does not match this backup file. Storage was not modified.'
        );
      }
    } else {
      vaultKey = activeKey || this.repo.getActiveKey();
      if (!vaultKey) {
        throw new AuthenticationError(
          'Master password or unlocked vault is required to restore an encrypted backup.'
        );
      }
      hkdfKey =
        (vaultKey ? VAULT_HKDF_KEY_MAP.get(vaultKey) : null) || this.repo.getActiveHkdfKey?.() || null;
      try {
        const sentinel = await encryptionService.decryptString(
          envelope.verificationToken,
          vaultKey
        );
        if (sentinel !== VERIFICATION_SENTINEL && sentinel !== 'SECURE_VAULT_AUTHENTICATED_V1') {
          throw new AuthenticationError('Active vault key does not match this backup.');
        }
      } catch {
        throw new AuthenticationError('Active vault key does not match this backup.');
      }
    }

    // Verify HMAC tag using secret derived from authenticated vault key
    if (envelope.hmacTag && envelope.hmacSalt) {
      const saltBytes = this.base64ToBytes(envelope.hmacSalt);

      if (envelope.version >= 3 && envelope.format === 'LOTUSX_AUTHENTICATED_BACKUP_V3') {
        if (envelope.checksum && envelope.hmacTag === envelope.checksum) {
          const computed = await this.calculateSha256(canonicalJson);
          if (computed !== envelope.checksum) {
            throw new BackupIntegrityError(
              'Backup verification failed: Checksum mismatch. File was tampered with.'
            );
          }
        } else {
          if (!hkdfKey) {
            throw new BackupIntegrityError('Backup verification failed: Missing HKDF key for V3 backup.');
          }
          const hmacCryptoKey = await this.deriveHkdfHmacKey(hkdfKey, saltBytes);
          const isValidHmac = await this.verifyHkdfHmacTag(canonicalJson, envelope.hmacTag, hmacCryptoKey);
          if (!isValidHmac) {
            throw new BackupIntegrityError(
              'Backup verification failed: HMAC authentication tag mismatch. File was tampered with.'
            );
          }
        }
      } else {
        const legacyHmacSecret = await this.deriveLegacyV2HmacSecret(vaultKey, saltBytes);
        const isValidHmac = await encryptionService.verifyHmacSha256(canonicalJson, envelope.hmacTag, legacyHmacSecret);
        encryptionService.zeroize(legacyHmacSecret);
        if (!isValidHmac) {
          throw new BackupIntegrityError(
            'Backup verification failed: HMAC authentication tag mismatch. File was tampered with.'
          );
        }
      }
    }

    // Decrypt and validate schema of every encrypted record before modifying storage
    const validatedDecryptedRecords: VaultRecord[] = [];
    for (const rec of envelope.records) {
      if (!rec || typeof rec !== 'object' || typeof rec.id !== 'string' || !rec.payload) {
        throw new BackupIntegrityError(
          'Backup contains malformed record envelope structure. Storage was not modified.'
        );
      }
      try {
        const rawDecrypted = await encryptionService.decryptData<VaultRecord>(rec.payload, vaultKey);
        const sanitizedDecrypted = this.sanitizeObjectKeys(rawDecrypted);
        if (!sanitizedDecrypted || typeof sanitizedDecrypted !== 'object' || typeof sanitizedDecrypted.title !== 'string') {
          throw new Error('Decrypted record failed schema check');
        }
        const normalizedRecord: VaultRecord = {
          ...sanitizedDecrypted,
          id: sanitizedDecrypted.id || rec.id,
          title: sanitizedDecrypted.title,
          type: sanitizedDecrypted.type || 'login',
          category: sanitizedDecrypted.category || 'passwords',
          website: sanitizedDecrypted.website || sanitizedDecrypted.url,
          url: sanitizedDecrypted.url || sanitizedDecrypted.website,
          favorite: Boolean(sanitizedDecrypted.favorite),
          createdAt: typeof sanitizedDecrypted.createdAt === 'number' ? sanitizedDecrypted.createdAt : rec.createdAt || Date.now(),
          updatedAt: typeof sanitizedDecrypted.updatedAt === 'number' ? sanitizedDecrypted.updatedAt : rec.updatedAt || Date.now(),
          tags: [],
        };
        validatedDecryptedRecords.push(normalizedRecord);
      } catch {
        throw new BackupIntegrityError(
          'Backup contains corrupted or tampered records. Storage was not modified.'
        );
      }
    }

    // Restore metadata and records safely.
    // IMPORTANT: If a local vault was already initialized with the same Vault Key (same verificationToken),
    // preserve its Master Password wrapping (kdfParams & encryptedVaultKey) when restoring a backup that was
    // encrypted with a separate backup password, so the user's Master Password is not overwritten by the backup password!
    const existingLocalMeta = await this.repo.getMetadata();
    const isSameUnderlyingVaultKey =
      existingLocalMeta &&
      existingLocalMeta.encryptedVaultKey &&
      existingLocalMeta.verificationToken &&
      envelope.verificationToken &&
      existingLocalMeta.verificationToken.ciphertext === envelope.verificationToken.ciphertext &&
      existingLocalMeta.verificationToken.iv === envelope.verificationToken.iv;

    const metadata: VaultMetadata = {
      version: envelope.version,
      vaultId: envelope.vaultId,
      createdAt: envelope.createdAt,
      updatedAt: Date.now(),
      passwordHint: envelope.passwordHint || existingLocalMeta?.passwordHint,
      kdfParams: isSameUnderlyingVaultKey ? existingLocalMeta.kdfParams : envelope.kdfParams,
      encryptedVaultKey: isSameUnderlyingVaultKey
        ? existingLocalMeta.encryptedVaultKey
        : envelope.encryptedVaultKey,
      encryptedVaultKeyWithRecovery:
        envelope.encryptedVaultKeyWithRecovery || existingLocalMeta?.encryptedVaultKeyWithRecovery,
      recoveryKdfParams: envelope.recoveryKdfParams || existingLocalMeta?.recoveryKdfParams,
      verificationToken: envelope.verificationToken,
    };

    await this.repo.replaceSnapshot(metadata, envelope.records);

    // Verify persistence in storage before reporting success
    const persistedEncrypted = await this.repo.getAllEncryptedRecords();
    if (persistedEncrypted.length !== envelope.records.length) {
      throw new BackupIntegrityError(
        `Storage persistence verification failed: expected ${envelope.records.length} records, persisted ${persistedEncrypted.length}.`
      );
    }

    this.repo.setActiveKey(vaultKey, hkdfKey);

    return {
      recordCount: validatedDecryptedRecords.length,
      metadata,
      records: validatedDecryptedRecords,
      cryptoKey: vaultKey,
    };
  }

  /**
   * Parses CSV content locally with a detailed diagnostic report.
   * Supports Chrome, Edge, Brave, Firefox, Bitwarden, 1Password, LastPass, KeePass, Dashlane, and LotusX CSV formats.
   * Full RFC 4180 state-machine parser supporting multiline quoted fields, escaped quotes, UTF-8 BOM, and delimiter auto-detection.
   */
  async parseCsvImportWithReport(
    csvContent: string,
    existingRecords: VaultRecord[] = []
  ): Promise<CsvImportReport> {
    if (!csvContent || !csvContent.trim()) {
      throw new Error('The selected CSV file is empty.');
    }
    if (csvContent.length > BackupService.MAX_CSV_SIZE_BYTES) {
      throw new Error('CSV file exceeds maximum allowed size (10MB).');
    }

    // Strip UTF-8 BOM if present
    const cleanText = csvContent.replace(/^\uFEFF/, '');

    // Auto-detect delimiter (comma, semicolon, or tab) from the first non-empty line
    const delimiter = this.detectCsvDelimiter(cleanText);

    // Parse full CSV using RFC 4180 state machine (supports multiline quoted notes!)
    const allRows = this.parseCsvDocument(cleanText, delimiter);
    if (allRows.length === 0) {
      throw new Error('No readable rows found in CSV file.');
    }
    if (allRows.length > 10001) {
      throw new Error('CSV file exceeds maximum allowed limit of 10,000 entries.');
    }

    // Check if first row is a known header row or data
    const firstRow = allRows[0];
    for (const h of firstRow) {
      const lower = h.toLowerCase().trim();
      if (lower === '__proto__' || lower === 'constructor' || lower === 'prototype') {
        throw new Error('CSV header contains disallowed malicious property names.');
      }
    }

    const normalizedHeaders = firstRow.map((h) =>
      h.toLowerCase().trim().replace(/^["']|["']$/g, '').replace(/[\s_\-]+/g, '_')
    );

    const knownHeaderKeywords = [
      'title', 'name', 'service', 'account', 'site',
      'url', 'website', 'login_uri', 'hostname', 'origin', 'http', 'domain', 'web_address',
      'username', 'user', 'login', 'login_username', 'email', 'user_name', 'userid',
      'password', 'pass', 'login_password', 'secret', 'passphrase',
      'notes', 'note', 'extra', 'comment', 'comments', 'description',
      'totp', 'login_totp', 'otp', 'two_factor',
      'folder', 'group', 'category', 'type', 'grouping', 'favorite', 'fav'
    ];

    const hasRecognizableHeader = normalizedHeaders.some((h) =>
      knownHeaderKeywords.some((kw) => h === kw || h.includes(kw))
    );

    if (!hasRecognizableHeader) {
      throw new Error(
        'Unrecognized CSV header format. Expected columns such as title/name, url/website, username/email, or password.'
      );
    }

    if (allRows.length < 2) {
      return {
        records: [],
        totalRows: 0,
        importedCount: 0,
        skippedCount: 0,
        duplicateCount: 0,
        detectedFormat: this.identifyCsvFormatLabel(normalizedHeaders),
      };
    }

    const findColIndex = (exactMatches: string[], partialMatches: string[]): number => {
      for (const exact of exactMatches) {
        const idx = normalizedHeaders.indexOf(exact);
        if (idx !== -1) return idx;
      }
      for (const partial of partialMatches) {
        const idx = normalizedHeaders.findIndex((h) => h.includes(partial));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const titleIdx = findColIndex(
      ['title', 'name', 'account', 'service', 'site_name'],
      ['title', 'name', 'service', 'account']
    );
    const urlIdx = findColIndex(
      ['url', 'website', 'login_uri', 'hostname', 'origin', 'web_address', 'domain'],
      ['url', 'website', 'uri', 'hostname', 'domain', 'site']
    );
    const userIdx = findColIndex(
      ['username', 'login_username', 'user_name', 'user', 'login', 'userid'],
      ['user', 'login']
    );
    const emailIdx = findColIndex(['email', 'email_address', 'e_mail'], ['email', 'mail']);
    const passIdx = findColIndex(
      ['password', 'login_password', 'pass', 'secret', 'passphrase'],
      ['pass', 'secret']
    );
    const notesIdx = findColIndex(
      ['notes', 'note', 'extra', 'comments', 'comment', 'description'],
      ['note', 'extra', 'comment', 'desc']
    );
    const categoryIdx = findColIndex(
      ['category', 'folder', 'group', 'grouping', 'type'],
      ['category', 'folder', 'group', 'type']
    );
    const totpIdx = findColIndex(
      ['totp', 'login_totp', 'totp_secret', 'otp', 'authenticator_key'],
      ['totp', 'otp', '2fa']
    );
    const favIdx = findColIndex(['favorite', 'fav', 'starred'], ['fav', 'star']);
    const tagsIdx = findColIndex(['tags', 'tag', 'labels'], ['tag', 'label']);

    const mappedIndices = new Set(
      [titleIdx, urlIdx, userIdx, emailIdx, passIdx, notesIdx, categoryIdx, totpIdx, favIdx, tagsIdx].filter(
        (idx) => idx >= 0
      )
    );

    const sanitizeCell = (str?: string): string => {
      if (!str) return '';
      // Strip null bytes and non-printable control characters (preserve \n and \t inside notes)
      const cleaned = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      // Unwrap leading single-quote added by CSV formula injection defense if followed by =, +, -, @
      const unquoted = cleaned.replace(/^'([=+\-@|])/, '$1');
      return unquoted.slice(0, 20000).trim();
    };

    // Build set of existing signatures to detect duplicates
    const existingSignatures = new Set<string>();
    for (const r of existingRecords) {
      if (r.deletedAt) continue;
      const sig = `${(r.title || '').toLowerCase().trim()}|${(r.username || r.email || '').toLowerCase().trim()}|${(r.website || r.url || '').toLowerCase().trim()}|${r.password || ''}`;
      existingSignatures.add(sig);
    }

    const imported: VaultRecord[] = [];
    let skippedCount = 0;
    let duplicateCount = 0;
    const now = Date.now();
    const totalDataRows = allRows.length - 1;

    for (let i = 1; i < allRows.length; i++) {
      const row = allRows[i];
      if (!row || row.every((cell) => !cell || !cell.trim())) {
        skippedCount++;
        continue;
      }

      const rawUrl = sanitizeCell(urlIdx >= 0 ? row[urlIdx] : '');
      const rawTitle = sanitizeCell(titleIdx >= 0 ? row[titleIdx] : '');
      const rawUsername = sanitizeCell(userIdx >= 0 ? row[userIdx] : '');
      const rawEmail = sanitizeCell(emailIdx >= 0 ? row[emailIdx] : '');
      const password = sanitizeCell(passIdx >= 0 ? row[passIdx] : '');
      const notes = sanitizeCell(notesIdx >= 0 ? row[notesIdx] : '');
      const totpSecret = sanitizeCell(totpIdx >= 0 ? row[totpIdx] : '');
      const rawCategory = sanitizeCell(categoryIdx >= 0 ? row[categoryIdx]?.toLowerCase() : '');
      const rawFav = sanitizeCell(favIdx >= 0 ? row[favIdx]?.toLowerCase() : '');
      const rawTags = sanitizeCell(tagsIdx >= 0 ? row[tagsIdx] : '');

      // Skip rows that have no meaningful credential content at all
      if (!rawTitle && !rawUrl && !rawUsername && !rawEmail && !password && !notes) {
        skippedCount++;
        continue;
      }

      // Derive human-friendly title if missing (e.g. from domain or username)
      let title = rawTitle;
      if (!title && rawUrl) {
        try {
          const parsedUrl = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
          title = parsedUrl.hostname.replace(/^www\./, '');
        } catch {
          title = rawUrl;
        }
      }
      if (!title) {
        title = rawUsername || rawEmail || 'Imported Credential';
      }

      const username = rawUsername || (rawEmail && userIdx === -1 ? rawEmail : '');
      const email = rawEmail || (rawUsername.includes('@') ? rawUsername : undefined);

      // Duplicate check against existing vault and earlier rows in same CSV
      const signature = `${title.toLowerCase().trim()}|${(username || email || '').toLowerCase().trim()}|${rawUrl.toLowerCase().trim()}|${password}`;
      if (existingSignatures.has(signature)) {
        duplicateCount++;
        continue;
      }
      existingSignatures.add(signature);

      let category: RecordCategory = 'passwords';
      if (rawCategory.includes('bank') || rawCategory.includes('financ')) category = 'banking';
      else if (rawCategory.includes('card') || rawCategory.includes('credit') || rawCategory.includes('debit')) category = 'cards';
      else if (rawCategory.includes('social')) category = 'social';
      else if (rawCategory.includes('work') || rawCategory.includes('corp') || rawCategory.includes('dev')) category = 'work';
      else if (rawCategory.includes('note') || rawCategory.includes('secure note')) category = 'notes';
      else if (rawCategory.includes('wifi') || rawCategory.includes('wireless')) category = 'wifi';
      else if (rawCategory.includes('email') || rawCategory.includes('mail')) category = 'email';
      else if (rawCategory.includes('ident') || rawCategory.includes('personal')) category = 'identity';
      else if (rawCategory.includes('edu') || rawCategory.includes('school')) category = 'education';

      const type: RecordType =
        category === 'notes'
          ? 'note'
          : category === 'wifi'
          ? 'wifi'
          : category === 'cards'
          ? 'card'
          : category === 'identity'
          ? 'identity'
          : 'login';

      const favorite = rawFav === '1' || rawFav === 'true' || rawFav === 'yes';

      const tags: string[] = [];

      // Preserve any extra unmapped columns as custom fields so zero user data is lost
      const customFields: Array<{ id: string; label: string; value: string; isHidden: boolean }> = [];
      for (let colIdx = 0; colIdx < row.length; colIdx++) {
        if (mappedIndices.has(colIdx)) continue;
        const headerLabel = sanitizeCell(firstRow[colIdx]);
        const cellVal = sanitizeCell(row[colIdx]);
        if (headerLabel && cellVal) {
          customFields.push({
            id: 'cf_' + window.crypto.randomUUID(),
            label: headerLabel.slice(0, 120),
            value: cellVal,
            isHidden: headerLabel.toLowerCase().includes('secret') || headerLabel.toLowerCase().includes('pin') || headerLabel.toLowerCase().includes('cvv') || headerLabel.toLowerCase().includes('key'),
          });
        }
      }

      const record: VaultRecord = {
        id: 'rec_' + window.crypto.randomUUID(),
        title,
        type,
        category,
        username: username || undefined,
        email: email || undefined,
        password: password || undefined,
        website: rawUrl || undefined,
        url: rawUrl || undefined,
        notes: notes || undefined,
        totpSecret: totpSecret || undefined,
        favorite,
        createdAt: now,
        updatedAt: now,
        tags,
        customFields: customFields.length > 0 ? customFields : undefined,
      };

      imported.push(record);
    }

    return {
      records: imported,
      totalRows: totalDataRows,
      importedCount: imported.length,
      skippedCount,
      duplicateCount,
      detectedFormat: this.identifyCsvFormatLabel(normalizedHeaders),
    };
  }

  /**
   * Parses CSV content locally (supporting standard formats: Chrome, Bitwarden, 1Password, LastPass, Firefox)
   * Hardened against prototype pollution, oversized files, control characters, and malformed structures.
   */
  async parseCsvImport(csvContent: string): Promise<VaultRecord[]> {
    if (!csvContent || !csvContent.trim()) return [];
    const report = await this.parseCsvImportWithReport(csvContent);
    return report.records;
  }

  private detectCsvDelimiter(text: string): string {
    const firstLineEnd = text.search(/\r?\n/);
    const firstLine = firstLineEnd >= 0 ? text.slice(0, firstLineEnd) : text;
    let inQuotes = false;
    let commas = 0;
    let semicolons = 0;
    let tabs = 0;

    for (let i = 0; i < firstLine.length; i++) {
      const c = firstLine[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes) {
        if (c === ',') commas++;
        else if (c === ';') semicolons++;
        else if (c === '\t') tabs++;
      }
    }

    if (semicolons > commas && semicolons >= tabs) return ';';
    if (tabs > commas && tabs > semicolons) return '\t';
    return ',';
  }

  private identifyCsvFormatLabel(headers: string[]): string {
    if (headers.includes('login_uri') && headers.includes('login_username')) return 'Bitwarden CSV';
    if (headers.includes('grouping') && headers.includes('extra')) return 'LastPass CSV';
    if (headers.includes('http_realm') || headers.includes('form_action_origin')) return 'Firefox CSV';
    if (headers.includes('name') && headers.includes('url') && headers.includes('username')) return 'Chrome / Edge / Brave CSV';
    if (headers.includes('title') && headers.includes('website')) return 'LotusX / 1Password CSV';
    return 'Standard Password CSV';
  }

  /**
   * Full RFC 4180 compliant state-machine CSV document parser.
   * Properly handles multiline quoted values, escaped double-quotes (""), and custom delimiters.
   */
  private parseCsvDocument(text: string, delimiter = ','): string[][] {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const next = text[i + 1];

      if (c === '"') {
        if (inQuotes && next === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === delimiter && !inQuotes) {
        currentRow.push(currentCell);
        currentCell = '';
      } else if ((c === '\r' || c === '\n') && !inQuotes) {
        if (c === '\r' && next === '\n') {
          i++;
        }
        currentRow.push(currentCell);
        if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0].trim() !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += c;
      }
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell);
      if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0].trim() !== '')) {
        rows.push(currentRow);
      }
    }

    return rows;
  }

  /**
   * Triggers a browser download of the backup file
   */
  downloadBackup(backupJson: string, filename?: string): void {
    const defaultName = `vault_backup_ENCRYPTED_${new Date().toISOString().slice(0, 10)}.vault`;
    const blob = new Blob([backupJson], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || defaultName;
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  /**
   * Generates a plaintext CSV export string with formula injection protection
   */
  exportToPlaintextCsv(records: VaultRecord[]): string {
    const headers = ['title', 'username', 'password', 'website', 'notes', 'category'];
    const escapeCsv = (str?: string) => {
      if (!str) return '""';
      let safeStr = str;
      // Formula injection defense (sanitize leading =, +, -, @, tab, cr, |, %)
      if (/^[=+\-@\t\r|%]/.test(safeStr)) {
        safeStr = "'" + safeStr;
      }
      const escaped = safeStr.replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const rows = records.map((r) =>
      [
        escapeCsv(r.title),
        escapeCsv(r.username),
        escapeCsv(r.password || r.pin),
        escapeCsv(r.website),
        escapeCsv(r.notes),
        escapeCsv(r.category),
      ].join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }

  private parseCsvRow(rowText: string): string[] {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < rowText.length; i++) {
      const c = rowText[i];
      if (c === '"') {
        if (inQuotes && rowText[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (c === ',' && !inQuotes) {
        result.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    result.push(cur);
    return result;
  }

  private async deriveHkdfHmacKey(hkdfKey: CryptoKey, saltBytes: Uint8Array): Promise<CryptoKey> {
    return await window.crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: saltBytes,
        info: BACKUP_HMAC_INFO_V3,
      },
      hkdfKey,
      {
        name: 'HMAC',
        hash: 'SHA-256',
        length: 256,
      },
      false, // Non-extractable in JS
      ['sign', 'verify']
    );
  }

  private async computeHkdfHmacTag(canonicalJson: string, hmacKey: CryptoKey): Promise<string> {
    const encoder = new TextEncoder();
    const sig = await window.crypto.subtle.sign('HMAC', hmacKey, encoder.encode(canonicalJson));
    return this.bytesToBase64(new Uint8Array(sig));
  }

  private async verifyHkdfHmacTag(
    canonicalJson: string,
    tagBase64: string,
    hmacKey: CryptoKey
  ): Promise<boolean> {
    const encoder = new TextEncoder();
    const sigBytes = this.base64ToBytes(tagBase64);
    return await window.crypto.subtle.verify('HMAC', hmacKey, sigBytes, encoder.encode(canonicalJson));
  }

  private async deriveLegacyV2HmacSecret(vaultKey: CryptoKey, saltBytes: Uint8Array): Promise<Uint8Array> {
    // Legacy cryptographic domain separation IV for authenticated v2 backup HMAC
    const kdfIv = new Uint8Array([
      0x53, 0x45, 0x43, 0x55, 0x52, 0x41, 0x5F, 0x48, 0x4D, 0x41, 0x43, 0x01
    ]); // 'SECURA_HMAC\x01'

    const encoder = new TextEncoder();
    const labelBytes = encoder.encode('SECURA_AUTHENTICATED_BACKUP_HMAC_V2');
    const derivationPayload = new Uint8Array(saltBytes.length + labelBytes.length);
    derivationPayload.set(saltBytes, 0);
    derivationPayload.set(labelBytes, saltBytes.length);

    const encryptedBytes = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: kdfIv },
      vaultKey,
      derivationPayload
    );

    const hmacKeyBuffer = await window.crypto.subtle.digest('SHA-256', encryptedBytes);
    return new Uint8Array(hmacKeyBuffer);
  }

  private async calculateSha256(text: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
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

export const backupService = new BackupService();
