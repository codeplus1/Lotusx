/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useBackHandler } from '../../hooks/useBackHandler';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'lg',
}) => {
  useBackHandler({
    id: `modal-${title || 'common'}`,
    enabled: isOpen,
    priority: 100,
    onBack: onClose,
  });

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const maxWidthClass =
    {
      sm: 'max-w-sm',
      md: 'max-w-md',
      lg: 'max-w-lg',
      xl: 'max-w-xl',
      '2xl': 'max-w-2xl',
    }[maxWidth] || maxWidth;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          id="vault-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16, ease: 'easeOut' }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#03152F]/75 backdrop-blur-xs"
          onClick={onClose}
        >
          <motion.div
            id="vault-modal-card"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 6 }}
            transition={{
              duration: 0.18,
              ease: [0.16, 1, 0.3, 1],
            }}
            className={`w-full ${maxWidthClass} bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] rounded-t-2xl sm:rounded-xl shadow-xl border-t sm:border border-[var(--color-border)] overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[90vh]`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Drag Indicator Handle */}
            <div className="w-12 h-1 rounded-full bg-[var(--color-border)] mx-auto mt-2.5 sm:hidden shrink-0" />

            {/* Header */}
            <div className="flex items-start justify-between px-4 sm:px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
              <div className="min-w-0 pr-2">
                <h3 className="text-base sm:text-lg font-bold text-[var(--color-text-primary)] leading-snug truncate">
                  {title}
                </h3>
                {subtitle && (
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 line-clamp-2">
                    {subtitle}
                  </p>
                )}
              </div>
              <button
                id="modal-close-btn"
                onClick={onClose}
                className="min-h-[44px] min-w-[44px] -mr-2 -mt-1 flex items-center justify-center rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)] transition-colors cursor-pointer shrink-0"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="px-4 sm:px-6 py-4 sm:py-6 overflow-y-auto space-y-4 pb-safe">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
