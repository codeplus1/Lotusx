/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  Key,
  ShieldAlert,
  KeyRound,
  Settings,
  Landmark,
  CreditCard,
  UserCheck,
  FileText,
  Wifi,
  Mail,
  Briefcase,
  X,
  Shield,
  ChevronDown,
  Wrench,
} from 'lucide-react';
import { useVault, AppView } from '../../context/VaultContext';
import { RecordCategory } from '../../types/vault';
import { useBackHandler } from '../../hooks/useBackHandler';

export const Sidebar: React.FC = () => {
  const {
    activeView,
    setActiveView,
    selectedCategory,
    setSelectedCategory,
    records,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
  } = useVault();

  // Close mobile sidebar drawer on Android back button press
  useBackHandler({
    id: 'sidebar-mobile-drawer',
    enabled: isMobileMenuOpen,
    priority: 90,
    onBack: () => setIsMobileMenuOpen(false),
  });

  const activeRecords = records.filter((r) => !r.deletedAt);
  const totalItems = activeRecords.length;

  const navigateToCategory = (cat: RecordCategory) => {
    setSelectedCategory(cat);
    setActiveView('items');
    setIsMobileMenuOpen(false);
  };

  const navigateToView = (viewId: AppView, cat?: RecordCategory) => {
    if (cat) {
      navigateToCategory(cat);
    } else {
      setActiveView(viewId);
      setIsMobileMenuOpen(false);
    }
  };

  const primaryNavItems = [
    { id: 'dashboard' as AppView, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'items' as AppView, label: 'All Items', icon: Key, count: totalItems, category: 'all' as RecordCategory },
    { id: 'security_center' as AppView, label: 'Security Center', icon: ShieldAlert },
  ];

  const advancedNavItems = [
    { id: 'generator' as AppView, label: 'Generator', fullTitle: 'Password Generator', icon: KeyRound },
  ];

  const isAdvancedActive = activeView === 'generator';
  const [isAdvancedExpanded, setIsAdvancedExpanded] = React.useState<boolean>(() => isAdvancedActive);

  React.useEffect(() => {
    if (isAdvancedActive) {
      setIsAdvancedExpanded(true);
    }
  }, [isAdvancedActive]);

  const categoryShortcuts: {
    id: RecordCategory;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'passwords', label: 'Passwords', icon: Key },
    { id: 'banking', label: 'Banking', icon: Landmark },
    { id: 'cards', label: 'Cards', icon: CreditCard },
    { id: 'identity', label: 'Identity', icon: UserCheck },
    { id: 'notes', label: 'Secure Notes', icon: FileText },
    { id: 'wifi', label: 'Wi-Fi Networks', icon: Wifi },
    { id: 'email', label: 'Email', icon: Mail },
    { id: 'work', label: 'Work', icon: Briefcase },
  ];

  const renderNavList = () => (
    <div className="p-4 flex-1 space-y-6 overflow-y-auto">
      {/* Primary Views */}
      <div>
        <span className="text-[11px] font-semibold text-[#8493A5] uppercase tracking-wider px-3">
          Vault Navigation
        </span>
        <nav className="mt-2 space-y-1">
          {primaryNavItems.map((item) => {
            const Icon = item.icon;
            const isSelected =
              activeView === item.id &&
              (!item.category || selectedCategory === item.category);

            return (
              <button
                key={`${item.id}-${item.category || 'default'}`}
                id={`nav-${item.id}-${item.category || 'default'}`}
                type="button"
                onClick={() => navigateToView(item.id, item.category)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer min-h-[44px] ${
                  isSelected
                    ? 'bg-[#08BBD4] text-white font-semibold shadow-2xs'
                    : 'text-[#B8C6D8] hover:bg-[#062A63]/70 hover:text-white active:bg-[#062A63]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-white' : 'text-[#B8C6D8]'}`} />
                  <span>{item.label}</span>
                </div>
                {item.count !== undefined && item.count > 0 && (
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-md tabular-nums ${
                      isSelected
                        ? 'bg-[#03152F]/25 text-white font-semibold'
                        : 'bg-[#062A63] text-[#B8C6D8]'
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}

          {/* Advanced Collapsible Submenu */}
          <div className="pt-0.5">
            <button
              id="nav-advanced-toggle"
              type="button"
              onClick={() => setIsAdvancedExpanded(!isAdvancedExpanded)}
              aria-expanded={isAdvancedExpanded}
              aria-controls="nav-advanced-submenu"
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer min-h-[44px] ${
                isAdvancedActive && !isAdvancedExpanded
                  ? 'bg-[#062A63] text-[#08BBD4] border border-[#08BBD4]/40'
                  : 'text-[#B8C6D8] hover:bg-[#062A63]/70 hover:text-white active:bg-[#062A63]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Wrench className={`w-4 h-4 shrink-0 ${isAdvancedActive ? 'text-[#08BBD4]' : 'text-[#B8C6D8]'}`} />
                <span>Advanced</span>
              </div>
              <div className="flex items-center gap-1.5">
                {isAdvancedActive && !isAdvancedExpanded && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#08BBD4]" title="Active tool inside" />
                )}
                <ChevronDown
                  className={`w-4 h-4 text-[#B8C6D8] transition-transform duration-150 ${
                    isAdvancedExpanded ? 'rotate-180 text-white' : ''
                  }`}
                />
              </div>
            </button>

            <AnimatePresence initial={false}>
              {isAdvancedExpanded && (
                <motion.div
                  id="nav-advanced-submenu"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.16, ease: 'easeInOut' }}
                  className="overflow-hidden pl-3 space-y-1 border-l border-[#1D3855] ml-5 my-1"
                >
                  {advancedNavItems.map((item) => {
                    const Icon = item.icon;
                    const isSelected = activeView === item.id;

                    return (
                      <button
                        key={item.id}
                        id={`nav-${item.id}-default`}
                        type="button"
                        onClick={() => navigateToView(item.id)}
                        title={item.fullTitle}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer min-h-[40px] ${
                          isSelected
                            ? 'bg-[#08BBD4] text-white font-semibold shadow-2xs'
                            : 'text-[#B8C6D8] hover:bg-[#062A63]/70 hover:text-white active:bg-[#062A63]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-[#B8C6D8]'}`} />
                          <span>{item.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Settings Nav Item */}
          <button
            id="nav-settings-default"
            type="button"
            onClick={() => navigateToView('settings')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-colors cursor-pointer min-h-[44px] ${
              activeView === 'settings'
                ? 'bg-[#08BBD4] text-white font-semibold shadow-2xs'
                : 'text-[#B8C6D8] hover:bg-[#062A63]/70 hover:text-white active:bg-[#062A63]'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Settings className={`w-4 h-4 shrink-0 ${activeView === 'settings' ? 'text-white' : 'text-[#B8C6D8]'}`} />
              <span>Settings</span>
            </div>
          </button>
        </nav>
      </div>

      {/* Categories Section */}
      <div>
        <div className="flex items-center justify-between px-3">
          <span className="text-[11px] font-semibold text-[#8493A5] uppercase tracking-wider">
            Categories
          </span>
          <button
            onClick={() => {
              setActiveView('categories');
              setIsMobileMenuOpen(false);
            }}
            className="text-[11px] text-[#08BBD4] hover:text-white font-medium transition-colors cursor-pointer min-h-[32px] flex items-center"
          >
            View All
          </button>
        </div>
        <div className="mt-2 space-y-1">
          {categoryShortcuts.map((cat) => {
            const Icon = cat.icon;
            const count = activeRecords.filter((r) => {
              if (cat.id === 'cards') return r.category === 'cards' || r.category === 'card';
              if (cat.id === 'notes') return r.category === 'notes' || r.category === 'note';
              return r.category === cat.id;
            }).length;
            const isSelected = activeView === 'items' && selectedCategory === cat.id;

            return (
              <button
                key={cat.id}
                id={`cat-${cat.id}`}
                onClick={() => navigateToCategory(cat.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer min-h-[40px] ${
                  isSelected
                    ? 'bg-[#08BBD4] text-white font-semibold'
                    : 'text-[#B8C6D8] hover:bg-[#062A63]/70 hover:text-white active:bg-[#062A63]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-[#B8C6D8]'}`} />
                  <span>{cat.label}</span>
                </div>
                {count > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-md tabular-nums ${
                      isSelected ? 'bg-[#03152F]/25 text-white' : 'bg-[#062A63] text-[#B8C6D8]'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:flex w-64 bg-[#03152F] text-[#F5F9FF] flex-col shrink-0 min-h-[calc(100vh-4rem)] border-r border-[#1D3855]">
        {renderNavList()}
      </aside>

      {/* Mobile Drawer (Visible on < lg when isMobileMenuOpen is true) */}
      {isMobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop Overlay */}
          <div
            className="fixed inset-0 bg-[#03152F]/75"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Slide-out Sidebar Panel */}
          <div
            className="relative w-72 max-w-[85vw] bg-[#03152F] text-[#F5F9FF] flex flex-col shadow-xl z-10 h-full border-r border-[#1D3855]"
            role="dialog"
            aria-modal="true"
            aria-label="Sidebar Navigation Menu"
          >
            {/* Drawer Header */}
            <div className="p-4 border-b border-[#1D3855] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#062A63] border border-[#1D3855] text-[#08BBD4] flex items-center justify-center">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-sm text-white tracking-tight">Vault Navigation</span>
                  <p className="text-[10px] text-[#B8C6D8]">Local Encrypted Storage</p>
                </div>
              </div>
              <button
                id="close-mobile-sidebar-btn"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 text-[#B8C6D8] hover:text-white hover:bg-[#062A63] rounded-full transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
                aria-label="Close sidebar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Body */}
            {renderNavList()}
          </div>
        </div>
      )}
    </>
  );
};
