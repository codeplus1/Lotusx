/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface IndexedDBRecordEnvelope {
  key: string;
  value: any;
  updatedAt: number;
  sizeEstimateBytes: number;
}

const DB_NAME = 'lotusx_secure_vault_v1';
const DB_VERSION = 1;
const STORE_NAME = 'vault_records';

/**
 * Enterprise IndexedDB Store for LotusX Vault
 * Native asynchronous browser storage with multi-gigabyte capacity, no 5MB limit.
 * Transparently falls back to isolated memory storage in headless CLI testing environments.
 */
export class IndexedDBStore {
  private dbPromise: Promise<IDBDatabase> | null = null;
  private memoryFallback: Map<string, IndexedDBRecordEnvelope> = new Map();

  public static isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.indexedDB !== 'undefined' &&
      typeof IDBKeyRange !== 'undefined'
    );
  }

  private async getDB(): Promise<IDBDatabase> {
    if (!IndexedDBStore.isSupported()) {
      throw new Error('Native IndexedDB is not supported in this runtime.');
    }

    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      try {
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          }
        };

        request.onsuccess = (event: Event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          db.onversionchange = () => {
            db.close();
            this.dbPromise = null;
          };
          resolve(db);
        };

        request.onerror = (event: Event) => {
          this.dbPromise = null;
          reject((event.target as IDBOpenDBRequest).error || new Error('Failed to open IndexedDB database.'));
        };
      } catch (err) {
        this.dbPromise = null;
        reject(err);
      }
    });

    return this.dbPromise;
  }

  public async getItem<T>(key: string): Promise<T | null> {
    if (!IndexedDBStore.isSupported()) {
      const record = this.memoryFallback.get(key);
      return record ? (record.value as T) : null;
    }

    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);

        req.onsuccess = () => {
          const result = req.result as IndexedDBRecordEnvelope | undefined;
          if (!result) {
            resolve(null);
          } else {
            resolve(result.value as T);
          }
        };

        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  }

  public async setItem<T>(key: string, value: T): Promise<void> {
    const serialized = JSON.stringify(value);
    const sizeEstimateBytes = (key.length + serialized.length) * 2;

    const envelope: IndexedDBRecordEnvelope = {
      key,
      value,
      updatedAt: Date.now(),
      sizeEstimateBytes,
    };

    if (!IndexedDBStore.isSupported()) {
      this.memoryFallback.set(key, envelope);
      return;
    }

    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(envelope);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  public async removeItem(key: string): Promise<void> {
    if (!IndexedDBStore.isSupported()) {
      this.memoryFallback.delete(key);
      return;
    }

    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(key);

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Ignored
    }
  }

  public async getAllKeys(): Promise<string[]> {
    if (!IndexedDBStore.isSupported()) {
      return Array.from(this.memoryFallback.keys());
    }

    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAllKeys();

        req.onsuccess = () => resolve((req.result as string[]) || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  public async getAllEntries<T = any>(): Promise<Array<{ key: string; value: T; updatedAt: number }>> {
    if (!IndexedDBStore.isSupported()) {
      return Array.from(this.memoryFallback.values()).map((r) => ({
        key: r.key,
        value: r.value as T,
        updatedAt: r.updatedAt,
      }));
    }

    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();

        req.onsuccess = () => {
          const results = (req.result as IndexedDBRecordEnvelope[]) || [];
          resolve(
            results.map((r) => ({
              key: r.key,
              value: r.value as T,
              updatedAt: r.updatedAt,
            }))
          );
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  }

  public async calculateStoreBytes(): Promise<{ totalBytes: number; keyCount: number }> {
    if (!IndexedDBStore.isSupported()) {
      let totalBytes = 0;
      for (const entry of this.memoryFallback.values()) {
        const str = JSON.stringify(entry.value);
        totalBytes += (entry.key.length + str.length) * 2;
      }
      return { totalBytes, keyCount: this.memoryFallback.size };
    }

    try {
      const entries = await this.getAllEntries();
      let totalBytes = 0;
      for (const entry of entries) {
        const str = JSON.stringify(entry.value);
        totalBytes += (entry.key.length + str.length) * 2;
      }
      return { totalBytes, keyCount: entries.length };
    } catch {
      return { totalBytes: 0, keyCount: 0 };
    }
  }

  public async clear(): Promise<void> {
    if (!IndexedDBStore.isSupported()) {
      this.memoryFallback.clear();
      return;
    }

    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.clear();

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Ignored
    }
  }
}

export const indexedDBStore = new IndexedDBStore();
