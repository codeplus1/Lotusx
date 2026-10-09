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
import { vaultRepository, IVaultRepository, VAULT_HKDF_KEY_MAP } from './VaultRepository';
import { encryptionService } from '../security/EncryptionService';
import { keyDerivationService } from '../security/KeyDerivationService';

export const BACKUP_HMAC_INFO_V3 = new TextEncoder().encode('LOTUSX_AUTHENTICATED_BACKUP_HMAC_V3');

export interface IBackupService {
  createEncryptedBackup(activeKey?: CryptoKey): Promise<string>;
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
  ): Promise<{ recordCount: number }>;
  parseCsvImport(csvContent: string): Promise<VaultRecord[]>;
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
   * Generates a fully authenticated and encrypted .vault export
   * HMAC key is derived from the secret Vault Key using standard HKDF-SHA-256 with proper salt and domain separation.
   */
  async createEncryptedBackup(activeKey?: CryptoKey): Promise<string> {
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

    const records = await this.repo.getAllEncryptedRecords();

    // 1. Generate fresh CSPRNG salt (32 bytes) for backup HKDF-HMAC authentication
    const hmacSaltBytes = encryptionService.generateRandomBytes(32);
    const hmacSalt = this.bytesToBase64(hmacSaltBytes);

    const payloadWithoutIntegrity: Omit<EncryptedBackupEnvelope, 'checksum' | 'hmacTag' | 'hmacSalt'> = {
      format: 'LOTUSX_AUTHENTICATED_BACKUP_V3',
      version: 3,
      createdAt: Date.now(),
      vaultId: metadata.vaultId,
      passwordHint: metadata.passwordHint,
      kdfParams: metadata.kdfParams,
      encryptedVaultKey: metadata.encryptedVaultKey,
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
   * Creates an encrypted .vault JSON string using either the active vault key or a provided password
   */
  async createEncryptedBackupString(backupPassword?: string): Promise<string> {
    const activeKey = this.repo.getActiveKey();
    if (activeKey) {
      return await this.createEncryptedBackup(activeKey);
    }
    if (backupPassword) {
      const { cryptoKey } = await this.repo.unlockWithPassword(backupPassword);
      return await this.createEncryptedBackup(cryptoKey);
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
      tags: Array.isArray(item.tags) ? item.tags.map(String) : ['imported'],
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
   * Restores an encrypted backup into local storage after full cryptographic validation
   */
  async restoreEncryptedBackup(
    backupJson: string,
    masterPassword?: string,
    activeKey?: CryptoKey
  ): Promise<{ recordCount: number }> {
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
      try {
        const { rawKey: masterRawKey, cryptoKey: masterCryptoKey } =
          await keyDerivationService.deriveKey(masterPassword, envelope.kdfParams);

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
          throw new Error('Invalid sentinel');
        }
      } catch {
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

    // Verify cryptographic integrity of every encrypted record before modifying storage
    for (const rec of envelope.records) {
      try {
        await encryptionService.decryptData(rec.payload, vaultKey);
      } catch {
        throw new BackupIntegrityError(
          'Backup contains corrupted or tampered records. Storage was not modified.'
        );
      }
    }

    // Restore metadata and records safely
    const metadata: VaultMetadata = {
      version: envelope.version,
      vaultId: envelope.vaultId,
      createdAt: envelope.createdAt,
      updatedAt: Date.now(),
      passwordHint: envelope.passwordHint,
      kdfParams: envelope.kdfParams,
      encryptedVaultKey: envelope.encryptedVaultKey,
      encryptedVaultKeyWithRecovery: envelope.encryptedVaultKeyWithRecovery,
      recoveryKdfParams: envelope.recoveryKdfParams,
      verificationToken: envelope.verificationToken,
    };

    await this.repo.replaceSnapshot(metadata, envelope.records);

    this.repo.setActiveKey(vaultKey, hkdfKey);

    return { recordCount: envelope.records.length };
  }

  /**
   * Parses CSV content locally (supporting standard formats: Chrome, Bitwarden, 1Password, LastPass)
   * Hardened against prototype pollution, oversized files, control characters, and malformed structures.
   */
  async parseCsvImport(csvContent: string): Promise<VaultRecord[]> {
    if (!csvContent) return [];
    if (csvContent.length > BackupService.MAX_CSV_SIZE_BYTES) {
      throw new Error('CSV file exceeds maximum allowed size (10MB).');
    }

    const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];
    if (lines.length > 10001) {
      throw new Error('CSV file exceeds maximum allowed limit of 10,000 entries.');
    }

    const headerLine = lines[0];
    const rawHeaders = this.parseCsvRow(headerLine);

    // Validate headers against prototype pollution
    for (const h of rawHeaders) {
      const lower = h.toLowerCase().trim();
      if (lower === '__proto__' || lower === 'constructor' || lower === 'prototype') {
        throw new Error('CSV header contains disallowed malicious property names.');
      }
    }

    const headers = rawHeaders.map((h) => h.toLowerCase().trim());

    const titleIdx = headers.findIndex((h) => h.includes('title') || h.includes('name'));
    const urlIdx = headers.findIndex((h) => h.includes('url') || h.includes('website'));
    const userIdx = headers.findIndex((h) => h.includes('user') || h.includes('login') || h.includes('email'));
    const passIdx = headers.findIndex((h) => h.includes('pass'));
    const notesIdx = headers.findIndex((h) => h.includes('note') || h.includes('comment'));
    const categoryIdx = headers.findIndex((h) => h.includes('folder') || h.includes('group') || h.includes('category'));

    const sanitizeCell = (str?: string): string => {
      if (!str) return '';
      // Strip null bytes and non-printable control characters
      const cleaned = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
      // Bound field length to prevent memory exhaustion attacks
      return cleaned.slice(0, 20000).trim();
    };

    const imported: VaultRecord[] = [];
    const now = Date.now();

    for (let i = 1; i < lines.length; i++) {
      const row = this.parseCsvRow(lines[i]);
      if (row.length === 0) continue;

      const title = sanitizeCell((titleIdx >= 0 ? row[titleIdx] : '') || row[0] || 'Imported Credential');
      const username = sanitizeCell(userIdx >= 0 ? row[userIdx] : '');
      const password = sanitizeCell(passIdx >= 0 ? row[passIdx] : '');
      const website = sanitizeCell(urlIdx >= 0 ? row[urlIdx] : '');
      const notes = sanitizeCell(notesIdx >= 0 ? row[notesIdx] : '');
      const catName = sanitizeCell(categoryIdx >= 0 ? row[categoryIdx]?.toLowerCase() : '') || 'passwords';

      let category: RecordCategory = 'passwords';
      if (catName.includes('bank') || catName.includes('financ')) category = 'banking';
      else if (catName.includes('social')) category = 'social';
      else if (catName.includes('work')) category = 'work';
      else if (catName.includes('note')) category = 'notes';
      else if (catName.includes('wifi')) category = 'wifi';
      else if (catName.includes('email')) category = 'email';

      const type: RecordType = category === 'notes' ? 'note' : category === 'wifi' ? 'wifi' : 'login';

      const record: VaultRecord = {
        id: 'rec_' + window.crypto.randomUUID(),
        title,
        type,
        category,
        username,
        password,
        website,
        notes,
        favorite: false,
        createdAt: now,
        updatedAt: now,
        tags: ['imported'],
      };

      imported.push(record);
    }

    return imported;
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
