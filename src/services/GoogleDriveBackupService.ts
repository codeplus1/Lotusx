/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { BackupIntegrityError } from '../core/errors';
import { backupService } from '../storage/BackupService';

export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

export interface DriveBackupFile {
  id: string;
  name: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
}

export type DriveBackupFileMetadata = DriveBackupFile;

const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const firebaseAuth = getAuth(firebaseApp);

const googleProvider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  googleProvider.addScope(scope);
}

export class GoogleDriveBackupService {
  private cachedAccessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private isSigningIn: boolean = false;
  private currentUserEmail: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        onAuthStateChanged(firebaseAuth, (user: User | null) => {
          if (user) {
            this.currentUserEmail = user.email || null;
          } else if (!this.isSigningIn) {
            this.cachedAccessToken = null;
            this.tokenExpiresAt = 0;
            this.currentUserEmail = null;
          }
        });
      } catch {
        // Ignored in headless CLI test environments
      }
    }
  }

  /**
   * Retrieves the configured OAuth Client ID from environment, firebase config, or user override
   */
  public getClientId(): string {
    const envClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (envClientId && typeof envClientId === 'string' && envClientId.trim() !== '') {
      return envClientId.trim();
    }
    if (
      firebaseConfig?.oAuthClientId &&
      typeof firebaseConfig.oAuthClientId === 'string' &&
      firebaseConfig.oAuthClientId.trim() !== ''
    ) {
      return firebaseConfig.oAuthClientId.trim();
    }
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('lotusx_gdrive_client_id');
      if (stored) return stored.trim();
    }
    return '';
  }

  public setCustomClientId(clientId: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('lotusx_gdrive_client_id', clientId.trim());
    }
  }

  public getConnectedEmail(): string | null {
    return this.currentUserEmail;
  }

  public getUserProfile(): { email: string | null } {
    return { email: this.currentUserEmail };
  }

  /**
   * Checks whether an active, non-expired Google OAuth access token is available in memory
   */
  public isAuthenticated(): boolean {
    return Boolean(this.cachedAccessToken && Date.now() < this.tokenExpiresAt - 60000);
  }

  /**
   * Checks whether Google Identity Services SDK is loaded on the page
   */
  public isGsiLoaded(): boolean {
    const win = window as unknown as {
      google?: {
        accounts?: {
          oauth2?: {
            initTokenClient: (config: unknown) => { requestAccessToken: (opts: unknown) => void };
          };
        };
      };
    };
    return (
      typeof window !== 'undefined' &&
      typeof win.google !== 'undefined' &&
      typeof win.google?.accounts?.oauth2 !== 'undefined'
    );
  }

  /**
   * Initiates Google OAuth popup client-side to request restricted drive.file access.
   * Uses Firebase Auth signInWithPopup with GoogleAuthProvider (or GSI fallback if configured).
   * Access token is cached strictly in volatile memory (never in localStorage or sessionStorage).
   */
  public async requestAccessToken(customClientId?: string): Promise<string> {
    if (this.cachedAccessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.cachedAccessToken;
    }

    // 1. Primary path: Firebase Auth GoogleAuthProvider popup
    if (!customClientId && firebaseConfig?.apiKey) {
      try {
        this.isSigningIn = true;
        const result = await signInWithPopup(firebaseAuth, googleProvider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        if (credential?.accessToken) {
          this.cachedAccessToken = credential.accessToken;
          this.tokenExpiresAt = Date.now() + 3500 * 1000;
          this.currentUserEmail = result.user?.email || null;
          return this.cachedAccessToken;
        }
      } catch (firebaseErr: unknown) {
        // If user explicitly closed the popup, surface a clear cancellation error immediately
        const errCode = (firebaseErr as { code?: string })?.code || '';
        if (errCode === 'auth/popup-closed-by-user' || errCode === 'auth/cancelled-popup-request') {
          throw new Error('Google sign-in was cancelled.');
        }
        if (errCode === 'auth/popup-blocked') {
          throw new Error('Sign-in popup was blocked by your browser. Please allow popups for this site and try again.');
        }
        // Otherwise fall through to GSI token client if available
        if (!this.isGsiLoaded()) {
          const msg =
            firebaseErr instanceof Error
              ? firebaseErr.message
              : 'Failed to authenticate with Google Drive.';
          throw new Error(msg);
        }
      } finally {
        this.isSigningIn = false;
      }
    }

    // 2. Fallback path: Google Identity Services (GSI) token client
    const clientId = customClientId || this.getClientId();
    if (!clientId) {
      throw new Error(
        'Google OAuth Client ID is not configured. Please authorize Google Drive access.'
      );
    }

    if (!this.isGsiLoaded()) {
      throw new Error(
        'Google Identity Services client is not available. Please check your internet connection and refresh.'
      );
    }

    const win = window as unknown as {
      google: {
        accounts: {
          oauth2: {
            initTokenClient: (config: {
              client_id: string;
              scope: string;
              prompt: string;
              callback: (response: {
                error?: string;
                error_description?: string;
                access_token?: string;
                expires_in?: number | string;
              }) => void;
            }) => { requestAccessToken: (opts: { prompt: string }) => void };
          };
        };
      };
    };

    return new Promise((resolve, reject) => {
      try {
        const tokenClient = win.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPES.join(' '),
          prompt: '',
          callback: (response) => {
            if (response.error) {
              const msg =
                response.error_description ||
                response.error ||
                'Google Drive authorization was cancelled or failed.';
              reject(new Error(msg));
              return;
            }
            if (response.access_token) {
              this.cachedAccessToken = response.access_token;
              const expiresIn = Number(response.expires_in) || 3600;
              this.tokenExpiresAt = Date.now() + expiresIn * 1000;
              resolve(response.access_token);
            } else {
              reject(new Error('No access token received from Google.'));
            }
          },
        });

        tokenClient.requestAccessToken({ prompt: '' });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Failed to initialize Google authorization.';
        reject(new Error(message));
      }
    });
  }

  /**
   * Canonical authenticate method used by GoogleDriveBackupModal
   */
  public async authenticate(customClientId?: string): Promise<string> {
    return await this.requestAccessToken(customClientId);
  }

  /**
   * Validates that a backup payload string is strictly a valid encrypted LotusX backup envelope
   * and contains zero unencrypted record fields before any network upload can occur.
   */
  public validateEncryptedPayloadBeforeUpload(backupJson: string): void {
    if (!backupJson || typeof backupJson !== 'string' || !backupJson.trim()) {
      throw new BackupIntegrityError('Cannot upload empty backup payload to Google Drive.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(backupJson);
    } catch {
      throw new BackupIntegrityError('Backup payload must be a valid JSON cryptographic envelope.');
    }

    // Use BackupService's envelope validator to ensure format, version, kdfParams, verificationToken, and records array exist
    const envelope = backupService.migrateBackupEnvelope(parsed);

    if (!envelope.hmacTag || !envelope.hmacSalt || !envelope.checksum) {
      throw new BackupIntegrityError(
        'Refusing to upload unauthenticated backup: missing HKDF-HMAC tag or SHA-256 checksum.'
      );
    }

    // Verify that every record in envelope.records only exposes { id, createdAt, updatedAt, payload: { version, iv, ciphertext, tagLength } }
    // and never contains plaintext properties like password, username, title, notes, totpSecret, or url
    const forbiddenPlaintextKeys = [
      'password',
      'username',
      'email',
      'title',
      'notes',
      'totpSecret',
      'url',
      'website',
      'cardNumber',
      'accountNumber',
      'customFields',
      'pin',
    ];

    for (const rec of envelope.records) {
      if (!rec || typeof rec !== 'object') {
        throw new BackupIntegrityError('Invalid record entry in backup envelope.');
      }
      const rawRec = rec as unknown as Record<string, unknown>;
      for (const forbidden of forbiddenPlaintextKeys) {
        if (forbidden in rawRec && rawRec[forbidden] !== undefined) {
          throw new BackupIntegrityError(
            `Security violation blocked: Plaintext field "${forbidden}" detected outside encrypted payload.`
          );
        }
      }

      if (
        !rec.payload ||
        typeof rec.payload.iv !== 'string' ||
        typeof rec.payload.ciphertext !== 'string' ||
        rec.payload.iv.length < 12 ||
        rec.payload.ciphertext.length < 16
      ) {
        throw new BackupIntegrityError(
          'Security violation blocked: Record is missing valid AES-256-GCM IV or ciphertext.'
        );
      }
    }
  }

  /**
   * Lists all LotusX zero-knowledge encrypted backup files stored in user's Drive
   */
  public async listBackups(accessToken?: string): Promise<DriveBackupFile[]> {
    const token = accessToken || (await this.requestAccessToken());
    const query = encodeURIComponent(
      "(name contains 'lotusx-backup-' or name contains 'LotusX-Vault-Backup') and trashed = false"
    );
    const fields = encodeURIComponent('files(id, name, size, createdTime, modifiedTime)');
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=modifiedTime desc&pageSize=25`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401 || response.status === 403) {
      this.cachedAccessToken = null;
      this.tokenExpiresAt = 0;
      throw new Error('Google Drive session expired or access was revoked. Please reconnect.');
    }

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(
        err.error?.message || `Failed to list files from Google Drive (HTTP ${response.status})`
      );
    }

    const data = (await response.json()) as {
      files?: Array<{
        id: string;
        name: string;
        size?: string;
        createdTime?: string;
        modifiedTime?: string;
      }>;
    };
    const files = (data.files || []).map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size ? `${(Number(f.size) / 1024).toFixed(1)} KB` : undefined,
      createdTime: f.createdTime,
      modifiedTime: f.modifiedTime,
    }));

    if (files.length > 0 && typeof localStorage !== 'undefined') {
      const latestTime = files[0].modifiedTime || files[0].createdTime;
      if (latestTime) {
        try {
          localStorage.setItem('lotusx_last_gdrive_backup_at', latestTime);
          localStorage.setItem('lotusx_last_backup_at', latestTime);
          if (files[0].name) {
            localStorage.setItem('lotusx_last_gdrive_backup_at_name', files[0].name);
          }
        } catch {
          // Ignored
        }
      }
    }

    return files;
  }

  public async listEncryptedBackups(): Promise<DriveBackupFileMetadata[]> {
    return await this.listBackups();
  }

  /**
   * Uploads an AES-256-GCM encrypted backup file to the user's personal Google Drive.
   * Strictly validates that backupJson is an authenticated encrypted envelope before uploading.
   * Uses a generic filename (e.g. lotusx-backup-YYYY-MM-DD-HHMMSS.vault) with zero sensitive metadata.
   */
  public async uploadBackup(
    accessToken: string,
    backupJson: string
  ): Promise<{ fileId: string; fileName: string; name: string }> {
    // Mandatory pre-upload zero-knowledge validation
    this.validateEncryptedPayloadBeforeUpload(backupJson);

    const now = new Date();
    const datePart = now.toISOString().slice(0, 10);
    const timePart = now.toISOString().slice(11, 19).replace(/:/g, '');
    const fileName = `lotusx-backup-${datePart}-${timePart}.vault`;

    const metadata = {
      name: fileName,
      mimeType: 'application/octet-stream',
      description: 'LotusX Encrypted Vault Backup (AES-256-GCM)',
      appProperties: {
        app: 'LotusX',
        format: 'LOTUSX_AUTHENTICATED_BACKUP_V3',
      },
    };

    const boundary = '-------LotusXMultipartBoundary314159265';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/octet-stream\r\n\r\n' +
      backupJson +
      closeDelimiter;

    const response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      }
    );

    if (response.status === 401 || response.status === 403) {
      this.cachedAccessToken = null;
      this.tokenExpiresAt = 0;
      throw new Error('Google Drive session expired. Please reconnect and try again.');
    }

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(
        err.error?.message || `Failed to upload backup to Google Drive (HTTP ${response.status})`
      );
    }

    const data = (await response.json()) as { id?: string };
    if (!data?.id) {
      throw new Error('Google Drive upload did not return a valid file identifier.');
    }

    if (typeof localStorage !== 'undefined') {
      const uploadedIso = now.toISOString();
      try {
        localStorage.setItem('lotusx_last_gdrive_backup_at', uploadedIso);
        localStorage.setItem('lotusx_last_backup_at', uploadedIso);
        localStorage.setItem('lotusx_last_gdrive_backup_at_name', fileName);
        localStorage.removeItem('lotusx_gdrive_reminder_dismissed_at');
      } catch {
        // Ignored
      }
    }

    return {
      fileId: data.id,
      fileName,
      name: fileName,
    };
  }

  public async uploadEncryptedBackup(
    backupJson: string
  ): Promise<{ fileId: string; fileName: string; name: string }> {
    this.validateEncryptedPayloadBeforeUpload(backupJson);
    const token = await this.requestAccessToken();
    return await this.uploadBackup(token, backupJson);
  }

  /**
   * Silently uploads an encrypted backup to Google Drive without notifying the user or showing UI errors.
   * Uses the cached OAuth token if available, or attempts silent token acquisition.
   */
  public async silentUploadEncryptedBackup(backupJson: string): Promise<boolean> {
    try {
      this.validateEncryptedPayloadBeforeUpload(backupJson);
      let token = this.cachedAccessToken && Date.now() < this.tokenExpiresAt - 30000
        ? this.cachedAccessToken
        : null;

      if (!token) {
        token = await this.requestAccessToken();
      }
      if (!token) return false;

      await this.uploadBackup(token, backupJson);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Downloads an encrypted backup file from Google Drive into browser memory
   */
  public async downloadBackup(accessToken: string, fileId: string): Promise<string> {
    if (!fileId || typeof fileId !== 'string') {
      throw new Error('Invalid Google Drive file ID.');
    }

    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status === 401 || response.status === 403) {
      this.cachedAccessToken = null;
      this.tokenExpiresAt = 0;
      throw new Error('Google Drive session expired. Please reconnect and try again.');
    }

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(
        err.error?.message || `Failed to download file from Google Drive (HTTP ${response.status})`
      );
    }

    const text = await response.text();
    if (!text || !text.trim()) {
      throw new BackupIntegrityError('Downloaded Google Drive backup file is empty.');
    }
    return text;
  }

  public async downloadEncryptedBackup(fileId: string): Promise<string> {
    const token = await this.requestAccessToken();
    return await this.downloadBackup(token, fileId);
  }

  /**
   * Permanently deletes a selected backup file from Google Drive (requires explicit user confirmation in UI)
   */
  public async deleteEncryptedBackup(fileId: string): Promise<void> {
    if (!fileId || typeof fileId !== 'string') {
      throw new Error('Invalid Google Drive file ID.');
    }
    const token = await this.requestAccessToken();
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401 || response.status === 403) {
      this.cachedAccessToken = null;
      this.tokenExpiresAt = 0;
      throw new Error('Google Drive session expired. Please reconnect and try again.');
    }

    if (!response.ok && response.status !== 204) {
      const err = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(
        err.error?.message || `Failed to delete backup from Google Drive (HTTP ${response.status})`
      );
    }
  }

  public async deleteBackup(fileId: string): Promise<void> {
    return await this.deleteEncryptedBackup(fileId);
  }

  /**
   * Clears cached session token and signs out of Firebase Google session
   */
  public async disconnect(): Promise<void> {
    this.cachedAccessToken = null;
    this.tokenExpiresAt = 0;
    this.currentUserEmail = null;
    try {
      await firebaseAuth.signOut();
    } catch {
      // Ignored
    }
  }
}

export const googleDriveBackupService = new GoogleDriveBackupService();
export const googleDriveService = googleDriveBackupService;

