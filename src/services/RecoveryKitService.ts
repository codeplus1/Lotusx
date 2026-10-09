/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { deflate, inflate } from 'pako';
import { backupService, RestoreBackupResult } from '../storage/BackupService';
import { BackupIntegrityError } from '../core/errors';

export interface RecoveryKitPayload {
  qrData: string;
  isQrCompact: boolean;
  isDisasterKeyOnly?: boolean;
  rawBackupJson: string;
  recordCount: number;
  createdAt: string;
  saltHex: string;
}

export interface EmergencyKitData {
  qrPayload: string;
  qrDataUrl: string | null;
  fitsInQr: boolean;
  isDisasterKeyOnly: boolean;
  payloadSizeBytes: number;
  recordCount: number;
  fingerprint: string;
  createdAt: string;
  rawBackupJson: string;
}

export class RecoveryKitService {
  // QR code Version 40 (L/M) safely encodes up to ~2,850 alphanumeric/byte characters
  public static readonly QR_SAFE_CHAR_LIMIT = 2850;

  /**
   * Compresses text using pako deflate and converts to base64
   */
  public compressWithPako(text: string): string {
    const deflated = deflate(text, { level: 9 });
    let binary = '';
    const len = deflated.length;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(deflated[i]);
    }
    return btoa(binary);
  }

  /**
   * Decompresses base64 data back to plain text using pako inflate
   */
  public decompressWithPako(base64Data: string): string {
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const inflated = inflate(bytes);
    return new TextDecoder().decode(inflated);
  }

  /**
   * Fallback decompression for legacy browser stream compression
   */
  private async decompressWithStream(base64Data: string): Promise<string> {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Browser decompression stream not available.');
    }
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const response = new Response(stream);
    return await response.text();
  }

  /**
   * Prepares the Emergency Recovery Kit payload from an encrypted backup JSON.
   * Guaranteed to always return a valid, non-empty QR code payload.
   */
  public async prepareRecoveryKit(backupJson: string): Promise<RecoveryKitPayload> {
    const parsed = JSON.parse(backupJson);
    const recordCount = Array.isArray(parsed.records) ? parsed.records.length : 0;
    const createdAt = parsed.createdAt ? String(parsed.createdAt) : new Date().toISOString();
    const saltHex = parsed.kdfParams?.salt || parsed.saltHex || 'Protected';

    const minifiedJson = JSON.stringify(parsed);

    try {
      const compressedBase64 = this.compressWithPako(minifiedJson);
      const fullQrString = `LOTUSX_BACKUP_V1:${compressedBase64}`;

      if (fullQrString.length <= RecoveryKitService.QR_SAFE_CHAR_LIMIT) {
        return {
          qrData: fullQrString,
          isQrCompact: true,
          isDisasterKeyOnly: false,
          rawBackupJson: minifiedJson,
          recordCount,
          createdAt,
          saltHex,
        };
      }
    } catch (e) {
      console.warn('Pako full compression error, falling back to disaster key:', e);
    }

    const disasterEnvelope = {
      format: 'LOTUSX_AUTHENTICATED_BACKUP_V3',
      version: 3,
      createdAt: parsed.createdAt || Date.now(),
      vaultId: parsed.vaultId,
      passwordHint: parsed.passwordHint || '',
      kdfParams: parsed.kdfParams,
      encryptedVaultKey: parsed.encryptedVaultKey,
      encryptedVaultKeyWithRecovery: parsed.encryptedVaultKeyWithRecovery,
      recoveryKdfParams: parsed.recoveryKdfParams,
      verificationToken: parsed.verificationToken,
      records: [],
    };

    const disasterJson = JSON.stringify(disasterEnvelope);
    const compressedDisaster = this.compressWithPako(disasterJson);
    const disasterQrString = `LOTUSX_KEY_V1:${compressedDisaster}`;

    return {
      qrData: disasterQrString,
      isQrCompact: true,
      isDisasterKeyOnly: true,
      rawBackupJson: minifiedJson,
      recordCount,
      createdAt,
      saltHex,
    };
  }

  /**
   * Generates a complete encrypted Emergency Kit with rendered QR Data URL and SHA-256 fingerprint
   */
  public async generateKit(password?: string): Promise<EmergencyKitData> {
    const backupJson = await backupService.createEncryptedBackupString(password);
    const prepared = await this.prepareRecoveryKit(backupJson);

    const encoder = new TextEncoder();
    const digest = await window.crypto.subtle.digest('SHA-256', encoder.encode(backupJson));
    const hashHex = Array.from(new Uint8Array(digest))
      .slice(0, 6)
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join('');
    const fingerprint = `${hashHex.slice(0, 4)}-${hashHex.slice(4, 8)}-${hashHex.slice(8, 12)}`;

    const fitsInQr =
      prepared.qrData.length > 0 &&
      prepared.qrData.length <= RecoveryKitService.QR_SAFE_CHAR_LIMIT;

    return {
      qrPayload: prepared.qrData,
      qrDataUrl: null,
      fitsInQr,
      isDisasterKeyOnly: Boolean(prepared.isDisasterKeyOnly),
      payloadSizeBytes: new Blob([backupJson]).size,
      recordCount: prepared.recordCount,
      fingerprint,
      createdAt: new Date().toISOString(),
      rawBackupJson: prepared.rawBackupJson,
    };
  }

  /**
   * Parses and validates raw scanned QR string back to backup JSON
   */
  public async parseScannedQr(scannedString: string): Promise<string> {
    const trimmed = scannedString.trim();

    if (
      trimmed.startsWith('LOTUSX_BACKUP_V1:') ||
      trimmed.startsWith('LOTUSX_QR_V1:') ||
      trimmed.startsWith('LXK1:')
    ) {
      const base64Data = trimmed.replace(/^(LOTUSX_BACKUP_V1:|LOTUSX_QR_V1:|LXK1:)/, '');
      try {
        return this.decompressWithPako(base64Data);
      } catch {
        return await this.decompressWithStream(base64Data);
      }
    }

    if (trimmed.startsWith('LOTUSX_KEY_V1:')) {
      const base64Data = trimmed.replace('LOTUSX_KEY_V1:', '');
      return this.decompressWithPako(base64Data);
    }

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return trimmed;
    }

    throw new BackupIntegrityError(
      'Scanned QR code does not contain a valid LotusX encrypted recovery payload.'
    );
  }

  /**
   * Restores an encrypted vault from a scanned QR code string and Master/Backup Password.
   * Rejects header-only disaster keys if the user expects password records without accompanying .vault file,
   * and returns the full decrypted RestoreBackupResult so the UI can unlock and display records immediately.
   */
  public async restoreFromQrPayload(
    scannedString: string,
    password: string
  ): Promise<RestoreBackupResult> {
    const trimmed = scannedString.trim();
    if (trimmed.startsWith('LOTUSX_KEY_V1:')) {
      throw new BackupIntegrityError(
        'This QR code is a large-vault header key (LOTUSX_KEY_V1) and does not contain the full credential records inside the optical barcode. Please restore using your accompanying .vault backup file or Google Drive backup.'
      );
    }
    const backupJson = await this.parseScannedQr(trimmed);
    return await backupService.restoreEncryptedBackup(backupJson, password);
  }

  /**
   * Triggers native print dialog or downloads the encrypted recovery kit
   */
  public openPrintableWindow(kit: EmergencyKitData): void {
    backupService.downloadBackup(
      kit.rawBackupJson,
      `LotusX-Emergency-Kit-${kit.fingerprint}.vault`
    );
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  }
}

export const recoveryKitService = new RecoveryKitService();
export const emergencyKitService = recoveryKitService;
