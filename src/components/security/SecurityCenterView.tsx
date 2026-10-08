/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Copy,
  Clock,
  CheckCircle2,
  Edit3,
  KeyRound,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { CATEGORY_METADATA, VaultRecord, SecurityScoreReport } from '../../types/vault';
import { passwordHealthService } from '../../security/PasswordHealthService';

export function analyzeVaultRecords(
  records: VaultRecord[],
  now: number = Date.now()
): SecurityScoreReport {
  return passwordHealthService.auditVault(records, now);
}

export const SecurityCenterView: React.FC = () => {
  const {
    securityReport,
    records,
    setEditingRecord,
    setActiveView,
  } = useVault();

  if (!securityReport) return null;

  const activeRecords = records.filter((r) => !r.deletedAt);
  const getRecordById = (id: string) => activeRecords.find((r) => r.id === id);

  const score = securityReport.overallScore;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Hero Score Card */}
      <div className="bg-[#03152F] text-white rounded-xl p-6 sm:p-8 border border-[#1D3855] flex flex-col md:flex-row items-center justify-between gap-6 shadow-xs">
        <div className="space-y-2 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-[#062A63] border border-[#1D3855] text-[#08BBD4] text-xs font-mono">
            <ShieldAlert className="w-3.5 h-3.5" />
            Automated Vault Hygiene Analysis
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Credential Health & Vulnerability Report
          </h1>
          <p className="text-xs sm:text-sm text-[#B8C6D8] max-w-xl leading-relaxed">
            LotusX evaluates your encrypted credentials locally in memory for Shannon entropy, password reuse across domains, and credential rotation age.
          </p>
        </div>

        {/* Circular Gauge Representation */}
        <div className="flex items-center gap-6 bg-[#0B1F38] p-5 rounded-xl border border-[#1D3855] shrink-0">
          <div className="text-center">
            <span
              className={`text-4xl sm:text-5xl font-extrabold font-mono ${
                score >= 80
                  ? 'text-[#16A56B]'
                  : score >= 50
                  ? 'text-[#E6A23C]'
                  : 'text-[#D64545]'
              }`}
            >
              {score}%
            </span>
            <span className="block text-[10px] font-mono uppercase tracking-widest text-[#8493A5] mt-1">
              Security Score
            </span>
          </div>

          <div className="h-12 w-px bg-[#1D3855]" />

          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[#B8C6D8]">Strong:</span>
              <span className="font-mono font-bold text-[#16A56B]">{securityReport.strongCount}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[#B8C6D8]">Weak:</span>
              <span className="font-mono font-bold text-[#D64545]">{securityReport.weakCount}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[#B8C6D8]">Reused:</span>
              <span className="font-mono font-bold text-[#E6A23C]">{securityReport.reusedCount}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Metric Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-bg-surface p-5 rounded-xl border border-border shadow-xs flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-error/10 text-error flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-text-primary">{securityReport.weakCount}</p>
            <p className="text-xs font-medium text-text-secondary">Weak Passwords (&lt;50 bits)</p>
          </div>
        </div>

        <div className="bg-bg-surface p-5 rounded-xl border border-border shadow-xs flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-warning/15 text-warning flex items-center justify-center shrink-0">
            <Copy className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-text-primary">{securityReport.reusedCount}</p>
            <p className="text-xs font-medium text-text-secondary">Reused Passwords</p>
          </div>
        </div>

        <div className="bg-bg-surface p-5 rounded-xl border border-border shadow-xs flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-info/15 text-info flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold font-mono text-text-primary">{securityReport.oldCount}</p>
            <p className="text-xs font-medium text-text-secondary">Unchanged &gt; 180 Days</p>
          </div>
        </div>
      </div>

      {/* Issue List */}
      <div className="bg-bg-surface rounded-xl border border-border shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-bold text-sm text-text-primary">
            Actionable Security Recommendations ({securityReport.issues.length})
          </h2>
          <button
            onClick={() => setActiveView('generator')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-dark cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5" />
            Open Password Generator
          </button>
        </div>

        {securityReport.issues.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-success/15 text-success flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-text-primary">Zero Vulnerabilities Detected</h3>
            <p className="text-xs text-text-secondary mt-1 max-w-md mx-auto">
              Every credential in your vault uses a unique, high-entropy password with no detected reuse.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {securityReport.issues.map((issue, idx) => {
              const rec = getRecordById(issue.recordId);
              if (!rec) return null;
              const meta = CATEGORY_METADATA[rec.category] || CATEGORY_METADATA.other;

              return (
                <div
                  key={`${issue.recordId}-${issue.type}-${idx}`}
                  className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-bg-secondary/60 transition-colors"
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        issue.severity === 'high'
                          ? 'bg-error/15 text-error'
                          : issue.severity === 'medium'
                          ? 'bg-warning/15 text-warning'
                          : 'bg-info/15 text-info'
                      }`}
                    >
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-text-primary">{issue.recordTitle}</h4>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                            issue.severity === 'high'
                              ? 'bg-error/10 text-error border-error/25'
                              : issue.severity === 'medium'
                              ? 'bg-warning/15 text-warning border-warning/30'
                              : 'bg-info/10 text-info border-info/25'
                          }`}
                        >
                          {issue.type}
                        </span>
                        <span className="text-[11px] text-text-muted">{meta.label}</span>
                      </div>
                      <p className="text-xs text-text-secondary mt-0.5">{issue.message}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => setEditingRecord(rec)}
                    className="btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs shrink-0 self-start sm:self-center cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Rotate Password
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
