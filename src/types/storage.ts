/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type StorageEngineType = 'indexeddb';

export interface StorageMetrics {
  engine: StorageEngineType;
  usedBytes: number;
  formattedUsed: string;
  quotaBytes: number;
  formattedQuota: string;
  percentUsed: number;
  totalKeysCount: number;
  isPersistent: boolean;
  configuredQuotaMb: number; // 0 = Unlimited / Auto-Expand (Device disk capacity)
  quotaLabel: string;
  estimatedFreeBytes: number;
  formattedFree: string;
  vaultRecordCount: number;
  isQuotaApproaching: boolean;
  backendNote: string;
}
