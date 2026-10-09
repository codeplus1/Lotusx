/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { googleDriveBackupService, GoogleDriveBackupService, DriveBackupFile } from './GoogleDriveBackupService';

export const BACKUP_REMINDER_THRESHOLD_DAYS = 30;
export const BACKUP_REMINDER_THRESHOLD_MS = BACKUP_REMINDER_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

export const LAST_GOOGLE_DRIVE_BACKUP_KEY = 'lotusx_last_gdrive_backup_at';
export const LEGACY_LAST_BACKUP_KEY = 'lotusx_last_backup_at';
export const BACKUP_REMINDER_DISMISSED_KEY = 'lotusx_gdrive_reminder_dismissed_at';
export const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours snooze after dismissal

export interface GoogleDriveBackupStatus {
  hasBackup: boolean;
  lastBackupAt: string | null;
  lastBackupFileName?: string;
  ageInDays: number | null;
  isOverdue: boolean;
  shouldRemind: boolean;
  isDismissed: boolean;
  source: 'drive_api' | 'local_cache' | 'none';
}

type StatusListener = (status: GoogleDriveBackupStatus) => void;

export class BackupReminderService {
  private listeners: Set<StatusListener> = new Set();

  constructor(private driveService: GoogleDriveBackupService = googleDriveBackupService) {}

  /**
   * Subscribes to changes in the Google Drive backup reminder state
   */
  public subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async notifyListeners(): Promise<void> {
    const status = await this.evaluateBackupStatus();
    for (const listener of this.listeners) {
      try {
        listener(status);
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  /**
   * Records a fresh Google Drive backup timestamp and clears any active reminder snooze
   */
  public recordSuccessfulDriveBackup(timestampIso?: string, fileName?: string): void {
    const iso = timestampIso || new Date().toISOString();
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(LAST_GOOGLE_DRIVE_BACKUP_KEY, iso);
        localStorage.setItem(LEGACY_LAST_BACKUP_KEY, iso);
        if (fileName) {
          localStorage.setItem(`${LAST_GOOGLE_DRIVE_BACKUP_KEY}_name`, fileName);
        }
        localStorage.removeItem(BACKUP_REMINDER_DISMISSED_KEY);
      } catch {
        // Ignore storage write errors
      }
    }
    void this.notifyListeners();
  }

  /**
   * Reads the cached last Google Drive backup timestamp from localStorage
   */
  public getCachedLastBackupDate(): { timestamp: string | null; fileName?: string } {
    if (typeof localStorage === 'undefined') {
      return { timestamp: null };
    }
    try {
      const gdriveTs = localStorage.getItem(LAST_GOOGLE_DRIVE_BACKUP_KEY);
      const fileName = localStorage.getItem(`${LAST_GOOGLE_DRIVE_BACKUP_KEY}_name`) || undefined;
      if (gdriveTs && !isNaN(new Date(gdriveTs).getTime())) {
        return { timestamp: gdriveTs, fileName };
      }
      const legacyTs = localStorage.getItem(LEGACY_LAST_BACKUP_KEY);
      if (legacyTs && !isNaN(new Date(legacyTs).getTime())) {
        return { timestamp: legacyTs };
      }
    } catch {
      // Ignore storage read errors
    }
    return { timestamp: null };
  }

  /**
   * Checks whether the user recently dismissed the gentle reminder (within the 24h snooze window)
   */
  public isReminderDismissed(): boolean {
    if (typeof localStorage === 'undefined') return false;
    try {
      const dismissedRaw = localStorage.getItem(BACKUP_REMINDER_DISMISSED_KEY);
      if (!dismissedRaw) return false;
      const dismissedTime = new Date(dismissedRaw).getTime();
      if (isNaN(dismissedTime)) return false;
      return Date.now() - dismissedTime < DISMISS_COOLDOWN_MS;
    } catch {
      return false;
    }
  }

  /**
   * Snoozes/dismisses the reminder on the dashboard
   */
  public dismissReminder(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(BACKUP_REMINDER_DISMISSED_KEY, new Date().toISOString());
      } catch {
        // Ignore
      }
    }
    void this.notifyListeners();
  }

  /**
   * Calculates the number of whole days elapsed since a given ISO date string
   */
  public calculateAgeInDays(isoTimestamp: string, referenceNow: number = Date.now()): number | null {
    const parsed = new Date(isoTimestamp).getTime();
    if (isNaN(parsed)) return null;
    const diffMs = Math.max(0, referenceNow - parsed);
    return Math.floor(diffMs / (24 * 60 * 60 * 1000));
  }

  /**
   * Checks whether a given backup timestamp is older than the threshold (default: 30 days)
   */
  public isBackupOlderThanThreshold(
    isoTimestamp: string,
    thresholdDays: number = BACKUP_REMINDER_THRESHOLD_DAYS,
    referenceNow: number = Date.now()
  ): boolean {
    const parsed = new Date(isoTimestamp).getTime();
    if (isNaN(parsed)) return false;
    const diffMs = referenceNow - parsed;
    return diffMs > thresholdDays * 24 * 60 * 60 * 1000;
  }

  /**
   * Inspects the latest Google Drive backup (fetching from Drive API if authenticated, or using local cache)
   * and returns whether a gentle reminder should be displayed.
   */
  public async evaluateBackupStatus(options?: {
    forceDriveCheck?: boolean;
    thresholdDays?: number;
  }): Promise<GoogleDriveBackupStatus> {
    const thresholdDays = options?.thresholdDays ?? BACKUP_REMINDER_THRESHOLD_DAYS;
    const cached = this.getCachedLastBackupDate();
    let latestIso: string | null = cached.timestamp;
    let latestFileName: string | undefined = cached.fileName;
    let source: 'drive_api' | 'local_cache' | 'none' = latestIso ? 'local_cache' : 'none';

    if (this.driveService.isAuthenticated() || options?.forceDriveCheck) {
      try {
        const files: DriveBackupFile[] = await this.driveService.listBackups();
        if (files.length > 0) {
          const newest = files[0];
          const fileTimestamp = newest.modifiedTime || newest.createdTime;
          if (fileTimestamp && !isNaN(new Date(fileTimestamp).getTime())) {
            if (!latestIso || new Date(fileTimestamp).getTime() >= new Date(latestIso).getTime()) {
              latestIso = fileTimestamp;
              latestFileName = newest.name;
              source = 'drive_api';
              if (typeof localStorage !== 'undefined') {
                try {
                  localStorage.setItem(LAST_GOOGLE_DRIVE_BACKUP_KEY, fileTimestamp);
                  if (newest.name) {
                    localStorage.setItem(`${LAST_GOOGLE_DRIVE_BACKUP_KEY}_name`, newest.name);
                  }
                } catch {
                  // Ignore
                }
              }
            }
          }
        }
      } catch {
        // Fall back gracefully to cached metadata if network or token check fails silently
      }
    }

    const isDismissed = this.isReminderDismissed();

    if (!latestIso) {
      return {
        hasBackup: false,
        lastBackupAt: null,
        ageInDays: null,
        isOverdue: false,
        shouldRemind: false,
        isDismissed,
        source: 'none',
      };
    }

    const ageInDays = this.calculateAgeInDays(latestIso);
    const isOverdue = this.isBackupOlderThanThreshold(latestIso, thresholdDays);

    return {
      hasBackup: true,
      lastBackupAt: latestIso,
      lastBackupFileName: latestFileName,
      ageInDays,
      isOverdue,
      shouldRemind: isOverdue && !isDismissed,
      isDismissed,
      source,
    };
  }
}

export const backupReminderService = new BackupReminderService();
