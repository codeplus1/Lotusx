/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultRecord, DetectedPasswordChange } from '../types/vault';
import { STORAGE_KEYS } from '../core/constants';
import { secureStorageService } from '../storage/SecureStorageService';

export interface PendingChangeSession {
  recordId: string;
  domain: string;
  title: string;
  username?: string;
  currentPassword?: string;
  startedAt: number;
}

export type PasswordChangeListener = (change: DetectedPasswordChange | null) => void;

export class PasswordChangeDetectionService {
  private activeDetectedChange: DetectedPasswordChange | null = null;
  private pendingSession: PendingChangeSession | null = null;
  private listeners: Set<PasswordChangeListener> = new Set();
  private isFocusListenerAttached = false;
  private getRecordsCallback: (() => VaultRecord[]) | null = null;

  constructor() {
    this.restorePendingSession();
    this.setupAutofillBridge();
  }

  public setRecordsProvider(callback: () => VaultRecord[]) {
    this.getRecordsCallback = callback;
    this.attachFocusListener();
  }

  private async restorePendingSession() {
    try {
      const stored = await secureStorageService.getItem<PendingChangeSession>(
        STORAGE_KEYS.PENDING_CHANGE_SESSION
      );
      if (stored && Date.now() - stored.startedAt < 30 * 60 * 1000) {
        // Valid within 30 minutes
        this.pendingSession = stored;
      } else {
        await secureStorageService.removeItem(STORAGE_KEYS.PENDING_CHANGE_SESSION);
      }
    } catch {
      // Storage unavailable or uninitialized
    }
  }

  /**
   * Registers a pending credential update session when a user clicks "Change Password"
   * or visits a website from LotusX.
   */
  public async registerPendingSession(record: VaultRecord): Promise<void> {
    const domain = this.extractDomain(record.website || record.title);
    const session: PendingChangeSession = {
      recordId: record.id,
      domain,
      title: record.title,
      username: record.username,
      currentPassword: record.password,
      startedAt: Date.now(),
    };
    this.pendingSession = session;
    await secureStorageService.setItem(STORAGE_KEYS.PENDING_CHANGE_SESSION, session);
  }

  public getPendingSession(): PendingChangeSession | null {
    return this.pendingSession;
  }

  public async clearPendingSession(): Promise<void> {
    this.pendingSession = null;
    await secureStorageService.removeItem(STORAGE_KEYS.PENDING_CHANGE_SESSION);
  }

  /**
   * Safely checks clipboard for a new password when returning to LotusX.
   * Never stores or transmits unrelated text.
   */
  public async checkClipboardForChange(records: VaultRecord[]): Promise<DetectedPasswordChange | null> {
    if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
      return null;
    }

    try {
      const text = await navigator.clipboard.readText();
      return this.evaluateCandidatePassword(text, records);
    } catch {
      return null;
    }
  }

  /**
   * Evaluates if a given string is a changed password for an existing vault record.
   * Strictly verifies:
   * 1. Candidate must belong to a known target record in LotusX.
   * 2. Candidate must differ from the existing password.
   * 3. Discards candidate immediately if unrelated.
   */
  public evaluateCandidatePassword(
    candidate: string,
    records: VaultRecord[]
  ): DetectedPasswordChange | null {
    if (!candidate || typeof candidate !== 'string') return null;
    const clean = candidate.trim();
    if (clean.length < 6 || clean.length > 256) return null;

    // 1. If we have an active pending session from a recent "Change Password" launch:
    if (this.pendingSession) {
      const target = records.find((r) => r.id === this.pendingSession!.recordId);
      if (target && target.password !== clean) {
        const change: DetectedPasswordChange = {
          recordId: target.id,
          recordTitle: target.title,
          website: target.website,
          username: target.username,
          oldPassword: target.password,
          newPassword: clean,
          detectedAt: Date.now(),
          source: 'browser_session',
        };
        this.stageDetectedChange(change);
        return change;
      }
    }

    // 2. If no pending session, check if the candidate matches any record's history or is an updated variant
    return null;
  }

  /**
   * Explicit test/simulation method for UI testing or platform bridge events
   */
  public stageSimulatedChange(record: VaultRecord, newPassword: string): DetectedPasswordChange {
    const change: DetectedPasswordChange = {
      recordId: record.id,
      recordTitle: record.title,
      website: record.website,
      username: record.username,
      oldPassword: record.password,
      newPassword,
      detectedAt: Date.now(),
      source: 'manual',
    };
    this.stageDetectedChange(change);
    return change;
  }

  public stageDetectedChange(change: DetectedPasswordChange): void {
    this.activeDetectedChange = change;
    this.notifyListeners();
  }

  public getActiveDetectedChange(): DetectedPasswordChange | null {
    return this.activeDetectedChange;
  }

  public dismissDetectedChange(): void {
    this.activeDetectedChange = null;
    this.clearPendingSession();
    this.notifyListeners();
  }

  /**
   * Only updates the corresponding LotusX credential AFTER explicit user confirmation.
   * Automatically archives prior password in passwordHistory.
   */
  public async applyPasswordChange(
    change: DetectedPasswordChange,
    saveRecordFn: (rec: VaultRecord) => Promise<void>,
    records: VaultRecord[]
  ): Promise<boolean> {
    const target = records.find((r) => r.id === change.recordId);
    if (!target) {
      this.dismissDetectedChange();
      return false;
    }

    // Prepare updated password history
    const history = target.passwordHistory ? [...target.passwordHistory] : [];
    if (target.password && target.password !== change.newPassword) {
      history.unshift({
        id: 'hist_' + window.crypto.randomUUID(),
        password: target.password,
        changedAt: Date.now(),
      });
    }

    const updatedRecord: VaultRecord = {
      ...target,
      password: change.newPassword,
      passwordHistory: history.slice(0, 20), // Retain up to 20 historical versions
      updatedAt: Date.now(),
    };

    await saveRecordFn(updatedRecord);
    this.dismissDetectedChange();
    return true;
  }

  public subscribe(listener: PasswordChangeListener): () => void {
    this.listeners.add(listener);
    listener(this.activeDetectedChange);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.activeDetectedChange);
    }
  }

  private attachFocusListener(): void {
    if (this.isFocusListenerAttached || typeof window === 'undefined') return;
    this.isFocusListenerAttached = true;

    window.addEventListener('focus', async () => {
      if (this.pendingSession && this.getRecordsCallback) {
        const records = this.getRecordsCallback();
        // Check if clipboard holds new password from changed website
        await this.checkClipboardForChange(records);
      }
    });
  }

  /**
   * Sets up Android / Flutter Autofill Bridge for native integration
   * If LotusX is wrapped in Flutter WebView or Android Autofill Service,
   * the native platform calls window.LotusXAutofillBridge.notifyPasswordChanged(...)
   */
  private setupAutofillBridge(): void {
    if (typeof window === 'undefined') return;

    (window as any).LotusXAutofillBridge = {
      notifyPasswordChanged: (domainOrUrl: string, username: string, newPassword: string) => {
        if (!this.getRecordsCallback) return false;
        const records = this.getRecordsCallback();
        const cleanDomain = this.extractDomain(domainOrUrl);

        // Find match in vault records
        const match = records.find((r) => {
          const recDomain = this.extractDomain(r.website || r.title);
          const domainMatches = recDomain.length > 0 && (cleanDomain.includes(recDomain) || recDomain.includes(cleanDomain));
          const userMatches = !username || !r.username || r.username.toLowerCase() === username.toLowerCase();
          return domainMatches && userMatches;
        });

        if (match && match.password !== newPassword) {
          const change: DetectedPasswordChange = {
            recordId: match.id,
            recordTitle: match.title,
            website: match.website,
            username: match.username || username,
            oldPassword: match.password,
            newPassword,
            detectedAt: Date.now(),
            source: 'autofill_bridge',
          };
          this.stageDetectedChange(change);
          return true;
        }
        return false;
      },
    };
  }

  public extractDomain(urlOrTitle?: string): string {
    if (!urlOrTitle) return '';
    try {
      let candidate = urlOrTitle.trim();
      if (!candidate.startsWith('http://') && !candidate.startsWith('https://')) {
        candidate = 'https://' + candidate;
      }
      const parsed = new URL(candidate);
      return parsed.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return urlOrTitle.trim().toLowerCase();
    }
  }
}

export const passwordChangeDetectionService = new PasswordChangeDetectionService();
