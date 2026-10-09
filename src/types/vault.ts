/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StorageEngineType } from './storage';

export type RecordCategory =
  | 'all'
  | 'favorites'
  | 'trash'
  | 'passwords'
  | 'banking'
  | 'email'
  | 'social'
  | 'work'
  | 'education'
  | 'wifi'
  | 'cards'
  | 'card'
  | 'identity'
  | 'notes'
  | 'note'
  | 'other';

export type RecordType = 'login' | 'card' | 'identity' | 'note' | 'wifi' | 'pin';

export type SortOption =
  | 'updated_desc'
  | 'created_desc'
  | 'title_asc'
  | 'title_desc'
  | 'category'
  | 'strength_asc';

export const CATEGORY_METADATA: Record<
  string,
  { label: string; description: string }
> = {
  all: { label: 'All Credentials', description: 'All encrypted records in your vault' },
  favorites: { label: 'Starred Favorites', description: 'Frequently accessed credentials' },
  trash: { label: 'Trash', description: 'Soft-deleted records' },
  passwords: { label: 'Logins & Passwords', description: 'Website and app credentials' },
  banking: { label: 'Banking & Finance', description: 'Bank accounts, routing, and online banking' },
  cards: { label: 'Credit & Debit Cards', description: 'Payment cards, expiry, and billing details' },
  card: { label: 'Credit & Debit Cards', description: 'Payment cards, expiry, and billing details' },
  social: { label: 'Social Media', description: 'Social network accounts and profiles' },
  email: { label: 'Email Accounts', description: 'Personal and work email credentials' },
  work: { label: 'Work & Developer', description: 'Corporate SSO, cloud, and API tokens' },
  education: { label: 'Education', description: 'University portals and learning platforms' },
  wifi: { label: 'Wi-Fi Networks', description: 'Wireless network SSIDs and passphrases' },
  identity: { label: 'Personal Identity', description: 'Passports, IDs, and personal records' },
  notes: { label: 'Encrypted Notes', description: 'Confidential recovery phrases and documents' },
  note: { label: 'Encrypted Notes', description: 'Confidential recovery phrases and documents' },
  other: { label: 'Other Credentials', description: 'Miscellaneous secure entries' },
};

export interface CustomField {
  id: string;
  label: string;
  value: string;
  isSensitive?: boolean; // if true, masked and encrypted
  isHidden?: boolean;
}

export type BankAccountType = 'Savings' | 'Current/Checking' | 'Fixed Deposit' | 'Other';

export interface BankDetails {
  bankName?: string;
  accountHolderName?: string;
  accountType?: BankAccountType;
  accountNumber?: string;
  branchName?: string;
  branchCode?: string;
  swiftBic?: string;
  iban?: string;
  routingOrIfsc?: string;
  onlineBankingUsername?: string;
  onlineBankingPassword?: string;
  bankWebsiteUrl?: string;
}

export type PaymentCardKind = 'Debit' | 'Credit' | 'Prepaid';
export type PaymentCardNetwork = 'Visa' | 'Mastercard' | 'American Express' | 'Other';

export interface CardDetails {
  cardholderName?: string;
  cardKind?: PaymentCardKind;
  cardNetwork?: PaymentCardNetwork;
  cardNumber?: string;
  expirationMonth?: string;
  expirationYear?: string;
  cvv?: string;
  pin?: string;
  issuingBank?: string;
  billingAddress?: string;
  cardType?: 'visa' | 'mastercard' | 'amex' | 'discover' | 'other';
}

export type IdentityDocumentType =
  | 'Passport'
  | 'National ID'
  | "Driver's License"
  | 'Social Security / Tax ID'
  | 'Voter ID'
  | 'Residence Permit'
  | 'Other';

export interface IdentityDetails {
  fullName?: string;
  dateOfBirth?: string;
  documentType?: IdentityDocumentType | string;
  documentNumber?: string;
  issuingCountry?: string;
  issueDate?: string;
  expiryDate?: string;
  email?: string;
  phone?: string;
  address?: string;
  idNumber?: string;
  passportNumber?: string;
  ssn?: string;
}

export type WifiSecurityType = 'WPA3' | 'WPA2' | 'WPA/WPA2' | 'WEP' | 'Open';

export interface WifiDetails {
  ssid?: string;
  password?: string;
  securityType?: WifiSecurityType;
  hiddenNetwork?: boolean;
}

export interface PasswordHistoryItem {
  id?: string;
  password: string;
  changedAt: number;
}

/**
 * Plaintext Vault Record (in active memory ONLY while unlocked)
 */
export interface VaultRecord {
  id: string;
  title: string;
  type?: RecordType;
  category: RecordCategory;
  username?: string;
  email?: string;
  password?: string;
  website?: string;
  url?: string;
  notes?: string;
  favorite: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  lastUsedAt?: number;
  strengthScore?: number;
  tags: string[];
  customFields?: CustomField[];
  bankDetails?: BankDetails;
  cardDetails?: CardDetails;
  identityDetails?: IdentityDetails;
  wifiDetails?: WifiDetails;
  pin?: string;
  bankName?: string;
  accountHolderName?: string;
  accountType?: BankAccountType;
  accountNumber?: string;
  branchName?: string;
  branchCode?: string;
  swiftBic?: string;
  iban?: string;
  routingOrIfsc?: string;
  cardholderName?: string;
  cardKind?: PaymentCardKind;
  cardNetwork?: PaymentCardNetwork;
  cardNumber?: string;
  cardExpiry?: string;
  cardCvv?: string;
  cardPin?: string;
  issuingBank?: string;
  billingAddress?: string;
  totpSecret?: string;
  passwordHistory?: PasswordHistoryItem[];
}

/**
 * Key Derivation Parameters stored with vault metadata
 */
export interface KdfParams {
  algorithm: 'argon2id';
  memorySize: number; // in KiB (e.g. 65536 = 64MB)
  iterations: number; // e.g. 3
  parallelism: number; // e.g. 1
  hashLength: number; // 32 bytes (256-bit key)
  salt: string; // Base64 encoded 16-byte random salt
}

/**
 * Encrypted payload envelope (AES-256-GCM)
 */
export interface EncryptedPayload {
  version: number; // e.g. 1
  iv: string; // Base64 12-byte initialization vector
  ciphertext: string; // Base64 ciphertext with appended auth tag
  tagLength?: number; // 128-bit tag
}

/**
 * Stored Encrypted Record in database / local storage
 * Minimizes unencrypted metadata to protect user privacy.
 */
export interface EncryptedVaultRecord {
  id: string; // Random UUIDv4 (unencrypted for fast indexing)
  createdAt: number;
  updatedAt: number;
  payload: EncryptedPayload; // All sensitive fields (title, username, password, notes, etc.) are encrypted inside payload
}

/**
 * Vault Root Metadata stored locally
 */
export interface VaultMetadata {
  version: number;
  vaultId: string;
  createdAt: number;
  updatedAt: number;
  kdfParams: KdfParams;
  // Encrypted 256-bit Vault Key protected by Master Key (AES-256-GCM)
  encryptedVaultKey?: EncryptedPayload;
  // Encrypted 256-bit Vault Key protected by Emergency Recovery Key (AES-256-GCM)
  encryptedVaultKeyWithRecovery?: EncryptedPayload;
  recoveryKdfParams?: KdfParams;
  // Verification sentinel encrypted with the Vault Key (defense-in-depth)
  verificationToken: EncryptedPayload;
  // Master Password Hint (Windows-style, displayed after incorrect unlock attempt)
  passwordHint?: string;
  // Legacy fields retained for backwards-compatibility migrations
  recoveryVerificationToken?: EncryptedPayload;
  recoverySalt?: string;
}

/**
 * Backup File Format (.vault) with Authenticated Integrity Protection
 */
export interface EncryptedBackupEnvelope {
  format: 'LOTUSX_AUTHENTICATED_BACKUP_V3' | 'SECURA_AUTHENTICATED_BACKUP_V2' | 'PASSWORD_VAULT_BACKUP';
  version: number;
  createdAt: number;
  vaultId: string;
  passwordHint?: string;
  kdfParams: KdfParams;
  encryptedVaultKey?: EncryptedPayload;
  encryptedVaultKeyWithRecovery?: EncryptedPayload;
  recoveryKdfParams?: KdfParams;
  verificationToken: EncryptedPayload;
  records: EncryptedVaultRecord[];
  // Authenticated HMAC-SHA256 integrity protection
  hmacTag?: string;
  hmacSalt?: string;
  checksum?: string; // Legacy fallback
}

/**
 * Detected Password Change for external websites/apps
 */
export interface DetectedPasswordChange {
  recordId: string;
  recordTitle: string;
  website?: string;
  username?: string;
  oldPassword?: string;
  newPassword: string;
  detectedAt: number;
  source: 'browser_session' | 'autofill_bridge' | 'clipboard' | 'manual';
}

/**
 * Security Audit Item
 */
export interface PasswordAuditIssue {
  recordId: string;
  title: string;
  recordTitle?: string;
  username?: string;
  issueType: 'weak' | 'reused' | 'old' | 'missing' | 'duplicate_url';
  type?: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  message?: string;
  passwordAgeDays?: number;
}

export interface SecurityScoreReport {
  score: number; // 0 to 100
  overallScore: number; // 0 to 100
  totalPasswords: number;
  weakCount: number;
  reusedCount: number;
  oldCount: number;
  missingCount: number;
  strongCount: number;
  issues: PasswordAuditIssue[];
  weakPasswords?: VaultRecord[];
  reusedPasswords?: VaultRecord[];
  oldPasswords?: VaultRecord[];
  overOneYearCount?: number;
  overOneYearIssues?: PasswordAuditIssue[];
}

export type SecurityHealthReport = SecurityScoreReport;

export interface GeneratorPreferences {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
}

/**
 * Application Settings
 */
export interface AppSettings {
  autoLockMinutes: number; // 0 = Immediately, 0.5 = 30s, 1, 5, 15, 30, -1 = Never
  clipboardClearSeconds: number; // 10, 30, 60, 0 = Never
  theme: 'dark' | 'light' | 'system';
  hidePasswordDefault: boolean;
  passwordMaskTimeoutSeconds: number;
  argon2SecurityLevel: 'standard' | 'high'; // 32MB vs 64MB
  kdfIterations: number;
  generatorDefaults?: GeneratorPreferences;
  // User-configurable storage settings (solves 5MB limit permanently):
  storageEngine?: StorageEngineType; // strictly 'indexeddb' (unlimited/GBs)
  storageQuotaMb?: number; // 0 = Unlimited (Browser Max / Multi-GB), or custom MB ceiling
  persistentStorageRequested?: boolean;
  autoCompactOnLock?: boolean;
}
