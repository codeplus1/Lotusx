/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import {
  Landmark,
  CreditCard,
  Globe,
  Mail,
  FileText,
  UserCheck,
  Briefcase,
  Folder,
  ArrowRight,
  Key,
  Star,
  Plus,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { CATEGORY_METADATA, RecordCategory } from '../../types/vault';

const CATEGORY_ICONS: Record<string, React.FC<{ className?: string }>> = {
  banking: Landmark,
  card: CreditCard,
  cards: CreditCard,
  social: Globe,
  email: Mail,
  note: FileText,
  notes: FileText,
  identity: UserCheck,
  work: Briefcase,
  other: Folder,
};

export const CategoriesView: React.FC = () => {
  const {
    records,
    setSelectedCategory,
    setActiveView,
    setIsCreateModalOpen,
  } = useVault();

  const activeRecords = records.filter((r) => !r.deletedAt);

  const getCategoryCount = (cat: RecordCategory) =>
    activeRecords.filter((r) => r.category === cat).length;

  const handleSelectCategory = (cat: RecordCategory | 'all' | 'favorites') => {
    setSelectedCategory(cat);
    setActiveView('items');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-6 max-w-6xl mx-auto"
    >
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-bg-surface p-6 rounded-xl border border-border shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Vault Categories
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            Organize and filter your encrypted credentials by structured domain.
          </p>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add New Credential
        </button>
      </div>

      {/* Quick Collections Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          onClick={() => handleSelectCategory('all')}
          className="bg-[#03152F] text-white p-6 rounded-xl border border-[#1D3855] flex items-center justify-between cursor-pointer hover:border-[#08BBD4] transition-all group shadow-xs"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#062A63] border border-[#1D3855] flex items-center justify-center text-[#08BBD4]">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">All Vault Items</h3>
              <p className="text-xs text-[#B8C6D8] mt-0.5">
                Every active encrypted credential in your vault
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold font-mono text-white">{activeRecords.length}</span>
            <ArrowRight className="w-4 h-4 text-[#B8C6D8] group-hover:text-[#08BBD4] group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>

        <div
          onClick={() => handleSelectCategory('favorites')}
          className="bg-bg-surface p-6 rounded-xl border border-border flex items-center justify-between cursor-pointer hover:border-primary/60 transition-all group shadow-xs"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
              <Star className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary">Starred Favorites</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                High-priority logins pinned for rapid access
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold font-mono text-text-primary">
              {activeRecords.filter((r) => r.favorite).length}
            </span>
            <ArrowRight className="w-4 h-4 text-text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>
      </div>

      {/* Category Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(Object.keys(CATEGORY_METADATA) as RecordCategory[]).map((cat) => {
          const meta = CATEGORY_METADATA[cat];
          const IconComponent = CATEGORY_ICONS[cat] || Folder;
          const count = getCategoryCount(cat);

          return (
            <div
              key={cat}
              onClick={() => handleSelectCategory(cat)}
              className="bg-bg-surface p-5 rounded-xl border border-border shadow-xs hover:border-primary/60 transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="w-11 h-11 rounded-xl bg-secondary text-white flex items-center justify-center shadow-2xs group-hover:bg-primary transition-colors">
                    <IconComponent className="w-5 h-5" />
                  </div>
                  <span className="text-xl font-bold font-mono text-text-primary">
                    {count}
                  </span>
                </div>

                <h3 className="text-sm font-bold text-text-primary group-hover:text-primary transition-colors">
                  {meta.label}
                </h3>
                <p className="text-xs text-text-secondary mt-1">
                  {count === 0
                    ? 'No credentials saved'
                    : `${count} encrypted ${count === 1 ? 'record' : 'records'}`}
                </p>
              </div>

              <div className="mt-5 pt-3 border-t border-border flex items-center justify-between text-xs font-medium text-text-secondary group-hover:text-primary transition-colors">
                <span>Open Category</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
};
