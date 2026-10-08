/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  ShieldAlert,
  Key,
  Star,
  Plus,
  KeyRound,
  ArrowRight,
  Clock,
  Search,
  Landmark,
  CreditCard,
  Globe,
  Mail,
  FileText,
  UserCheck,
  Briefcase,
  Wifi,
  GraduationCap,
  Folder,
  Copy,
  Check,
  ExternalLink,
  X,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { CATEGORY_METADATA, VaultRecord } from '../../types/vault';
import { VAULT_CATEGORIES } from '../../core/constants';
import { searchService } from '../../storage/SearchService';
import { DashboardSkeleton } from './DashboardSkeleton';

const CATEGORY_ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  Shield: ShieldCheck,
  Star: Star,
  Key: Key,
  Landmark: Landmark,
  CreditCard: CreditCard,
  UserCheck: UserCheck,
  FileText: FileText,
  Wifi: Wifi,
  Mail: Mail,
  Share2: Globe,
  Briefcase: Briefcase,
  GraduationCap: GraduationCap,
  Folder: Folder,
};

export const DashboardView: React.FC = () => {
  const {
    isVaultLoading,
    records,
    securityReport,
    metadata,
    recoveryKeyNotice,
    dismissRecoveryNotice,
    setActiveView,
    setSelectedCategory,
    setSelectedRecord,
    setIsCreateModalOpen,
    setIsGeneratorModalOpen,
    copyToClipboard,
    copiedFieldLabel,
  } = useVault();

  // Instant Domain & Account Title Search State
  const [quickFilterQuery, setQuickFilterQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const activeRecords = useMemo(() => records.filter((r) => !r.deletedAt), [records]);
  const favorites = useMemo(() => activeRecords.filter((r) => r.favorite), [activeRecords]);
  const recentRecords = useMemo(
    () => [...activeRecords].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6),
    [activeRecords]
  );

  const filteredMatches = useMemo(() => {
    if (!quickFilterQuery.trim()) return [];
    return searchService.search(activeRecords, quickFilterQuery, 'all', undefined, 'all');
  }, [activeRecords, quickFilterQuery]);

  const categoryCounts = useMemo(() => {
    return activeRecords.reduce((acc, rec) => {
      acc[rec.category] = (acc[rec.category] || 0) + 1;
      if (rec.category === 'card') acc.cards = (acc.cards || 0) + 1;
      if (rec.category === 'cards') acc.card = (acc.card || 0) + 1;
      if (rec.category === 'note') acc.notes = (acc.notes || 0) + 1;
      if (rec.category === 'notes') acc.note = (acc.note || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [activeRecords]);

  if (isVaultLoading) {
    return <DashboardSkeleton />;
  }

  const weakCount = securityReport?.weakCount ?? 0;
  const reusedCount = securityReport?.reusedCount ?? 0;
  const oldCount = securityReport?.oldCount ?? 0;
  const strongCount = securityReport?.strongCount ?? 0;

  const handleOpenRecord = (rec: VaultRecord) => {
    setSelectedCategory('all');
    setSelectedRecord(rec);
    setActiveView('items');
  };

  const browseCategories = VAULT_CATEGORIES.filter(
    (c) => c.id !== 'all' && c.id !== 'favorites'
  ).slice(0, 4);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-8">
      {/* Emergency Recovery Key First-Run Notice (if newly created vault) */}
      <AnimatePresence>
        {recoveryKeyNotice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-[#03152F] text-[#F5F9FF] p-5 sm:p-6 rounded-xl border border-[#08BBD4]/50 shadow-sm space-y-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#062A63] border border-[#08BBD4]/40 flex items-center justify-center text-[#08BBD4] shrink-0">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-mono uppercase tracking-widest text-[#08BBD4] font-semibold">
                    One-Time Emergency Recovery Key
                  </span>
                  <h3 className="text-base font-bold text-white mt-0.5">
                    Save Your Emergency Recovery Key Offline
                  </h3>
                  <p className="text-xs text-[#B8C6D8] mt-1 leading-relaxed">
                    This 160-bit recovery key can independently unwrap your vault key if you ever forget your Master Password. Write it down or store it in a physical safe—it will not be shown again.
                  </p>
                </div>
              </div>
              <button
                onClick={dismissRecoveryNotice}
                className="p-1.5 rounded-lg text-[#B8C6D8] hover:text-white hover:bg-[#062A63] transition-colors cursor-pointer"
                title="Dismiss recovery key notice"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#061426] border border-[#1D3855]">
              <code className="font-mono text-xs sm:text-sm font-bold text-[#08BBD4] tracking-wider break-all select-all">
                {recoveryKeyNotice}
              </code>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => copyToClipboard(recoveryKeyNotice, 'recovery-key-banner')}
                  className="btn-primary px-3.5 py-2 rounded-lg text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {copiedFieldLabel === 'recovery-key-banner' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy Key
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={dismissRecoveryNotice}
                  className="px-3.5 py-2 rounded-lg bg-[#062A63] hover:bg-[#08357A] text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  I Saved It
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Unified Dashboard Header & Instant Lookup Card */}
      <div className="bg-bg-surface p-5 sm:p-6 rounded-xl border border-border shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
          <div className="flex items-center justify-between">
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight">
              Dashboard
            </h1>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-nowrap items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={() => setIsGeneratorModalOpen(true)}
              className="btn-outline flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer"
            >
              <KeyRound className="w-4 h-4 shrink-0" />
              <span>Generate Password</span>
            </button>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="btn-primary flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Add Credential</span>
            </button>
          </div>
        </div>

        <div className="pt-3.5 border-t border-border/70 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              id="dashboard-quick-search-input"
              type="text"
              value={quickFilterQuery}
              onChange={(e) => setQuickFilterQuery(e.target.value)}
              placeholder="Search credentials by domain (e.g. github.com) or account title..."
              className="w-full pl-10 pr-20 py-2.5 bg-bg-app border border-border rounded-xl text-xs sm:text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
            {quickFilterQuery ? (
              <button
                type="button"
                onClick={() => setQuickFilterQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-text-secondary hover:text-text-primary px-2 py-1 rounded-md bg-bg-secondary cursor-pointer"
              >
                Clear
              </button>
            ) : (
              <span className="hidden sm:inline-block absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-text-muted bg-bg-secondary px-2 py-0.5 rounded border border-border">
                ⌘K / Ctrl+K
              </span>
            )}
          </div>

          {/* Instant Search Results Dropdown / Panel */}
          {quickFilterQuery.trim() !== '' && (
            <div className="pt-2 border-t border-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-text-secondary">
                  Instant Matches ({filteredMatches.length})
                </span>
                <span className="text-[11px] text-text-muted font-mono">
                  In-Memory Filter • Zero Disk Index
                </span>
              </div>

              {filteredMatches.length === 0 ? (
                <div className="p-6 text-center rounded-xl bg-bg-app border border-border">
                  <p className="text-xs font-medium text-text-primary">
                    No credentials matched &ldquo;{quickFilterQuery}&rdquo;
                  </p>
                  <p className="text-[11px] text-text-secondary mt-0.5">
                    Try another search keyword or create a new entry.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                  {filteredMatches.map((rec) => {
                    const meta = CATEGORY_METADATA[rec.category] || CATEGORY_METADATA.other;
                    const domain = searchService.extractDomain(rec.website || rec.url);
                    const isCopied = copiedFieldLabel === `dash-search-${rec.id}`;
                    const secretToCopy =
                      rec.password || rec.pin || rec.cardNumber || rec.accountNumber || '';

                    return (
                      <div
                        key={rec.id}
                        onClick={() => handleOpenRecord(rec)}
                        className="p-3 rounded-xl bg-bg-app hover:bg-bg-secondary border border-border hover:border-primary/50 flex items-center justify-between gap-3 transition-all cursor-pointer group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-secondary text-white font-bold text-xs flex items-center justify-center shrink-0">
                            {rec.title.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-bold text-text-primary truncate group-hover:text-primary transition-colors">
                                {rec.title}
                              </p>
                              {domain && (
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20 truncate max-w-[130px]">
                                  {domain}
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-text-secondary truncate">
                              {rec.username || rec.email || meta.label}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {secretToCopy && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(secretToCopy, `dash-search-${rec.id}`);
                              }}
                              title="Copy password / secret"
                              className={`p-2 rounded-lg text-xs transition-colors cursor-pointer ${
                                isCopied
                                  ? 'bg-success/15 text-success'
                                  : 'bg-bg-surface hover:bg-primary hover:text-white text-text-secondary border border-border'
                              }`}
                            >
                              {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          <ArrowRight className="w-3.5 h-3.5 text-text-muted group-hover:text-primary" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Vault Categories Quick Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
            Vault Categories
          </h2>
          <button
            type="button"
            onClick={() => setActiveView('categories')}
            className="text-xs font-semibold text-primary hover:text-primary-dark flex items-center gap-1 cursor-pointer"
          >
            <span>View All Categories</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {browseCategories.map((cat) => {
            const IconComp = CATEGORY_ICON_MAP[cat.icon] || Folder;
            const count = categoryCounts[cat.id] || 0;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat.id);
                  setActiveView('items');
                }}
                className="p-3.5 bg-bg-surface hover:bg-bg-secondary rounded-xl border border-border hover:border-primary/50 transition-all text-left flex flex-col justify-between group shadow-2xs cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2.5">
                  <div className="w-9 h-9 rounded-lg bg-secondary text-white group-hover:bg-primary flex items-center justify-center transition-colors">
                    <IconComp className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-bold font-mono text-text-primary">
                    {count}
                  </span>
                </div>
                <div>
                  <div className="text-xs font-semibold text-text-primary group-hover:text-primary transition-colors truncate">
                    {cat.name}
                  </div>
                  <div className="text-[10px] text-text-muted truncate mt-0.5">
                    {count === 1 ? '1 item' : `${count} items`}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Grid: Recent Credentials & Password Hygiene Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Starred Favorites + Recently Modified Credentials */}
        <div className="lg:col-span-2 space-y-6">
          {/* Starred Favorites Bar (if user has favorites) */}
          {favorites.length > 0 && (
            <div className="bg-bg-surface rounded-xl border border-border shadow-xs overflow-hidden">
              <div className="px-6 py-3.5 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-primary fill-primary" />
                  <h2 className="font-semibold text-sm text-text-primary">
                    Pinned Favorites
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory('favorites');
                    setActiveView('items');
                  }}
                  className="text-xs font-semibold text-primary hover:text-primary-dark cursor-pointer"
                >
                  See All ({favorites.length})
                </button>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {favorites.slice(0, 4).map((rec) => {
                  const meta = CATEGORY_METADATA[rec.category] || CATEGORY_METADATA.other;
                  const secret =
                    rec.password || rec.pin || rec.cardNumber || rec.accountNumber || '';
                  const isCopied = copiedFieldLabel === `fav-${rec.id}`;

                  return (
                    <div
                      key={rec.id}
                      onClick={() => handleOpenRecord(rec)}
                      className="p-3 rounded-xl bg-bg-app hover:bg-bg-secondary border border-border hover:border-primary/40 flex items-center justify-between gap-3 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-secondary text-white font-bold text-xs flex items-center justify-center shrink-0">
                          {rec.title.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-text-primary truncate group-hover:text-primary transition-colors">
                            {rec.title}
                          </p>
                          <p className="text-[11px] text-text-secondary truncate">
                            {rec.username || rec.email || meta.label}
                          </p>
                        </div>
                      </div>
                      {secret && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(secret, `fav-${rec.id}`);
                          }}
                          title="Copy secret to clipboard"
                          className={`p-2 rounded-lg text-xs transition-colors cursor-pointer shrink-0 ${
                            isCopied
                              ? 'bg-success/15 text-success'
                              : 'text-text-secondary hover:text-primary hover:bg-bg-surface'
                          }`}
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recently Modified Credentials */}
          <div className="bg-bg-surface rounded-xl border border-border shadow-xs overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-text-secondary" />
                <h2 className="font-semibold text-sm text-text-primary">
                  Recently Modified Credentials
                </h2>
              </div>
              <button
                onClick={() => {
                  setSelectedCategory('all');
                  setActiveView('items');
                }}
                className="text-xs font-semibold text-primary hover:text-primary-dark cursor-pointer"
              >
                View All
              </button>
            </div>

            {recentRecords.length === 0 ? (
              <div className="p-12 text-center my-auto">
                <Key className="w-8 h-8 text-text-muted mx-auto mb-2" />
                <p className="text-sm font-medium text-text-primary">Your vault is empty</p>
                <p className="text-xs text-text-secondary mt-1 mb-4">
                  Add your first login, bank account, payment card, or encrypted note to get started.
                </p>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create First Item
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentRecords.map((rec) => {
                  const meta = CATEGORY_METADATA[rec.category] || CATEGORY_METADATA.other;
                  const secret =
                    rec.password || rec.pin || rec.cardNumber || rec.accountNumber || '';
                  const isCopied = copiedFieldLabel === `recent-${rec.id}`;
                  const siteUrl = rec.website || rec.url;

                  return (
                    <div
                      key={rec.id}
                      onClick={() => handleOpenRecord(rec)}
                      className="px-6 py-3.5 hover:bg-bg-secondary/70 flex items-center justify-between gap-4 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm bg-secondary text-white">
                          {rec.title.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-text-primary group-hover:text-primary transition-colors truncate">
                              {rec.title}
                            </p>
                            {rec.favorite && (
                              <Star className="w-3.5 h-3.5 text-primary fill-primary shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-text-secondary truncate">
                            {rec.username || rec.email || meta.label}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="hidden sm:inline-block text-[11px] font-medium px-2.5 py-1 rounded-md bg-bg-secondary text-text-secondary border border-border">
                          {meta.label}
                        </span>
                        <span className="hidden md:inline-block text-xs text-text-muted font-mono">
                          {new Date(rec.updatedAt).toLocaleDateString()}
                        </span>

                        {siteUrl && (
                          <a
                            href={siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Launch website"
                            className="p-2 rounded-lg text-text-secondary hover:text-primary hover:bg-bg-secondary transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}

                        {secret && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(secret, `recent-${rec.id}`);
                            }}
                            title="Copy secret to clipboard"
                            className={`p-2 rounded-lg text-xs transition-colors cursor-pointer ${
                              isCopied
                                ? 'bg-success/15 text-success'
                                : 'text-text-secondary hover:text-primary hover:bg-bg-secondary'
                            }`}
                          >
                            {isCopied ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Password Hygiene Breakdown */}
        <div className="space-y-6">
          <div className="bg-bg-surface rounded-xl p-5 border border-border shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-primary" />
                Password Hygiene Breakdown
              </h3>
              <button
                type="button"
                onClick={() => setActiveView('security_center')}
                className="text-xs font-semibold text-primary hover:underline cursor-pointer"
              >
                Full Report
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-center">
              <div className="p-3 rounded-xl bg-bg-app border border-border">
                <div className="text-lg font-bold font-mono text-success">{strongCount}</div>
                <div className="text-[11px] text-text-secondary">Strong Keys</div>
              </div>
              <div className="p-3 rounded-xl bg-bg-app border border-border">
                <div className="text-lg font-bold font-mono text-error">{weakCount}</div>
                <div className="text-[11px] text-text-secondary">Weak (&lt;12 chars)</div>
              </div>
              <div className="p-3 rounded-xl bg-bg-app border border-border">
                <div className="text-lg font-bold font-mono text-warning">{reusedCount}</div>
                <div className="text-[11px] text-text-secondary">Reused</div>
              </div>
              <div className="p-3 rounded-xl bg-bg-app border border-border">
                <div className="text-lg font-bold font-mono text-info">{oldCount}</div>
                <div className="text-[11px] text-text-secondary">&gt; 1 Year Old</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
