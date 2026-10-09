/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
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
  Landmark,
  CreditCard,
  UserCheck,
  FileText,
  Wifi,
  Mail,
  Globe,
  Briefcase,
  GraduationCap,
  Folder,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { useVault } from '../../context/VaultContext';
import {
  VaultRecord,
  RecordCategory,
  RecordType,
  CATEGORY_METADATA,
  CustomField,
  BankAccountType,
  PaymentCardKind,
  PaymentCardNetwork,
  IdentityDocumentType,
  WifiSecurityType,
} from '../../types/vault';
import { passwordGenerator } from '../../security/PasswordGeneratorService';
import { totpService } from '../../security/TotpService';

interface RecordEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  recordToEdit?: VaultRecord | null;
}

const SELECTABLE_CATEGORIES: RecordCategory[] = [
  'passwords',
  'banking',
  'cards',
  'identity',
  'notes',
  'wifi',
  'email',
  'social',
  'work',
  'education',
  'other',
];

const normalizeEditableCategory = (cat?: RecordCategory): RecordCategory => {
  if (!cat || cat === 'all' || cat === 'favorites' || cat === 'trash') return 'passwords';
  if (cat === 'card') return 'cards';
  if (cat === 'note') return 'notes';
  return cat;
};

const CATEGORY_CONFIG: Record<
  string,
  {
    icon: React.FC<{ className?: string }>;
    formTitleAdd: string;
    formTitleEdit: string;
    titleLabel: string;
    titlePlaceholder: string;
    helperText: string;
    recordType: RecordType;
  }
> = {
  passwords: {
    icon: KeyRound,
    formTitleAdd: 'Add Login Credential',
    formTitleEdit: 'Edit Login Credential',
    titleLabel: 'Item Title *',
    titlePlaceholder: 'e.g., GitHub, Netflix, Amazon',
    helperText: 'Store website and app sign-in credentials with optional 2FA.',
    recordType: 'login',
  },
  banking: {
    icon: Landmark,
    formTitleAdd: 'Add Bank Account',
    formTitleEdit: 'Edit Bank Account',
    titleLabel: 'Item Title *',
    titlePlaceholder: 'e.g., Chase Checking, HDFC Savings',
    helperText: 'Store bank account details, branch identifiers, and online banking access.',
    recordType: 'login',
  },
  cards: {
    icon: CreditCard,
    formTitleAdd: 'Add Payment Card',
    formTitleEdit: 'Edit Payment Card',
    titleLabel: 'Item Title *',
    titlePlaceholder: 'e.g., Sapphire Reserve Visa, Corporate Amex',
    helperText: 'Store debit, credit, or prepaid card details with masked security codes.',
    recordType: 'card',
  },
  identity: {
    icon: UserCheck,
    formTitleAdd: 'Add Personal Identity',
    formTitleEdit: 'Edit Personal Identity',
    titleLabel: 'Item Title *',
    titlePlaceholder: 'e.g., US Passport, Driver License, National ID',
    helperText: 'Store official identity documents, numbers, and validity dates.',
    recordType: 'identity',
  },
  notes: {
    icon: FileText,
    formTitleAdd: 'Add Secure Note',
    formTitleEdit: 'Edit Secure Note',
    titleLabel: 'Item Title *',
    titlePlaceholder: 'e.g., Hardware Wallet Seed Phrase, SSH Backup Keys',
    helperText: 'Store multiline confidential notes, recovery codes, or private keys.',
    recordType: 'note',
  },
  wifi: {
    icon: Wifi,
    formTitleAdd: 'Add Wi-Fi Network',
    formTitleEdit: 'Edit Wi-Fi Network',
    titleLabel: 'Item Title / Network Name *',
    titlePlaceholder: 'e.g., Home 5GHz Wi-Fi, Office Guest Network',
    helperText: 'Store wireless SSID, security protocol, and passphrase.',
    recordType: 'wifi',
  },
  email: {
    icon: Mail,
    formTitleAdd: 'Add Email Account',
    formTitleEdit: 'Edit Email Account',
    titleLabel: 'Item Title *',
    titlePlaceholder: 'e.g., Personal ProtonMail, Google Workspace Mail',
    helperText: 'Store email account credentials, webmail URL, and 2FA key.',
    recordType: 'login',
  },
  social: {
    icon: Globe,
    formTitleAdd: 'Add Social Media Account',
    formTitleEdit: 'Edit Social Media Account',
    titleLabel: 'Item Title *',
    titlePlaceholder: 'e.g., LinkedIn, X / Twitter, Instagram',
    helperText: 'Store social network handles, login credentials, and 2FA.',
    recordType: 'login',
  },
  work: {
    icon: Briefcase,
    formTitleAdd: 'Add Work / Developer Credential',
    formTitleEdit: 'Edit Work / Developer Credential',
    titleLabel: 'Item Title *',
    titlePlaceholder: 'e.g., AWS Production Root, Corporate Okta SSO',
    helperText: 'Store workspace SSO accounts, cloud consoles, or service credentials.',
    recordType: 'login',
  },
  education: {
    icon: GraduationCap,
    formTitleAdd: 'Add Education Account',
    formTitleEdit: 'Edit Education Account',
    titleLabel: 'Item Title *',
    titlePlaceholder: 'e.g., University Student Portal, Coursera',
    helperText: 'Store academic portal logins, student IDs, and course credentials.',
    recordType: 'login',
  },
  other: {
    icon: Folder,
    formTitleAdd: 'Add Secure Item',
    formTitleEdit: 'Edit Secure Item',
    titleLabel: 'Item Title *',
    titlePlaceholder: 'e.g., Safe Combination, Software License',
    helperText: 'Store miscellaneous credentials, secrets, and custom encrypted fields.',
    recordType: 'login',
  },
};

/**
 * Formats a raw card number string with spaces for readability (4-6-5 for Amex, 4-4-4-4 otherwise)
 */
export const formatCardNumberDisplay = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 19);
  if (!digits) return '';
  // Amex starts with 34 or 37 (15 digits: 4-6-5)
  if (/^3[47]/.test(digits)) {
    const p1 = digits.slice(0, 4);
    const p2 = digits.slice(4, 10);
    const p3 = digits.slice(10, 15);
    return [p1, p2, p3].filter(Boolean).join(' ');
  }
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
};

/**
 * Detects card network from digits
 */
const detectCardNetwork = (raw: string): PaymentCardNetwork | null => {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('4')) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'American Express';
  return null;
};

/**
 * Luhn checksum validation for payment card numbers
 */
const isValidLuhnChecksum = (raw: string): boolean => {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
};

/**
 * Flexible URL validation (recognizes valid domains or URLs without being overly restrictive)
 */
const validateUrlInput = (val: string): string | null => {
  const trimmed = val.trim();
  if (!trimmed) return null;
  if (/\s/.test(trimmed)) {
    return 'URL cannot contain spaces.';
  }
  try {
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(candidate);
    if (!parsed.hostname || (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost')) {
      return 'Enter a valid website domain (e.g., example.com or https://example.com).';
    }
    return null;
  } catch {
    return 'Enter a valid website URL.';
  }
};

export const RecordEditModal: React.FC<RecordEditModalProps> = ({
  isOpen,
  onClose,
  recordToEdit,
}) => {
  const { addRecord, updateRecord, selectedCategory } = useVault();

  // Shared fields across categories
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<RecordCategory>(() =>
    normalizeEditableCategory(selectedCategory)
  );
  const [notes, setNotes] = useState('');
  const [favorite, setFavorite] = useState(false);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  // Login / Email / Social / Work / Education / Other fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [url, setUrl] = useState('');
  const [totpSecret, setTotpSecret] = useState('');

  // Bank Account specific state (isolated from card & login state so switching never corrupts fields)
  const [bankName, setBankName] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountType, setAccountType] = useState<BankAccountType>('Savings');
  const [accountNumber, setAccountNumber] = useState('');
  const [showAccountNumber, setShowAccountNumber] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [swiftBic, setSwiftBic] = useState('');
  const [iban, setIban] = useState('');
  const [showInternationalBankFields, setShowInternationalBankFields] = useState(false);
  const [onlineBankingUsername, setOnlineBankingUsername] = useState('');
  const [onlineBankingPassword, setOnlineBankingPassword] = useState('');
  const [showBankPassword, setShowBankPassword] = useState(false);
  const [bankWebsiteUrl, setBankWebsiteUrl] = useState('');

  // Payment Card specific state
  const [cardholderName, setCardholderName] = useState('');
  const [cardKind, setCardKind] = useState<PaymentCardKind>('Credit');
  const [cardNetwork, setCardNetwork] = useState<PaymentCardNetwork>('Visa');
  const [cardNumber, setCardNumber] = useState('');
  const [showCardNumber, setShowCardNumber] = useState(false);
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [showCardCvv, setShowCardCvv] = useState(false);
  const [allowStoreCvv, setAllowStoreCvv] = useState(false);
  const [cardPin, setCardPin] = useState('');
  const [showCardPin, setShowCardPin] = useState(false);
  const [issuingBank, setIssuingBank] = useState('');
  const [billingAddress, setBillingAddress] = useState('');

  // Identity specific state
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [documentType, setDocumentType] = useState<IdentityDocumentType>('Passport');
  const [documentNumber, setDocumentNumber] = useState('');
  const [showDocumentNumber, setShowDocumentNumber] = useState(false);
  const [issuingCountry, setIssuingCountry] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [identityExpiryDate, setIdentityExpiryDate] = useState('');

  // Wi-Fi specific state
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiSecurityType, setWifiSecurityType] = useState<WifiSecurityType>('WPA2');
  const [wifiPassword, setWifiPassword] = useState('');
  const [showWifiPassword, setShowWifiPassword] = useState(false);
  const [wifiHidden, setWifiHidden] = useState(false);

  // Submission & status state
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [categorySwitchNotice, setCategorySwitchNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSubmitError(null);
    setCategorySwitchNotice(null);
    setShowPassword(false);
    setShowAccountNumber(false);
    setShowBankPassword(false);
    setShowCardNumber(false);
    setShowCardCvv(false);
    setShowCardPin(false);
    setShowDocumentNumber(false);
    setShowWifiPassword(false);

    if (recordToEdit) {
      const normCat = normalizeEditableCategory(recordToEdit.category);
      setTitle(recordToEdit.title || '');
      setCategory(normCat);
      setNotes(recordToEdit.notes || '');
      setFavorite(Boolean(recordToEdit.favorite));
      setCustomFields(recordToEdit.customFields || []);

      // Login fields
      setUsername(recordToEdit.username || '');
      setEmail(recordToEdit.email || '');
      setPassword(recordToEdit.password || '');
      setUrl(recordToEdit.url || recordToEdit.website || '');
      setTotpSecret(recordToEdit.totpSecret || '');

      // Banking fields
      const bd = recordToEdit.bankDetails;
      setBankName(bd?.bankName || recordToEdit.bankName || '');
      setAccountHolderName(bd?.accountHolderName || recordToEdit.accountHolderName || '');
      setAccountType(bd?.accountType || recordToEdit.accountType || 'Savings');
      setAccountNumber(bd?.accountNumber || recordToEdit.accountNumber || '');
      setBranchName(bd?.branchName || recordToEdit.branchName || '');
      setBranchCode(bd?.branchCode || recordToEdit.branchCode || recordToEdit.routingOrIfsc || '');
      const loadedSwift = bd?.swiftBic || recordToEdit.swiftBic || '';
      const loadedIban = bd?.iban || recordToEdit.iban || '';
      setSwiftBic(loadedSwift);
      setIban(loadedIban);
      setShowInternationalBankFields(Boolean(loadedSwift || loadedIban));
      setOnlineBankingUsername(
        bd?.onlineBankingUsername || (normCat === 'banking' ? recordToEdit.username || '' : '')
      );
      setOnlineBankingPassword(
        bd?.onlineBankingPassword || (normCat === 'banking' ? recordToEdit.password || '' : '')
      );
      setBankWebsiteUrl(
        bd?.bankWebsiteUrl || (normCat === 'banking' ? recordToEdit.url || recordToEdit.website || '' : '')
      );

      // Payment card fields
      const cd = recordToEdit.cardDetails;
      setCardholderName(cd?.cardholderName || recordToEdit.cardholderName || '');
      setCardKind(cd?.cardKind || recordToEdit.cardKind || 'Credit');
      const existingRawCard = cd?.cardNumber || recordToEdit.cardNumber || '';
      setCardNumber(formatCardNumberDisplay(existingRawCard));
      setCardNetwork(
        cd?.cardNetwork ||
          recordToEdit.cardNetwork ||
          detectCardNetwork(existingRawCard) ||
          'Visa'
      );

      // Parse expiry month and year from either cardDetails or MM/YY string
      let expM = cd?.expirationMonth || '';
      let expY = cd?.expirationYear || '';
      if ((!expM || !expY) && recordToEdit.cardExpiry) {
        const parts = recordToEdit.cardExpiry.split('/');
        if (parts.length === 2) {
          expM = parts[0].trim();
          expY = parts[1].trim();
        }
      }
      setExpiryMonth(expM);
      setExpiryYear(expY);

      const loadedCvv = cd?.cvv || recordToEdit.cardCvv || '';
      setCardCvv(loadedCvv);
      setAllowStoreCvv(Boolean(loadedCvv));
      setCardPin(cd?.pin || recordToEdit.cardPin || '');
      setIssuingBank(cd?.issuingBank || recordToEdit.issuingBank || recordToEdit.bankName || '');
      setBillingAddress(cd?.billingAddress || recordToEdit.billingAddress || '');

      // Identity fields
      const idDet = recordToEdit.identityDetails;
      setFullName(idDet?.fullName || '');
      setDateOfBirth(idDet?.dateOfBirth || '');
      setDocumentType((idDet?.documentType as IdentityDocumentType) || 'Passport');
      setDocumentNumber(
        idDet?.documentNumber || idDet?.passportNumber || idDet?.idNumber || idDet?.ssn || ''
      );
      setIssuingCountry(idDet?.issuingCountry || '');
      setIssueDate(idDet?.issueDate || '');
      setIdentityExpiryDate(idDet?.expiryDate || '');

      // Wi-Fi fields
      const wd = recordToEdit.wifiDetails;
      setWifiSsid(wd?.ssid || (normCat === 'wifi' ? recordToEdit.username || '' : ''));
      setWifiSecurityType(wd?.securityType || 'WPA2');
      setWifiPassword(wd?.password || (normCat === 'wifi' ? recordToEdit.password || '' : ''));
      setWifiHidden(Boolean(wd?.hiddenNetwork));
    } else {
      // Reset all fields for new entry
      setTitle('');
      setCategory(normalizeEditableCategory(selectedCategory));
      setNotes('');
      setFavorite(selectedCategory === 'favorites');
      setCustomFields([]);

      setUsername('');
      setEmail('');
      setPassword('');
      setUrl('');
      setTotpSecret('');

      setBankName('');
      setAccountHolderName('');
      setAccountType('Savings');
      setAccountNumber('');
      setBranchName('');
      setBranchCode('');
      setSwiftBic('');
      setIban('');
      setShowInternationalBankFields(false);
      setOnlineBankingUsername('');
      setOnlineBankingPassword('');
      setBankWebsiteUrl('');

      setCardholderName('');
      setCardKind('Credit');
      setCardNetwork('Visa');
      setCardNumber('');
      setExpiryMonth('');
      setExpiryYear('');
      setCardCvv('');
      setAllowStoreCvv(false);
      setCardPin('');
      setIssuingBank('');
      setBillingAddress('');

      setFullName('');
      setDateOfBirth('');
      setDocumentType('Passport');
      setDocumentNumber('');
      setIssuingCountry('');
      setIssueDate('');
      setIdentityExpiryDate('');

      setWifiSsid('');
      setWifiSecurityType('WPA2');
      setWifiPassword('');
      setWifiHidden(false);
    }
  }, [recordToEdit, isOpen, selectedCategory]);

  // Handle category change safely: retain entered values in component state so switching back never loses user input
  const handleCategoryChange = (nextCat: RecordCategory) => {
    const prevCat = category;
    if (nextCat === prevCat) return;

    const hadCategorySpecificInput =
      (prevCat === 'banking' && (bankName || accountNumber || branchCode || onlineBankingUsername)) ||
      (prevCat === 'cards' && (cardNumber || cardholderName || issuingBank)) ||
      (prevCat === 'identity' && (fullName || documentNumber || issuingCountry)) ||
      (prevCat === 'wifi' && (wifiSsid || wifiPassword));

    if (hadCategorySpecificInput) {
      setCategorySwitchNotice(
        `Switched to ${CATEGORY_METADATA[nextCat]?.label || nextCat}. Shared fields (Title, Notes) are preserved, and your previous ${CATEGORY_METADATA[prevCat]?.label || prevCat} inputs remain safely kept in form memory if you switch back before saving.`
      );
    } else {
      setCategorySwitchNotice(null);
    }

    setCategory(nextCat);
  };

  const generateStrongSecret = () =>
    passwordGenerator.generatePassword({
      length: 20,
      uppercase: true,
      lowercase: true,
      numbers: true,
      symbols: true,
      excludeAmbiguous: false,
    });

  const handleQuickGeneratePassword = () => {
    setPassword(generateStrongSecret());
    setShowPassword(true);
  };

  const handleGenerateBankPassword = () => {
    setOnlineBankingPassword(generateStrongSecret());
    setShowBankPassword(true);
  };

  const handleGenerateWifiPassword = () => {
    setWifiPassword(generateStrongSecret());
    setShowWifiPassword(true);
  };

  const handleCardNumberChange = (val: string) => {
    const formatted = formatCardNumberDisplay(val);
    setCardNumber(formatted);
    const detected = detectCardNetwork(formatted);
    if (detected) {
      setCardNetwork(detected);
    }
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

  // Field-level inline validation
  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};

    if (!title.trim()) {
      errors.title = 'Item title is required.';
    }

    if (category === 'passwords' || category === 'email' || category === 'social' || category === 'work' || category === 'education' || category === 'other') {
      const urlErr = validateUrlInput(url);
      if (urlErr) errors.url = urlErr;
      if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        errors.email = 'Enter a valid email address.';
      }
      if (totpSecret.trim() && !totpService.isValidSecret(totpSecret.trim())) {
        errors.totp = 'Invalid Base32 TOTP secret or otpauth:// URI.';
      }
    }

    if (category === 'banking') {
      if (!bankName.trim()) {
        errors.bankName = 'Bank name is required for a bank account entry.';
      }
      const bankUrlErr = validateUrlInput(bankWebsiteUrl);
      if (bankUrlErr) errors.bankWebsiteUrl = bankUrlErr;
      if (swiftBic.trim() && !/^[A-Za-z0-9]{8}([A-Za-z0-9]{3})?$/.test(swiftBic.trim().replace(/\s+/g, ''))) {
        errors.swiftBic = 'SWIFT/BIC code must be 8 or 11 alphanumeric characters.';
      }
      if (iban.trim() && !/^[A-Za-z]{2}[0-9]{2}[A-Za-z0-9]{10,30}$/.test(iban.trim().replace(/\s+/g, ''))) {
        errors.iban = 'Enter a valid IBAN format (country code + check digits + account).';
      }
    }

    if (category === 'cards') {
      const rawDigits = cardNumber.replace(/\D/g, '');
      if (!rawDigits) {
        errors.cardNumber = 'Card number is required.';
      } else if (rawDigits.length < 13 || rawDigits.length > 19) {
        errors.cardNumber = 'Card number must be between 13 and 19 digits.';
      } else if (!isValidLuhnChecksum(rawDigits)) {
        errors.cardNumber = 'Card number failed Luhn checksum validation. Please check for typos.';
      }

      if (expiryMonth && (!/^(0?[1-9]|1[0-2])$/.test(expiryMonth))) {
        errors.expiry = 'Select a valid expiry month (01–12).';
      }
      if (expiryYear && !/^\d{2,4}$/.test(expiryYear)) {
        errors.expiry = 'Select a valid expiry year.';
      }
      if (allowStoreCvv && cardCvv.trim() && !/^\d{3,4}$/.test(cardCvv.trim())) {
        errors.cardCvv = 'CVV/CVC must be 3 or 4 digits.';
      }
    }

    if (category === 'identity') {
      if (!fullName.trim()) {
        errors.fullName = 'Full name is required.';
      }
      if (!documentNumber.trim()) {
        errors.documentNumber = 'Document number is required.';
      }
      if (issueDate && identityExpiryDate && issueDate > identityExpiryDate) {
        errors.identityExpiryDate = 'Expiry date must be after the issue date.';
      }
    }

    if (category === 'notes') {
      if (!notes.trim()) {
        errors.notes = 'Note content is required for a Secure Note.';
      }
    }

    if (category === 'wifi') {
      if (!wifiSsid.trim()) {
        errors.wifiSsid = 'Network SSID is required.';
      }
      if (wifiSecurityType !== 'Open' && !wifiPassword) {
        errors.wifiPassword = 'Wi-Fi password is required for secured networks.';
      }
    }

    return errors;
  }, [
    title,
    category,
    url,
    email,
    totpSecret,
    bankName,
    bankWebsiteUrl,
    swiftBic,
    iban,
    cardNumber,
    expiryMonth,
    expiryYear,
    allowStoreCvv,
    cardCvv,
    fullName,
    documentNumber,
    issueDate,
    identityExpiryDate,
    notes,
    wifiSsid,
    wifiSecurityType,
    wifiPassword,
  ]);

  const isFormValid = Object.keys(validationErrors).length === 0;

  const activePasswordForStrength =
    category === 'banking'
      ? onlineBankingPassword
      : category === 'wifi'
      ? wifiPassword
      : password;

  const strength = useMemo(
    () =>
      activePasswordForStrength
        ? passwordGenerator.evaluateStrength(activePasswordForStrength)
        : null,
    [activePasswordForStrength]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || isSaving) return;

    setIsSaving(true);
    setSubmitError(null);

    try {
      const cleanCustomFields = customFields.filter((f) => f.label.trim() !== '');
      const catConfig = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.passwords;

      const basePayload: Omit<VaultRecord, 'id' | 'createdAt' | 'updatedAt'> = {
        title: title.trim(),
        type: catConfig.recordType,
        category,
        notes: notes.trim() || undefined,
        tags: [],
        favorite,
        customFields: cleanCustomFields,
        // Explicitly clear category-specific root fields so switching categories doesn't leak stale incompatible fields
        username: undefined,
        email: undefined,
        password: undefined,
        url: undefined,
        website: undefined,
        totpSecret: undefined,
        bankDetails: undefined,
        bankName: undefined,
        accountHolderName: undefined,
        accountType: undefined,
        accountNumber: undefined,
        branchName: undefined,
        branchCode: undefined,
        swiftBic: undefined,
        iban: undefined,
        routingOrIfsc: undefined,
        cardDetails: undefined,
        cardholderName: undefined,
        cardKind: undefined,
        cardNetwork: undefined,
        cardNumber: undefined,
        cardExpiry: undefined,
        cardCvv: undefined,
        cardPin: undefined,
        issuingBank: undefined,
        billingAddress: undefined,
        identityDetails: undefined,
        wifiDetails: undefined,
      };

      if (category === 'banking') {
        const cleanBankUrl = bankWebsiteUrl.trim() || undefined;
        const cleanBankUser = onlineBankingUsername.trim() || undefined;
        const cleanBankPass = onlineBankingPassword || undefined;
        const cleanSwift = showInternationalBankFields ? swiftBic.trim().toUpperCase() || undefined : undefined;
        const cleanIban = showInternationalBankFields ? iban.trim().toUpperCase() || undefined : undefined;
        const cleanBranchCode = branchCode.trim() || undefined;

        basePayload.bankName = bankName.trim() || undefined;
        basePayload.accountHolderName = accountHolderName.trim() || undefined;
        basePayload.accountType = accountType;
        basePayload.accountNumber = accountNumber.trim() || undefined;
        basePayload.branchName = branchName.trim() || undefined;
        basePayload.branchCode = cleanBranchCode;
        basePayload.swiftBic = cleanSwift;
        basePayload.iban = cleanIban;
        basePayload.routingOrIfsc = cleanBranchCode || cleanSwift || undefined;
        basePayload.username = cleanBankUser;
        basePayload.password = cleanBankPass;
        basePayload.url = cleanBankUrl;
        basePayload.website = cleanBankUrl;
        basePayload.bankDetails = {
          bankName: bankName.trim() || undefined,
          accountHolderName: accountHolderName.trim() || undefined,
          accountType,
          accountNumber: accountNumber.trim() || undefined,
          branchName: branchName.trim() || undefined,
          branchCode: cleanBranchCode,
          swiftBic: cleanSwift,
          iban: cleanIban,
          routingOrIfsc: cleanBranchCode || cleanSwift || undefined,
          onlineBankingUsername: cleanBankUser,
          onlineBankingPassword: cleanBankPass,
          bankWebsiteUrl: cleanBankUrl,
        };
      } else if (category === 'cards') {
        const formattedCard = formatCardNumberDisplay(cardNumber);
        const normMonth = expiryMonth ? expiryMonth.padStart(2, '0') : '';
        const normYear = expiryYear ? (expiryYear.length === 4 ? expiryYear.slice(-2) : expiryYear) : '';
        const combinedExpiry = normMonth && normYear ? `${normMonth}/${normYear}` : undefined;
        const finalCvv = allowStoreCvv && cardCvv.trim() ? cardCvv.trim() : undefined;

        basePayload.cardholderName = cardholderName.trim() || undefined;
        basePayload.cardKind = cardKind;
        basePayload.cardNetwork = cardNetwork;
        basePayload.cardNumber = formattedCard || undefined;
        basePayload.cardExpiry = combinedExpiry;
        basePayload.cardCvv = finalCvv;
        basePayload.cardPin = cardPin.trim() || undefined;
        basePayload.issuingBank = issuingBank.trim() || undefined;
        basePayload.bankName = issuingBank.trim() || undefined;
        basePayload.billingAddress = billingAddress.trim() || undefined;
        basePayload.cardDetails = {
          cardholderName: cardholderName.trim() || undefined,
          cardKind,
          cardNetwork,
          cardNumber: formattedCard || undefined,
          expirationMonth: normMonth || undefined,
          expirationYear: expiryYear || undefined,
          cvv: finalCvv,
          pin: cardPin.trim() || undefined,
          issuingBank: issuingBank.trim() || undefined,
          billingAddress: billingAddress.trim() || undefined,
        };
      } else if (category === 'identity') {
        basePayload.username = fullName.trim() || undefined;
        basePayload.identityDetails = {
          fullName: fullName.trim() || undefined,
          dateOfBirth: dateOfBirth || undefined,
          documentType,
          documentNumber: documentNumber.trim() || undefined,
          idNumber: documentNumber.trim() || undefined,
          issuingCountry: issuingCountry.trim() || undefined,
          issueDate: issueDate || undefined,
          expiryDate: identityExpiryDate || undefined,
        };
      } else if (category === 'wifi') {
        basePayload.username = wifiSsid.trim() || undefined;
        basePayload.password = wifiSecurityType === 'Open' ? undefined : wifiPassword || undefined;
        basePayload.wifiDetails = {
          ssid: wifiSsid.trim() || undefined,
          securityType: wifiSecurityType,
          password: wifiSecurityType === 'Open' ? undefined : wifiPassword || undefined,
          hiddenNetwork: wifiHidden,
        };
      } else if (category === 'notes') {
        // Secure Note only stores title, multiline note content, tags, favorite, and optional custom fields
      } else {
        // Login, Email, Social, Work, Education, Other
        const cleanUrl = url.trim() || undefined;
        basePayload.username = username.trim() || undefined;
        basePayload.email = email.trim() || undefined;
        basePayload.password = password || undefined;
        basePayload.url = cleanUrl;
        basePayload.website = cleanUrl;
        basePayload.totpSecret = totpSecret.trim() || undefined;
      }

      if (recordToEdit) {
        await updateRecord(recordToEdit.id, basePayload);
      } else {
        await addRecord(basePayload);
      }

      onClose();
    } catch (err: unknown) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to encrypt and save vault entry.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const currentConfig = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.passwords;
  const CategoryIcon = currentConfig.icon;
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 16 }, (_, i) => String((currentYear + i) % 100).padStart(2, '0'));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={recordToEdit ? currentConfig.formTitleEdit : currentConfig.formTitleAdd}
      subtitle={currentConfig.helperText}
      maxWidth="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* Category Selector & Contextual Header Banner */}
        <div className="p-3.5 rounded-xl bg-bg-secondary border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-secondary text-white flex items-center justify-center shrink-0 shadow-2xs">
              <CategoryIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <label
                htmlFor="vault-category-select"
                className="block text-[11px] font-bold uppercase tracking-wider text-text-secondary"
              >
                Entry Category
              </label>
              <p className="text-xs text-text-muted">
                Fields adapt automatically to the selected category
              </p>
            </div>
          </div>

          <select
            id="vault-category-select"
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value as RecordCategory)}
            className="w-full sm:w-56 px-3.5 py-2.5 rounded-xl border border-border bg-bg-surface text-text-primary text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer"
          >
            {SELECTABLE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_METADATA[cat].label}
              </option>
            ))}
          </select>
        </div>

        {/* Category Switch Data-Safety Notice */}
        {categorySwitchNotice && (
          <div className="p-3 rounded-xl bg-primary/10 border border-primary/25 text-xs text-text-primary flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <span className="leading-relaxed">{categorySwitchNotice}</span>
          </div>
        )}

        {/* Item Title Field (Shared across all categories) */}
        <div>
          <label className="block text-xs font-semibold text-text-primary mb-1.5">
            {currentConfig.titleLabel}
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={currentConfig.titlePlaceholder}
            className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-surface text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            required
          />
          {title.length > 0 && validationErrors.title && (
            <p className="text-[11px] text-error mt-1">{validationErrors.title}</p>
          )}
        </div>

        {/* =====================================================================
            CATEGORY A: LOGIN, EMAIL, SOCIAL, WORK, EDUCATION, OTHER
           ===================================================================== */}
        {(category === 'passwords' ||
          category === 'email' ||
          category === 'social' ||
          category === 'work' ||
          category === 'education' ||
          category === 'other') && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1.5">
                  {category === 'social'
                    ? 'Username / Handle'
                    : category === 'education'
                    ? 'Student ID / Username'
                    : 'Username or Email'}
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={
                    category === 'social'
                      ? 'e.g., @alex_dev'
                      : category === 'email'
                      ? 'e.g., alex@proton.me'
                      : 'e.g., alex@company.com or alex_ops'
                  }
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-surface text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1.5">
                  {category === 'email' ? 'Recovery / Secondary Email' : 'Email Address (Optional)'}
                </label>
                <input
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g., alex@company.com"
                  autoCapitalize="none"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-surface text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                {validationErrors.email && (
                  <p className="text-[11px] text-error mt-1">{validationErrors.email}</p>
                )}
              </div>
            </div>

            {/* Password Field with Built-in CSPRNG Generator */}
            <div className="space-y-2 p-4 rounded-xl bg-bg-secondary border border-border">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-text-primary flex items-center gap-1.5 whitespace-nowrap">
                  <KeyRound className="w-3.5 h-3.5 text-primary shrink-0" />
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleQuickGeneratePassword}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-dark cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                  Generate Key
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
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {password.length > 0 && strength && (
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-text-secondary">
                    Entropy:{' '}
                    <strong className="font-mono text-text-primary">
                      {strength.entropyBits} bits
                    </strong>
                  </span>
                  <span className="font-semibold" style={{ color: strength.color }}>
                    {strength.label} ({strength.estimatedCrackTime})
                  </span>
                </div>
              )}
            </div>

            {/* Website URL */}
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1.5">
                {category === 'email' ? 'Webmail / Server URL' : 'Website URL'}
              </label>
              <input
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                autoCapitalize="none"
                className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-surface text-text-primary placeholder:text-text-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              {validationErrors.url && (
                <p className="text-[11px] text-error mt-1">{validationErrors.url}</p>
              )}
            </div>

            {/* Authenticator (TOTP 2FA) Secret Input */}
            <div className="space-y-2 p-4 rounded-xl bg-bg-secondary border border-border">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-text-primary flex items-center gap-1.5 whitespace-nowrap">
                  <QrCode className="w-3.5 h-3.5 text-primary shrink-0" />
                  2FA Secret Key (TOTP Optional)
                </label>
                {totpSecret.trim().length > 0 &&
                  (totpService.isValidSecret(totpSecret) ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-success">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Valid Base32 Key
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-error">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Invalid Base32 Secret
                    </span>
                  ))}
              </div>

              <input
                type="text"
                value={totpSecret}
                onChange={(e) => setTotpSecret(e.target.value)}
                placeholder="e.g., JBSWY3DPEHPK3PXP or otpauth://totp/..."
                className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary placeholder:text-text-muted text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              {validationErrors.totp && (
                <p className="text-[11px] text-error">{validationErrors.totp}</p>
              )}
            </div>
          </div>
        )}

        {/* =====================================================================
            CATEGORY B: BANK ACCOUNT
           ===================================================================== */}
        {category === 'banking' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-bg-secondary border border-border space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                <Landmark className="w-3.5 h-3.5" />
                Bank Account Information
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">
                    Bank Name *
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g., Chase, HDFC Bank, HSBC"
                    className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-sm focus:outline-none focus:border-primary"
                    required
                  />
                  {bankName.length > 0 && validationErrors.bankName && (
                    <p className="text-[11px] text-error mt-1">{validationErrors.bankName}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">
                    Account Holder Name
                  </label>
                  <input
                    type="text"
                    value={accountHolderName}
                    onChange={(e) => setAccountHolderName(e.target.value)}
                    placeholder="e.g., Alex Morgan"
                    className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">
                    Account Type
                  </label>
                  <select
                    value={accountType}
                    onChange={(e) => setAccountType(e.target.value as BankAccountType)}
                    className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-sm focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="Savings">Savings</option>
                    <option value="Current/Checking">Current / Checking</option>
                    <option value="Fixed Deposit">Fixed Deposit</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">
                    Account Number
                  </label>
                  <div className="relative">
                    <input
                      type={showAccountNumber ? 'text' : 'password'}
                      inputMode="numeric"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      placeholder="000012345678"
                      className="w-full px-3.5 py-2 pr-9 rounded-xl border border-border bg-bg-surface text-text-primary text-sm font-mono focus:outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAccountNumber(!showAccountNumber)}
                      aria-label={showAccountNumber ? 'Hide account number' : 'Show account number'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
                    >
                      {showAccountNumber ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">
                    Branch Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    placeholder="e.g., Downtown Main Branch"
                    className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">
                    Branch Code / Routing / IFSC (Optional)
                  </label>
                  <input
                    type="text"
                    value={branchCode}
                    onChange={(e) => setBranchCode(e.target.value)}
                    placeholder="e.g., 021000021 or HDFC0001234"
                    className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-sm font-mono focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Optional International Identifiers Toggle (SWIFT/BIC & IBAN) */}
              <div className="pt-2 border-t border-border/70">
                <button
                  type="button"
                  onClick={() => setShowInternationalBankFields(!showInternationalBankFields)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-dark cursor-pointer"
                >
                  {showInternationalBankFields ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {showInternationalBankFields
                      ? 'Hide International Banking Identifiers (SWIFT/BIC & IBAN)'
                      : 'Add International Banking Identifiers (SWIFT/BIC & IBAN, if applicable)'}
                  </span>
                </button>

                {showInternationalBankFields && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mt-3">
                    <div>
                      <label className="block text-xs font-semibold text-text-primary mb-1">
                        SWIFT / BIC Code (Optional)
                      </label>
                      <input
                        type="text"
                        value={swiftBic}
                        onChange={(e) => setSwiftBic(e.target.value)}
                        placeholder="e.g., CHASUS33XXX"
                        className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-sm font-mono uppercase focus:outline-none focus:border-primary"
                      />
                      {validationErrors.swiftBic && (
                        <p className="text-[11px] text-error mt-1">{validationErrors.swiftBic}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-text-primary mb-1">
                        IBAN (Optional)
                      </label>
                      <input
                        type="text"
                        value={iban}
                        onChange={(e) => setIban(e.target.value)}
                        placeholder="e.g., GB29 NWBK 6016 1331 9268 19"
                        className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-sm font-mono uppercase focus:outline-none focus:border-primary"
                      />
                      {validationErrors.iban && (
                        <p className="text-[11px] text-error mt-1">{validationErrors.iban}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Online Banking Credentials */}
            <div className="p-4 rounded-xl bg-bg-secondary border border-border space-y-3.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                Online Banking Access
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">
                    Online Banking Username / Customer ID
                  </label>
                  <input
                    type="text"
                    value={onlineBankingUsername}
                    onChange={(e) => setOnlineBankingUsername(e.target.value)}
                    placeholder="e.g., alex_banking_id"
                    autoCapitalize="none"
                    className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-sm focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-xs font-semibold text-text-primary">
                      Online Banking Password
                    </label>
                    <button
                      type="button"
                      onClick={handleGenerateBankPassword}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-dark cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Generate Key
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showBankPassword ? 'text' : 'password'}
                      value={onlineBankingPassword}
                      onChange={(e) => setOnlineBankingPassword(e.target.value)}
                      placeholder="Enter online banking password..."
                      className="w-full px-3.5 py-2 pr-9 rounded-xl border border-border bg-bg-surface text-text-primary text-sm font-mono focus:outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowBankPassword(!showBankPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
                    >
                      {showBankPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Bank Website URL
                </label>
                <input
                  type="url"
                  inputMode="url"
                  value={bankWebsiteUrl}
                  onChange={(e) => setBankWebsiteUrl(e.target.value)}
                  placeholder="https://www.chase.com"
                  autoCapitalize="none"
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-sm focus:outline-none focus:border-primary"
                />
                {validationErrors.bankWebsiteUrl && (
                  <p className="text-[11px] text-error mt-1">{validationErrors.bankWebsiteUrl}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* =====================================================================
            CATEGORY C: PAYMENT CARD
           ===================================================================== */}
        {category === 'cards' && (
          <div className="p-4 rounded-xl bg-bg-secondary border border-border space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5" />
                Payment Card Details
              </h4>
              <span className="text-[11px] font-mono text-text-secondary">
                {cardNetwork} • {cardKind}
              </span>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Cardholder Name
                </label>
                <input
                  type="text"
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value)}
                  placeholder="e.g., ALEX MORGAN"
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">
                    Card Type
                  </label>
                  <select
                    value={cardKind}
                    onChange={(e) => setCardKind(e.target.value as PaymentCardKind)}
                    className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-sm focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="Credit">Credit</option>
                    <option value="Debit">Debit</option>
                    <option value="Prepaid">Prepaid</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">
                    Card Network
                  </label>
                  <select
                    value={cardNetwork}
                    onChange={(e) => setCardNetwork(e.target.value as PaymentCardNetwork)}
                    className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-sm focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="Visa">Visa</option>
                    <option value="Mastercard">Mastercard</option>
                    <option value="American Express">American Express</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Card Number (Formatted & Masked by default) + Expiry Month/Year */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Card Number *
                </label>
                <div className="relative">
                  <input
                    type={showCardNumber ? 'text' : 'password'}
                    inputMode="numeric"
                    value={cardNumber}
                    onChange={(e) => handleCardNumberChange(e.target.value)}
                    placeholder="4532 0151 1283 8891"
                    className="w-full px-3.5 py-2 pr-10 rounded-xl border border-border bg-bg-surface text-text-primary text-sm font-mono tracking-wider focus:outline-none focus:border-primary"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCardNumber(!showCardNumber)}
                    aria-label={showCardNumber ? 'Mask card number' : 'Reveal card number'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
                  >
                    {showCardNumber ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {cardNumber.length > 0 && validationErrors.cardNumber ? (
                  <p className="text-[11px] text-error mt-1">{validationErrors.cardNumber}</p>
                ) : (
                  cardNumber.replace(/\D/g, '').length >= 13 && (
                    <p className="text-[11px] text-success mt-1 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Valid Luhn checksum ({cardNumber.replace(/\D/g, '').length} digits)
                    </p>
                  )
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Expiry Month &amp; Year
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={expiryMonth}
                    onChange={(e) => setExpiryMonth(e.target.value)}
                    aria-label="Expiry Month"
                    className="w-full px-2.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-xs font-mono focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="">MM</option>
                    {Array.from({ length: 12 }, (_, i) =>
                      String(i + 1).padStart(2, '0')
                    ).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>

                  <select
                    value={expiryYear}
                    onChange={(e) => setExpiryYear(e.target.value)}
                    aria-label="Expiry Year"
                    className="w-full px-2.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-xs font-mono focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="">YY</option>
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                {validationErrors.expiry && (
                  <p className="text-[11px] text-error mt-1">{validationErrors.expiry}</p>
                )}
              </div>
            </div>

            {/* Issuing Bank & PIN */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Issuing Bank
                </label>
                <input
                  type="text"
                  value={issuingBank}
                  onChange={(e) => setIssuingBank(e.target.value)}
                  placeholder="e.g., JPMorgan Chase, Citibank"
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  ATM / Card PIN (Optional)
                </label>
                <div className="relative">
                  <input
                    type={showCardPin ? 'text' : 'password'}
                    inputMode="numeric"
                    value={cardPin}
                    onChange={(e) => setCardPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="••••"
                    className="w-full px-3.5 py-2 pr-9 rounded-xl border border-border bg-bg-surface text-text-primary text-sm font-mono focus:outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCardPin(!showCardPin)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
                  >
                    {showCardPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Optional CVV Storage with Explicit Security Warning */}
            <div className="p-3.5 rounded-xl bg-bg-surface border border-border space-y-2.5">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allowStoreCvv}
                  onChange={(e) => {
                    setAllowStoreCvv(e.target.checked);
                    if (!e.target.checked) setCardCvv('');
                  }}
                  className="mt-0.5 rounded border-border text-primary focus:ring-primary"
                />
                <div className="text-xs">
                  <span className="font-semibold text-text-primary">
                    Store CVV/CVC Security Code (Optional)
                  </span>
                  <p className="text-[11px] text-text-secondary mt-0.5 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-warning shrink-0" />
                    <span>
                      For maximum security, storing CVV is optional. If enabled, it is AES-256-GCM encrypted and masked by default.
                    </span>
                  </p>
                </div>
              </label>

              {allowStoreCvv && (
                <div className="pt-1 max-w-xs">
                  <div className="relative">
                    <input
                      type={showCardCvv ? 'text' : 'password'}
                      inputMode="numeric"
                      value={cardCvv}
                      onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder={cardNetwork === 'American Express' ? '4-digit CID' : '3-digit CVV'}
                      className="w-full px-3.5 py-2 pr-9 rounded-xl border border-border bg-bg-app text-text-primary text-xs font-mono focus:outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCardCvv(!showCardCvv)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
                    >
                      {showCardCvv ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {validationErrors.cardCvv && (
                    <p className="text-[11px] text-error mt-1">{validationErrors.cardCvv}</p>
                  )}
                </div>
              )}
            </div>

            {/* Billing Address */}
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1">
                Billing Address (Optional)
              </label>
              <input
                type="text"
                value={billingAddress}
                onChange={(e) => setBillingAddress(e.target.value)}
                placeholder="e.g., 742 Evergreen Terrace, Suite 200, New York, NY 10001"
                className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        )}

        {/* =====================================================================
            CATEGORY D: IDENTITY
           ===================================================================== */}
        {category === 'identity' && (
          <div className="p-4 rounded-xl bg-bg-secondary border border-border space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5" />
              Identity Document Details
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Full Legal Name *
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g., Alexander James Morgan"
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-sm focus:outline-none focus:border-primary"
                  required
                />
                {fullName.length > 0 && validationErrors.fullName && (
                  <p className="text-[11px] text-error mt-1">{validationErrors.fullName}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Date of Birth (Optional)
                </label>
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Document Type
                </label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value as IdentityDocumentType)}
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-sm focus:outline-none focus:border-primary cursor-pointer"
                >
                  <option value="Passport">Passport</option>
                  <option value="National ID">National ID</option>
                  <option value="Driver's License">Driver&apos;s License</option>
                  <option value="Social Security / Tax ID">Social Security / Tax ID</option>
                  <option value="Voter ID">Voter ID</option>
                  <option value="Residence Permit">Residence Permit</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Document Number *
                </label>
                <div className="relative">
                  <input
                    type={showDocumentNumber ? 'text' : 'password'}
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                    placeholder="e.g., P98234102"
                    className="w-full px-3.5 py-2 pr-9 rounded-xl border border-border bg-bg-surface text-text-primary text-sm font-mono focus:outline-none focus:border-primary"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowDocumentNumber(!showDocumentNumber)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
                  >
                    {showDocumentNumber ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {documentNumber.length > 0 && validationErrors.documentNumber && (
                  <p className="text-[11px] text-error mt-1">{validationErrors.documentNumber}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Issuing Country / Authority
                </label>
                <input
                  type="text"
                  value={issuingCountry}
                  onChange={(e) => setIssuingCountry(e.target.value)}
                  placeholder="e.g., United States, India, United Kingdom"
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">
                    Issue Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-xs focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">
                    Expiry Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={identityExpiryDate}
                    onChange={(e) => setIdentityExpiryDate(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-xs focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>
            {validationErrors.identityExpiryDate && (
              <p className="text-[11px] text-error">{validationErrors.identityExpiryDate}</p>
            )}
          </div>
        )}

        {/* =====================================================================
            CATEGORY F: WI-FI NETWORK
           ===================================================================== */}
        {category === 'wifi' && (
          <div className="p-4 rounded-xl bg-bg-secondary border border-border space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5" />
              Wireless Network Configuration
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Network Name (SSID) *
                </label>
                <input
                  type="text"
                  value={wifiSsid}
                  onChange={(e) => setWifiSsid(e.target.value)}
                  placeholder="e.g., LotusX_Secure_5G"
                  autoCapitalize="none"
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-sm font-mono focus:outline-none focus:border-primary"
                  required
                />
                {wifiSsid.length > 0 && validationErrors.wifiSsid && (
                  <p className="text-[11px] text-error mt-1">{validationErrors.wifiSsid}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">
                  Security Type
                </label>
                <select
                  value={wifiSecurityType}
                  onChange={(e) => setWifiSecurityType(e.target.value as WifiSecurityType)}
                  className="w-full px-3.5 py-2 rounded-xl border border-border bg-bg-surface text-text-primary text-sm focus:outline-none focus:border-primary cursor-pointer"
                >
                  <option value="WPA3">WPA3 Personal / Enterprise</option>
                  <option value="WPA2">WPA2 (AES)</option>
                  <option value="WPA/WPA2">WPA / WPA2 Mixed</option>
                  <option value="WEP">WEP</option>
                  <option value="Open">Open (No Password)</option>
                </select>
              </div>
            </div>

            {wifiSecurityType !== 'Open' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-text-primary">
                    Wi-Fi Password *
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateWifiPassword}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-dark cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Generate Key
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showWifiPassword ? 'text' : 'password'}
                    value={wifiPassword}
                    onChange={(e) => setWifiPassword(e.target.value)}
                    placeholder="Enter wireless network passphrase..."
                    className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-border bg-bg-surface text-text-primary text-sm font-mono focus:outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowWifiPassword(!showWifiPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
                  >
                    {showWifiPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {wifiPassword.length > 0 && strength && (
                  <div className="flex items-center justify-between text-xs pt-0.5">
                    <span className="text-text-secondary">
                      Entropy: <strong className="font-mono text-text-primary">{strength.entropyBits} bits</strong>
                    </span>
                    <span className="font-semibold" style={{ color: strength.color }}>
                      {strength.label}
                    </span>
                  </div>
                )}
              </div>
            )}

            <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer select-none">
              <input
                type="checkbox"
                checked={wifiHidden}
                onChange={(e) => setWifiHidden(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <span>Hidden SSID network (does not broadcast network name)</span>
            </label>
          </div>
        )}

        {/* =====================================================================
            NOTES (Required & Expanded for Secure Note, Optional for others)
           ===================================================================== */}
        <div>
          <label className="block text-xs font-semibold text-text-primary mb-1.5">
            {category === 'notes'
              ? 'Encrypted Note Content *'
              : 'Notes (Optional)'}
          </label>
          <textarea
            rows={category === 'notes' ? 7 : 3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              category === 'notes'
                ? 'Write confidential notes, recovery seed phrases, SSH keys, or sensitive instructions...'
                : 'Add additional notes, security questions, or instructions...'
            }
            className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-bg-surface text-text-primary placeholder:text-text-muted text-xs font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            required={category === 'notes'}
          />
          {category === 'notes' && notes.length > 0 && validationErrors.notes && (
            <p className="text-[11px] text-error mt-1">{validationErrors.notes}</p>
          )}
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
                placeholder="Field label"
                className="w-1/3 px-3 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs"
              />
              <input
                type={field.isHidden ? 'password' : 'text'}
                value={field.value}
                onChange={(e) => handleUpdateCustomField(field.id, { value: e.target.value })}
                placeholder="Value..."
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-bg-surface text-text-primary text-xs font-mono"
              />
              <label className="flex items-center gap-1 text-xs text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={field.isHidden}
                  onChange={(e) =>
                    handleUpdateCustomField(field.id, { isHidden: e.target.checked })
                  }
                  className="rounded border-border text-primary"
                />
                Mask
              </label>
              <button
                type="button"
                onClick={() => handleRemoveCustomField(field.id)}
                className="p-2 text-text-muted hover:text-error cursor-pointer"
                aria-label="Remove custom field"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {submitError && (
          <div className="p-3 rounded-xl bg-error/10 border border-error/30 text-xs text-error flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="pt-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={favorite}
              onChange={(e) => setFavorite(e.target.checked)}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-xs font-medium text-text-primary">Pin to Starred Favorites</span>
          </label>

          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-border text-xs font-semibold text-text-secondary hover:bg-bg-secondary cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isFormValid || isSaving}
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
