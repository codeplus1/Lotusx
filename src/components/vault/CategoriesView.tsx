/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import {
  ShieldCheck,
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
  Key,
  Star,
  Plus,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { RecordCategory } from '../../types/vault';
import { VAULT_CATEGORIES } from '../../core/constants';

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

export const CategoriesView: React.FC = () => {
  const {
    records,
    setSelectedCategory,
    setActiveView,
    setIsCreateModalOpen,
  } = useVault();

  const activeRecords = useMemo(() => records.filter((r) => !r.deletedAt), [records]);

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

  const browseCategories = VAULT_CATEGORIES.filter(
    (c) => c.id !== 'all' && c.id !== 'favorites'
  );

  const handleSelectCategory = (cat: RecordCategory | 'all' | 'favorites') => {
    setSelectedCategory(cat);
    setActiveView('items');
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
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

      {/* Category Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {browseCategories.map((cat) => {
          const IconComp = CATEGORY_ICON_MAP[cat.icon] || Folder;
          const count = categoryCounts[cat.id] || 0;

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleSelectCategory(cat.id)}
              className="p-3.5 bg-bg-surface hover:bg-bg-secondary rounded-xl border border-border hover:border-primary/50 transition-colors text-left flex flex-col justify-between group shadow-2xs cursor-pointer"
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
  );
};
