/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import {
  ShieldCheck,
  ShieldAlert,
  Key,
  Landmark,
  CreditCard,
  Globe,
  Mail,
  FileText,
  UserCheck,
  Briefcase,
  Folder,
  Plus,
  Lock,
} from 'lucide-react';
import { VaultRecord, SecurityHealthReport, RecordCategory } from '../../types/vault';

interface VaultOverviewProps {
  records: VaultRecord[];
  health: SecurityHealthReport | null;
  onSelectCategory: (category: RecordCategory | 'all') => void;
  onOpenGenerator: () => void;
  onAddNew: () => void;
}

export const VaultOverview: React.FC<VaultOverviewProps> = ({
  records,
  health,
  onSelectCategory,
  onOpenGenerator,
  onAddNew,
}) => {
  const categoryCounts = records.reduce((acc, rec) => {
    acc[rec.category] = (acc[rec.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const categories: { id: RecordCategory; label: string; icon: React.ReactNode }[] = [
    { id: 'banking', label: 'Banking & Finance', icon: <Landmark className="w-5 h-5" /> },
    { id: 'card', label: 'Credit / Debit Cards', icon: <CreditCard className="w-5 h-5" /> },
    { id: 'social', label: 'Social Media', icon: <Globe className="w-5 h-5" /> },
    { id: 'email', label: 'Email Accounts', icon: <Mail className="w-5 h-5" /> },
    { id: 'work', label: 'Work & Developer', icon: <Briefcase className="w-5 h-5" /> },
    { id: 'identity', label: 'Personal Identity', icon: <UserCheck className="w-5 h-5" /> },
    { id: 'note', label: 'Encrypted Notes', icon: <FileText className="w-5 h-5" /> },
    { id: 'other', label: 'Other Logins', icon: <Folder className="w-5 h-5" /> },
  ];

  const score = health?.overallScore ?? 100;

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-bg-surface p-6 rounded-xl border border-border shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Security Command Center</h2>
          <p className="text-sm text-text-secondary mt-0.5">
            All records encrypted locally via AES-256-GCM. Zero network exposure.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenGenerator}
            className="btn-outline px-4 py-2.5 rounded-lg text-sm cursor-pointer"
          >
            Password Generator
          </button>
          <button
            onClick={onAddNew}
            className="btn-primary flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Credential
          </button>
        </div>
      </div>

      {/* Security Health & Stats Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Security Score Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#03152F] text-white p-6 rounded-xl border border-[#1D3855] flex flex-col justify-between shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-[#B8C6D8]">
              Vault Security Health
            </span>
            {score >= 80 ? (
              <ShieldCheck className="w-5 h-5 text-[#16A56B]" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-[#E6A23C]" />
            )}
          </div>

          <div className="my-6 flex items-baseline gap-4">
            <span
              className={`text-5xl font-bold tracking-tight font-mono ${
                score >= 80
                  ? 'text-[#16A56B]'
                  : score >= 50
                  ? 'text-[#E6A23C]'
                  : 'text-[#D64545]'
              }`}
            >
              {score}%
            </span>
            <div className="text-xs text-[#B8C6D8]">
              {score >= 80
                ? 'Strong cryptographic posture'
                : score >= 50
                ? 'Moderate risk — review weak/reused keys'
                : 'Action required — weak or reused passwords detected'}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-4 border-t border-[#1D3855] text-center">
            <div>
              <div className="text-lg font-bold text-[#16A56B] font-mono">{health?.strongCount ?? 0}</div>
              <div className="text-[11px] text-[#8493A5]">Strong</div>
            </div>
            <div>
              <div className="text-lg font-bold text-[#E6A23C] font-mono">{health?.reusedCount ?? 0}</div>
              <div className="text-[11px] text-[#8493A5]">Reused</div>
            </div>
            <div>
              <div className="text-lg font-bold text-[#D64545] font-mono">{health?.weakCount ?? 0}</div>
              <div className="text-[11px] text-[#8493A5]">Weak</div>
            </div>
          </div>
        </motion.div>

        {/* Active Issues List */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="lg:col-span-2 bg-bg-surface p-6 rounded-xl border border-border shadow-xs flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-text-primary flex items-center gap-2">
                <Lock className="w-4 h-4 text-primary" />
                Security Audit Findings
              </h3>
              <span className="text-xs font-mono text-text-muted">
                {records.length} Total Encrypted Records
              </span>
            </div>

            {!health || health.issues.length === 0 ? (
              <div className="py-8 text-center bg-success/10 rounded-xl border border-success/25">
                <ShieldCheck className="w-8 h-8 text-success mx-auto mb-2" />
                <p className="text-sm font-medium text-text-primary">
                  Zero password vulnerabilities detected
                </p>
                <p className="text-xs text-text-secondary mt-0.5">
                  All stored credentials meet entropy and uniqueness thresholds.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-44 overflow-y-auto pr-1">
                {health.issues.slice(0, 5).map((issue, idx) => (
                  <div
                    key={`${issue.recordId}-${idx}`}
                    className="flex items-center justify-between p-3 rounded-xl bg-bg-app border border-border text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          issue.severity === 'high'
                            ? 'bg-error'
                            : issue.severity === 'medium'
                            ? 'bg-warning'
                            : 'bg-info'
                        }`}
                      />
                      <span className="font-semibold text-text-primary">{issue.recordTitle}:</span>
                      <span className="text-text-secondary">{issue.message}</span>
                    </div>
                    <span className="uppercase font-mono text-[10px] px-2 py-0.5 rounded bg-bg-surface border border-border text-text-secondary">
                      {issue.type}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-text-muted">
            <span>Cipher: WebCrypto AES-256-GCM (96-bit IV, 128-bit Auth Tag)</span>
            <button
              onClick={() => onSelectCategory('all')}
              className="text-primary font-semibold hover:underline cursor-pointer"
            >
              View All Credentials →
            </button>
          </div>
        </motion.div>
      </div>

      {/* Category Grid */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary mb-4">
          Vault Categories
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {categories.map((cat) => {
            const count = categoryCounts[cat.id] || 0;
            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className="flex items-center gap-4 p-4 bg-bg-surface hover:bg-bg-secondary rounded-xl border border-border hover:border-primary/40 transition-all text-left group shadow-xs cursor-pointer"
              >
                <div className="w-11 h-11 rounded-xl flex items-center justify-center transition-colors bg-secondary text-white group-hover:bg-primary">
                  {cat.icon}
                </div>
                <div>
                  <div className="font-semibold text-text-primary text-sm group-hover:text-primary transition-colors">
                    {cat.label}
                  </div>
                  <div className="text-xs text-text-secondary mt-0.5">
                    {count} {count === 1 ? 'record' : 'records'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
