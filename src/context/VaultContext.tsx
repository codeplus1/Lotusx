/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  VaultRecord,
  VaultMetadata,
  AppSettings,
  RecordCategory,
  DetectedPasswordChange,
  SecurityScoreReport,
  SortOption,
} from '../types/vault';
import { VaultStatus } from '../types/auth';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../core/constants';
import { vaultRepository } from '../storage/VaultRepository';
import { secureStorageService } from '../storage/SecureStorageService';
import { clipboardService } from '../security/ClipboardService';
import { passwordChangeDetectionService } from '../security/PasswordChangeDetectionService';
import { passwordHealthService } from '../security/PasswordHealthService';
import { biometricService } from '../security/BiometricService';
import { useBackHandler } from '../hooks/useBackHandler';

export type AppView =
  | 'dashboard'
  | 'items'
  | 'categories'
  | 'search'
  | 'security_center'
  | 'generator'
  | 'settings'
  | 'audit';

interface VaultContextType {
  status: VaultStatus;
  isLoading: boolean;
  isVaultLoading: boolean;
  error: string | null;
  metadata: VaultMetadata | null;
  records: VaultRecord[];
  filteredRecords: VaultRecord[];
  securityReport: SecurityScoreReport | null;
  settings: AppSettings;
  activeView: AppView;
  selectedCategory: RecordCategory;
  searchQuery: string;
  sortBy: SortOption;
  selectedRecord: VaultRecord | null;
  editingRecord: VaultRecord | null;
  isCreateModalOpen: boolean;
  isGeneratorModalOpen: boolean;
  clipboardSeconds: number;
  copiedFieldLabel: string | null;
  recoveryKeyNotice: string | null;
  isMobileMenuOpen: boolean;
  integrityWarning: string | null;
  failedAttempts: number;
  detectedPasswordChange: DetectedPasswordChange | null;
  activeSettingsTab: string;
  autoLockMinutes: number;
  clipboardClearSeconds: number;

  // Actions
  setActiveView: (view: AppView) => void;
  navigateBack: () => void;
  canGoBack: boolean;
  setActiveSettingsTab: (tab: string) => void;
  setSelectedCategory: (category: RecordCategory) => void;
  setSearchQuery: (query: string) => void;
  setSortBy: (sort: SortOption) => void;
  setSelectedRecord: (record: VaultRecord | null) => void;
  setEditingRecord: (record: VaultRecord | null) => void;
  setIsCreateModalOpen: (open: boolean) => void;
  setIsGeneratorModalOpen: (open: boolean) => void;
  setIsMobileMenuOpen: (open: boolean) => void;
  setAutoLockMinutes: (minutes: number) => Promise<void>;
  setClipboardClearSeconds: (seconds: number) => Promise<void>;
  dismissRecoveryNotice: () => void;
  dismissIntegrityWarning: () => void;
  setDetectedPasswordChange: (change: DetectedPasswordChange | null) => void;
  applyDetectedPasswordChange: (change: DetectedPasswordChange) => Promise<boolean>;
  updatePasswordHint: (hint: string) => Promise<boolean>;
  fetchFailedAttempts: () => Promise<number>;

  createVault: (password: string, securityLevel?: 'standard' | 'high', passwordHint?: string) => Promise<string>;
  createNewVault: (password: string, seedSampleData?: boolean) => Promise<string>;
  unlockWithPassword: (password: string) => Promise<boolean>;
  unlock: (password: string) => Promise<{ success: boolean; error?: string; remainingLockoutMs?: number }>;
  unlockWithRecoveryKey: (recoveryKey: string) => Promise<boolean>;
  lockVault: () => void;
  wipeVault: () => Promise<void>;

  saveRecord: (record: VaultRecord) => Promise<void>;
  addRecord: (record: Omit<VaultRecord, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateRecord: (id: string, updates: Partial<VaultRecord>) => Promise<void>;
  deleteRecord: (id: string) => Promise<void>;
  softDeleteRecord: (id: string) => Promise<void>;
  restoreRecord: (id: string) => Promise<void>;
  permanentlyDeleteRecord: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  duplicateRecord: (record: VaultRecord) => Promise<void>;
  importMultipleRecords: (imported: VaultRecord[] | Promise<VaultRecord[]>) => Promise<number>;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  copySecretToClipboard: (secret: string) => Promise<boolean>;
  copyToClipboard: (secret: string, fieldLabel?: string) => Promise<boolean>;
  clearClipboardNow: () => Promise<void>;
  refreshRecords: () => Promise<void>;
  activeKey: CryptoKey | null;
  cryptoKey: CryptoKey | null;
  reEncryptVaultWithNewPassword: (oldPassword: string, newPassword: string) => Promise<boolean>;
  changeMasterPassword: (
    oldPassword: string,
    newPassword: string
  ) => Promise<{ success: boolean; error?: string }>;
}

const VaultContext = createContext<VaultContextType | null>(null);

export const VaultProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<VaultStatus>('uninitialized');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<VaultMetadata | null>(null);
  const [cryptoKey, setCryptoKey] = useState<CryptoKey | null>(null);
  const [records, setRecords] = useState<VaultRecord[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [selectedCategory, setSelectedCategory] = useState<RecordCategory>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortOption>('updated_desc');
  const [selectedRecord, setSelectedRecord] = useState<VaultRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<VaultRecord | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isGeneratorModalOpen, setIsGeneratorModalOpen] = useState<boolean>(false);
  const [clipboardSeconds, setClipboardSeconds] = useState<number>(0);
  const [copiedFieldLabel, setCopiedFieldLabel] = useState<string | null>(null);
  const [recoveryKeyNotice, setRecoveryKeyNotice] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [integrityWarning, setIntegrityWarning] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState<number>(0);
  const [detectedPasswordChange, setDetectedPasswordChange] = useState<DetectedPasswordChange | null>(null);
  const [activeSettingsTab, setActiveSettingsTab] = useState<string>('security');

  const activeViewRef = useRef<AppView>('dashboard');
  const selectedCategoryRef = useRef<RecordCategory>('all');
  const selectedRecordRef = useRef<VaultRecord | null>(null);
  const recordsRef = useRef<VaultRecord[]>([]);
  recordsRef.current = records;

  const navStackRef = useRef<Array<{ view: AppView; category: RecordCategory; recordId: string | null }>>([]);
  const isBatchingNavRef = useRef<boolean>(false);
  const didSetRecordInTickRef = useRef<boolean>(false);

  const pushNavSnapshotOncePerTick = useCallback(() => {
    if (isBatchingNavRef.current) return;
    isBatchingNavRef.current = true;
    navStackRef.current.push({
      view: activeViewRef.current,
      category: selectedCategoryRef.current,
      recordId: selectedRecordRef.current?.id ?? null,
    });
    queueMicrotask(() => {
      isBatchingNavRef.current = false;
      didSetRecordInTickRef.current = false;
    });
  }, []);

  const handleSetSelectedRecord = useCallback(
    (nextRecord: VaultRecord | null) => {
      if (nextRecord === null) {
        if (selectedRecordRef.current !== null) {
          selectedRecordRef.current = null;
          setSelectedRecord(null);
        }
        return;
      }

      didSetRecordInTickRef.current = true;
      queueMicrotask(() => {
        didSetRecordInTickRef.current = false;
      });

      if (selectedRecordRef.current === null) {
        pushNavSnapshotOncePerTick();
      }

      selectedRecordRef.current = nextRecord;
      setSelectedRecord(nextRecord);
    },
    [pushNavSnapshotOncePerTick]
  );

  const handleSetSelectedCategory = useCallback(
    (nextCategory: RecordCategory) => {
      if (nextCategory !== selectedCategoryRef.current || activeViewRef.current !== 'items') {
        pushNavSnapshotOncePerTick();
      }
      selectedCategoryRef.current = nextCategory;
      setSelectedCategory(nextCategory);

      if (!didSetRecordInTickRef.current && selectedRecordRef.current !== null) {
        selectedRecordRef.current = null;
        setSelectedRecord(null);
      }
    },
    [pushNavSnapshotOncePerTick]
  );

  const handleSetActiveView = useCallback(
    (nextView: AppView) => {
      if (nextView === 'dashboard') {
        navStackRef.current = [];
        activeViewRef.current = 'dashboard';
        selectedCategoryRef.current = 'all';
        selectedRecordRef.current = null;
        setActiveView('dashboard');
        setSelectedCategory('all');
        setSelectedRecord(null);
        return;
      }

      if (nextView !== activeViewRef.current) {
        pushNavSnapshotOncePerTick();
        activeViewRef.current = nextView;
        setActiveView(nextView);
      }

      if (!didSetRecordInTickRef.current && selectedRecordRef.current !== null) {
        selectedRecordRef.current = null;
        setSelectedRecord(null);
      }
    },
    [pushNavSnapshotOncePerTick]
  );

  const navigateBack = useCallback(() => {
    const currentView = activeViewRef.current;
    const currentCat = selectedCategoryRef.current;
    const currentRecId = selectedRecordRef.current?.id ?? null;

    let target: { view: AppView; category: RecordCategory; recordId: string | null } | undefined;
    while (navStackRef.current.length > 0) {
      const candidate = navStackRef.current.pop()!;
      const isSameState =
        candidate.view === currentView &&
        (candidate.view !== 'items' ||
          (candidate.category === currentCat && candidate.recordId === currentRecId));
      if (!isSameState) {
        target = candidate;
        break;
      }
    }

    if (!target || target.view === 'dashboard') {
      navStackRef.current = [];
      activeViewRef.current = 'dashboard';
      selectedCategoryRef.current = 'all';
      selectedRecordRef.current = null;
      setActiveView('dashboard');
      setSelectedCategory('all');
      setSelectedRecord(null);
      return;
    }

    activeViewRef.current = target.view;
    selectedCategoryRef.current = target.category;
    const restoredRecord = target.recordId
      ? recordsRef.current.find((r) => r.id === target!.recordId) || null
      : null;
    selectedRecordRef.current = restoredRecord;

    setActiveView(target.view);
    setSelectedCategory(target.category);
    setSelectedRecord(restoredRecord);
  }, []);

  const canGoBack = activeView !== 'dashboard' || (activeView === 'items' && selectedRecord !== null);

  useBackHandler({
    id: 'vault-screen-navigation',
    enabled: status === 'unlocked' && canGoBack,
    priority: 50,
    onBack: navigateBack,
  });

  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    async function init() {
      try {
        setIsLoading(true);
        const storedSettings = await secureStorageService.getItem<AppSettings>(STORAGE_KEYS.SETTINGS);
        if (storedSettings) {
          setSettings({ ...DEFAULT_SETTINGS, ...storedSettings });
        }

        const initialFailed = await vaultRepository.getFailedUnlockAttempts();
        setFailedAttempts(initialFailed);

        const isInit = await vaultRepository.isInitialized();
        if (isInit) {
          const meta = await vaultRepository.getMetadata();
          setMetadata(meta);
          setStatus('locked');
        } else {
          setStatus('uninitialized');
        }
      } catch {
        setError('Error initializing vault storage');
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, []);

  useEffect(() => {
    passwordChangeDetectionService.setRecordsProvider(() => records);
  }, [records]);

  useEffect(() => {
    const unsub = passwordChangeDetectionService.subscribe((change) => {
      setDetectedPasswordChange(change);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = clipboardService.onCountdown((seconds) => {
      setClipboardSeconds(seconds);
      if (seconds <= 0) {
        setCopiedFieldLabel(null);
      }
    });
    return unsub;
  }, []);

  const recordUserActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const lockVault = useCallback(() => {
    setCryptoKey(null);
    setRecords([]);
    selectedRecordRef.current = null;
    setSelectedRecord(null);
    setEditingRecord(null);
    setIsMobileMenuOpen(false);
    setIntegrityWarning(null);
    activeViewRef.current = 'dashboard';
    selectedCategoryRef.current = 'all';
    navStackRef.current = [];
    setActiveView('dashboard');
    setSelectedCategory('all');
    vaultRepository.setActiveKey(null);
    setStatus('locked');
    clipboardService.clearNow();
  }, []);

  useEffect(() => {
    if (status !== 'unlocked') return;

    window.addEventListener('mousemove', recordUserActivity, { passive: true });
    window.addEventListener('keydown', recordUserActivity, { passive: true });
    window.addEventListener('click', recordUserActivity, { passive: true });
    window.addEventListener('scroll', recordUserActivity, { passive: true });

    const handleVisibilityChange = () => {
      if (document.hidden && settings.autoLockMinutes === 0) {
        lockVault();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const checkInterval = window.setInterval(() => {
      if (settings.autoLockMinutes <= 0) return;

      const timeoutMs = settings.autoLockMinutes * 60 * 1000;
      const elapsed = Date.now() - lastActivityRef.current;

      if (elapsed >= timeoutMs) {
        lockVault();
      }
    }, 5000);

    return () => {
      window.removeEventListener('mousemove', recordUserActivity);
      window.removeEventListener('keydown', recordUserActivity);
      window.removeEventListener('click', recordUserActivity);
      window.removeEventListener('scroll', recordUserActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(checkInterval);
    };
  }, [status, settings.autoLockMinutes, recordUserActivity, lockVault]);

  const securityReport = useMemo<SecurityScoreReport | null>(() => {
    if (status !== 'unlocked') return null;
    return passwordHealthService.auditVault(records);
  }, [records, status]);

  const filteredRecords = useMemo<VaultRecord[]>(() => {
    let list = [...records];

    if (selectedCategory === 'trash') {
      list = list.filter((r) => Boolean(r.deletedAt));
    } else {
      list = list.filter((r) => !r.deletedAt);
      if (selectedCategory === 'favorites') {
        list = list.filter((r) => r.favorite);
      } else if (selectedCategory !== 'all') {
        list = list.filter((r) => {
          if (selectedCategory === 'card' || selectedCategory === 'cards') {
            return r.category === 'card' || r.category === 'cards';
          }
          if (selectedCategory === 'note' || selectedCategory === 'notes') {
            return r.category === 'note' || r.category === 'notes';
          }
          return r.category === selectedCategory;
        });
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.username && r.username.toLowerCase().includes(q)) ||
          (r.email && r.email.toLowerCase().includes(q)) ||
          (r.website && r.website.toLowerCase().includes(q)) ||
          (r.url && r.url.toLowerCase().includes(q)) ||
          (r.bankName && r.bankName.toLowerCase().includes(q)) ||
          r.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      if (sortBy === 'title_asc') return a.title.localeCompare(b.title);
      if (sortBy === 'title_desc') return b.title.localeCompare(a.title);
      if (sortBy === 'category') return a.category.localeCompare(b.category);
      return b.updatedAt - a.updatedAt;
    });

    return list;
  }, [records, selectedCategory, searchQuery, sortBy]);

  const createVault = async (
    password: string,
    securityLevel: 'standard' | 'high' = 'high',
    passwordHint?: string
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const { metadata: newMeta, cryptoKey: key, recoveryKey } =
        await vaultRepository.createVault(password, securityLevel, passwordHint);

      setMetadata(newMeta);
      setCryptoKey(key);
      setRecords([]);
      setStatus('unlocked');
      setRecoveryKeyNotice(recoveryKey);
      setIntegrityWarning(null);
      setFailedAttempts(0);
      lastActivityRef.current = Date.now();
      return recoveryKey;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create vault.';
      setError(msg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const createNewVault = async (password: string): Promise<string> => {
    return await createVault(password, 'high');
  };

  const unlockWithPassword = async (password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const { cryptoKey: key, records: decryptedRecords } =
        await vaultRepository.unlockWithPassword(password);

      setCryptoKey(key);
      setRecords(decryptedRecords);
      setIntegrityWarning(vaultRepository.getIntegrityWarning());
      setStatus('unlocked');
      setFailedAttempts(0);
      lastActivityRef.current = Date.now();
      return true;
    } catch (err: unknown) {
      const count = await vaultRepository.getFailedUnlockAttempts();
      setFailedAttempts(count);
      const isStillInit = await vaultRepository.isInitialized();
      if (!isStillInit) {
        setStatus('uninitialized');
        setMetadata(null);
        setCryptoKey(null);
        setRecords([]);
      }
      const msg = err instanceof Error ? err.message : 'Invalid master password.';
      setError(msg);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const unlock = async (
    password: string
  ): Promise<{ success: boolean; error?: string; remainingLockoutMs?: number }> => {
    const ok = await unlockWithPassword(password);
    if (ok) {
      return { success: true };
    }
    return {
      success: false,
      error: error || 'Invalid Master Password. Decryption authentication tag mismatch.',
    };
  };

  const unlockWithRecoveryKey = async (recoveryKey: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const { cryptoKey: key, records: decryptedRecords } =
        await vaultRepository.unlockWithRecoveryKey(recoveryKey);

      setCryptoKey(key);
      setRecords(decryptedRecords);
      setIntegrityWarning(vaultRepository.getIntegrityWarning());
      setStatus('unlocked');
      setFailedAttempts(0);
      lastActivityRef.current = Date.now();
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid recovery key.';
      setError(msg);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const refreshRecords = async () => {
    if (!cryptoKey) return;
    setIsLoading(true);
    try {
      const updated = await vaultRepository.getDecryptedRecords(cryptoKey);
      setRecords(updated);
      setIntegrityWarning(vaultRepository.getIntegrityWarning());
      setSelectedRecord((prev) => {
        if (!prev) {
          selectedRecordRef.current = null;
          return null;
        }
        const found = updated.find((r) => r.id === prev.id) || null;
        selectedRecordRef.current = found;
        return found;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveRecord = useCallback(
    async (record: VaultRecord) => {
      if (!cryptoKey) throw new Error('Vault is locked');
      recordUserActivity();
      const normalized: VaultRecord = {
        ...record,
        type: record.type || 'login',
        website: record.website || record.url,
        url: record.url || record.website,
      };

      // Optimistically update in-memory state immediately so UI feels instantaneous
      setRecords((prev) => {
        const idx = prev.findIndex((r) => r.id === normalized.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = normalized;
          return next;
        }
        return [normalized, ...prev];
      });
      if (selectedRecordRef.current && selectedRecordRef.current.id === normalized.id) {
        selectedRecordRef.current = normalized;
      }
      setSelectedRecord((prev) => (prev && prev.id === normalized.id ? normalized : prev));

      await vaultRepository.saveRecord(normalized, cryptoKey);
    },
    [cryptoKey, recordUserActivity]
  );

  const addRecord = useCallback(
    async (recordInput: Omit<VaultRecord, 'id' | 'createdAt' | 'updatedAt'>) => {
      const now = Date.now();
      const fullRecord: VaultRecord = {
        ...recordInput,
        id: 'rec_' + window.crypto.randomUUID(),
        type: recordInput.type || 'login',
        website: recordInput.website || recordInput.url,
        url: recordInput.url || recordInput.website,
        createdAt: now,
        updatedAt: now,
      };
      await saveRecord(fullRecord);
    },
    [saveRecord]
  );

  const updateRecord = useCallback(
    async (id: string, updates: Partial<VaultRecord>) => {
      const existing = records.find((r) => r.id === id);
      if (!existing) return;

      const now = Date.now();
      let passwordHistory = existing.passwordHistory || [];
      if (updates.password && existing.password && updates.password !== existing.password) {
        passwordHistory = [
          {
            id: 'hist_' + window.crypto.randomUUID(),
            password: existing.password,
            changedAt: now,
          },
          ...passwordHistory,
        ].slice(0, 15);
      }

      const updated: VaultRecord = {
        ...existing,
        ...updates,
        website: updates.website ?? updates.url ?? existing.website ?? existing.url,
        url: updates.url ?? updates.website ?? existing.url ?? existing.website,
        passwordHistory,
        updatedAt: now,
      };
      await saveRecord(updated);
    },
    [records, saveRecord]
  );

  const deleteRecord = useCallback(
    async (id: string) => {
      if (!cryptoKey) throw new Error('Vault is locked');
      recordUserActivity();
      setRecords((prev) => prev.filter((r) => r.id !== id));
      if (selectedRecordRef.current?.id === id) {
        selectedRecordRef.current = null;
      }
      setSelectedRecord((prev) => (prev?.id === id ? null : prev));
      await vaultRepository.deleteRecord(id);
    },
    [cryptoKey, recordUserActivity]
  );

  const softDeleteRecord = useCallback(
    async (id: string) => {
      if (selectedRecordRef.current?.id === id) {
        selectedRecordRef.current = null;
      }
      setSelectedRecord((prev) => (prev?.id === id ? null : prev));
      await updateRecord(id, { deletedAt: Date.now() });
    },
    [updateRecord]
  );

  const restoreRecord = useCallback(
    async (id: string) => {
      await updateRecord(id, { deletedAt: undefined });
    },
    [updateRecord]
  );

  const permanentlyDeleteRecord = useCallback(
    async (id: string) => {
      await deleteRecord(id);
    },
    [deleteRecord]
  );

  const toggleFavorite = useCallback(
    async (id: string) => {
      if (!cryptoKey) return;
      const rec = records.find((r) => r.id === id);
      if (rec) {
        const updated = { ...rec, favorite: !rec.favorite, updatedAt: Date.now() };
        await saveRecord(updated);
      }
    },
    [cryptoKey, records, saveRecord]
  );

  const duplicateRecord = useCallback(
    async (record: VaultRecord) => {
      if (!cryptoKey) return;
      const duplicated: VaultRecord = {
        ...record,
        id: 'rec_' + window.crypto.randomUUID(),
        title: `${record.title} (Copy)`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        favorite: false,
      };
      await saveRecord(duplicated);
    },
    [cryptoKey, saveRecord]
  );

  const importMultipleRecords = async (
    importedInput: VaultRecord[] | Promise<VaultRecord[]>
  ): Promise<number> => {
    if (!cryptoKey) throw new Error('Vault is locked');
    const resolved = await importedInput;
    for (const item of resolved) {
      await vaultRepository.saveRecord(
        {
          ...item,
          type: item.type || 'login',
        },
        cryptoKey
      );
    }
    await refreshRecords();
    return resolved.length;
  };

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    const merged = { ...settings, ...newSettings };
    setSettings(merged);
    await secureStorageService.setItem(STORAGE_KEYS.SETTINGS, merged);
  };

  const setAutoLockMinutes = async (minutes: number) => {
    await updateSettings({ autoLockMinutes: minutes });
  };

  const setClipboardClearSeconds = async (seconds: number) => {
    await updateSettings({ clipboardClearSeconds: seconds });
  };

  const copySecretToClipboard = async (secret: string): Promise<boolean> => {
    recordUserActivity();
    return await clipboardService.copySensitive(secret, settings.clipboardClearSeconds);
  };

  const copyToClipboard = async (secret: string, fieldLabel?: string): Promise<boolean> => {
    const ok = await copySecretToClipboard(secret);
    if (ok && fieldLabel) {
      setCopiedFieldLabel(fieldLabel);
    }
    return ok;
  };

  const clearClipboardNow = async () => {
    setCopiedFieldLabel(null);
    await clipboardService.clearNow();
  };

  const wipeVault = async () => {
    biometricService.disableBiometricUnlock();
    await vaultRepository.wipeVault();
    setCryptoKey(null);
    setRecords([]);
    setMetadata(null);
    setIntegrityWarning(null);
    setFailedAttempts(0);
    setDetectedPasswordChange(null);
    setStatus('uninitialized');
    selectedRecordRef.current = null;
    setSelectedRecord(null);
    setEditingRecord(null);
    activeViewRef.current = 'dashboard';
    selectedCategoryRef.current = 'all';
    navStackRef.current = [];
    setActiveView('dashboard');
    setSelectedCategory('all');
  };

  const fetchFailedAttempts = async (): Promise<number> => {
    const count = await vaultRepository.getFailedUnlockAttempts();
    setFailedAttempts(count);
    return count;
  };

  const updatePasswordHint = async (hint: string): Promise<boolean> => {
    const success = await vaultRepository.updatePasswordHint(hint);
    if (success) {
      const updatedMeta = await vaultRepository.getMetadata();
      setMetadata(updatedMeta);
    }
    return success;
  };

  const applyDetectedPasswordChange = async (change: DetectedPasswordChange): Promise<boolean> => {
    return await passwordChangeDetectionService.applyPasswordChange(change, saveRecord, records);
  };

  const dismissRecoveryNotice = () => {
    setRecoveryKeyNotice(null);
  };

  const dismissIntegrityWarning = () => {
    vaultRepository.clearIntegrityWarning();
    setIntegrityWarning(null);
  };

  const reEncryptVaultWithNewPassword = async (oldPassword: string, newPassword: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const success = await vaultRepository.changeMasterPassword(oldPassword, newPassword);
      if (success) {
        await biometricService.handleMasterPasswordRotated(newPassword);
        const updatedMeta = await vaultRepository.getMetadata();
        setMetadata(updatedMeta);
      }
      return success;
    } catch {
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const changeMasterPassword = async (
    oldPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    const ok = await reEncryptVaultWithNewPassword(oldPassword, newPassword);
    if (ok) {
      return { success: true };
    }
    return {
      success: false,
      error: 'Current Master Password is incorrect or key rotation failed.',
    };
  };

  return (
    <VaultContext.Provider
      value={{
        status,
        isLoading,
        isVaultLoading: isLoading,
        error,
        metadata,
        records,
        filteredRecords,
        securityReport,
        settings,
        activeView,
        selectedCategory,
        searchQuery,
        sortBy,
        selectedRecord,
        editingRecord,
        isCreateModalOpen,
        isGeneratorModalOpen,
        clipboardSeconds,
        copiedFieldLabel,
        recoveryKeyNotice,
        isMobileMenuOpen,
        integrityWarning,
        failedAttempts,
        detectedPasswordChange,
        activeSettingsTab,
        autoLockMinutes: settings.autoLockMinutes,
        clipboardClearSeconds: settings.clipboardClearSeconds,
        setActiveView: handleSetActiveView,
        navigateBack,
        canGoBack,
        setActiveSettingsTab,
        setSelectedCategory: handleSetSelectedCategory,
        setSearchQuery,
        setSortBy,
        setSelectedRecord: handleSetSelectedRecord,
        setEditingRecord,
        setIsCreateModalOpen,
        setIsGeneratorModalOpen,
        setIsMobileMenuOpen,
        setAutoLockMinutes,
        setClipboardClearSeconds,
        dismissRecoveryNotice,
        dismissIntegrityWarning,
        setDetectedPasswordChange,
        applyDetectedPasswordChange,
        updatePasswordHint,
        fetchFailedAttempts,
        createVault,
        createNewVault,
        unlockWithPassword,
        unlock,
        unlockWithRecoveryKey,
        lockVault,
        wipeVault,
        saveRecord,
        addRecord,
        updateRecord,
        deleteRecord,
        softDeleteRecord,
        restoreRecord,
        permanentlyDeleteRecord,
        toggleFavorite,
        duplicateRecord,
        importMultipleRecords,
        updateSettings,
        copySecretToClipboard,
        copyToClipboard,
        clearClipboardNow,
        refreshRecords,
        activeKey: cryptoKey,
        cryptoKey: cryptoKey,
        reEncryptVaultWithNewPassword,
        changeMasterPassword,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
};

export const useVault = () => {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error('useVault must be used within a VaultProvider');
  }
  return context;
};
