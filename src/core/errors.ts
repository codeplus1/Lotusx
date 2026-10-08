/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Custom Error hierarchy ensuring no sensitive information is leaked in error messages.
 */
export class VaultError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'VaultError';
  }
}

export class AuthenticationError extends VaultError {
  constructor(message = 'Invalid master password or corrupted vault.') {
    super(message, 'ERR_AUTH_FAILED');
    this.name = 'AuthenticationError';
  }
}

export class DecryptionError extends VaultError {
  constructor(message = 'Unable to decrypt vault record. Authentication tag mismatch or corrupted data.') {
    super(message, 'ERR_DECRYPT_FAILED');
    this.name = 'DecryptionError';
  }
}

export class EncryptionError extends VaultError {
  constructor(message = 'Failed to securely encrypt payload.') {
    super(message, 'ERR_ENCRYPT_FAILED');
    this.name = 'EncryptionError';
  }
}

export class VaultLockedError extends VaultError {
  constructor(message = 'Vault is locked. Decrypted operations are forbidden.') {
    super(message, 'ERR_VAULT_LOCKED');
    this.name = 'VaultLockedError';
  }
}

export class BackupIntegrityError extends VaultError {
  constructor(message = 'Backup file is corrupted or failed cryptographic verification.') {
    super(message, 'ERR_BACKUP_CORRUPT');
    this.name = 'BackupIntegrityError';
  }
}

export class VaultIntegrityError extends VaultError {
  constructor(message = 'Vault integrity check failed: one or more encrypted records have been corrupted or tampered with.') {
    super(message, 'ERR_VAULT_INTEGRITY');
    this.name = 'VaultIntegrityError';
  }
}

