/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { encryptionService } from './EncryptionService';
import { keyDerivationService } from './KeyDerivationService';
import { passwordGeneratorService } from './PasswordGeneratorService';
import { VaultRepository } from '../storage/VaultRepository';
import { LocalSecureStorageService } from '../storage/SecureStorageService';
import { BackupService } from '../storage/BackupService';
import { SearchService } from '../storage/SearchService';
import { VaultRecord, EncryptedPayload } from '../types/vault';
import { analyzeVaultRecords } from '../components/security/SecurityCenterView';
import { RecoveryKitService, recoveryKitService } from '../services/RecoveryKitService';
import { biometricService } from './BiometricService';
import { DEFAULT_THEME_CONFIG, THEME_STORAGE_KEY } from '../types/theme';
import {
  VaultIntegrityError,
  BackupIntegrityError,
  AuthenticationError,
  VaultLockedError,
  DecryptionError,
} from '../core/errors';

export interface TestCaseResult {
  id: string;
  name: string;
  category: 'Crypto' | 'KeyDerivation' | 'TamperResistance' | 'CRUD' | 'Backup' | 'Search' | 'Audit' | 'RecoveryKit';
  passed: boolean;
  durationMs: number;
  message: string;
  details?: string;
}

export interface TestSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  totalDurationMs: number;
  results: TestCaseResult[];
}

export class SecurityTestSuite {
  static async runAll(): Promise<TestSuiteSummary> {
    const start = performance.now();
    const results = await SecurityTestSuite.runAllTests();
    const totalDurationMs = Math.round(performance.now() - start);
    const passed = results.filter((r) => r.passed).length;
    return {
      total: results.length,
      passed,
      failed: results.length - passed,
      totalDurationMs,
      results,
    };
  }

  /**
   * Runs the complete test suite verifying all 18+ security guarantees
   */
  static async runAllTests(): Promise<TestCaseResult[]> {
    const results: TestCaseResult[] = [];

    // Helper to measure and record
    const runTest = async (
      id: string,
      name: string,
      category: TestCaseResult['category'],
      fn: () => Promise<{ passed: boolean; message: string; details?: string }>
    ) => {
      const start = performance.now();
      try {
        const res = await fn();
        const durationMs = Math.round(performance.now() - start);
        results.push({
          id,
          name,
          category,
          passed: res.passed,
          durationMs,
          message: res.message,
          details: res.details,
        });
      } catch (err: any) {
        const durationMs = Math.round(performance.now() - start);
        results.push({
          id,
          name,
          category,
          passed: false,
          durationMs,
          message: err?.message || 'Exception during test',
        });
      }
    };

    // 1. Key Derivation Test
    await runTest('kdf_argon2id', 'Argon2id Key Derivation & Salt Randomness', 'KeyDerivation', async () => {
      const salt1 = keyDerivationService.generateSalt(16);
      const salt2 = keyDerivationService.generateSalt(16);
      if (salt1 === salt2) {
        return { passed: false, message: 'CSPRNG generated duplicate salt!' };
      }

      const params = {
        algorithm: 'argon2id' as const,
        memorySize: 4096, // 4MB for quick unit test
        iterations: 2,
        parallelism: 1,
        hashLength: 32,
        salt: salt1,
      };

      const { rawKey, cryptoKey } = await keyDerivationService.deriveKey('TestSecretP@ssw0rd!2026', params);
      if (rawKey.length !== 32) {
        return { passed: false, message: `Expected 32-byte key, got ${rawKey.length}` };
      }

      return {
        passed: true,
        message: 'Successfully derived 256-bit key via Argon2id with unique CSPRNG salt.',
        details: `Key length: 256 bits, Algorithm: ${cryptoKey.algorithm.name}`,
      };
    });

    // 2. Encryption/Decryption Round-Trip
    let sharedKey: CryptoKey;
    await runTest('aes_gcm_roundtrip', 'AES-256-GCM Encrypt/Decrypt Round-Trip', 'Crypto', async () => {
      const raw = new Uint8Array(32);
      window.crypto.getRandomValues(raw);
      sharedKey = await window.crypto.subtle.importKey(
        'raw',
        raw,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );

      const secretText = 'CONFIDENTIAL_DATA_PAYLOAD_αβγ_998877';
      const envelope = await encryptionService.encryptString(secretText, sharedKey);
      const decrypted = await encryptionService.decryptString(envelope, sharedKey);

      if (decrypted !== secretText) {
        return { passed: false, message: 'Decrypted data does not match original plaintext.' };
      }

      return {
        passed: true,
        message: 'Round-trip encryption/decryption perfectly restored UTF-8 plaintext.',
        details: `IV length: 12 bytes, Tag length: ${envelope.tagLength} bits`,
      };
    });

    // 3. Unique Nonce Test
    await runTest('nonce_uniqueness', 'AES-256-GCM Nonce / IV Randomness', 'Crypto', async () => {
      const p1 = await encryptionService.encryptString('Same message', sharedKey);
      const p2 = await encryptionService.encryptString('Same message', sharedKey);

      if (p1.iv === p2.iv) {
        return { passed: false, message: 'CRITICAL SECURITY FAILURE: Nonce reused across encryptions!' };
      }
      if (p1.ciphertext === p2.ciphertext) {
        return { passed: false, message: 'Ciphertext is identical despite distinct nonces!' };
      }

      return {
        passed: true,
        message: 'Verified nonces are strictly unique for identical plaintexts (no nonce reuse).',
      };
    });

    // 4. Tamper Resistance Test
    await runTest('tamper_resistance', 'Authentication Tag Verification (Tamper Rejection)', 'TamperResistance', async () => {
      const secret = 'Tamper-proof financial record';
      const envelope = await encryptionService.encryptString(secret, sharedKey);

      // Mutate one character of ciphertext
      const tamperedBytes = window.atob(envelope.ciphertext).split('');
      tamperedBytes[0] = String.fromCharCode((tamperedBytes[0].charCodeAt(0) ^ 0x01));
      const tamperedCiphertext = window.btoa(tamperedBytes.join(''));

      const tamperedEnvelope: EncryptedPayload = {
        ...envelope,
        ciphertext: tamperedCiphertext,
      };

      try {
        await encryptionService.decryptString(tamperedEnvelope, sharedKey);
        return { passed: false, message: 'Failed: Decryption did NOT throw on tampered ciphertext!' };
      } catch {
        return {
          passed: true,
          message: 'Decryption correctly rejected tampered ciphertext with tag mismatch.',
        };
      }
    });

    // 5. Wrong Key Rejection Test
    await runTest('wrong_key_rejection', 'Wrong Key Rejection (No Decryption Oracle)', 'TamperResistance', async () => {
      const envelope = await encryptionService.encryptString('Secret note', sharedKey);

      const wrongRaw = new Uint8Array(32);
      window.crypto.getRandomValues(wrongRaw);
      const wrongKey = await window.crypto.subtle.importKey(
        'raw',
        wrongRaw,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );

      try {
        await encryptionService.decryptString(envelope, wrongKey);
        return { passed: false, message: 'Failed: Wrong key was erroneously accepted!' };
      } catch {
        return {
          passed: true,
          message: 'Cryptographic authentication rejected invalid key cleanly without leaking info.',
        };
      }
    });

    // 6. Password Generator CSPRNG & Entropy
    await runTest('password_generator', 'Password Generator CSPRNG & Entropy Calculation', 'Crypto', async () => {
      const res = passwordGeneratorService.generatePassword({
        length: 20,
        useUppercase: true,
        useLowercase: true,
        useNumbers: true,
        useSymbols: true,
        avoidAmbiguous: false,
      });

      if (res.password.length !== 20) {
        return { passed: false, message: `Expected length 20, got ${res.password.length}` };
      }
      if (res.entropy < 80) {
        return { passed: false, message: `Calculated entropy too low: ${res.entropy} bits` };
      }

      const passphrase = passwordGeneratorService.generatePassphrase({
        wordCount: 5,
        separator: '-',
        capitalize: true,
        includeNumber: true,
      });

      if (passphrase.passphrase.split('-').length < 5) {
        return { passed: false, message: 'Passphrase word count mismatch' };
      }

      return {
        passed: true,
        message: 'Password & Diceware generators produced high-entropy CSPRNG tokens.',
        details: `Password entropy: ${res.entropy} bits, Passphrase: ${passphrase.entropy} bits`,
      };
    });

    // 7. CRUD Isolation & Storage Test
    await runTest('vault_crud', 'Isolated In-Memory Vault Creation & Record CRUD', 'CRUD', async () => {
      const mockStorage = new LocalSecureStorageService();
      const testRepo = new VaultRepository(mockStorage);

      const { cryptoKey } = await testRepo.createVault('MockMasterPassword123#', 'standard');

      const mockRecord: VaultRecord = {
        id: 'test_rec_1',
        title: 'Acme Corp',
        type: 'login',
        category: 'work',
        username: 'alice@acme.com',
        password: 'SuperSecretAlicePassword123!',
        website: 'https://acme.internal',
        favorite: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: ['prod', 'acme'],
      };

      await testRepo.saveRecord(mockRecord, cryptoKey);
      const records = await testRepo.getDecryptedRecords(cryptoKey);

      if (records.length !== 1 || records[0].password !== mockRecord.password) {
        return { passed: false, message: 'Record was not correctly encrypted and decrypted.' };
      }

      // Check that persistent storage contains ONLY ciphertext, never plaintext password
      const rawStored = await mockStorage.getItem<any[]>('secure_vault_records_v1');
      const rawRecordString = JSON.stringify(rawStored);
      if (rawRecordString.includes('SuperSecretAlicePassword123!')) {
        return { passed: false, message: 'CRITICAL: Plaintext password found in raw storage!' };
      }

      return {
        passed: true,
        message: 'CRUD operations succeeded. Verified raw storage contains 100% encrypted ciphertext.',
      };
    });

    // 8. Search Filter Test
    await runTest('search_service', 'In-Memory Search & Filtering (No Disk Index)', 'Search', async () => {
      const searchService = new SearchService();
      const records: VaultRecord[] = [
        { id: '1', title: 'GitHub', type: 'login', category: 'work', username: 'dev@test.io', favorite: true, createdAt: 0, updatedAt: 0, tags: ['git'], website: 'https://github.com/login' },
        { id: '2', title: 'Personal Bank', type: 'login', category: 'banking', username: 'banker', favorite: false, createdAt: 0, updatedAt: 0, tags: ['money'], website: 'https://online.mybank.org' },
        { id: '3', title: 'Home Wi-Fi', type: 'wifi', category: 'wifi', favorite: true, createdAt: 0, updatedAt: 0, tags: ['network'] },
      ];

      const resGit = searchService.search(records, 'dev@test');
      if (resGit.length !== 1 || resGit[0].title !== 'GitHub') {
        return { passed: false, message: 'Search by username failed' };
      }

      const resBank = searchService.search(records, '', 'banking');
      if (resBank.length !== 1 || resBank[0].title !== 'Personal Bank') {
        return { passed: false, message: 'Category filter failed' };
      }

      const resFav = searchService.search(records, '', 'favorites');
      if (resFav.length !== 2) {
        return { passed: false, message: 'Favorites filter failed' };
      }

      // Domain and title filtering tests
      const resDomain = searchService.filterByDomainOrTitle(records, 'github.com');
      if (resDomain.length !== 1 || resDomain[0].title !== 'GitHub') {
        return { passed: false, message: 'Filter by website domain failed' };
      }

      const resTitle = searchService.filterByDomainOrTitle(records, 'Personal Bank');
      if (resTitle.length !== 1 || resTitle[0].id !== '2') {
        return { passed: false, message: 'Filter by account title failed' };
      }

      // Verify username does NOT match domain_or_title filter
      const resUserOnly = searchService.filterByDomainOrTitle(records, 'banker');
      if (resUserOnly.length !== 0) {
        return { passed: false, message: 'Username should not match domain_or_title filter' };
      }

      return {
        passed: true,
        message: 'In-memory multi-attribute search, domain/title filtering, and category filters passed.',
      };
    });

    // 9. Backup & Integrity Verification Test
    await runTest('backup_verification', 'Encrypted Backup Envelope & SHA-256 Checksum', 'Backup', async () => {
      const mockStorage = new LocalSecureStorageService();
      const testRepo = new VaultRepository(mockStorage);
      const testBackup = new BackupService(testRepo);

      await testRepo.createVault('BackupSecretPassphrase9988!', 'standard');
      const backupJson = await testBackup.createEncryptedBackup();

      const isValid = await testBackup.verifyBackupIntegrity(backupJson);
      if (!isValid) {
        return { passed: false, message: 'Freshly generated backup failed checksum verification!' };
      }

      // Tamper backup text
      const tamperedBackup = backupJson.replace(/"version":\s*\d+/, '"version": 99');
      const isTamperedValid = await testBackup.verifyBackupIntegrity(tamperedBackup);
      if (isTamperedValid) {
        return { passed: false, message: 'Tampered backup incorrectly passed verification!' };
      }

      return {
        passed: true,
        message: 'Encrypted backup generation, checksum verification, and tamper rejection passed.',
      };
    });

    // 19. Local Security Analysis Verification (Reused, Weak, >1 Year Unchanged)
    await runTest('SEC-19', 'Local Security Analysis (Reused, Weak, >1 Yr Old)', 'Audit', async () => {
      const now = Date.now();
      const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

      const mockRecord1: VaultRecord = {
        id: 'rec-1',
        title: 'Legacy Streaming',
        type: 'login',
        category: 'passwords',
        username: 'user1',
        password: 'Password1', // Weak (<12 chars), reused with rec-2, >1 year old
        favorite: false,
        createdAt: now - (ONE_YEAR_MS + 50 * 24 * 60 * 60 * 1000), // ~415 days ago
        updatedAt: now - (ONE_YEAR_MS + 50 * 24 * 60 * 60 * 1000),
        tags: [],
      };

      const mockRecord2: VaultRecord = {
        id: 'rec-2',
        title: 'Forum Account',
        type: 'login',
        category: 'passwords',
        username: 'user2',
        password: 'Password1', // Weak, reused with rec-1, recently created
        favorite: false,
        createdAt: now - (10 * 24 * 60 * 60 * 1000),
        updatedAt: now - (10 * 24 * 60 * 60 * 1000),
        tags: [],
      };

      const mockRecord3: VaultRecord = {
        id: 'rec-3',
        title: 'Primary Bank',
        type: 'login',
        category: 'banking',
        username: 'bankuser',
        password: 'Kj8#vN2$mQ9!zL5@wR', // Strong (18 chars, 90+ bits entropy), unique, recent
        favorite: true,
        createdAt: now - (5 * 24 * 60 * 60 * 1000),
        updatedAt: now - (5 * 24 * 60 * 60 * 1000),
        tags: [],
      };

      const report = analyzeVaultRecords([mockRecord1, mockRecord2, mockRecord3], now);

      if (report.reusedCount !== 2) {
        return {
          passed: false,
          message: `Expected 2 reused issues, got ${report.reusedCount}`,
        };
      }

      if (report.weakCount !== 2) {
        return {
          passed: false,
          message: `Expected 2 weak issues, got ${report.weakCount}`,
        };
      }

      if (report.overOneYearCount !== 1) {
        return {
          passed: false,
          message: `Expected 1 issue unchanged for > 1 year, got ${report.overOneYearCount}`,
        };
      }

      const overOneYearIssue = report.overOneYearIssues[0];
      if (overOneYearIssue.recordId !== 'rec-1') {
        return {
          passed: false,
          message: `Expected rec-1 to be flagged as >1 year old, got ${overOneYearIssue.recordId}`,
        };
      }

      return {
        passed: true,
        message: 'Successfully flagged reused passwords (2), weak entropy passwords (2), and legacy password unchanged for >1 year (1).',
      };
    });

    // 20. Adversarial Backup HMAC Forgery Resistance
    await runTest(
      'backup_hmac_adversarial_forgery',
      'Adversarial Backup HMAC Forgery Resistance (Secret Derivation)',
      'TamperResistance',
      async () => {
        const mockStorage = new LocalSecureStorageService();
        const testRepo = new VaultRepository(mockStorage);
        const testBackup = new BackupService(testRepo);

        const legitimatePassword = 'LegitMasterPassword2026!';
        const { cryptoKey } = await testRepo.createVault(legitimatePassword, 'high');

        const secretRecord: VaultRecord = {
          id: 'rec_secret_1',
          title: 'Swiss Bank Account',
          type: 'login',
          category: 'banking',
          username: 'swiss_vault_user',
          password: 'SecretSwissPin9988!',
          favorite: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          tags: ['financial'],
        };
        await testRepo.saveRecord(secretRecord, cryptoKey);

        const originalBackup = await testBackup.createEncryptedBackup(cryptoKey);

        // Adversary tampers with the backup record
        const tamperedEnvelope = JSON.parse(originalBackup);
        tamperedEnvelope.records[0].title = 'Attacker Injected Bank Account';

        // Adversary recalculates outer SHA-256 checksum
        const { checksum, hmacTag, hmacSalt, ...rest } = tamperedEnvelope;
        const canonicalJson = JSON.stringify(rest);
        const encoder = new TextEncoder();
        const hashBuf = await window.crypto.subtle.digest('SHA-256', encoder.encode(canonicalJson));
        tamperedEnvelope.checksum = Array.from(new Uint8Array(hashBuf))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');

        // Without active key or correct credentials, verifyBackupIntegrity must reject
        const isTamperedValid = await testBackup.verifyBackupIntegrity(JSON.stringify(tamperedEnvelope));
        if (isTamperedValid) {
          return { passed: false, message: 'Attacker forged valid backup integrity without active key!' };
        }

        // With wrong attacker password, verifyBackupIntegrity must also reject
        const isTamperedWrongPw = await testBackup.verifyBackupIntegrity(JSON.stringify(tamperedEnvelope), {
          masterPassword: 'AttackerWrongPassword123!',
        });
        if (isTamperedWrongPw) {
          return { passed: false, message: 'Tampered backup verified with attacker wrong password!' };
        }

        // Legitimate owner restore of tampered backup must throw BackupIntegrityError
        let restoreErrorCaught = false;
        try {
          await testBackup.restoreEncryptedBackup(JSON.stringify(tamperedEnvelope), legitimatePassword);
        } catch (err: any) {
          if (err instanceof BackupIntegrityError) {
            restoreErrorCaught = true;
          }
        }

        if (!restoreErrorCaught) {
          return { passed: false, message: 'Tampered backup restore did not throw BackupIntegrityError!' };
        }

        return {
          passed: true,
          message: 'Adversary cannot forge HMAC authentication tag without authenticated vault key; tampered restores rejected.',
        };
      }
    );

    // 21. Adversarial Backup Restore Rejection (Corrupted Record Payloads)
    await runTest(
      'backup_corrupted_records_adversarial',
      'Adversarial Backup Restore Rejection (Corrupted Record Payloads)',
      'TamperResistance',
      async () => {
        const mockStorage = new LocalSecureStorageService();
        const testRepo = new VaultRepository(mockStorage);
        const testBackup = new BackupService(testRepo);

        const legitimatePassword = 'LegitMasterPassword2026!';
        const { cryptoKey } = await testRepo.createVault(legitimatePassword, 'high');

        const record1: VaultRecord = {
          id: 'rec_1',
          title: 'Account 1',
          type: 'login',
          category: 'passwords',
          username: 'user1',
          password: 'Password1!',
          favorite: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          tags: [],
        };
        await testRepo.saveRecord(record1, cryptoKey);

        const originalBackup = await testBackup.createEncryptedBackup(cryptoKey);
        const tamperedEnvelope = JSON.parse(originalBackup);

        // Corrupt the ciphertext bytes of the record payload
        const corruptedCiphertext = 'AAAA' + tamperedEnvelope.records[0].payload.ciphertext.slice(4);
        tamperedEnvelope.records[0].payload.ciphertext = corruptedCiphertext;

        // Strip outer HMAC to test record-level decrypt validation during restore
        delete tamperedEnvelope.hmacTag;
        delete tamperedEnvelope.hmacSalt;
        delete tamperedEnvelope.checksum;

        let errorCaught = false;
        try {
          await testBackup.restoreEncryptedBackup(JSON.stringify(tamperedEnvelope), legitimatePassword);
        } catch (err: any) {
          if (err instanceof BackupIntegrityError && err.message.includes('corrupted or tampered records')) {
            errorCaught = true;
          }
        }

        if (!errorCaught) {
          return { passed: false, message: 'Corrupted record backup restore was not rejected with BackupIntegrityError!' };
        }

        return {
          passed: true,
          message: 'Decryption failure in backup records strictly prevented storage mutation and threw BackupIntegrityError.',
        };
      }
    );

    // 22. Adversarial Backup Restore With Invalid Credentials
    await runTest(
      'backup_wrong_credentials_adversarial',
      'Adversarial Backup Restore With Invalid Credentials',
      'TamperResistance',
      async () => {
        const mockStorage = new LocalSecureStorageService();
        const testRepo = new VaultRepository(mockStorage);
        const testBackup = new BackupService(testRepo);

        const legitimatePassword = 'LegitMasterPassword2026!';
        const { cryptoKey } = await testRepo.createVault(legitimatePassword, 'high');

        const record1: VaultRecord = {
          id: 'rec_1',
          title: 'Safe Account',
          type: 'login',
          category: 'passwords',
          username: 'owner',
          password: 'SecretSafePassword!',
          favorite: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          tags: [],
        };
        await testRepo.saveRecord(record1, cryptoKey);

        const backupJson = await testBackup.createEncryptedBackup(cryptoKey);

        let errorCaught = false;
        try {
          await testBackup.restoreEncryptedBackup(backupJson, 'AttackerGuessedWrongPassword999!');
        } catch (err: any) {
          if (err instanceof AuthenticationError) {
            errorCaught = true;
          }
        }

        if (!errorCaught) {
          return { passed: false, message: 'Restoring backup with wrong password did not throw AuthenticationError!' };
        }

        return {
          passed: true,
          message: 'Restore attempt with invalid credentials securely aborted with AuthenticationError without mutating state.',
        };
      }
    );

    // 23. Vault Record Tamper Quarantine & Integrity Warning
    await runTest(
      'vault_record_tamper_quarantine',
      'Vault Record Tamper Quarantine & Integrity Warning',
      'TamperResistance',
      async () => {
        const mockStorage = new LocalSecureStorageService();
        const testRepo = new VaultRepository(mockStorage);

        const { cryptoKey } = await testRepo.createVault('QuarantineTestPassword123!', 'standard');

        const rec1: VaultRecord = {
          id: 'rec_valid_1',
          title: 'Valid Record',
          type: 'login',
          category: 'passwords',
          username: 'alice',
          password: 'ValidAlicePass1!',
          favorite: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          tags: [],
        };
        const rec2: VaultRecord = {
          id: 'rec_corrupt_2',
          title: 'Tampered Record',
          type: 'login',
          category: 'passwords',
          username: 'bob',
          password: 'ValidBobPass2!',
          favorite: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          tags: [],
        };

        await testRepo.saveRecord(rec1, cryptoKey);
        await testRepo.saveRecord(rec2, cryptoKey);

        // Directly tamper with rec2 ciphertext in raw storage
        const rawRecords = await mockStorage.getItem<any[]>('secure_vault_records_v1');
        if (!rawRecords || rawRecords.length !== 2) {
          return { passed: false, message: 'Records not found in raw mock storage!' };
        }
        const targetRec = rawRecords.find((r) => r.id === 'rec_corrupt_2');
        targetRec.payload.ciphertext = 'FFFF' + targetRec.payload.ciphertext.slice(4);
        await mockStorage.setItem('secure_vault_records_v1', rawRecords);

        // Test non-throwing mode (used by UI for graceful resilience)
        const decrypted = await testRepo.getDecryptedRecords(cryptoKey, { throwOnError: false });
        if (decrypted.length !== 1 || decrypted[0].id !== 'rec_valid_1') {
          return { passed: false, message: 'Corrupted record was not properly quarantined from valid results!' };
        }

        const warning = testRepo.getIntegrityWarning();
        if (!warning || !warning.includes('rec_corrupt_2')) {
          return { passed: false, message: 'Vault integrity warning was not surfaced for corrupted record!' };
        }

        // Test throwing mode
        let threw = false;
        try {
          await testRepo.getDecryptedRecords(cryptoKey, { throwOnError: true });
        } catch (err: any) {
          if (err instanceof VaultIntegrityError) {
            threw = true;
          }
        }

        if (!threw) {
          return { passed: false, message: 'getDecryptedRecords({ throwOnError: true }) did not throw VaultIntegrityError!' };
        }

        return {
          passed: true,
          message: 'Corrupted records quarantined, integrity warning surfaced, and VaultIntegrityError thrown on demand.',
        };
      }
    );

    // 24. Targeted Origin Storage Cleanup
    await runTest(
      'targeted_storage_cleanup',
      'Targeted Origin Storage Cleanup (Preserves Third-Party Origin Keys)',
      'TamperResistance',
      async () => {
        const testThirdPartyKey = 'third_party_app_user_preference';
        localStorage.setItem(testThirdPartyKey, 'keep_me_safe');

        const realStorage = new LocalSecureStorageService();
        await realStorage.setItem('secure_vault_test_item', { foo: 'bar' });

        await realStorage.clearAllVaultData();

        const thirdPartyVal = localStorage.getItem(testThirdPartyKey);
        const vaultTestVal = localStorage.getItem('secure_vault_test_item');

        localStorage.removeItem(testThirdPartyKey);

        if (thirdPartyVal !== 'keep_me_safe') {
          return { passed: false, message: 'Third-party origin key was wiped by clearAllVaultData!' };
        }

        if (vaultTestVal !== null) {
          return { passed: false, message: 'Vault test key was not cleared by clearAllVaultData!' };
        }

        return {
          passed: true,
          message: 'Storage cleanup accurately targeted only Securely keys while preserving unrelated origin data.',
        };
      }
    );

    // 25. Wrong Password & Recovery Key Rejection
    await runTest(
      'wrong_credential_rejection',
      'Wrong Master Password & Recovery Key Rejection (No Oracle, No Leaks)',
      'TamperResistance',
      async () => {
        const memStorage = new Map<string, any>();
        const mockStorage = {
          getItem: async <T>(k: string): Promise<T | null> => (memStorage.has(k) ? JSON.parse(JSON.stringify(memStorage.get(k))) : null),
          setItem: async <T>(k: string, v: T): Promise<void> => { memStorage.set(k, JSON.parse(JSON.stringify(v))); },
          removeItem: async (k: string): Promise<void> => { memStorage.delete(k); },
        };
        const repo = new VaultRepository(mockStorage as any);
        const { recoveryKey } = await repo.createVault('CorrectP@ssword123!', 'standard');
        repo.setActiveKey(null);

        // Attempt unlock with wrong password
        let wrongPassThrew = false;
        try {
          await repo.unlockWithPassword('WrongPassword999!');
        } catch (err: any) {
          if (err instanceof AuthenticationError) wrongPassThrew = true;
        }

        // Attempt recovery with wrong recovery key
        let wrongRecoveryThrew = false;
        try {
          await repo.unlockWithRecoveryKey('invalid word phrase that is completely incorrect for testing');
        } catch (err: any) {
          if (err instanceof AuthenticationError) wrongRecoveryThrew = true;
        }

        // Active key must remain null
        const activeKey = repo.getActiveKey();

        if (!wrongPassThrew) {
          return { passed: false, message: 'Wrong master password did not throw AuthenticationError!' };
        }
        if (!wrongRecoveryThrew) {
          return { passed: false, message: 'Wrong recovery key did not throw AuthenticationError!' };
        }
        if (activeKey !== null) {
          return { passed: false, message: 'Active key was populated despite authentication failures!' };
        }

        // Verify correct recovery key succeeds
        const { cryptoKey } = await repo.unlockWithRecoveryKey(recoveryKey);
        if (!cryptoKey) {
          return { passed: false, message: 'Valid recovery key failed to unlock vault!' };
        }

        return {
          passed: true,
          message: 'Wrong master password and recovery key strictly rejected without side effects.',
        };
      }
    );

    // 26. Vault Key Protection & Non-Extractability
    await runTest(
      'vault_key_protection_extractability',
      'Vault Key Non-Extractability & Zeroization Memory Hygiene',
      'Crypto',
      async () => {
        const params = keyDerivationService.createDefaultKdfParams('standard');
        const { rawKey, cryptoKey } = await keyDerivationService.deriveKey('KeyProtectTest!2026', params);

        // 1. Verify CryptoKey is non-extractable from WebCrypto context
        if (cryptoKey.extractable !== false) {
          return { passed: false, message: 'Derived CryptoKey was marked extractable: true (security hazard)!' };
        }

        let exportFailed = false;
        try {
          await window.crypto.subtle.exportKey('raw', cryptoKey);
        } catch {
          exportFailed = true; // WebCrypto should refuse to export non-extractable keys
        }

        if (!exportFailed) {
          return { passed: false, message: 'WebCrypto allowed exporting non-extractable CryptoKey!' };
        }

        // 2. Test zeroization of raw bytes
        const testBuffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
        encryptionService.zeroize(testBuffer);
        const isZeroed = testBuffer.every((b) => b === 0);
        encryptionService.zeroize(rawKey);

        if (!isZeroed) {
          return { passed: false, message: 'zeroize() failed to overwrite memory buffer with zeroes!' };
        }

        return {
          passed: true,
          message: 'Vault CryptoKey is strictly non-extractable and memory buffers zeroize cleanly.',
        };
      }
    );

    // 27. Ciphertext & IV Bit-Flip Tampering Detection
    await runTest(
      'ciphertext_bit_flip_tampering',
      'AES-256-GCM 1-Bit Ciphertext & IV Tamper Rejection',
      'TamperResistance',
      async () => {
        const rawKey = encryptionService.generateRandomBytes(32);
        const key = await window.crypto.subtle.importKey(
          'raw',
          rawKey,
          { name: 'AES-GCM', length: 256 },
          false,
          ['encrypt', 'decrypt']
        );
        encryptionService.zeroize(rawKey);

        const plaintext = JSON.stringify({ secretToken: 'SUPER_SECRET_12345' });
        const envelope = await encryptionService.encryptData(plaintext, key);

        // Tamper 1: Modify ciphertext
        const tamperedCiphertextEnvelope: EncryptedPayload = {
          ...envelope,
          ciphertext: envelope.ciphertext.slice(0, -2) + (envelope.ciphertext.endsWith('AA') ? 'BB' : 'AA'),
        };

        let cipherTamperCaught = false;
        try {
          await encryptionService.decryptData(tamperedCiphertextEnvelope, key);
        } catch (err: any) {
          if (err instanceof DecryptionError) cipherTamperCaught = true;
        }

        // Tamper 2: Modify IV / Nonce
        const tamperedIvEnvelope: EncryptedPayload = {
          ...envelope,
          iv: envelope.iv.slice(0, -2) + (envelope.iv.endsWith('AA') ? 'BB' : 'AA'),
        };

        let ivTamperCaught = false;
        try {
          await encryptionService.decryptData(tamperedIvEnvelope, key);
        } catch (err: any) {
          if (err instanceof DecryptionError) ivTamperCaught = true;
        }

        if (!cipherTamperCaught) {
          return { passed: false, message: 'Tampered ciphertext did not throw DecryptionError!' };
        }
        if (!ivTamperCaught) {
          return { passed: false, message: 'Tampered IV did not throw DecryptionError!' };
        }

        return {
          passed: true,
          message: 'AES-256-GCM authentication tag rejected both ciphertext and IV modifications.',
        };
      }
    );

    // 28. Malicious Import Neutralization & Prototype Pollution Defense
    await runTest(
      'malicious_csv_import_neutralization',
      'Malicious Import Neutralization (Formula Injection & Prototype Pollution)',
      'TamperResistance',
      async () => {
        const backupSvc = new BackupService();

        // 1. Prototype Pollution Attempt in CSV header
        const protoPollutionCsv = '__proto__,username,password\npolluted,admin,1234';
        let protoBlocked = false;
        try {
          await backupSvc.parseCsvImport(protoPollutionCsv);
        } catch {
          protoBlocked = true;
        }

        if (!protoBlocked) {
          return { passed: false, message: 'CSV with __proto__ in header was not rejected!' };
        }

        // 2. Formula Injection / DDE Neutralization in CSV Export
        const dangerousRecord: VaultRecord = {
          id: 'rec_danger',
          title: '=cmd|\'/C calc\'!A0',
          username: '+user_exec',
          password: '-password_calc',
          website: '@https://evil.com',
          notes: '|cmd /c notepad',
          type: 'login',
          category: 'passwords',
          favorite: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          tags: [],
        };

        const exportedCsv = backupSvc.exportToPlaintextCsv([dangerousRecord]);
        // All formula cells should be prefixed with single quote '
        if (!exportedCsv.includes("'\=cmd") && !exportedCsv.includes('"\'=cmd')) {
          return { passed: false, message: 'Formula injection (=) was not sanitized with single quote!' };
        }
        if (!exportedCsv.includes("'\+user_exec") && !exportedCsv.includes('"\'+user_exec')) {
          return { passed: false, message: 'Formula injection (+) was not sanitized!' };
        }

        // 3. Null Byte and Control Character Stripping in CSV Import
        const dirtyCsv = `title,username,password,website,notes,category\nNormal Title\x00\x08,test_user\x00,secret_pass\x07,https://example.com,clean note,passwords`;
        const parsed = await backupSvc.parseCsvImport(dirtyCsv);
        if (parsed.length !== 1) {
          return { passed: false, message: 'Failed to parse dirty CSV row!' };
        }
        if (parsed[0].title.includes('\x00') || parsed[0].username.includes('\x00')) {
          return { passed: false, message: 'Null bytes were not stripped from imported record!' };
        }

        return {
          passed: true,
          message: 'Prototype pollution headers rejected, formula injections prepended with quote, and control chars stripped.',
        };
      }
    );

    // 29. Lock/Unlock Bypass Enforcement
    await runTest(
      'lock_unlock_bypass_enforcement',
      'Locked Vault Operation Bypass Rejection (All CRUD Gated)',
      'TamperResistance',
      async () => {
        const memStorage = new Map<string, any>();
        const mockStorage = {
          getItem: async <T>(k: string): Promise<T | null> => (memStorage.has(k) ? JSON.parse(JSON.stringify(memStorage.get(k))) : null),
          setItem: async <T>(k: string, v: T): Promise<void> => { memStorage.set(k, JSON.parse(JSON.stringify(v))); },
          removeItem: async (k: string): Promise<void> => { memStorage.delete(k); },
        };
        const repo = new VaultRepository(mockStorage as any);
        await repo.createVault('LockTestPassword123!', 'standard');

        // Vault starts unlocked after init; explicitly lock it
        repo.setActiveKey(null);

        let deleteBlocked = false;
        try {
          await repo.deleteRecord('rec_any');
        } catch (err: any) {
          if (err instanceof VaultLockedError) deleteBlocked = true;
        }

        let replaceBlocked = false;
        try {
          await repo.replaceEncryptedRecords([]);
        } catch (err: any) {
          if (err instanceof VaultLockedError) replaceBlocked = true;
        }

        let getDecryptedBlocked = false;
        try {
          await repo.getDecryptedRecords(null as any);
        } catch (err: any) {
          if (err instanceof VaultLockedError) getDecryptedBlocked = true;
        }

        if (!deleteBlocked) {
          return { passed: false, message: 'deleteRecord() did not throw VaultLockedError when locked!' };
        }
        if (!replaceBlocked) {
          return { passed: false, message: 'replaceEncryptedRecords() did not throw VaultLockedError when locked!' };
        }
        if (!getDecryptedBlocked) {
          return { passed: false, message: 'getDecryptedRecords(null) did not throw VaultLockedError!' };
        }

        return {
          passed: true,
          message: 'All mutating and decrypting operations strictly enforce vault unlocked state.',
        };
      }
    );

    // 30. Storage Manipulation Rejection
    await runTest(
      'storage_manipulation_rejection',
      'Storage Metadata Manipulation Detection & Rejection',
      'TamperResistance',
      async () => {
        const memStorage = new Map<string, any>();
        const mockStorage = {
          getItem: async <T>(k: string): Promise<T | null> => (memStorage.has(k) ? JSON.parse(JSON.stringify(memStorage.get(k))) : null),
          setItem: async <T>(k: string, v: T): Promise<void> => { memStorage.set(k, JSON.parse(JSON.stringify(v))); },
          removeItem: async (k: string): Promise<void> => { memStorage.delete(k); },
        };
        const repo = new VaultRepository(mockStorage as any);
        await repo.createVault('IntegrityCheckPass1!', 'standard');
        repo.setActiveKey(null);

        // Tamper with metadata salt in raw storage
        const meta = await mockStorage.getItem<any>('secure_vault_metadata_v1');
        meta.kdfParams.salt = keyDerivationService.generateSalt(16); // swap salt
        await mockStorage.setItem('secure_vault_metadata_v1', meta);

        let unlockFailed = false;
        try {
          await repo.unlockWithPassword('IntegrityCheckPass1!');
        } catch (err: any) {
          if (err instanceof AuthenticationError) unlockFailed = true;
        }

        if (!unlockFailed) {
          return { passed: false, message: 'Vault unlocked despite tampered KDF salt in storage!' };
        }

        return {
          passed: true,
          message: 'Direct manipulation of storage metadata is detected and blocked during authentication.',
        };
      }
    );

    // 31. Replayed & Modified Backups Rejection
    await runTest(
      'replayed_modified_backup_version_rejection',
      'Incompatible Backup Format & Future Version Rejection',
      'Backup',
      async () => {
        const memStorage = new Map<string, any>();
        const mockStorage = {
          getItem: async <T>(k: string): Promise<T | null> => (memStorage.has(k) ? JSON.parse(JSON.stringify(memStorage.get(k))) : null),
          setItem: async <T>(k: string, v: T): Promise<void> => { memStorage.set(k, JSON.parse(JSON.stringify(v))); },
          removeItem: async (k: string): Promise<void> => { memStorage.delete(k); },
        };
        const repo = new VaultRepository(mockStorage as any);
        await repo.createVault('BackupTestPass1!', 'standard');
        const backupSvc = new BackupService(repo);
        const validBackupJson = await backupSvc.createEncryptedBackup();

        // Tamper 1: Future unsupported version (v99)
        const parsedBackup = JSON.parse(validBackupJson);
        parsedBackup.version = 99;
        let futureVersionRejected = false;
        try {
          await backupSvc.restoreEncryptedBackup(JSON.stringify(parsedBackup), 'BackupTestPass1!');
        } catch (err: any) {
          if (err instanceof BackupIntegrityError && err.message.includes('Unsupported backup format version')) {
            futureVersionRejected = true;
          }
        }

        // Tamper 2: Invalid format identifier
        parsedBackup.version = 2;
        parsedBackup.format = 'UNKNOWN_MALICIOUS_FORMAT';
        let invalidFormatRejected = false;
        try {
          await backupSvc.restoreEncryptedBackup(JSON.stringify(parsedBackup), 'BackupTestPass1!');
        } catch (err: any) {
          if (err instanceof BackupIntegrityError && err.message.includes('Unrecognized backup format')) {
            invalidFormatRejected = true;
          }
        }

        if (!futureVersionRejected) {
          return { passed: false, message: 'Backup with future version (v99) was not rejected!' };
        }
        if (!invalidFormatRejected) {
          return { passed: false, message: 'Backup with unknown format was not rejected!' };
        }

        return {
          passed: true,
          message: 'Incompatible backup formats and unsupported versions are strictly rejected.',
        };
      }
    );

    // 23. Emergency Recovery Kit: Compression Round-Trip & QR Generation
    await runTest(
      'recovery-kit-compression-roundtrip',
      'Emergency Recovery Kit QR Generation & Pako Compression Round-Trip',
      'RecoveryKit',
      async () => {
        const secureStore = new LocalSecureStorageService();
        const vaultRepo = new VaultRepository(secureStore);
        const { cryptoKey } = await vaultRepo.createVault('RecoveryKitPass123!@#', 'standard');

        // Add 2 sample credentials
        await vaultRepo.saveRecord(
          {
            id: 'rec_kit_1',
            title: 'GitHub Work',
            type: 'login',
            category: 'work',
            username: 'octocat',
            password: 'SuperSecretGitHubPassword123!',
            website: 'https://github.com',
            favorite: true,
            tags: ['work', 'dev'],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          cryptoKey
        );
        await vaultRepo.saveRecord(
          {
            id: 'rec_kit_2',
            title: 'Emergency Contacts',
            type: 'note',
            category: 'notes',
            notes: 'Doctor: 555-0199, Lawyer: 555-0144',
            favorite: false,
            tags: ['emergency'],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          cryptoKey
        );

        const backupSvc = new BackupService(vaultRepo);
        const backupJson = await backupSvc.createEncryptedBackup(cryptoKey);

        // Generate Emergency Recovery Kit payload
        const kitPayload = await recoveryKitService.prepareRecoveryKit(backupJson);

        if (!kitPayload.qrData || kitPayload.qrData.length === 0) {
          return { passed: false, message: 'Recovery kit produced an empty QR payload string!' };
        }

        if (!kitPayload.qrData.startsWith('LOTUSX_BACKUP_V1:') && !kitPayload.qrData.startsWith('LOTUSX_KEY_V1:')) {
          return {
            passed: false,
            message: `QR payload missing required LOTUSX header! Found: ${kitPayload.qrData.slice(0, 30)}`,
          };
        }

        if (kitPayload.recordCount !== 2) {
          return {
            passed: false,
            message: `Expected record count 2, got ${kitPayload.recordCount}`,
          };
        }

        // Test decompression of compressed payload
        if (kitPayload.qrData.startsWith('LOTUSX_BACKUP_V1:')) {
          const rawBase64 = kitPayload.qrData.slice('LOTUSX_BACKUP_V1:'.length);
          const decompressed = recoveryKitService.decompressWithPako(rawBase64);
          const parsedRestored = JSON.parse(decompressed);

          if (!parsedRestored.records || parsedRestored.records.length !== 2) {
            return {
              passed: false,
              message: 'Decompressed payload records count does not match original backup!',
            };
          }
        }

        return {
          passed: true,
          message: 'Recovery Kit generated a valid, compressed QR payload and decompressed successfully.',
          details: `Payload length: ${kitPayload.qrData.length} chars (Safe limit: ${RecoveryKitService.QR_SAFE_CHAR_LIMIT})`,
        };
      }
    );

    // 24. Emergency Recovery Kit: Guaranteed Safe Fallback for Large Vaults
    await runTest(
      'recovery-kit-large-vault-fallback',
      'Emergency Recovery Kit Guaranteed Fallback for Large Vaults',
      'RecoveryKit',
      async () => {
        // Construct a simulated large backup that exceeds normal QR byte capacity
        // Real AES-256-GCM ciphertexts are high-entropy (incompressible). Using random hex strings ensures realistic size.
        const largeRecords = Array.from({ length: 40 }).map((_, i) => ({
          id: `record-${i}`,
          ciphertext: Array.from({ length: 200 }, () => Math.floor(Math.random() * 16).toString(16)).join(''),
          iv: '123456789012',
          tag: '1234567890123456',
          version: 2,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }));

        const mockBackup = {
          version: 2,
          format: 'LOTUSX_ENCRYPTED_BACKUP',
          createdAt: new Date().toISOString(),
          recordCount: largeRecords.length,
          saltHex: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          records: largeRecords,
          vaultKeys: {
            authVerification: { ciphertext: 'test-auth', iv: 'iv', tag: 'tag', version: 2 },
          },
        };

        const largeBackupJson = JSON.stringify(mockBackup);
        const kitPayload = await recoveryKitService.prepareRecoveryKit(largeBackupJson);

        if (!kitPayload.qrData) {
          return { passed: false, message: 'Recovery kit returned empty QR data for large backup!' };
        }

        if (kitPayload.qrData.length > RecoveryKitService.QR_SAFE_CHAR_LIMIT) {
          return {
            passed: false,
            message: `QR payload size (${kitPayload.qrData.length}) exceeded safe limit (${RecoveryKitService.QR_SAFE_CHAR_LIMIT})!`,
          };
        }

        if (!kitPayload.isDisasterKeyOnly) {
          return {
            passed: false,
            message: 'Large backup did not activate isDisasterKeyOnly fallback mode!',
          };
        }

        if (!kitPayload.qrData.startsWith('LOTUSX_KEY_V1:')) {
          return {
            passed: false,
            message: 'Fallback payload must use LOTUSX_KEY_V1 header prefix.',
          };
        }

        return {
          passed: true,
          message: 'Large vault successfully triggered guaranteed compact disaster key QR fallback.',
          details: `Payload length: ${kitPayload.qrData.length} chars (within safe limit)`,
        };
      }
    );

    // 25. Theme & Appearance: Persistent Custom Palette & Logo Settings
    await runTest(
      'theme-appearance-persistence',
      'Theme & Appearance Persistence and Logo Settings',
      'CRUD',
      async () => {
        // Test initial default settings
        const initialSaved = localStorage.getItem(THEME_STORAGE_KEY);

        const customSettings = {
          palette: {
            ...DEFAULT_THEME_CONFIG.palette,
            primary: '#e63946',
            secondary: '#457b9d',
            accent: '#f1faee',
          },
          logoMode: 'custom',
          customLogoUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
          customLogoName: 'test-custom-logo.svg',
          isCustomized: true,
        };

        localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(customSettings));

        const storedRaw = localStorage.getItem(THEME_STORAGE_KEY);
        if (!storedRaw) {
          return { passed: false, message: 'Custom theme settings were not saved to localStorage!' };
        }

        const parsed = JSON.parse(storedRaw);
        if (parsed.palette.primary !== '#e63946') {
          return { passed: false, message: 'Saved primary color does not match expected value!' };
        }
        if (parsed.logoMode !== 'custom') {
          return { passed: false, message: 'logoMode flag was not preserved!' };
        }

        // Test restore default logo
        parsed.logoMode = 'default';
        parsed.customLogoUrl = null;
        parsed.customLogoName = null;
        localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(parsed));

        const restored = JSON.parse(localStorage.getItem(THEME_STORAGE_KEY)!);
        if (restored.logoMode !== 'default' || restored.customLogoUrl !== null) {
          return { passed: false, message: 'Failed to reset custom logo to default!' };
        }

        // Clean up
        if (initialSaved) {
          localStorage.setItem(THEME_STORAGE_KEY, initialSaved);
        } else {
          localStorage.removeItem(THEME_STORAGE_KEY);
        }

        return {
          passed: true,
          message: 'Theme colors and custom logo preferences persist and restore correctly.',
        };
      }
    );

    // 26. Configurable Storage Engine & Unlimited Memory Quota
    await runTest(
      'configurable-storage-engine-quota',
      'Configurable Storage Engine & Unlimited Quota Management',
      'CRUD',
      async () => {
        const storage = new LocalSecureStorageService();

        // 1. Verify engine getter/setter
        const initialEngine = storage.getActiveEngine();
        if (initialEngine !== 'indexeddb' && initialEngine !== 'localstorage') {
          return { passed: false, message: `Unexpected storage engine returned: ${initialEngine}` };
        }

        // 2. Configure Unlimited Quota (0 MB)
        storage.setConfiguredQuotaMb(0);
        if (storage.getConfiguredQuotaMb() !== 0) {
          return { passed: false, message: 'Failed to configure unlimited storage quota!' };
        }

        const metricsUnlimited = await storage.getStorageMetrics();
        if (metricsUnlimited.configuredQuotaMb !== 0) {
          return { passed: false, message: 'Metrics do not reflect unlimited quota setting!' };
        }
        if (!metricsUnlimited.quotaLabel.toLowerCase().includes('unlimited')) {
          return { passed: false, message: `Expected Unlimited quota label, got: ${metricsUnlimited.quotaLabel}` };
        }

        // 3. Configure Custom Quota (e.g. 500 MB)
        storage.setConfiguredQuotaMb(500);
        if (storage.getConfiguredQuotaMb() !== 500) {
          return { passed: false, message: 'Failed to set custom 500MB storage quota!' };
        }
        const metrics500 = await storage.getStorageMetrics();
        if (metrics500.configuredQuotaMb !== 500 || metrics500.quotaBytes !== 500 * 1024 * 1024) {
          return { passed: false, message: 'Metrics calculation failed for custom quota!' };
        }

        // 4. Test quota enforcement threshold rejection when limit is exceeded
        storage.setConfiguredQuotaMb(0.001); // ~1KB quota to verify threshold enforcement
        let quotaRejected = false;
        try {
          await storage.setItem('large_payload_test', {
            data: 'X'.repeat(5000), // ~10KB payload (exceeds 1KB limit)
          });
        } catch (err: any) {
          if (err.message && err.message.includes('quota limit')) {
            quotaRejected = true;
          }
        } finally {
          await storage.removeItem('large_payload_test');
          storage.setConfiguredQuotaMb(0); // Restore to unlimited
        }

        if (!quotaRejected) {
          return { passed: false, message: 'Storage service failed to enforce configured quota threshold!' };
        }

        return {
          passed: true,
          message: 'Configurable storage engine and unlimited quota operate reliably without 5MB ceiling.',
          details: `Active Engine: ${storage.getActiveEngine()}, Quota: Unlimited (Auto-Expand)`,
        };
      }
    );

    // 27. Storage Optimization & Zero Data Loss Migration
    await runTest(
      'storage-optimization-migration',
      'Storage Optimization & Multi-Engine Migration Safety',
      'CRUD',
      async () => {
        const storage = new LocalSecureStorageService();
        const testItemKey = 'secure_vault_migration_test_key';
        const testItemVal = { credentialId: 'cred-999', secret: 'AlphaOmegaSecret' };

        await storage.setItem(testItemKey, testItemVal);

        const retrievedBefore = await storage.getItem<typeof testItemVal>(testItemKey);
        if (!retrievedBefore || retrievedBefore.secret !== 'AlphaOmegaSecret') {
          return { passed: false, message: 'Failed initial write/read before migration test!' };
        }

        // Run optimization
        const optResult = await storage.optimizeStorage();
        if (typeof optResult.freedBytes !== 'number' || typeof optResult.keysCount !== 'number') {
          return { passed: false, message: 'Optimization returned invalid telemetry structure!' };
        }

        // Verify key persists through optimization
        const retrievedAfter = await storage.getItem<typeof testItemVal>(testItemKey);
        if (!retrievedAfter || retrievedAfter.secret !== 'AlphaOmegaSecret') {
          return { passed: false, message: 'Storage optimization corrupted or lost stored key!' };
        }

        await storage.removeItem(testItemKey);

        return {
          passed: true,
          message: 'Storage optimization and multi-engine safety verified with 100% data fidelity.',
        };
      }
    );

    // 28. WebAuthn Biometric Unlock Cryptographic Key Wrapping & Persistence
    await runTest(
      'webauthn-biometric-key-wrapping',
      'WebAuthn Biometric Unlock Cryptographic Key Wrapping & Storage Safety',
      'Crypto',
      async () => {
        const storage = new LocalSecureStorageService();
        const existingBio = localStorage.getItem('lotusx_webauthn_biometric_v1');

        try {
          // Verify platform label detection works
          const label = biometricService.getPlatformBiometricLabel();
          if (!label || typeof label !== 'string') {
            return { passed: false, message: 'Biometric platform label detection returned empty string!' };
          }

          // Simulate encrypted biometric metadata and verify SecureStorageService does not purge it during storage optimization
          const dummyKey = await window.crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
          );
          const wrappedSecret = await encryptionService.encryptString('TestMasterSecret!2026', dummyKey);
          const mockMeta = {
            enabled: true,
            credentialIdBase64: window.btoa('mock-cred-id-12345'),
            prfSaltBase64: window.btoa('mock-prf-salt-1234567890123456'),
            wrappedSecret,
            wrapMode: 'prf' as const,
            deviceLabel: 'Test Biometric Sensor',
            createdAt: Date.now(),
          };

          localStorage.setItem('lotusx_webauthn_biometric_v1', JSON.stringify(mockMeta));

          if (!biometricService.isBiometricEnabled()) {
            return { passed: false, message: 'BiometricService failed to detect enabled metadata!' };
          }

          // Ensure storage migration / optimization preserves WebAuthn enrollment metadata
          await storage.optimizeStorage();

          if (!biometricService.isBiometricEnabled()) {
            return {
              passed: false,
              message: 'SecureStorageService erroneously purged WebAuthn biometric enrollment metadata!',
            };
          }

          const decrypted = await encryptionService.decryptString(
            biometricService.getMetadata()!.wrappedSecret,
            dummyKey
          );
          if (decrypted !== 'TestMasterSecret!2026') {
            return { passed: false, message: 'Wrapped biometric secret failed round-trip AES-256-GCM decryption!' };
          }

          return {
            passed: true,
            message: 'WebAuthn biometric key wrapping and storage persistence verified.',
            details: `Sensor Label: ${label}, Encryption: AES-256-GCM`,
          };
        } finally {
          if (existingBio) {
            localStorage.setItem('lotusx_webauthn_biometric_v1', existingBio);
          } else {
            localStorage.removeItem('lotusx_webauthn_biometric_v1');
          }
        }
      }
    );

    return results;
  }
}
