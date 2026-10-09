/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ThemeProvider } from './context/ThemeContext';
import { VaultProvider, useVault } from './context/VaultContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { WelcomeScreen } from './components/auth/WelcomeScreen';
import { CreateVaultScreen } from './components/auth/CreateVaultScreen';
import { UnlockVaultScreen } from './components/auth/UnlockVaultScreen';
import { DashboardView } from './components/vault/DashboardView';
import { RecordListView } from './components/vault/RecordListView';
import { RecordDetailView } from './components/vault/RecordDetailView';
import { RecordEditModal } from './components/vault/RecordEditModal';
import { CategoriesView } from './components/vault/CategoriesView';
import { PasswordGeneratorView } from './components/generator/PasswordGeneratorView';
import { SecurityCenterView } from './components/security/SecurityCenterView';
import { AuditRunnerView } from './components/security/AuditRunnerView';
import { SettingsView } from './components/settings/SettingsView';
import { Modal } from './components/common/Modal';
import { backupService } from './storage/BackupService';
import { InstallAppPromptBanner } from './components/mobile/InstallAppPromptBanner';
import { UpdateNotificationBanner } from './components/common/UpdateNotificationBanner';
import { PasswordChangePromptModal } from './components/vault/PasswordChangePromptModal';
import { DetectedPasswordChange } from './types/vault';
import { GoogleDriveBackupModal } from './components/recovery/GoogleDriveBackupModal';
import { QRScannerModal } from './components/recovery/QRScannerModal';
import { SplashScreen } from './components/common/SplashScreen';
import { useBackHandler } from './hooks/useBackHandler';

const VaultApp: React.FC = () => {
  const {
    status,
    activeView,
    selectedRecord,
    setSelectedRecord,
    isCreateModalOpen,
    setIsCreateModalOpen,
    editingRecord,
    setEditingRecord,
    isGeneratorModalOpen,
    setIsGeneratorModalOpen,
    integrityWarning,
    dismissIntegrityWarning,
    detectedPasswordChange,
    setDetectedPasswordChange,
    applyDetectedPasswordChange,
    applyRestoredVault,
  } = useVault();

  const [isApplyingPasswordChange, setIsApplyingPasswordChange] = useState(false);

  const handleConfirmPasswordChange = async (change: DetectedPasswordChange) => {
    setIsApplyingPasswordChange(true);
    try {
      const ok = await applyDetectedPasswordChange(change);
      if (ok) {
        setDetectedPasswordChange(null);
      }
    } finally {
      setIsApplyingPasswordChange(false);
    }
  };

  // Sub-navigation state for initial onboarding
  const [isOnboardingCreate, setIsOnboardingCreate] = useState(false);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccessMessage, setRestoreSuccessMessage] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Disaster Recovery modals (Google Drive & QR Scanner)
  const [isGoogleDriveModalOpen, setIsGoogleDriveModalOpen] = useState(false);
  const [isQRScannerModalOpen, setIsQRScannerModalOpen] = useState(false);

  // Handle Android back button on uninitialized onboarding screens
  useBackHandler({
    id: 'onboarding-create-vault-screen',
    enabled: status === 'uninitialized' && isOnboardingCreate,
    priority: 70,
    onBack: () => setIsOnboardingCreate(false),
  });

  useBackHandler({
    id: 'onboarding-restore-modal',
    enabled: status === 'uninitialized' && isRestoreModalOpen,
    priority: 100,
    onBack: () => setIsRestoreModalOpen(false),
  });

  // Scroll viewport to vault-integrity-alert-banner if rendered off-screen when vault is first unlocked
  const hasScrolledIntegrityBannerRef = React.useRef(false);

  React.useEffect(() => {
    if (status !== 'unlocked') {
      hasScrolledIntegrityBannerRef.current = false;
      return;
    }

    if (status === 'unlocked' && integrityWarning && !hasScrolledIntegrityBannerRef.current) {
      const timer = setTimeout(() => {
        const banner = document.getElementById('vault-integrity-alert-banner');
        if (banner) {
          const rect = banner.getBoundingClientRect();
          const windowHeight = window.innerHeight || document.documentElement.clientHeight;
          const windowWidth = window.innerWidth || document.documentElement.clientWidth;

          const isOffScreen =
            rect.top < 0 ||
            rect.bottom > windowHeight ||
            rect.left < 0 ||
            rect.right > windowWidth;

          if (isOffScreen) {
            banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          hasScrolledIntegrityBannerRef.current = true;
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [status, integrityWarning]);

  // Restore handler for uninitialized or locked vault
  const handleRestoreBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreFile || !restorePassword) return;

    setIsRestoring(true);
    setRestoreError(null);
    setRestoreSuccessMessage(null);
    try {
      const fileText = await restoreFile.text();
      const restored = await backupService.restoreEncryptedBackup(fileText, restorePassword);
      applyRestoredVault(restored);
      setRestoreSuccessMessage(
        `Restored ${restored.recordCount} credentials! Opening vault...`
      );
      setIsRestoreModalOpen(false);
      setRestoreFile(null);
      setRestorePassword('');
    } catch (err: unknown) {
      setRestoreError(
        err instanceof Error ? err.message : 'Decryption failed. Check your password.'
      );
    } finally {
      setIsRestoring(false);
    }
  };

  // Shared Restore Backup Modal Content
  const renderRestoreModal = () => (
    <Modal
      isOpen={isRestoreModalOpen}
      onClose={() => setIsRestoreModalOpen(false)}
      title="Restore Vault from Backup"
      subtitle="Select an encrypted .vault backup file and enter its password."
      maxWidth="md"
    >
      <form onSubmit={handleRestoreBackup} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-text-primary mb-1.5">
            Encrypted .vault Backup File
          </label>
          <input
            type="file"
            accept=".vault,.json"
            onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
            className="w-full text-xs text-text-secondary file:mr-3 file:py-2 file:px-3.5 file:rounded-lg file:border file:border-border file:text-xs file:font-semibold file:bg-bg-secondary file:text-text-primary hover:file:bg-bg-elevated cursor-pointer"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-text-primary mb-1.5">
            Backup Password
          </label>
          <input
            type="password"
            value={restorePassword}
            onChange={(e) => setRestorePassword(e.target.value)}
            placeholder="Enter password used to encrypt this backup..."
            className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-bg-surface text-text-primary placeholder:text-text-muted text-xs focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            required
          />
        </div>

        {restoreError && (
          <p className="text-xs text-error bg-error/10 border border-error/20 p-2.5 rounded-lg">{restoreError}</p>
        )}

        {restoreSuccessMessage && (
          <p className="text-xs text-success bg-success/10 border border-success/20 p-2.5 rounded-lg">{restoreSuccessMessage}</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setIsRestoreModalOpen(false)}
            className="px-4 py-2 rounded-lg border border-border text-text-secondary hover:bg-bg-secondary text-xs font-medium cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isRestoring || !restoreFile || !restorePassword}
            className="btn-primary px-4 py-2 rounded-lg text-xs cursor-pointer disabled:opacity-50"
          >
            {isRestoring ? 'Decrypting...' : 'Restore Vault'}
          </button>
        </div>
      </form>
    </Modal>
  );

  // 1. Uninitialized Vault State (First Run)
  if (status === 'uninitialized') {
    if (isOnboardingCreate) {
      return (
        <CreateVaultScreen
          onCancel={() => setIsOnboardingCreate(false)}
          onSuccess={() => setIsOnboardingCreate(false)}
        />
      );
    }

    return (
      <>
        <WelcomeScreen
          onCreateVault={() => setIsOnboardingCreate(true)}
          onRestoreBackup={() => setIsRestoreModalOpen(true)}
          onRestoreFromGoogleDrive={() => setIsGoogleDriveModalOpen(true)}
          onScanRecoveryKitQr={() => setIsQRScannerModalOpen(true)}
        />

        <GoogleDriveBackupModal
          isOpen={isGoogleDriveModalOpen}
          onClose={() => setIsGoogleDriveModalOpen(false)}
          onRestoreSuccess={() => {
            setIsGoogleDriveModalOpen(false);
          }}
        />

        <QRScannerModal
          isOpen={isQRScannerModalOpen}
          onClose={() => setIsQRScannerModalOpen(false)}
          onSuccess={() => {
            setIsQRScannerModalOpen(false);
          }}
        />

        {renderRestoreModal()}
      </>
    );
  }

  // 2. Locked Vault State
  if (status === 'locked') {
    return (
      <>
        <UnlockVaultScreen
          onRestoreBackup={() => setIsRestoreModalOpen(true)}
          onRestoreFromGoogleDrive={() => setIsGoogleDriveModalOpen(true)}
          onScanRecoveryKitQr={() => setIsQRScannerModalOpen(true)}
        />

        <GoogleDriveBackupModal
          isOpen={isGoogleDriveModalOpen}
          onClose={() => setIsGoogleDriveModalOpen(false)}
          onRestoreSuccess={() => {
            setIsGoogleDriveModalOpen(false);
          }}
        />

        <QRScannerModal
          isOpen={isQRScannerModalOpen}
          onClose={() => setIsQRScannerModalOpen(false)}
          onSuccess={() => {
            setIsQRScannerModalOpen(false);
          }}
        />

        {renderRestoreModal()}
      </>
    );
  }

  // 3. Unlocked Vault State (Main App)
  return (
    <div className="h-dvh overflow-hidden bg-bg-app flex flex-col antialiased text-text-primary transition-colors">
      <Header />

      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar */}
        <Sidebar />

        {/* Main Content View */}
        <main className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6 lg:p-8">
          {integrityWarning && (
            <div
              id="vault-integrity-alert-banner"
              className="max-w-7xl mx-auto mb-6 p-4 rounded-xl border border-error/30 bg-error/10 text-text-primary flex items-start justify-between gap-4 shadow-xs"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-error shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-error">Vault Integrity Warning</h4>
                  <p className="text-sm text-text-secondary mt-0.5">{integrityWarning}</p>
                </div>
              </div>
              <button
                id="dismiss-integrity-warning-btn"
                onClick={dismissIntegrityWarning}
                className="text-xs font-medium text-error hover:bg-error/20 bg-error/10 px-3 py-1.5 rounded-lg transition-colors shrink-0 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {activeView === 'dashboard' && <DashboardView />}

          {activeView === 'items' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-start max-w-7xl mx-auto">
              <div
                className={`${
                  selectedRecord ? 'hidden lg:block lg:col-span-5 xl:col-span-5' : 'col-span-12'
                }`}
              >
                <RecordListView />
              </div>

              {selectedRecord && (
                <div className="col-span-12 lg:col-span-7 xl:col-span-7">
                  <RecordDetailView />
                </div>
              )}
            </div>
          )}

          {activeView === 'categories' && <CategoriesView />}
          {activeView === 'security_center' && <SecurityCenterView />}
          {activeView === 'generator' && <PasswordGeneratorView />}
          {activeView === 'audit' && <AuditRunnerView />}
          {activeView === 'settings' && <SettingsView />}
        </main>
      </div>

      {/* Global Modals */}
      <RecordEditModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} />

      <RecordEditModal
        isOpen={!!editingRecord}
        onClose={() => setEditingRecord(null)}
        recordToEdit={editingRecord}
      />

      <Modal
        isOpen={isGeneratorModalOpen}
        onClose={() => setIsGeneratorModalOpen(false)}
        title="Password & Passphrase Generator"
        subtitle="Cryptographically random secrets generated locally with CSPRNG"
        maxWidth="lg"
      >
        {isGeneratorModalOpen && <PasswordGeneratorView isModal={true} />}
      </Modal>

      <PasswordChangePromptModal
        change={detectedPasswordChange}
        onConfirm={handleConfirmPasswordChange}
        onDismiss={() => setDetectedPasswordChange(null)}
        isUpdating={isApplyingPasswordChange}
      />
    </div>
  );
};

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <ThemeProvider>
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
      <VaultProvider>
        <VaultApp />
      </VaultProvider>
    </ThemeProvider>
  );
}
