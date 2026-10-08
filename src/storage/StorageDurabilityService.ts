/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { secureStorageService } from './SecureStorageService';
import { indexedDBStore } from './IndexedDBStore';

export interface StorageHealthReport {
  primaryIndexedDbHealthy: boolean;
  mirrorLocalStorageHealthy: boolean;
  usageBytes: number;
  quotaBytes: number;
  usagePercent: number;
  isPersistent: boolean;
  recordCount: number;
}

/**
 * Local-First Storage Durability & Health Diagnostics Service
 * Inspects IndexedDB store integrity, browser storage quota, and persistent storage status.
 */
export class StorageDurabilityService {
  public async getStorageHealthReport(): Promise<StorageHealthReport> {
    let primaryIndexedDbHealthy = false;
    let mirrorLocalStorageHealthy = false;

    try {
      const idbStats = await indexedDBStore.calculateStoreBytes();
      primaryIndexedDbHealthy = typeof idbStats.totalBytes === 'number';
    } catch {
      primaryIndexedDbHealthy = false;
    }

    try {
      if (typeof localStorage !== 'undefined') {
        const probeKey = 'lotusx_storage_probe';
        localStorage.setItem(probeKey, '1');
        localStorage.removeItem(probeKey);
        mirrorLocalStorageHealthy = true;
      }
    } catch {
      mirrorLocalStorageHealthy = false;
    }

    const metrics = await secureStorageService.getStorageMetrics();

    return {
      primaryIndexedDbHealthy,
      mirrorLocalStorageHealthy,
      usageBytes: metrics.usedBytes,
      quotaBytes: metrics.quotaBytes,
      usagePercent: metrics.percentUsed,
      isPersistent: metrics.isPersistent,
      recordCount: metrics.vaultRecordCount,
    };
  }

  public formatBytes(bytes: number): string {
    return secureStorageService.formatBytes(bytes);
  }
}

export const storageDurabilityService = new StorageDurabilityService();
