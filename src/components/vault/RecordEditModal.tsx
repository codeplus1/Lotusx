/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  RefreshCw,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  ShieldCheck,
  QrCode,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { useVault } from '../../context/VaultContext';
import {
  VaultRecord,
  RecordCategory,
  CATEGORY_METADATA,
  CustomField,
} from '../../types/vault';
import { passwordGenerator } from '../../security/PasswordGeneratorService';
import { totpService } from '../../security/TotpService';

interface RecordEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  recordToEdit?: VaultRecord | null;
}

export const RecordEditModal: React.FC<RecordEditModalProps> = ({
  isOpen,
  onClose,
  recordToEdit,
}) => {
  const { addRecord, updateRecord } = useVault();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<RecordCategory>('banking');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [favorite, setFavorite] = useState(false);

  // Banking & Card fields
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [routingOrIfsc, setRoutingOrIfsc] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardPin, setCardPin] = useState('');

  // TOTP Secret
  const [totpSecret, setTotpSecret] = useState('');

  // Custom Fields
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (recordToEdit) {
      setTitle(recordToEdit.title);
      setCategory(recordToEdit.category);
      setUsername(recordToEdit.username || '');
      setEmail(recordToEdit.email || '');
      setPassword(recordToEdit.password || '');
      setUrl(recordToEdit.url || '');
      setNotes(recordToEdit.notes || '');
      setTagsInput(recordToEdit.tags.join(', '));
      setFavorite(recordToEdit.favorite);
      setBankName(recordToEdit.bankName || '');
      setAccountNumber(recordToEdit.accountNumber || '');
      setRoutingOrIfsc(recordToEdit.routingOrIfsc || '');
      setCardNumber(recordToEdit.cardNumber || '');
      setCardExpiry(recordToEdit.cardExpiry || '');
      setCardCvv(recordToEdit.cardCvv || '');
      setCardPin(recordToEdit.cardPin || '');
      setTotpSecret(recordToEdit.totpSecret || '');
      setCustomFields(recordToEdit.customFields || []);
    } else {
      setTitle('');
      setCategory('social');
      setUsername('');
      setEmail('');
      setPassword('');
      setUrl('');
      setNotes('');
      setTagsInput('');
      setFavorite(false);
      setBankName('');
      setAccountNumber('');
      setRoutingOrIfsc('');
      setCardNumber('');
      setCardExpiry('');
      setCardCvv('');
      setCardPin('');
      setTotpSecret('');
      setCustomFields([]);
    }
    setShowPassword(false);
  }, [recordToEdit, isOpen]);

  const handleQuickGeneratePassword = () => {
    const generated = passwordGenerator.generatePassword({
      length: 20,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true,
      excludeAmbiguous: false,
    });
    setPassword(generated);
    setShowPassword(true);
  };

  const handleAddCustomField = () => {
    setCustomFields([
      ...customFields,
      {
        id: crypto.randomUUID(),
        label: '',
        value: '',
        isHidden: true,
      },
    ]);
  };

  const handleUpdateCustomField = (id: string, patch: Partial<CustomField>) => {
    setCustomFields(customFields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const handleRemoveCustomField = (id: string) => {
    setCustomFields(customFields.filter((f) => f.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSaving) return;

    setIsSaving(true);
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);

      const cleanCustomFields = customFields.filter((f) => f.label.trim() !== '');

      const payload = {
        title: title.trim(),
        category,
        username: username.trim() || undefined,
        email: email.trim() || undefined,
        password: password || undefined,
        url: url.trim() || undefined,
        notes: notes.trim() || undefined,
        tags,
        favorite,
        bankName: bankName.trim() || undefined,
        accountNumber: accountNumber.trim() || undefined,
        routingOrIfsc: routingOrIfsc.trim() || undefined,
        cardNumber: cardNumber.trim() || undefined,
        cardExpiry: cardExpiry.trim() || undefined,
        cardCvv: cardCvv.trim() || undefined,
        cardPin: cardPin.trim() || undefined,
        totpSecret: totpSecret.trim() || undefined,
        customFields: cleanCustomFields,
      };

      if (recordToEdit) {
        await updateRecord(recordToEdit.id, payload);
      } else {
        await addRecord(payload);
      }

      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const strength = passwordGenerator.evaluateStrength(password);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={recordToEdit ? 'Edit Encrypted Credential' : 'Add New Encrypted Credential'}
      subtitle="Data is encrypted locally with AES-256-GCM before saving to IndexedDB"
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Title & Category Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-text-primary mb-1.5">
              Title / Service Name *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Chase Bank, GitHub Production, AWS Root"
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-surface text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1.5">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as RecordCategory)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
            >
              {(Object.keys(CATEGORY_METADATA) as RecordCategory[]).map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_METADATA[cat].label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Standard Login Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1.5">
              Username / Login ID
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g., alex_sec_ops"
              className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g., alex@company.com"
              className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        </div>

        {/* Password Field with Built-in CSPRNG Generator */}
        <div className="space-y-2 p-4 rounded-xl bg-bg-secondary border border-border">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-primary" />
              Password / Secret Key
            </label>
            <button
              type="button"
              onClick={handleQuickGeneratePassword}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-dark cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Generate Strong 20-Char Secret
            </button>
          </div>

          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter or generate password..."
              className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-border bg-bg-surface text-text-primary placeholder:text-text-muted text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {password.length > 0 && (
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-text-secondary">
                Entropy: <strong className="font-mono text-text-primary">{strength.entropyBits} bits</strong>
              </span>
              <span className="font-semibold" style={{ color: strength.color }}>
                {strength.label} ({strength.estimatedCrackTime})
              </span>
            </div>
          )}
        </div>

        {/* Authenticator (TOTP 2FA) Secret Input */}
        <div className="space-y-2 p-4 rounded-xl bg-bg-secondary border border-border">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
              <QrCode className="w-3.5 h-3.5 text-primary" />
              Authenticator Key (TOTP 2FA Secret / otpauth:// URI)
            </label>
            {totpSecret.trim().length > 0 && (
              totpService.isValidSecret(totpSecret) ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Valid Base32 Key
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-error">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Invalid Base32 Secret
                </span>
              )
            )}
          </div>

          <input
            type="text"
            value={totpSecret}
            onChange={(e) => setTotpSecret(e.target.value)}
            placeholder="e.g., JBSWY3DPEHPK3PXP or otpauth://totp/..."
            className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary placeholder:text-text-muted text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
          <p className="text-[11px] text-text-secondary">
            Generates live 6-digit 2FA verification codes every 30 seconds directly inside LotusX.
          </p>
        </div>

        {/* Category-Specific Fields: Banking */}
        {category === 'banking' && (
          <div className="p-4 rounded-xl bg-secondary/5 dark:bg-bg-secondary border border-border space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
              Banking & Wire Details
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                  Bank Institution
                </label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Chase / HDFC / HSBC"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                  Account Number
                </label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="000012345678"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                  Routing / IFSC / SWIFT
                </label>
                <input
                  type="text"
                  value={routingOrIfsc}
                  onChange={(e) => setRoutingOrIfsc(e.target.value)}
                  placeholder="CHASUS33 / 021000021"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* Category-Specific Fields: Payment Card */}
        {(category === 'card' || category === 'banking') && (
          <div className="p-4 rounded-xl bg-bg-secondary border border-border space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-primary">
              Payment Card Credentials
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                  Card Number
                </label>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value)}
                  placeholder="4532 •••• •••• 8891"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                  Expiry (MM/YY)
                </label>
                <input
                  type="text"
                  value={cardExpiry}
                  onChange={(e) => setCardExpiry(e.target.value)}
                  placeholder="09/28"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                    CVV
                  </label>
                  <input
                    type="password"
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value)}
                    placeholder="•••"
                    className="w-full px-2.5 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                    PIN
                  </label>
                  <input
                    type="password"
                    value={cardPin}
                    onChange={(e) => setCardPin(e.target.value)}
                    placeholder="••••"
                    className="w-full px-2.5 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Website URL & Tags */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1.5">
              Website / Login URL
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1.5">
              Tags (comma separated)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="finance, 2fa, production"
              className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        </div>

        {/* Custom Encrypted Fields */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-text-primary">
              Custom Encrypted Attributes
            </label>
            <button
              type="button"
              onClick={handleAddCustomField}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-dark cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Custom Field
            </button>
          </div>

          {customFields.map((field) => (
            <div key={field.id} className="flex items-center gap-2">
              <input
                type="text"
                value={field.label}
                onChange={(e) => handleUpdateCustomField(field.id, { label: e.target.value })}
                placeholder="Field name (e.g. Recovery Code)"
                className="w-1/3 px-3 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs"
              />
              <input
                type={field.isHidden ? 'password' : 'text'}
                value={field.value}
                onChange={(e) => handleUpdateCustomField(field.id, { value: e.target.value })}
                placeholder="Secret value..."
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs font-mono"
              />
              <label className="flex items-center gap-1 text-xs text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={field.isHidden}
                  onChange={(e) => handleUpdateCustomField(field.id, { isHidden: e.target.checked })}
                  className="rounded border-border text-primary"
                />
                Mask
              </label>
              <button
                type="button"
                onClick={() => handleRemoveCustomField(field.id)}
                className="p-2 text-text-muted hover:text-error cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Encrypted Notes */}
        <div>
          <label className="block text-xs font-semibold text-text-primary mb-1.5">
            Encrypted Notes / Recovery Backup Codes
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Store recovery phrases, security questions, or SSH keys..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-surface text-text-primary placeholder:text-text-muted text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
          />
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-border flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={favorite}
              onChange={(e) => setFavorite(e.target.checked)}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-xs font-medium text-text-primary">Pin to Starred Favorites</span>
          </label>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-border text-xs font-semibold text-text-secondary hover:bg-bg-secondary cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || isSaving}
              className="btn-primary px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-xs"
            >
              <ShieldCheck className="w-4 h-4" />
              {isSaving ? 'Encrypting...' : recordToEdit ? 'Save Changes' : 'Encrypt & Save'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
