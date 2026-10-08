/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import {
  Search,
  Plus,
  Star,
  Copy,
  Check,
  Key,
  ArrowUpDown,
  Filter,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { CATEGORY_METADATA, VaultRecord } from '../../types/vault';

export const RecordListView: React.FC = () => {
  const {
    filteredRecords,
    selectedCategory,
    selectedRecord,
    setSelectedRecord,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    setIsCreateModalOpen,
    copyToClipboard,
    copiedFieldLabel,
    toggleFavorite,
  } = useVault();

  const getHeaderTitle = () => {
    if (selectedCategory === 'all') return 'All Credentials';
    if (selectedCategory === 'favorites') return 'Starred Favorites';
    if (selectedCategory === 'trash') return 'Trash (Soft Deleted)';
    return CATEGORY_METADATA[selectedCategory]?.label || 'Credentials';
  };

  const handleQuickCopy = (e: React.MouseEvent, record: VaultRecord) => {
    e.stopPropagation();
    const secret = record.password || record.cardNumber || record.accountNumber || record.username || '';
    if (secret) {
      copyToClipboard(secret, `quick-${record.id}`);
    }
  };

  const handleQuickFavorite = async (e: React.MouseEvent, record: VaultRecord) => {
    e.stopPropagation();
    await toggleFavorite(record.id);
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Search and Filter Controls */}
      <div className="bg-bg-surface p-3.5 sm:p-4 rounded-xl border border-border shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-text-primary tracking-tight">
              {getHeaderTitle()}
            </h2>
            <p className="text-xs text-text-secondary">
              Showing {filteredRecords.length} {filteredRecords.length === 1 ? 'record' : 'records'}
            </p>
          </div>

          {selectedCategory !== 'trash' && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs cursor-pointer shadow-xs shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>New Item</span>
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by title, username, URL, or tag..."
              className="w-full pl-9 pr-4 py-2 bg-bg-app border border-border rounded-lg text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-text-muted hover:text-text-primary px-1.5 py-0.5 rounded bg-bg-secondary cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 bg-bg-app border border-border rounded-lg px-3 py-2 sm:py-1.5 shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 text-text-secondary shrink-0" />
            <span className="text-[11px] text-text-secondary font-medium">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-xs font-semibold text-text-primary focus:outline-none cursor-pointer flex-1 sm:flex-initial"
            >
              <option value="updated_desc">Recently Updated</option>
              <option value="created_desc">Newest First</option>
              <option value="title_asc">Title (A-Z)</option>
              <option value="title_desc">Title (Z-A)</option>
              <option value="strength_asc">Weakest Password First</option>
            </select>
          </div>
        </div>
      </div>

      {/* Record List */}
      <div className="bg-bg-surface rounded-xl border border-border shadow-xs overflow-hidden flex-1">
        {filteredRecords.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-bg-secondary border border-border flex items-center justify-center mx-auto mb-3 text-text-muted">
              {selectedCategory === 'trash' ? <Trash2 className="w-6 h-6" /> : <Filter className="w-6 h-6" />}
            </div>
            <h3 className="text-sm font-semibold text-text-primary">No matching records found</h3>
            <p className="text-xs text-text-secondary mt-1 max-w-sm mx-auto">
              {searchQuery
                ? `No credentials matched "${searchQuery}". Try adjusting your search query.`
                : selectedCategory === 'trash'
                ? 'Your trash bin is empty.'
                : 'No credentials in this category yet.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredRecords.map((rec) => {
              const meta = CATEGORY_METADATA[rec.category] || CATEGORY_METADATA.other;
              const isSelected = selectedRecord?.id === rec.id;
              const isCopied = copiedFieldLabel === `quick-${rec.id}`;
              const isWeak = rec.password && (rec.strengthScore ?? 3) <= 1;

              return (
                <motion.div
                  layout
                  key={rec.id}
                  onClick={() => setSelectedRecord(rec)}
                  className={`p-3.5 sm:px-5 sm:py-4 flex items-center justify-between gap-3 sm:gap-4 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-primary/10 border-l-4 border-l-primary'
                      : 'hover:bg-bg-secondary/60'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    {/* Avatar Icon */}
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm bg-secondary text-white shadow-2xs">
                      {rec.title.slice(0, 2).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-text-primary truncate">
                          {rec.title}
                        </h4>
                        {isWeak && (
                          <span
                            title="Weak password detected"
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-warning/15 text-warning border border-warning/30 shrink-0"
                          >
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Weak
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-text-secondary truncate mt-0.5">
                        <span className="truncate">
                          {rec.username || rec.email || rec.bankName || rec.url || meta.label}
                        </span>
                        {rec.tags.length > 0 && (
                          <div className="hidden md:flex items-center gap-1">
                            {rec.tags.slice(0, 2).map((t) => (
                              <span
                                key={t}
                                className="px-1.5 py-0.2 rounded bg-bg-secondary text-text-secondary text-[10px] font-mono border border-border"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {(rec.password || rec.cardNumber || rec.accountNumber) && !rec.deletedAt && (
                      <button
                        onClick={(e) => handleQuickCopy(e, rec)}
                        title="Copy secret to clipboard (auto-clears in 20s)"
                        className={`p-2 rounded-lg text-xs font-medium transition-colors cursor-pointer touch-target flex items-center justify-center ${
                          isCopied
                            ? 'bg-success/15 text-success'
                            : 'text-text-secondary hover:text-primary hover:bg-bg-secondary'
                        }`}
                      >
                        {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                    )}

                    {!rec.deletedAt && (
                      <button
                        onClick={(e) => handleQuickFavorite(e, rec)}
                        title={rec.favorite ? 'Remove from favorites' : 'Add to favorites'}
                        className="p-2 rounded-lg text-text-secondary hover:text-primary hover:bg-bg-secondary transition-colors cursor-pointer touch-target flex items-center justify-center"
                      >
                        <Star
                          className={`w-4 h-4 ${
                            rec.favorite ? 'text-primary fill-primary' : ''
                          }`}
                        />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
