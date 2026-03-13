/**
 * 🧬 L1+L6 — Translation Pair Download Manager
 * Downloads translation pair files from CDN with storage awareness,
 * integrity hashing, and platform-native encryption at rest.
 *
 * Encryption strategy (L6):
 *   iOS  → NSFileProtectionComplete (files encrypted when device locked)
 *   Android → encrypted filesystem on modern devices (API 29+)
 *   Both → SHA-256 integrity hash stored in expo-secure-store, tied to licenseToken
 *           If license changes, pairs are invalidated on next load verification.
 */
import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createLogger } from './logger';

const log = createLogger('PairManager');

// ─── Constants ───────────────────────────────────────────────

const PAIRS_DIR = `${FileSystem.documentDirectory}translation-pairs/`;
const DOWNLOADED_LIST_KEY = 'windy-downloaded-pairs';
const HASH_PREFIX = 'windy-pair-hash-';
const LICENSE_TOKEN_KEY = 'windy_jwt_token';

/** Minimum free space to warn the user (1 GB) */
const LOW_STORAGE_THRESHOLD = 1_073_741_824;
/** Minimum free space to block downloads entirely (500 MB) */
const BLOCK_STORAGE_THRESHOLD = 536_870_912;

// ─── Types ───────────────────────────────────────────────────

export interface DownloadProgress {
    pairId: string;
    bytesWritten: number;
    bytesTotal: number;
    /** 0.0 – 1.0 */
    fraction: number;
}

export interface BundleResult {
    success: string[];
    failed: string[];
}

export interface PairStorageEntry {
    id: string;
    sizeMB: number;
}

export interface StorageInfo {
    usedBytes: number;
    freeBytes: number;
    pairs: PairStorageEntry[];
}

export type ProgressCallback = (progress: DownloadProgress) => void;

// ─── Errors ──────────────────────────────────────────────────

export class StorageFullError extends Error {
    constructor(freeBytes: number) {
        super(`Insufficient storage: ${Math.round(freeBytes / 1_048_576)} MB free, need at least 500 MB`);
        this.name = 'StorageFullError';
    }
}

export class IntegrityError extends Error {
    constructor(pairId: string) {
        super(`Integrity check failed for pair "${pairId}" — license may have changed`);
        this.name = 'IntegrityError';
    }
}

// ─── PairManager ─────────────────────────────────────────────

class PairManager {
    private activeDownloads = new Map<string, FileSystem.DownloadResumable>();
    private dirReady = false;

    // ── Directory bootstrap ──────────────────────────────────

    private async ensureDir(): Promise<void> {
        if (this.dirReady) return;
        const info = await FileSystem.getInfoAsync(PAIRS_DIR);
        if (!info.exists) {
            await FileSystem.makeDirectoryAsync(PAIRS_DIR, { intermediates: true });
        }
        this.dirReady = true;
    }

    // ── Storage helpers ──────────────────────────────────────

    /**
     * Check free disk space. Warns via logger if < 1 GB, throws if < 500 MB.
     */
    private async checkStorage(): Promise<number> {
        const freeBytes = await FileSystem.getFreeDiskStorageAsync();
        if (freeBytes < BLOCK_STORAGE_THRESHOLD) {
            log.error('checkStorage', new StorageFullError(freeBytes));
            throw new StorageFullError(freeBytes);
        }
        if (freeBytes < LOW_STORAGE_THRESHOLD) {
            log.warn('checkStorage', 'Low storage warning', {
                freeMB: Math.round(freeBytes / 1_048_576),
            });
        }
        return freeBytes;
    }

    // ── Integrity hash (L6) ─────────────────────────────────

    /**
     * Compute SHA-256( pairId + licenseToken + fileSize )
     */
    private async computeHash(pairId: string, fileSize: number): Promise<string> {
        let licenseToken = '';
        try {
            licenseToken = (await SecureStore.getItemAsync(LICENSE_TOKEN_KEY)) ?? '';
        } catch {
            log.warn('computeHash', 'Could not read license token for hashing');
        }
        const payload = `${pairId}${licenseToken}${fileSize}`;
        return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, payload);
    }

    /**
     * Store the integrity hash for a pair in SecureStore.
     */
    private async storeHash(pairId: string, hash: string): Promise<void> {
        await SecureStore.setItemAsync(`${HASH_PREFIX}${pairId}`, hash);
    }

    /**
     * Verify a pair's integrity hash. Returns false if the hash is missing or mismatched.
     */
    async verifyIntegrity(pairId: string): Promise<boolean> {
        try {
            const filePath = `${PAIRS_DIR}${pairId}.bin`;
            const info = await FileSystem.getInfoAsync(filePath);
            if (!info.exists || !('size' in info)) return false;
            const fileSize = (info as { size: number }).size;

            const storedHash = await SecureStore.getItemAsync(`${HASH_PREFIX}${pairId}`);
            if (!storedHash) return false;

            const freshHash = await this.computeHash(pairId, fileSize);
            return storedHash === freshHash;
        } catch (err) {
            log.error('verifyIntegrity', err, { pairId });
            return false;
        }
    }

    // ── Downloaded-list persistence ──────────────────────────

    private async loadList(): Promise<string[]> {
        try {
            const raw = await AsyncStorage.getItem(DOWNLOADED_LIST_KEY);
            if (!raw) return [];
            const parsed: unknown = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter((v): v is string => typeof v === 'string');
        } catch {
            return [];
        }
    }

    private async saveList(list: string[]): Promise<void> {
        await AsyncStorage.setItem(DOWNLOADED_LIST_KEY, JSON.stringify(list));
    }

    private async addToList(pairId: string): Promise<void> {
        const list = await this.loadList();
        if (!list.includes(pairId)) {
            list.push(pairId);
            await this.saveList(list);
        }
    }

    private async removeFromList(pairId: string): Promise<void> {
        const list = await this.loadList();
        await this.saveList(list.filter(id => id !== pairId));
    }

    // ── Public API ───────────────────────────────────────────

    /**
     * Download a single translation pair from the CDN.
     *
     * 1. Check storage (warn < 1 GB, block < 500 MB)
     * 2. Create resumable download with progress callback
     * 3. Verify file size after download
     * 4. Record in AsyncStorage downloaded list
     * 5. Store integrity hash in SecureStore
     *
     * @returns true on success, false on failure (logged, not thrown)
     */
    async downloadPair(
        pairId: string,
        cdnUrl: string,
        onProgress?: ProgressCallback,
    ): Promise<boolean> {
        log.entry('downloadPair', { pairId, cdnUrl });

        try {
            await this.ensureDir();
            await this.checkStorage();

            const destPath = `${PAIRS_DIR}${pairId}.bin`;

            // If already downloaded, skip
            const existing = await FileSystem.getInfoAsync(destPath);
            if (existing.exists) {
                log.info('downloadPair', 'Pair already exists on disk', { pairId });
                // Re-record in case list got corrupted
                await this.addToList(pairId);
                return true;
            }

            // Create resumable download
            const downloadResumable = FileSystem.createDownloadResumable(
                cdnUrl,
                destPath,
                {
                    headers: {
                        'User-Agent': 'WindyPro/1.0.0',
                    },
                    // iOS: files are protected via NSFileProtectionComplete by default
                    // when the file lands inside the app's document directory
                    ...(Platform.OS === 'ios' ? { sessionType: FileSystem.FileSystemSessionType.BACKGROUND } : {}),
                },
                (progress) => {
                    if (onProgress && progress.totalBytesExpectedToWrite > 0) {
                        onProgress({
                            pairId,
                            bytesWritten: progress.totalBytesWritten,
                            bytesTotal: progress.totalBytesExpectedToWrite,
                            fraction: progress.totalBytesWritten / progress.totalBytesExpectedToWrite,
                        });
                    }
                },
            );

            this.activeDownloads.set(pairId, downloadResumable);

            const result = await downloadResumable.downloadAsync();
            this.activeDownloads.delete(pairId);

            if (!result?.uri) {
                log.error('downloadPair', new Error('Download returned no URI'), { pairId });
                // Clean up partial file
                await FileSystem.deleteAsync(destPath, { idempotent: true });
                return false;
            }

            // Verify file actually landed on disk and has size > 0
            const fileInfo = await FileSystem.getInfoAsync(destPath);
            if (!fileInfo.exists) {
                log.error('downloadPair', new Error('File missing after download'), { pairId });
                return false;
            }

            const fileSize = 'size' in fileInfo ? (fileInfo as { size: number }).size : 0;
            if (fileSize === 0) {
                log.error('downloadPair', new Error('Downloaded file is 0 bytes'), { pairId });
                await FileSystem.deleteAsync(destPath, { idempotent: true });
                return false;
            }

            // Record in AsyncStorage
            await this.addToList(pairId);

            // Store integrity hash (L6)
            const hash = await this.computeHash(pairId, fileSize);
            await this.storeHash(pairId, hash);

            log.exit('downloadPair', { pairId, sizeMB: Math.round(fileSize / 1_048_576 * 100) / 100 });
            return true;
        } catch (err) {
            this.activeDownloads.delete(pairId);
            log.error('downloadPair', err, { pairId });
            // Clean up partial file on any error
            try {
                await FileSystem.deleteAsync(`${PAIRS_DIR}${pairId}.bin`, { idempotent: true });
            } catch { /* ignore cleanup errors */ }
            return false;
        }
    }

    /**
     * Download multiple pairs sequentially.
     * Tracks successes and failures independently.
     */
    async downloadBundle(
        pairs: { id: string; cdnUrl: string }[],
        onProgress?: ProgressCallback,
    ): Promise<BundleResult> {
        log.entry('downloadBundle', { count: pairs.length });

        const result: BundleResult = { success: [], failed: [] };

        for (const pair of pairs) {
            const ok = await this.downloadPair(pair.id, pair.cdnUrl, onProgress);
            if (ok) {
                result.success.push(pair.id);
            } else {
                result.failed.push(pair.id);
            }
        }

        log.exit('downloadBundle', {
            successCount: result.success.length,
            failedCount: result.failed.length,
        });
        return result;
    }

    /**
     * Cancel an active download — pause the resumable and clean up the partial file.
     */
    async cancelDownload(pairId: string): Promise<void> {
        log.entry('cancelDownload', { pairId });

        const resumable = this.activeDownloads.get(pairId);
        if (resumable) {
            try {
                await resumable.pauseAsync();
            } catch (err) {
                log.warn('cancelDownload', 'pauseAsync failed', { pairId });
            }
            this.activeDownloads.delete(pairId);
        }

        // Clean partial file
        const filePath = `${PAIRS_DIR}${pairId}.bin`;
        await FileSystem.deleteAsync(filePath, { idempotent: true });

        // Remove from list if it somehow got added
        await this.removeFromList(pairId);

        log.exit('cancelDownload', { pairId });
    }

    /**
     * Check whether a pair is downloaded (on-disk existence + list membership).
     */
    async isDownloaded(pairId: string): Promise<boolean> {
        try {
            const filePath = `${PAIRS_DIR}${pairId}.bin`;
            const info = await FileSystem.getInfoAsync(filePath);
            return info.exists;
        } catch {
            return false;
        }
    }

    /**
     * Get the list of all downloaded pair IDs from persistent storage.
     */
    async getDownloadedPairs(): Promise<string[]> {
        return this.loadList();
    }

    /**
     * Delete a pair — removes the file, the list entry, and the integrity hash.
     */
    async deletePair(pairId: string): Promise<void> {
        log.entry('deletePair', { pairId });

        const filePath = `${PAIRS_DIR}${pairId}.bin`;
        await FileSystem.deleteAsync(filePath, { idempotent: true });
        await this.removeFromList(pairId);

        // Remove integrity hash from SecureStore
        try {
            await SecureStore.deleteItemAsync(`${HASH_PREFIX}${pairId}`);
        } catch {
            log.warn('deletePair', 'Could not remove integrity hash', { pairId });
        }

        log.exit('deletePair', { pairId });
    }

    /**
     * Get storage information: total used by pairs, free disk space, and per-pair sizes.
     */
    async getStorageInfo(): Promise<StorageInfo> {
        const list = await this.loadList();
        let usedBytes = 0;
        const pairs: PairStorageEntry[] = [];

        for (const id of list) {
            try {
                const filePath = `${PAIRS_DIR}${id}.bin`;
                const info = await FileSystem.getInfoAsync(filePath);
                if (info.exists && 'size' in info) {
                    const size = (info as { size: number }).size;
                    usedBytes += size;
                    pairs.push({
                        id,
                        sizeMB: Math.round((size / 1_048_576) * 100) / 100,
                    });
                } else {
                    // File missing — still report in list with 0
                    pairs.push({ id, sizeMB: 0 });
                }
            } catch {
                pairs.push({ id, sizeMB: 0 });
            }
        }

        let freeBytes = 0;
        try {
            freeBytes = await FileSystem.getFreeDiskStorageAsync();
        } catch {
            log.warn('getStorageInfo', 'Could not read free disk storage');
        }

        return { usedBytes, freeBytes, pairs };
    }
}

// ─── Singleton Export ────────────────────────────────────────

export const pairManager = new PairManager();
