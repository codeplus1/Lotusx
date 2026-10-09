/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { STORAGE_KEYS } from '../core/constants';
import { StorageEngineType, StorageMetrics } from '../types/storage';
import { indexedDBStore, IndexedDBStore } from './IndexedDBStore';

export interface ISecureStorageService {
  getItem<T>(key: string): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
  clearAllVaultData?(): Promise<void>;
  // Storage engine & quota methods
  getActiveEngine?(): StorageEngineType;
  setActiveEngine?(engine: StorageEngineType): Promise<void>;
  getConfiguredQuotaMb?(): number;
  setConfiguredQuotaMb?(quotaMb: number): void;
  getStorageMetrics?(): Promise<StorageMetrics>;
  migrateStorageEngine?(targetEngine: StorageEngineType): Promise<{ migratedKeys: number; transferredBytes: number }>;
  purgeLegacyLocalStorage?(): Promise<{ purgedKeys: number }>;
  requestPersistentStorage?(): Promise<boolean>;
  isPersistentStorageGranted?(): Promise<boolean>;
  optimizeStorage?(): Promise<{ freedBytes: number; keysCount: number }>;
}

const STORAGE_QUOTA_PREF_KEY = 'lotusx_configured_storage_quota_mb_v1';
const BIOMETRIC_STORAGE_KEY = 'lotusx_webauthn_biometric_v1';
const PRESERVED_LOCAL_STORAGE_KEYS = new Set([
  STORAGE_QUOTA_PREF_KEY,
  BIOMETRIC_STORAGE_KEY,
  'lotusx_last_gdrive_backup_at',
  'lotusx_last_gdrive_backup_at_name',
  'lotusx_last_backup_at',
  'lotusx_gdrive_reminder_dismissed_at',
  'lotusx_gdrive_client_id',
]);

/**
 * Enterprise Secure Storage Service
 * Exclusively powered by IndexedDB for multi-gigabyte capacity, removing the legacy 5MB ceiling.
 * Automatically migrates and purges legacy localStorage remnants to keep browser storage pristine.
 */
export class UnifiedSecureStorageService implements ISecureStorageService {
  private activeEngine: StorageEngineType = 'indexeddb';
  private configuredQuotaMb: number = 0; // 0 = Unlimited / Auto-Expand
  private isAutoMigrated: boolean = false;

  constructor() {
    this.initializeEnginePreference();
  }

  private initializeEnginePreference(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        const savedQuota = localStorage.getItem(STORAGE_QUOTA_PREF_KEY);
        if (savedQuota !== null) {
          const parsed = parseInt(savedQuota, 10);
          if (!isNaN(parsed) && parsed >= 0) {
            this.configuredQuotaMb = parsed;
          }
        }
      } catch {
        // Ignored
      }
    }
  }

  public getActiveEngine(): StorageEngineType {
    return 'indexeddb';
  }

  public async setActiveEngine(_engine: StorageEngineType): Promise<void> {
    // LotusX exclusively uses IndexedDB
    this.activeEngine = 'indexeddb';
  }

  public getConfiguredQuotaMb(): number {
    return this.configuredQuotaMb;
  }

  public setConfiguredQuotaMb(quotaMb: number): void {
    this.configuredQuotaMb = Math.max(0, quotaMb);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_QUOTA_PREF_KEY, String(this.configuredQuotaMb));
      } catch {
        // Ignored
      }
    }
  }

  /**
   * Automatically migrates legacy localStorage vault data to IndexedDB
   * and purges the old localStorage keys to ensure only IndexedDB is used.
   */
  public async ensureDataMigrated(): Promise<void> {
    if (this.isAutoMigrated) return;
    this.isAutoMigrated = true;

    try {
      if (typeof localStorage === 'undefined') return;

      const keysToMigrate: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith('secure_vault_') ||
            key.startsWith('secura_') ||
            key.startsWith('lotusx_') ||
            Object.values(STORAGE_KEYS).includes(key))
        ) {
          if (!PRESERVED_LOCAL_STORAGE_KEYS.has(key)) {
            keysToMigrate.push(key);
          }
        }
      }

      for (const key of keysToMigrate) {
        const rawVal = localStorage.getItem(key);
        if (rawVal !== null) {
          const existing = await indexedDBStore.getItem(key);
          if (existing === null) {
            try {
              const parsed = JSON.parse(rawVal);
              await indexedDBStore.setItem(key, parsed);
            } catch {
              await indexedDBStore.setItem(key, rawVal);
            }
          }
          // Remove from localStorage to keep only IndexedDB
          localStorage.removeItem(key);
        }
      }
    } catch (e) {
      console.warn('Transparent storage auto-migration warning:', e);
    }
  }

  async getItem<T>(key: string): Promise<T | null> {
    await this.ensureDataMigrated();

    try {
      const idbVal = await indexedDBStore.getItem<T>(key);
      if (idbVal !== null && idbVal !== undefined) {
        return idbVal;
      }

      // Check legacy localStorage if not yet found in IndexedDB
      if (typeof localStorage !== 'undefined') {
        const localItem = localStorage.getItem(key);
        if (localItem !== null) {
          try {
            const parsed = JSON.parse(localItem) as T;
            await indexedDBStore.setItem(key, parsed);
            localStorage.removeItem(key);
            return parsed;
          } catch {
            return null;
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    await this.ensureDataMigrated();

    // Check user-configured quota if set (> 0)
    if (this.configuredQuotaMb > 0) {
      const quotaBytes = this.configuredQuotaMb * 1024 * 1024;
      const metrics = await this.getStorageMetrics();
      const serialized = JSON.stringify(value);
      const additionalBytes = (key.length + serialized.length) * 2;
      if (metrics.usedBytes + additionalBytes > quotaBytes) {
        throw new Error(
          `Vault storage quota limit (${this.configuredQuotaMb} MB) reached. Increase storage capacity or choose Unlimited in Settings > Storage.`
        );
      }
    }

    // Exclusively store in IndexedDB
    await indexedDBStore.setItem(key, value);
  }

  async removeItem(key: string): Promise<void> {
    await indexedDBStore.removeItem(key);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  }

  async clear(): Promise<void> {
    await this.clearAllVaultData();
  }

  async clearAllVaultData(): Promise<void> {
    // 1. Clear IndexedDB
    await indexedDBStore.clear();

    // 2. Clear strictly LotusX/vault keys from legacy localStorage (preserving third-party keys)
    if (typeof localStorage !== 'undefined') {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith('secure_vault_') ||
            key.startsWith('secura_') ||
            key.startsWith('lotusx_') ||
            Object.values(STORAGE_KEYS).includes(key))
        ) {
          keysToRemove.push(key);
        }
      }

      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
    }
  }

  /**
   * Purges any legacy vault keys in localStorage to maintain strict IndexedDB exclusivity
   */
  public async purgeLegacyLocalStorage(): Promise<{ purgedKeys: number }> {
    let purgedKeys = 0;
    if (typeof localStorage !== 'undefined') {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith('secure_vault_') ||
            key.startsWith('secura_') ||
            key.startsWith('lotusx_') ||
            Object.values(STORAGE_KEYS).includes(key))
        ) {
          if (!PRESERVED_LOCAL_STORAGE_KEYS.has(key)) {
            keysToRemove.push(key);
          }
        }
      }

      for (const key of keysToRemove) {
        localStorage.removeItem(key);
        purgedKeys++;
      }
    }
    return { purgedKeys };
  }

  /**
   * One-way migration ensuring all data is consolidated in IndexedDB and removed from other storage
   */
  public async migrateStorageEngine(
    _targetEngine: StorageEngineType = 'indexeddb'
  ): Promise<{ migratedKeys: number; transferredBytes: number }> {
    let migratedKeys = 0;
    let transferredBytes = 0;

    if (typeof localStorage !== 'undefined') {
      const keysToMigrate: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith('secure_vault_') ||
            key.startsWith('secura_') ||
            key.startsWith('lotusx_') ||
            Object.values(STORAGE_KEYS).includes(key))
        ) {
          if (!PRESERVED_LOCAL_STORAGE_KEYS.has(key)) {
            keysToMigrate.push(key);
          }
        }
      }

      for (const key of keysToMigrate) {
        const rawVal = localStorage.getItem(key);
        if (rawVal !== null) {
          try {
            const parsed = JSON.parse(rawVal);
            await indexedDBStore.setItem(key, parsed);
          } catch {
            await indexedDBStore.setItem(key, rawVal);
          }
          transferredBytes += (key.length + rawVal.length) * 2;
          migratedKeys++;
          localStorage.removeItem(key);
        }
      }
    }

    this.activeEngine = 'indexeddb';
    return { migratedKeys, transferredBytes };
  }

  /**
   * Request persistent storage permission so browser never evicts vault data
   */
  public async requestPersistentStorage(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      try {
        return await navigator.storage.persist();
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Check if persistent storage permission is granted
   */
  public async isPersistentStorageGranted(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted) {
      try {
        return await navigator.storage.persisted();
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Get comprehensive live storage metrics and browser disk quota
   */
  public async getStorageMetrics(): Promise<StorageMetrics> {
    let usedBytes = 0;
    let totalKeys = 0;
    let vaultRecordCount = 0;

    const stats = await indexedDBStore.calculateStoreBytes();
    usedBytes = stats.totalBytes;
    totalKeys = stats.keyCount;

    const records = await indexedDBStore.getItem<any[]>(STORAGE_KEYS.RECORDS);
    if (Array.isArray(records)) {
      vaultRecordCount = records.length;
    }

    // Determine Quota
    let quotaBytes: number;
    let quotaLabel: string;
    let browserDeviceQuotaBytes = 0;

    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        if (estimate.quota) {
          browserDeviceQuotaBytes = estimate.quota;
        }
      } catch {
        // Ignored
      }
    }

    if (this.configuredQuotaMb > 0) {
      quotaBytes = this.configuredQuotaMb * 1024 * 1024;
      quotaLabel =
        this.configuredQuotaMb >= 1024
          ? `${(this.configuredQuotaMb / 1024).toFixed(0)} GB`
          : `${this.configuredQuotaMb} MB`;
    } else {
      // 0 = Unlimited / Auto-Expand requested by user
      quotaBytes = browserDeviceQuotaBytes > 0 ? browserDeviceQuotaBytes : 50 * 1024 * 1024 * 1024;
      quotaLabel = 'Unlimited (IndexedDB)';
    }

    const percentUsed =
      quotaBytes > 0
        ? Math.min(100, Math.max(0.01, Number(((usedBytes / quotaBytes) * 100).toFixed(2))))
        : 0.01;

    const estimatedFreeBytes = Math.max(0, quotaBytes - usedBytes);
    const isPersistent = await this.isPersistentStorageGranted();

    const formattedUsed = this.formatBytes(usedBytes);
    const formattedQuota =
      this.configuredQuotaMb === 0
        ? browserDeviceQuotaBytes > 0
          ? `Unlimited (~${this.formatBytes(browserDeviceQuotaBytes)} device pool)`
          : 'Unlimited / Auto-Expand'
        : this.formatBytes(quotaBytes);

    const formattedFree = this.formatBytes(estimatedFreeBytes);
    const isQuotaApproaching = this.configuredQuotaMb > 0 && percentUsed > 85;

    const backendNote = 'Exclusive high-capacity IndexedDB engine active. No 5MB ceiling.';

    return {
      engine: 'indexeddb',
      usedBytes,
      formattedUsed,
      quotaBytes,
      formattedQuota,
      percentUsed,
      totalKeysCount: totalKeys,
      isPersistent,
      configuredQuotaMb: this.configuredQuotaMb,
      quotaLabel,
      estimatedFreeBytes,
      formattedFree,
      vaultRecordCount,
      isQuotaApproaching,
      backendNote,
    };
  }

  /**
   * Optimize and compact IndexedDB vault storage
   */
  public async optimizeStorage(): Promise<{ freedBytes: number; keysCount: number }> {
    const beforeStats = await this.getStorageMetrics();

    // Clean any residual localStorage keys
    await this.purgeLegacyLocalStorage();

    // Remove any transient change session keys
    await indexedDBStore.removeItem('secure_vault_pending_change_session_v1');

    const afterStats = await this.getStorageMetrics();
    return {
      freedBytes: Math.max(0, beforeStats.usedBytes - afterStats.usedBytes),
      keysCount: afterStats.totalKeysCount,
    };
  }

  public formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

/**
 * Backward compatibility alias: LocalSecureStorageService delegates to the IndexedDB engine
 */
export class LocalSecureStorageService extends UnifiedSecureStorageService {}

export const secureStorageService = new UnifiedSecureStorageService();
