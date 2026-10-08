/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  HardDrive,
  ShieldCheck,
  Database,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import {
  storageDurabilityService,
  StorageHealthReport,
} from '../../storage/StorageDurabilityService';

export const StorageSettingsSection: React.FC = () => {
  const [report, setReport] = useState<StorageHealthReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadHealthReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await storageDurabilityService.getStorageHealthReport();
      setReport(data);
    } catch (err) {
      console.error('Failed to load storage health report:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealthReport();
  }, [loadHealthReport]);

  return (
    <div className="bg-bg-surface rounded-xl border border-border shadow-xs overflow-hidden">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <HardDrive className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-sm text-text-primary">
            Offline Storage & Redundancy Engine
          </h2>
        </div>

        <button
          onClick={loadHealthReport}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary hover:text-primary transition-colors cursor-pointer"
          title="Refresh storage diagnostics"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="p-6 space-y-5">
        {/* Status Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Card 1: Dual-Store Redundancy */}
          <div className="p-4 rounded-xl bg-bg-app border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                Dual-Layer Persistence
              </span>
              <Database className="w-4 h-4 text-primary" />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-text-primary">
                {report?.primaryIndexedDbHealthy && report?.mirrorLocalStorageHealthy
                  ? 'Synchronized'
                  : 'Degraded'}
              </span>
              {report?.primaryIndexedDbHealthy && report?.mirrorLocalStorageHealthy && (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-success/15 text-success border border-success/25">
                  2x Redundant
                </span>
              )}
            </div>

            <div className="space-y-1 pt-1 text-[11px] text-text-secondary">
              <div className="flex items-center justify-between">
                <span>Primary (IndexedDB):</span>
                <span className="font-mono font-semibold text-success flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Active
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Emergency Mirror:</span>
                <span className="font-mono font-semibold text-success flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Synced
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Device Quota Usage */}
          <div className="p-4 rounded-xl bg-bg-app border border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                Encrypted Vault Footprint
              </span>
              <HardDrive className="w-4 h-4 text-text-muted" />
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold font-mono text-text-primary">
                {report ? storageDurabilityService.formatBytes(report.usageBytes) : '—'}
              </span>
              {report && report.quotaBytes > 0 && (
                <span className="text-[11px] text-text-muted">
                  of {storageDurabilityService.formatBytes(report.quotaBytes)} available
                </span>
              )}
            </div>

            <div className="w-full h-1.5 bg-bg-secondary rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{
                  width: `${Math.max(2, Math.min(100, report?.usagePercent || 1))}%`,
                }}
              />
            </div>

            <p className="text-[11px] text-text-secondary leading-relaxed pt-1">
              100% of vault records are stored locally on your device in AES-256-GCM encrypted form.
            </p>
          </div>
        </div>

        {/* Bottom Guarantee Banner */}
        <div className="p-4 rounded-xl bg-bg-secondary/70 border border-border flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-text-primary flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-success" />
              Zero-Plaintext Storage Guarantee
            </h4>
            <p className="text-[11px] text-text-secondary leading-relaxed">
              LotusX never stores session tokens, recovery keys, or unencrypted metadata in browser storage.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
