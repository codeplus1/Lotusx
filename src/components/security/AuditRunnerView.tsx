/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  ShieldCheck,
  Play,
  CheckCircle2,
  XCircle,
  Cpu,
  Lock,
  Terminal,
  RefreshCw,
} from 'lucide-react';
import { SecurityTestSuite, TestSuiteSummary } from '../../security/SecurityTestSuite';

export const AuditRunnerView: React.FC = () => {
  const [summary, setSummary] = useState<TestSuiteSummary | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const runDiagnostics = async () => {
    setIsRunning(true);
    await new Promise((r) => setTimeout(r, 120));
    try {
      const result = await SecurityTestSuite.runAll();
      setSummary(result);
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6 max-w-5xl mx-auto"
    >
      {/* Header Card (Dark Navy Security Surface) */}
      <div className="bg-[#03152F] text-white p-6 sm:p-8 rounded-xl border border-[#1D3855] flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-xs">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[#08BBD4]">
            <Terminal className="w-4 h-4" />
            Live Cryptographic Verification Suite
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Automated Security Self-Audit
          </h1>
          <p className="text-xs sm:text-sm text-[#B8C6D8] max-w-2xl leading-relaxed">
            Executes real-time unit and integration verification tests against your browser&apos;s Web Crypto API, testing AES-256-GCM authentication tags, PBKDF2 key isolation, and tamper resistance.
          </p>
        </div>

        <button
          onClick={runDiagnostics}
          disabled={isRunning}
          className="btn-primary px-5 py-3 rounded-xl text-xs flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-50 shadow-xs"
        >
          {isRunning ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Running Diagnostics...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              Re-Run Verification Suite
            </>
          )}
        </button>
      </div>

      {/* Summary Banner */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-bg-surface p-4 rounded-xl border border-border shadow-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
              Total Assertions
            </span>
            <p className="text-2xl font-bold font-mono text-text-primary mt-1">{summary.total}</p>
          </div>
          <div className="bg-bg-surface p-4 rounded-xl border border-success/30 shadow-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-success">
              Passed
            </span>
            <p className="text-2xl font-bold font-mono text-success mt-1">{summary.passed}</p>
          </div>
          <div className="bg-bg-surface p-4 rounded-xl border border-border shadow-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
              Failed
            </span>
            <p
              className={`text-2xl font-bold font-mono mt-1 ${
                summary.failed > 0 ? 'text-error' : 'text-text-muted'
              }`}
            >
              {summary.failed}
            </p>
          </div>
          <div className="bg-bg-surface p-4 rounded-xl border border-border shadow-xs">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
              Execution Time
            </span>
            <p className="text-2xl font-bold font-mono text-primary mt-1">
              {summary.totalDurationMs} ms
            </p>
          </div>
        </div>
      )}

      {/* Detailed Test Results */}
      <div className="bg-bg-surface rounded-xl border border-border shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary" />
            <h2 className="font-bold text-sm text-text-primary">
              Cryptographic & Invariant Test Results
            </h2>
          </div>
          {summary && summary.failed === 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success bg-success/10 px-2.5 py-1 rounded-md border border-success/25">
              <ShieldCheck className="w-4 h-4" />
              All Security Invariants Verified
            </span>
          )}
        </div>

        <div className="divide-y divide-border">
          {summary?.results.map((res) => (
            <div
              key={res.id}
              className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-bg-secondary/50 transition-colors"
            >
              <div className="flex items-start gap-3.5">
                {res.passed ? (
                  <CheckCircle2 className="w-5 h-5 text-success shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-bg-secondary text-text-secondary border border-border">
                      {res.category}
                    </span>
                    <h4 className="text-sm font-bold text-text-primary">{res.name}</h4>
                  </div>
                  <p className="text-xs text-text-secondary mt-1 font-mono">{res.details}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                <span className="text-xs font-mono text-text-muted">{res.durationMs} ms</span>
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                    res.passed
                      ? 'bg-success/15 text-success'
                      : 'bg-error/15 text-error'
                  }`}
                >
                  {res.passed ? 'PASS' : 'FAIL'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Security Architecture Specification */}
      <div className="bg-bg-secondary rounded-xl p-6 border border-border space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-text-primary uppercase tracking-wider">
          <Lock className="w-4 h-4 text-primary" />
          Architectural Guarantees
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-text-secondary leading-relaxed">
          <div>
            <strong className="text-text-primary block mb-0.5">
              1. Authenticated Encryption (AEAD)
            </strong>
            Every vault modification generates a fresh 96-bit initialization vector (IV) and computes a 128-bit Galois/Counter Mode (GCM) authentication tag over both the ciphertext and metadata header.
          </div>
          <div>
            <strong className="text-text-primary block mb-0.5">
              2. Non-Extractable Key Isolation
            </strong>
            Master decryption keys are derived with <code className="font-mono text-text-primary">extractable: false</code> inside the browser&apos;s native cryptographic subsystem, preventing raw key bytes from ever being read by JavaScript.
          </div>
        </div>
      </div>
    </motion.div>
  );
};
