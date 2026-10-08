/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppSettings, RecordCategory } from '../types/vault';

export const VERIFICATION_SENTINEL = 'VAULT_MASTER_KEY_AUTH_VALID_v1';

export const DEFAULT_ARGON2_PARAMS = {
  standard: {
    memorySize: 32768, // 32 MB
    iterations: 3,
    parallelism: 1,
    hashLength: 32, // 256 bits
  },
  high: {
    memorySize: 65536, // 64 MB (OWASP recommended for sensitive password managers)
    iterations: 3,
    parallelism: 1,
    hashLength: 32,
  },
};

export const DEFAULT_SETTINGS: AppSettings = {
  autoLockMinutes: 5,
  clipboardClearSeconds: 30,
  theme: 'light',
  hidePasswordDefault: true,
  passwordMaskTimeoutSeconds: 30,
  argon2SecurityLevel: 'high',
  kdfIterations: 3,
  storageEngine: 'indexeddb',
  storageQuotaMb: 0, // 0 = Unlimited / Auto-Expand (No 5MB limit!)
  persistentStorageRequested: false,
  autoCompactOnLock: true,
};

export interface CategoryDefinition {
  id: RecordCategory;
  name: string;
  icon: string;
  description: string;
}

export const VAULT_CATEGORIES: CategoryDefinition[] = [
  { id: 'all', name: 'All Items', icon: 'Shield', description: 'All stored vault credentials' },
  { id: 'favorites', name: 'Favorites', icon: 'Star', description: 'Starred priority items' },
  { id: 'passwords', name: 'Passwords', icon: 'Key', description: 'Logins & web accounts' },
  { id: 'banking', name: 'Banking', icon: 'Landmark', description: 'Bank accounts & financial credentials' },
  { id: 'cards', name: 'Cards', icon: 'CreditCard', description: 'Credit, debit, and ATM cards' },
  { id: 'identity', name: 'Identity', icon: 'UserCheck', description: 'Passports, IDs, and personal records' },
  { id: 'notes', name: 'Secure Notes', icon: 'FileText', description: 'Encrypted text and codes' },
  { id: 'wifi', name: 'Wi-Fi Networks', icon: 'Wifi', description: 'Wireless passwords and network keys' },
  { id: 'email', name: 'Email Accounts', icon: 'Mail', description: 'Email logins and app passwords' },
  { id: 'social', name: 'Social Media', icon: 'Share2', description: 'Social network accounts' },
  { id: 'work', name: 'Work', icon: 'Briefcase', description: 'Corporate and workspace credentials' },
  { id: 'education', name: 'Education', icon: 'GraduationCap', description: 'Academic and university accounts' },
  { id: 'other', name: 'Other', icon: 'Folder', description: 'Miscellaneous sensitive items' },
];

export const STORAGE_KEYS = {
  METADATA: 'secure_vault_metadata_v1',
  RECORDS: 'secure_vault_records_v1',
  SETTINGS: 'secure_vault_settings_v1',
  EMERGENCY_STATUS: 'secure_vault_emergency_kit_v1',
  FAILED_UNLOCK_ATTEMPTS: 'secure_vault_failed_attempts_v1',
  PENDING_CHANGE_SESSION: 'secure_vault_pending_change_session_v1',
};
