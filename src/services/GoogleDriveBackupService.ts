/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import firebaseConfig from '../../firebase-applet-config.json';

export interface DriveBackupFile {
  id: string;
  name: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
}

export type DriveBackupFileMetadata = DriveBackupFile;

export class GoogleDriveBackupService {
  private cachedAccessToken: string | null = null;
  private tokenExpiresAt: number = 0;

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
    return '417320716206-4qiad1pvf2c9eivk80omg42qd9b3526e.apps.googleusercontent.com';
  }

  public setCustomClientId(clientId: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('lotusx_gdrive_client_id', clientId.trim());
    }
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
      google?: { accounts?: { oauth2?: { initTokenClient: (config: unknown) => { requestAccessToken: (opts: unknown) => void } } } };
    };
    return (
      typeof window !== 'undefined' &&
      typeof win.google !== 'undefined' &&
      typeof win.google?.accounts?.oauth2 !== 'undefined'
    );
  }

  /**
   * Initiates Google OAuth popup client-side to request restricted drive.file access
   */
  public async requestAccessToken(customClientId?: string): Promise<string> {
    const clientId = customClientId || this.getClientId();
    if (!clientId) {
      throw new Error(
        'Google OAuth Client ID is not configured. Please provide VITE_GOOGLE_CLIENT_ID in your environment or Settings.'
      );
    }

    if (!this.isGsiLoaded()) {
      throw new Error(
        'Google Identity Services client is still loading or was blocked by an ad-blocker. Please check your internet connection and refresh.'
      );
    }

    if (this.cachedAccessToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.cachedAccessToken;
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
          scope: 'https://www.googleapis.com/auth/drive.file',
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
        const message = err instanceof Error ? err.message : 'Failed to initialize Google authorization.';
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
   * Lists all LotusX zero-knowledge encrypted backup files stored in user's Drive
   */
  public async listBackups(accessToken?: string): Promise<DriveBackupFile[]> {
    const token = accessToken || (await this.requestAccessToken());
    const query = encodeURIComponent("name contains 'LotusX-Vault-Backup' and trashed = false");
    const fields = encodeURIComponent('files(id, name, size, createdTime, modifiedTime)');
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=${fields}&orderBy=modifiedTime desc&pageSize=20`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(err.error?.message || `Failed to list files from Google Drive (HTTP ${response.status})`);
    }

    const data = (await response.json()) as {
      files?: Array<{ id: string; name: string; size?: string; createdTime?: string; modifiedTime?: string }>;
    };
    return (data.files || []).map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size ? `${(Number(f.size) / 1024).toFixed(1)} KB` : undefined,
      createdTime: f.createdTime,
      modifiedTime: f.modifiedTime,
    }));
  }

  public async listEncryptedBackups(): Promise<DriveBackupFileMetadata[]> {
    return await this.listBackups();
  }

  /**
   * Uploads an AES-256-GCM encrypted backup file to the user's personal Google Drive
   */
  public async uploadBackup(
    accessToken: string,
    backupJson: string
  ): Promise<{ fileId: string; fileName: string; name: string }> {
    const now = new Date();
    const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `LotusX-Vault-Backup-${dateStr}.vault`;

    const metadata = {
      name: fileName,
      mimeType: 'application/json',
      description: 'LotusX Backup (AES-256-GCM + Argon2id)',
      appProperties: {
        app: 'LotusX',
        format: 'LOTUSX_AUTHENTICATED_BACKUP_V3',
      },
    };

    const boundary = '-------LotusXMultipartBoundary314159';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      backupJson +
      closeDelimiter;

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(err.error?.message || `Failed to upload backup to Google Drive (HTTP ${response.status})`);
    }

    const data = (await response.json()) as { id: string };
    return {
      fileId: data.id,
      fileName,
      name: fileName,
    };
  }

  public async uploadEncryptedBackup(
    backupJson: string
  ): Promise<{ fileId: string; fileName: string; name: string }> {
    const token = await this.requestAccessToken();
    return await this.uploadBackup(token, backupJson);
  }

  /**
   * Downloads an encrypted backup file from Google Drive into browser memory
   */
  public async downloadBackup(accessToken: string, fileId: string): Promise<string> {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(err.error?.message || `Failed to download file from Google Drive (HTTP ${response.status})`);
    }

    return await response.text();
  }

  public async downloadEncryptedBackup(fileId: string): Promise<string> {
    const token = await this.requestAccessToken();
    return await this.downloadBackup(token, fileId);
  }

  /**
   * Clears cached session token (sign out from Drive session)
   */
  public disconnect(): void {
    this.cachedAccessToken = null;
    this.tokenExpiresAt = 0;
  }
}

export const googleDriveBackupService = new GoogleDriveBackupService();
export const googleDriveService = googleDriveBackupService;
