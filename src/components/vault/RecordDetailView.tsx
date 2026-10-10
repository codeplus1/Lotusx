/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Copy,
  Check,
  Eye,
  EyeOff,
  Edit3,
  Trash2,
  RotateCcw,
  ExternalLink,
  Calendar,
  History,
  Shield,
  QrCode,
  Sparkles,
  Plus,
  X,
  CreditCard,
  Building2,
  User,
  Mail,
  KeyRound,
  Hash,
  FileText,
  Lock,
  ChevronDown,
  ChevronUp,
  Wifi,
  UserCheck,
  Globe,
  MapPin,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { CustomField } from '../../types/vault';
import { passwordGenerator } from '../../security/PasswordGeneratorService';
import { PasswordHealthService } from '../../security/PasswordHealthService';
import { totpService } from '../../security/TotpService';

interface DetailRowProps {
  label: string;
  value?: string;
  fieldId: string;
  isSecret?: boolean;
  isMono?: boolean;
  isUrl?: boolean;
  icon?: React.ReactNode;
  revealedFields: Record<string, boolean>;
  onToggleReveal: (fieldId: string) => void;
  copiedFieldLabel: string | null;
  onCopy: (text: string, label: string) => void;
  extraBadge?: React.ReactNode;
  subContent?: React.ReactNode;
}

const DetailRow: React.FC<DetailRowProps> = ({
  label,
  value,
  fieldId,
  isSecret = false,
  isMono = false,
  isUrl = false,
  icon,
  revealedFields,
  onToggleReveal,
  copiedFieldLabel,
  onCopy,
  extraBadge,
  subContent,
}) => {
  if (!value) return null;

  const isRevealed = !isSecret || !!revealedFields[fieldId];
  const isCopied = copiedFieldLabel === fieldId;

  const getMaskedValue = (val: string) => {
    if (fieldId === 'cardNumber' && val.replace(/\s+/g, '').length >= 12) {
      const clean = val.replace(/\s+/g, '');
      return `•••• •••• •••• ${clean.slice(-4)}`;
    }
    return '••••••••••••••••';
  };

  return (
    <div className="p-4 rounded-xl bg-bg-app border border-border hover:border-primary/40 transition-all group">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1.5">
            <div className="flex items-center gap-2">
              {icon && <span className="text-text-secondary shrink-0">{icon}</span>}
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                {label}
              </span>
            </div>
            {extraBadge && <div className="mt-1">{extraBadge}</div>}
          </div>

          <div
            className={`text-sm text-text-primary break-all leading-relaxed ${
              isMono || isSecret ? 'font-mono tracking-wide' : 'font-medium'
            }`}
          >
            {isRevealed ? value : getMaskedValue(value)}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isSecret && (
            <button
              type="button"
              onClick={() => onToggleReveal(fieldId)}
              className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-surface border border-transparent hover:border-border transition-all cursor-pointer"
              title={isRevealed ? 'Hide secret' : 'Reveal secret'}
            >
              {isRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}

          {isUrl && (
            <a
              href={value.startsWith('http') ? value : `https://${value}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg text-text-secondary hover:text-primary hover:bg-bg-surface border border-transparent hover:border-border transition-all"
              title="Open website in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}

          <button
            type="button"
            onClick={() => onCopy(value, fieldId)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              isCopied
                ? 'bg-success text-white shadow-2xs'
                : 'bg-bg-surface hover:bg-bg-secondary text-text-primary border border-border'
            }`}
          >
            {isCopied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {subContent && <div className="mt-3 pt-3 border-t border-border">{subContent}</div>}
    </div>
  );
};

export const RecordDetailView: React.FC = () => {
  const {
    selectedRecord,
    setEditingRecord,
    updateRecord,
    softDeleteRecord,
    restoreRecord,
    permanentlyDeleteRecord,
    copyToClipboard,
    copiedFieldLabel,
  } = useVault();

  const [revealedFields, setRevealedFields] = useState<Record<string, boolean>>({});
  const [showHistory, setShowHistory] = useState(false);
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState(false);

  // Quick inline custom field creation state
  const [isAddingCustomField, setIsAddingCustomField] = useState(false);
  const [newCustomLabel, setNewCustomLabel] = useState('');
  const [newCustomValue, setNewCustomValue] = useState('');
  const [newCustomIsHidden, setNewCustomIsHidden] = useState(true);
  const [isSavingCustomField, setIsSavingCustomField] = useState(false);

  // Live TOTP 2FA state
  const [totpCode, setTotpCode] = useState<string | null>(null);
  const [totpRemaining, setTotpRemaining] = useState<number>(30);

  // Inline TOTP Setup state
  const [isSettingUpTotp, setIsSettingUpTotp] = useState(false);
  const [totpInput, setTotpInput] = useState('');
  const [totpSetupError, setTotpSetupError] = useState<string | null>(null);
  const [isSavingTotp, setIsSavingTotp] = useState(false);

  const toggleFieldReveal = useCallback((fieldId: string) => {
    setRevealedFields((prev) => ({ ...prev, [fieldId]: !prev[fieldId] }));
  }, []);

  // Reset local state when switching records
  useEffect(() => {
    setRevealedFields({});
    setShowHistory(false);
    setConfirmPermanentDelete(false);
    setIsAddingCustomField(false);
    setNewCustomLabel('');
    setNewCustomValue('');
    setNewCustomIsHidden(true);
    setIsSettingUpTotp(false);
    setTotpInput('');
    setTotpSetupError(null);
  }, [selectedRecord?.id]);

  // Refresh TOTP every second if record has totpSecret
  useEffect(() => {
    const rawSecret = selectedRecord?.totpSecret?.trim();
    if (!rawSecret) {
      setTotpCode(null);
      return;
    }

    let isMounted = true;
    const updateTotp = async () => {
      const snap = await totpService.generateTotp(rawSecret);
      if (isMounted) {
        if (snap) {
          setTotpCode(snap.code);
          setTotpRemaining(snap.remainingSeconds);
        } else {
          setTotpCode(null);
        }
      }
    };

    updateTotp();
    const interval = setInterval(updateTotp, 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedRecord?.id, selectedRecord?.totpSecret]);

  if (!selectedRecord) return null;

  const strength = selectedRecord.password
    ? passwordGenerator.evaluateStrength(selectedRecord.password)
    : null;

  const lastUpdatedTimestamp = selectedRecord.updatedAt || selectedRecord.createdAt;
  const credentialAgeMs = Math.max(0, Date.now() - lastUpdatedTimestamp);
  const credentialAgeDays = Math.floor(credentialAgeMs / (1000 * 60 * 60 * 24));
  const isOverNinetyDays = credentialAgeMs > PasswordHealthService.NINETY_DAYS_MS;
  const isOverOneYear = credentialAgeMs > PasswordHealthService.ONE_YEAR_MS;

  const formatCredentialAge = (days: number): string => {
    if (days <= 0) return 'Today (< 1 day old)';
    if (days === 1) return '1 day old';
    if (days >= 365) {
      const years = Math.floor(days / 365);
      const remainingDays = days % 365;
      return remainingDays > 0
        ? `${days} days old (${years}y ${remainingDays}d)`
        : `${days} days old (${years} ${years === 1 ? 'year' : 'years'})`;
    }
    return `${days} days old`;
  };

  const credentialAgeLabel = formatCredentialAge(credentialAgeDays);
  const hasSecretOrPassword = Boolean(
    selectedRecord.password ||
      selectedRecord.wifiDetails?.password ||
      selectedRecord.pin ||
      selectedRecord.cardPin ||
      selectedRecord.cardDetails?.pin
  );

  const handleQuickAddCustomField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomLabel.trim() || isSavingCustomField) return;

    setIsSavingCustomField(true);
    try {
      const fieldToAdd: CustomField = {
        id: crypto.randomUUID(),
        label: newCustomLabel.trim(),
        value: newCustomValue,
        isHidden: newCustomIsHidden,
      };

      const updatedFields = [...(selectedRecord.customFields || []), fieldToAdd];
      await updateRecord(selectedRecord.id, { customFields: updatedFields });

      setNewCustomLabel('');
      setNewCustomValue('');
      setNewCustomIsHidden(true);
      setIsAddingCustomField(false);
    } finally {
      setIsSavingCustomField(false);
    }
  };

  const handleDeleteCustomField = async (fieldId: string) => {
    const updatedFields = (selectedRecord.customFields || []).filter((f) => f.id !== fieldId);
    await updateRecord(selectedRecord.id, { customFields: updatedFields });
  };

  const handleSaveInlineTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = totpInput.trim();
    if (!trimmed || isSavingTotp) return;

    if (!totpService.isValidSecret(trimmed)) {
      setTotpSetupError(
        'Invalid Base32 Secret Key or otpauth:// URI. Ensure it contains valid Base32 characters (A-Z, 2-7).'
      );
      return;
    }

    setIsSavingTotp(true);
    setTotpSetupError(null);
    try {
      await updateRecord(selectedRecord.id, { totpSecret: trimmed });
      setIsSettingUpTotp(false);
      setTotpInput('');
    } finally {
      setIsSavingTotp(false);
    }
  };

  const handleRemoveTotp = async () => {
    await updateRecord(selectedRecord.id, { totpSecret: undefined });
  };

  const handleGenerateRandomCustomSecret = () => {
    const generated = passwordGenerator.generatePassword({
      length: 16,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true,
      excludeAmbiguous: false,
    });
    setNewCustomValue(generated);
  };

  const isWifiCategory = selectedRecord.category === 'wifi';
  const isIdentityCategory = selectedRecord.category === 'identity';

  const hasPrimaryCredentials = Boolean(
    !isWifiCategory &&
      !isIdentityCategory &&
      (selectedRecord.username ||
        selectedRecord.email ||
        selectedRecord.password ||
        selectedRecord.url)
  );

  const bd = selectedRecord.bankDetails;
  const hasBankingDetails = Boolean(
    selectedRecord.bankName ||
      bd?.bankName ||
      selectedRecord.accountNumber ||
      bd?.accountNumber ||
      selectedRecord.routingOrIfsc ||
      bd?.branchCode ||
      bd?.swiftBic ||
      bd?.iban
  );

  const cd = selectedRecord.cardDetails;
  const hasCardDetails = Boolean(
    selectedRecord.cardNumber ||
      cd?.cardNumber ||
      selectedRecord.cardExpiry ||
      selectedRecord.cardCvv ||
      selectedRecord.cardPin ||
      selectedRecord.cardholderName ||
      cd?.cardholderName
  );

  const idDet = selectedRecord.identityDetails;
  const hasIdentityDetails = Boolean(
    isIdentityCategory ||
      idDet?.fullName ||
      idDet?.documentNumber ||
      idDet?.passportNumber ||
      idDet?.idNumber
  );

  const wd = selectedRecord.wifiDetails;
  const hasWifiDetails = Boolean(
    isWifiCategory || wd?.ssid || wd?.password
  );

  const customFieldsList = selectedRecord.customFields || [];

  return (
    <div
      key={selectedRecord.id}
      className="bg-bg-surface rounded-xl border border-border shadow-xs overflow-hidden"
    >
      {/* Main Details Content */}
      <div className="p-4 sm:p-6 space-y-6">
        {/* 90-Day Credential Rotation Alert Banner */}
        {isOverNinetyDays && !selectedRecord.deletedAt && (
          <div
            role="alert"
            className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              isOverOneYear
                ? 'bg-error/10 border-error/30 text-error'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                  isOverOneYear
                    ? 'bg-error/15 text-error'
                    : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-xs font-bold tracking-wide uppercase">
                    {isOverOneYear
                      ? 'Critical Credential Age Alert (> 1 Year)'
                      : 'Password Rotation Alert (> 90 Days)'}
                  </h4>
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                      isOverOneYear
                        ? 'bg-error/20 text-error'
                        : 'bg-amber-500/20 text-amber-800 dark:text-amber-200'
                    }`}
                  >
                    {credentialAgeDays} days since update
                  </span>
                </div>
                <p className="text-xs opacity-90 leading-relaxed">
                  This saved credential has not been updated in{' '}
                  <span className="font-semibold">{credentialAgeDays} days</span> (last updated on{' '}
                  {new Date(lastUpdatedTimestamp).toLocaleDateString()}). Rotating credentials
                  every 90 days helps reduce exposure from potential data breaches.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setEditingRecord(selectedRecord)}
              className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                isOverOneYear
                  ? 'bg-error text-white hover:opacity-90'
                  : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Rotate Now</span>
            </button>
          </div>
        )}

        {/* 1. Primary Login & Authentication Section */}
        {hasPrimaryCredentials && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-primary" />
              Login Credentials
            </h3>

            <div className="space-y-2.5">
              <DetailRow
                label="Username / Login ID"
                value={selectedRecord.username}
                fieldId="username"
                icon={<User className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />

              <DetailRow
                label="Email Address"
                value={selectedRecord.email}
                fieldId="email"
                icon={<Mail className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />

              <DetailRow
                label="Password"
                value={selectedRecord.password}
                fieldId="password"
                isSecret={true}
                isMono={true}
                icon={<KeyRound className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
                extraBadge={
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      isOverOneYear
                        ? 'bg-error/15 text-error border border-error/30'
                        : isOverNinetyDays
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                        : 'bg-success/15 text-success border border-success/30'
                    }`}
                    title={`Last updated ${new Date(lastUpdatedTimestamp).toLocaleString()}`}
                  >
                    <Clock className="w-2.5 h-2.5" />
                    <span>{credentialAgeLabel}</span>
                  </span>
                }
                subContent={
                  strength ? (
                    <div className="space-y-2">
                      <div className="h-1.5 w-full bg-bg-secondary rounded-full overflow-hidden flex gap-1">
                        {[0, 1, 2, 3].map((idx) => (
                          <div
                            key={idx}
                            className="h-full flex-1 rounded-full transition-all"
                            style={{
                              backgroundColor:
                                idx < strength.score ? strength.color : 'var(--color-border)',
                            }}
                          />
                        ))}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted">
                        <span>
                          Estimated offline crack resistance:{' '}
                          <span className="font-mono font-semibold text-text-secondary">
                            {strength.estimatedCrackTime}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono text-text-secondary">
                          <Clock className="w-3 h-3 text-text-muted" />
                          Password age: {credentialAgeLabel}
                          {isOverNinetyDays ? ' (Rotation recommended)' : ''}
                        </span>
                      </div>
                    </div>
                  ) : undefined
                }
              />

              <DetailRow
                label="Website"
                value={selectedRecord.url}
                fieldId="url"
                icon={<ExternalLink className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />
            </div>
          </div>
        )}

        {/* 2. Live TOTP 2FA Authenticator Code */}
        {selectedRecord.totpSecret ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5 text-primary" />
                2FA
              </h3>
              {!selectedRecord.deletedAt && (
                <button
                  type="button"
                  onClick={handleRemoveTotp}
                  className="text-[11px] font-medium text-text-muted hover:text-error transition-colors cursor-pointer"
                >
                  Remove 2FA Key
                </button>
              )}
            </div>

            {totpCode ? (
              <div className="p-4 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                      Verification Code (RFC 6238)
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold ${
                        totpRemaining <= 5
                          ? 'bg-error/15 text-error animate-pulse'
                          : 'bg-bg-surface text-text-secondary border border-border'
                      }`}
                    >
                      Refreshes in {totpRemaining}s
                    </span>
                  </div>

                  <div className="text-2xl sm:text-3xl font-mono font-extrabold tracking-[0.22em] text-text-primary">
                    {totpCode.slice(0, 3)} {totpCode.slice(3)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => copyToClipboard(totpCode, 'totpCode')}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs ${
                    copiedFieldLabel === 'totpCode'
                      ? 'bg-success text-white'
                      : 'btn-primary'
                  }`}
                >
                  {copiedFieldLabel === 'totpCode' ? (
                    <>
                      <Check className="w-4 h-4" />
                      Copied 2FA
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Code
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-error/10 border border-error/25 text-xs text-error flex items-center justify-between">
                <span>Invalid TOTP Secret format. Please check the Base32 key.</span>
                <button
                  type="button"
                  onClick={() => {
                    setTotpInput(selectedRecord.totpSecret || '');
                    setIsSettingUpTotp(true);
                  }}
                  className="underline font-semibold cursor-pointer"
                >
                  Fix Key
                </button>
              </div>
            )}
          </div>
        ) : (
          !selectedRecord.deletedAt && (
            <div className="space-y-2.5">
              {!isSettingUpTotp ? (
                <div className="p-3.5 rounded-xl border border-dashed border-border bg-bg-app/50 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <QrCode className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-text-primary">
                        2FA
                      </h4>
                      <p className="text-[11px] text-text-secondary">
                        Generate 6-digit verification codes.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSettingUpTotp(true)}
                    className="btn-outline px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    + Setup 2FA
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={handleSaveInlineTotp}
                  className="p-4 rounded-xl bg-bg-secondary border border-border space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                      <QrCode className="w-3.5 h-3.5 text-primary" />
                      Configure TOTP Authenticator Key
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSettingUpTotp(false);
                        setTotpSetupError(null);
                      }}
                      className="text-text-muted hover:text-text-primary cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div>
                    <input
                      type="text"
                      value={totpInput}
                      onChange={(e) => {
                        setTotpInput(e.target.value);
                        setTotpSetupError(null);
                      }}
                      placeholder="Paste Base32 secret (e.g. JBSWY3DPEHPK3PXP) or otpauth:// URI"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs font-mono focus:outline-none focus:border-primary"
                      autoFocus
                      required
                    />
                    {totpSetupError && (
                      <p className="text-[11px] text-error mt-1">{totpSetupError}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsSettingUpTotp(false)}
                      className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-text-secondary hover:bg-bg-surface cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!totpInput.trim() || isSavingTotp}
                      className="btn-primary px-4 py-1.5 rounded-lg text-xs cursor-pointer disabled:opacity-50"
                    >
                      {isSavingTotp ? 'Saving...' : 'Activate 2FA Generator'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )
        )}

        {/* 3. Banking & Wire Transfer Details */}
        {hasBankingDetails && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-primary" />
              Banking &amp; Account Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <DetailRow
                label="Bank Name"
                value={bd?.bankName || selectedRecord.bankName}
                fieldId="bankName"
                icon={<Building2 className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />

              <DetailRow
                label="Account Holder Name"
                value={bd?.accountHolderName || selectedRecord.accountHolderName}
                fieldId="accountHolderName"
                icon={<User className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />

              <DetailRow
                label="Account Type"
                value={bd?.accountType || selectedRecord.accountType}
                fieldId="accountType"
                icon={<Building2 className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />

              <DetailRow
                label="Account Number"
                value={bd?.accountNumber || selectedRecord.accountNumber}
                fieldId="accountNumber"
                isSecret={true}
                isMono={true}
                icon={<Hash className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />

              <DetailRow
                label="Branch Name"
                value={bd?.branchName || selectedRecord.branchName}
                fieldId="branchName"
                icon={<Building2 className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />

              <DetailRow
                label="Branch Code / Routing / IFSC"
                value={bd?.branchCode || selectedRecord.branchCode || selectedRecord.routingOrIfsc}
                fieldId="routingOrIfsc"
                isMono={true}
                icon={<Building2 className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />

              <DetailRow
                label="SWIFT / BIC Code"
                value={bd?.swiftBic || selectedRecord.swiftBic}
                fieldId="swiftBic"
                isMono={true}
                icon={<Globe className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />

              <DetailRow
                label="IBAN"
                value={bd?.iban || selectedRecord.iban}
                fieldId="iban"
                isSecret={true}
                isMono={true}
                icon={<Globe className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />
            </div>
          </div>
        )}

        {/* 4. Payment Card Details */}
        {hasCardDetails && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-primary" />
              Payment Card Credentials
            </h3>

            {/* Interactive Visual Card Banner (Dark Navy & Deep Navy) */}
            {(selectedRecord.cardNumber || cd?.cardNumber) && (
              <div className="p-5 rounded-xl bg-gradient-to-br from-[#03152F] via-[#062A63] to-[#03152F] text-white shadow-sm border border-[#1D3855] space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono uppercase tracking-widest text-[#B8C6D8]">
                    {cd?.issuingBank ||
                      selectedRecord.issuingBank ||
                      selectedRecord.bankName ||
                      selectedRecord.title}
                  </span>
                  <span className="text-[11px] font-mono font-bold text-[#08BBD4]">
                    {cd?.cardNetwork || selectedRecord.cardNetwork || 'CARD'}
                    {(cd?.cardKind || selectedRecord.cardKind)
                      ? ` • ${cd?.cardKind || selectedRecord.cardKind}`
                      : ''}
                  </span>
                </div>

                <div className="font-mono text-lg sm:text-xl tracking-widest font-semibold text-white">
                  {revealedFields['cardNumber']
                    ? selectedRecord.cardNumber || cd?.cardNumber
                    : `•••• •••• •••• ${(selectedRecord.cardNumber || cd?.cardNumber || '')
                        .replace(/\s+/g, '')
                        .slice(-4)}`}
                </div>

                <div className="flex items-center justify-between text-xs text-[#B8C6D8] font-mono pt-1">
                  <div>
                    <span className="block text-[9px] uppercase text-[#8493A5]">CARDHOLDER</span>
                    <span className="truncate max-w-[140px] inline-block">
                      {cd?.cardholderName || selectedRecord.cardholderName || '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[9px] uppercase text-[#8493A5]">EXPIRES</span>
                    <span>{selectedRecord.cardExpiry || '••/••'}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] uppercase text-[#8493A5]">CVV</span>
                    <span>
                      {revealedFields['cardCvv']
                        ? selectedRecord.cardCvv || cd?.cvv || '—'
                        : '•••'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <DetailRow
                label="Cardholder Name"
                value={cd?.cardholderName || selectedRecord.cardholderName}
                fieldId="cardholderName"
                icon={<User className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />

              <DetailRow
                label="Card Type & Network"
                value={
                  [cd?.cardKind || selectedRecord.cardKind, cd?.cardNetwork || selectedRecord.cardNetwork]
                    .filter(Boolean)
                    .join(' • ') || undefined
                }
                fieldId="cardNetwork"
                icon={<CreditCard className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />

              <div className="sm:col-span-2">
                <DetailRow
                  label="Card Number"
                  value={selectedRecord.cardNumber || cd?.cardNumber}
                  fieldId="cardNumber"
                  isSecret={true}
                  isMono={true}
                  icon={<CreditCard className="w-3.5 h-3.5" />}
                  revealedFields={revealedFields}
                  onToggleReveal={toggleFieldReveal}
                  copiedFieldLabel={copiedFieldLabel}
                  onCopy={copyToClipboard}
                />
              </div>

              <DetailRow
                label="Expiration Date (MM/YY)"
                value={selectedRecord.cardExpiry}
                fieldId="cardExpiry"
                isMono={true}
                icon={<Calendar className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />

              <DetailRow
                label="Card Security Code (CVV / CVC)"
                value={selectedRecord.cardCvv || cd?.cvv}
                fieldId="cardCvv"
                isSecret={true}
                isMono={true}
                icon={<Shield className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />

              <DetailRow
                label="ATM / Card PIN"
                value={selectedRecord.cardPin || cd?.pin}
                fieldId="cardPin"
                isSecret={true}
                isMono={true}
                icon={<Lock className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />

              <DetailRow
                label="Issuing Bank"
                value={cd?.issuingBank || selectedRecord.issuingBank}
                fieldId="issuingBank"
                icon={<Building2 className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />

              <div className="sm:col-span-2">
                <DetailRow
                  label="Billing Address"
                  value={cd?.billingAddress || selectedRecord.billingAddress}
                  fieldId="billingAddress"
                  icon={<MapPin className="w-3.5 h-3.5" />}
                  revealedFields={revealedFields}
                  onToggleReveal={toggleFieldReveal}
                  copiedFieldLabel={copiedFieldLabel}
                  onCopy={copyToClipboard}
                />
              </div>
            </div>
          </div>
        )}

        {/* 4B. Personal Identity Details */}
        {hasIdentityDetails && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-primary" />
              Identity Document Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <DetailRow
                label="Full Name"
                value={idDet?.fullName || selectedRecord.username}
                fieldId="identityFullName"
                icon={<User className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />

              <DetailRow
                label="Document Type"
                value={idDet?.documentType}
                fieldId="identityDocType"
                icon={<UserCheck className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />

              <DetailRow
                label="Document Number"
                value={idDet?.documentNumber || idDet?.passportNumber || idDet?.idNumber}
                fieldId="identityDocNumber"
                isSecret={true}
                isMono={true}
                icon={<Hash className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />

              <DetailRow
                label="Issuing Country / Authority"
                value={idDet?.issuingCountry}
                fieldId="identityCountry"
                icon={<Globe className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />

              <DetailRow
                label="Date of Birth"
                value={idDet?.dateOfBirth}
                fieldId="identityDob"
                isMono={true}
                icon={<Calendar className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />

              <DetailRow
                label="Issue & Expiry Date"
                value={
                  [
                    idDet?.issueDate ? `Issued: ${idDet.issueDate}` : '',
                    idDet?.expiryDate ? `Expires: ${idDet.expiryDate}` : '',
                  ]
                    .filter(Boolean)
                    .join(' • ') || undefined
                }
                fieldId="identityDates"
                isMono={true}
                icon={<Calendar className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />
            </div>
          </div>
        )}

        {/* 4C. Wi-Fi Network Details */}
        {hasWifiDetails && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-primary" />
              Wi-Fi Network Configuration
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <DetailRow
                label="Network Name (SSID)"
                value={wd?.ssid || selectedRecord.username}
                fieldId="wifiSsid"
                isMono={true}
                icon={<Wifi className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />

              <DetailRow
                label="Security Type"
                value={
                  wd?.securityType
                    ? `${wd.securityType}${wd.hiddenNetwork ? ' (Hidden SSID)' : ''}`
                    : undefined
                }
                fieldId="wifiSecurity"
                icon={<Shield className="w-3.5 h-3.5" />}
                revealedFields={revealedFields}
                onToggleReveal={toggleFieldReveal}
                copiedFieldLabel={copiedFieldLabel}
                onCopy={copyToClipboard}
              />

              <div className="sm:col-span-2">
                <DetailRow
                  label="Wi-Fi Password"
                  value={wd?.password || selectedRecord.password}
                  fieldId="wifiPassword"
                  isSecret={true}
                  isMono={true}
                  icon={<KeyRound className="w-3.5 h-3.5" />}
                  revealedFields={revealedFields}
                  onToggleReveal={toggleFieldReveal}
                  copiedFieldLabel={copiedFieldLabel}
                  onCopy={copyToClipboard}
                  extraBadge={
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        isOverOneYear
                          ? 'bg-error/15 text-error border border-error/30'
                          : isOverNinetyDays
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                          : 'bg-success/15 text-success border border-success/30'
                      }`}
                    >
                      <Clock className="w-2.5 h-2.5" />
                      <span>{credentialAgeLabel}</span>
                    </span>
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* 5. Custom Encrypted Attributes Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5 min-w-0 truncate">
              <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="truncate">Custom Encrypted Fields ({customFieldsList.length})</span>
            </h3>

            {!selectedRecord.deletedAt && !isAddingCustomField && (
              <button
                type="button"
                onClick={() => setIsAddingCustomField(true)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary-dark cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3 h-3 shrink-0" />
                <span>Add Custom Field</span>
              </button>
            )}
          </div>

          {/* Quick Inline Add Custom Field Form */}
          {isAddingCustomField && (
            <form
              onSubmit={handleQuickAddCustomField}
              className="p-4 rounded-xl bg-bg-secondary border border-border space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-primary">
                  New Encrypted Custom Attribute
                </span>
                <button
                  type="button"
                  onClick={() => setIsAddingCustomField(false)}
                  className="text-text-muted hover:text-text-primary cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                    Field Label *
                  </label>
                  <input
                    type="text"
                    value={newCustomLabel}
                    onChange={(e) => setNewCustomLabel(e.target.value)}
                    placeholder="e.g., Security Question, SSH Passphrase"
                    className="w-full px-3 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs focus:outline-none focus:border-primary"
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-text-secondary">
                      Field Value *
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateRandomCustomSecret}
                      className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
                    >
                      Generate Random
                    </button>
                  </div>
                  <input
                    type={newCustomIsHidden ? 'password' : 'text'}
                    value={newCustomValue}
                    onChange={(e) => setNewCustomValue(e.target.value)}
                    placeholder="Enter value..."
                    className="w-full px-3 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs font-mono focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newCustomIsHidden}
                    onChange={(e) => setNewCustomIsHidden(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary"
                  />
                  <span>Mask value as secret (hidden by default)</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingCustomField(false)}
                    className="px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-text-secondary hover:bg-bg-surface cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newCustomLabel.trim() || isSavingCustomField}
                    className="btn-primary px-3.5 py-1.5 rounded-lg text-xs cursor-pointer disabled:opacity-50"
                  >
                    {isSavingCustomField ? 'Encrypting...' : 'Save Field'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {customFieldsList.length === 0 && !isAddingCustomField ? (
            <div className="p-4 rounded-xl border border-dashed border-border text-center">
              <p className="text-xs text-text-muted">
                No custom attributes stored for this credential.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {customFieldsList.map((cf) => (
                <DetailRow
                  key={cf.id}
                  label={cf.label}
                  value={cf.value}
                  fieldId={`custom-${cf.id}`}
                  isSecret={cf.isHidden}
                  isMono={cf.isHidden}
                  revealedFields={revealedFields}
                  onToggleReveal={toggleFieldReveal}
                  copiedFieldLabel={copiedFieldLabel}
                  onCopy={copyToClipboard}
                  extraBadge={
                    !selectedRecord.deletedAt ? (
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomField(cf.id)}
                        className="opacity-0 group-hover:opacity-100 text-[10px] text-text-muted hover:text-error transition-opacity ml-auto cursor-pointer"
                        title="Remove custom field"
                      >
                        Remove
                      </button>
                    ) : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* 6. Encrypted Notes Section */}
        {selectedRecord.notes && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-primary" />
                Encrypted Notes & Backup Codes
              </h3>
              <button
                type="button"
                onClick={() => copyToClipboard(selectedRecord.notes!, 'notes')}
                className="inline-flex items-center gap-1 text-xs font-semibold text-text-secondary hover:text-primary cursor-pointer"
              >
                {copiedFieldLabel === 'notes' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-success" />
                    <span className="text-success">Copied Notes</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Notes</span>
                  </>
                )}
              </button>
            </div>
            <div className="p-4 rounded-xl bg-bg-app border border-border text-xs text-text-primary whitespace-pre-wrap font-mono leading-relaxed">
              {selectedRecord.notes}
            </div>
          </div>
        )}

        {/* 7. Password History Accordion */}
        {selectedRecord.passwordHistory && selectedRecord.passwordHistory.length > 0 && (
          <div className="pt-4 border-t border-border">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center justify-between w-full text-xs font-semibold text-text-secondary hover:text-text-primary cursor-pointer py-1"
            >
              <span className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 text-primary" />
                Previous Password History ({selectedRecord.passwordHistory.length})
              </span>
              {showHistory ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>

            {showHistory && (
              <div className="mt-3 space-y-2">
                {selectedRecord.passwordHistory.map((h, i) => {
                  const histFieldId = `hist-${i}`;
                  const isHistRevealed = !!revealedFields[histFieldId];
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-xl bg-bg-app border border-border text-xs"
                    >
                      <div className="min-w-0 flex-1 pr-3">
                        <span className="font-mono text-text-primary break-all">
                          {isHistRevealed ? h.password : '••••••••••••••••'}
                        </span>
                        <span className="block text-[10px] text-text-muted mt-0.5">
                          Rotated on {new Date(h.changedAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleFieldReveal(histFieldId)}
                          className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-bg-surface cursor-pointer"
                          title={isHistRevealed ? 'Hide' : 'Reveal'}
                        >
                          {isHistRevealed ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(h.password, histFieldId)}
                          className="px-2.5 py-1 rounded-lg bg-bg-surface border border-border text-text-primary font-semibold cursor-pointer hover:bg-bg-secondary"
                        >
                          {copiedFieldLabel === histFieldId ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 9. Audit Timestamps Footer */}
        <div className="pt-4 border-t border-border flex flex-wrap items-center justify-between gap-2 text-[11px] text-text-muted">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            <span>Created: {new Date(selectedRecord.createdAt).toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock
              className={`w-3.5 h-3.5 ${
                isOverOneYear
                  ? 'text-error'
                  : isOverNinetyDays
                  ? 'text-amber-500'
                  : 'text-success'
              }`}
            />
            <span>
              {hasSecretOrPassword ? 'Password Age:' : 'Credential Age:'}{' '}
              <strong
                className={
                  isOverOneYear
                    ? 'text-error font-semibold'
                    : isOverNinetyDays
                    ? 'text-amber-600 dark:text-amber-400 font-semibold'
                    : 'text-text-secondary font-semibold'
                }
              >
                {credentialAgeLabel}
              </strong>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-success" />
            <span>Last Encrypted: {new Date(selectedRecord.updatedAt).toLocaleString()}</span>
          </div>
        </div>

        {/* 10. Bottom Record Action Buttons */}
        <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
          {!selectedRecord.deletedAt ? (
            <>
              <button
                type="button"
                onClick={() => setEditingRecord(selectedRecord)}
                className="btn-secondary flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold cursor-pointer flex-1 sm:flex-initial"
              >
                <Edit3 className="w-4 h-4" />
                Edit Record
              </button>
              <button
                type="button"
                onClick={() => softDeleteRecord(selectedRecord.id)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-error/30 bg-error/10 hover:bg-error/20 text-xs font-semibold text-error transition-colors cursor-pointer flex-1 sm:flex-initial"
                title="Move to Trash"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => restoreRecord(selectedRecord.id)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-success text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer flex-1 sm:flex-initial"
              >
                <RotateCcw className="w-4 h-4" />
                Restore
              </button>
              {!confirmPermanentDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmPermanentDelete(true)}
                  className="btn-danger flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold cursor-pointer flex-1 sm:flex-initial"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Forever
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => permanentlyDeleteRecord(selectedRecord.id)}
                  className="btn-danger flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold cursor-pointer animate-pulse flex-1 sm:flex-initial"
                >
                  Confirm Wipe
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
