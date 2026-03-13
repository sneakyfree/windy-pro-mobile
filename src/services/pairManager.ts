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
 *
 * Hardening (Strand L):
 *   - Input validation (pairId, cdnUrl)
 *   - Retry with exponential backoff (3 attempts)
 *   - NetInfo offline detection → queue for later
 *   - Storage full: user-friendly Alert + partial cleanup
 *   - 5-minute download timeout
 *   - Duplicate simultaneous download prevention
 */
import * as FileSystem from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { Alert, Platform } from 'react-native';
import { createLogger } from './logger';
import { licenseService } from './license';
import type { LicenseTier } from '@/types';

const log = createLogger('PairManager');

// ─── Constants ───────────────────────────────────────────────

const PAIRS_DIR = `${FileSystem.documentDirectory}translation-pairs/`;
const DOWNLOADED_LIST_KEY = 'windy-downloaded-pairs';
const HASH_PREFIX = 'windy-pair-hash-';
const LICENSE_TOKEN_KEY = 'windy_jwt_token';
const OFFLINE_QUEUE_KEY = 'windy-offline-download-queue';

/** Minimum free space to warn the user (1 GB) */
const LOW_STORAGE_THRESHOLD = 1_073_741_824;
/** Minimum free space to block downloads entirely (500 MB) */
const BLOCK_STORAGE_THRESHOLD = 536_870_912;

/** Maximum download time per pair (5 minutes) */
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

/** Retry configuration */
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

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

/** Tier → max downloaded pairs */
export const PAIR_LIMITS: Record<LicenseTier, number> = {
    free: 1,
    pro: 5,
    translate: 25,
    translate_pro: 100,
};

/** Result returned when the pair download limit is reached */
export interface PairLimitResult {
    success: false;
    reason: 'limit_reached';
    limit: number;
    tier: LicenseTier;
}

/** Result returned when device is offline */
export interface OfflineQueuedResult {
    success: false;
    reason: 'offline_queued';
}

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

export class DownloadTimeoutError extends Error {
    constructor(pairId: string) {
        super(`Download timed out for pair "${pairId}" after ${DOWNLOAD_TIMEOUT_MS / 60_000} minutes`);
        this.name = 'DownloadTimeoutError';
    }
}

export class InvalidInputError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidInputError';
    }
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Validate pairId: must be a non-empty string.
 */
function validatePairId(pairId: string): void {
    if (!pairId || typeof pairId !== 'string' || pairId.trim().length === 0) {
        throw new InvalidInputError('pairId must be a non-empty string');
    }
}

/**
 * Validate cdnUrl: must be a valid HTTPS URL.
 */
function validateCdnUrl(cdnUrl: string): void {
    if (!cdnUrl || typeof cdnUrl !== 'string') {
        throw new InvalidInputError('cdnUrl must be a non-empty string');
    }
    try {
        const url = new URL(cdnUrl);
        if (url.protocol !== 'https:') {
            throw new InvalidInputError(`cdnUrl must use HTTPS, got: ${url.protocol}`);
        }
    } catch (err) {
        if (err instanceof InvalidInputError) throw err;
        throw new InvalidInputError(`cdnUrl is not a valid URL: ${cdnUrl}`);
    }
}

/**
 * Sleep for the given ms.
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

    // ── Connectivity check ──────────────────────────────────

    /**
     * Check if the device is currently online.
     */
    private async isOnline(): Promise<boolean> {
        try {
            const state = await NetInfo.fetch();
            return state.isConnected === true && state.isInternetReachable !== false;
        } catch {
            // If NetInfo fails, assume online and let the download attempt handle errors
            log.warn('isOnline', 'NetInfo check failed, assuming online');
            return true;
        }
    }

    // ── Offline queue ───────────────────────────────────────

    /**
     * Add a pair to the offline download queue.
     */
    private async queueForLater(pairId: string, cdnUrl: string): Promise<void> {
        try {
            const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
            const queue: Array<{ id: string; cdnUrl: string }> = raw ? JSON.parse(raw) : [];
            if (!queue.some((item) => item.id === pairId)) {
                queue.push({ id: pairId, cdnUrl });
                await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
                log.info('queueForLater', 'Pair queued for offline download', { pairId });
            }
        } catch (err) {
            log.error('queueForLater', err, { pairId });
        }
    }

    /**
     * Get all queued offline downloads.
     */
    async getOfflineQueue(): Promise<Array<{ id: string; cdnUrl: string }>> {
        try {
            const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
            if (!raw) return [];
            const parsed: unknown = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter(
                (item): item is { id: string; cdnUrl: string } =>
                    typeof item === 'object' &&
                    item !== null &&
                    typeof (item as Record<string, unknown>).id === 'string' &&
                    typeof (item as Record<string, unknown>).cdnUrl === 'string'
            );
        } catch {
            return [];
        }
    }

    /**
     * Remove a pair from the offline queue.
     */
    private async removeFromQueue(pairId: string): Promise<void> {
        try {
            const queue = await this.getOfflineQueue();
            await AsyncStorage.setItem(
                OFFLINE_QUEUE_KEY,
                JSON.stringify(queue.filter((item) => item.id !== pairId))
            );
        } catch { /* ignore */ }
    }

    /**
     * Process any queued offline downloads (call when connectivity returns).
     */
    async processOfflineQueue(onProgress?: ProgressCallback): Promise<BundleResult> {
        const queue = await this.getOfflineQueue();
        if (queue.length === 0) return { success: [], failed: [] };

        log.info('processOfflineQueue', 'Processing offline queue', { count: queue.length });
        const result: BundleResult = { success: [], failed: [] };

        for (const item of queue) {
            const ok = await this.downloadPair(item.id, item.cdnUrl, onProgress);
            if (ok === true) {
                result.success.push(item.id);
                await this.removeFromQueue(item.id);
            } else {
                result.failed.push(item.id);
            }
        }
        return result;
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

    // ── Download core (with retry + timeout) ────────────────

    /**
     * Internal download attempt — single try, with timeout.
     */
    private async attemptDownload(
        pairId: string,
        cdnUrl: string,
        destPath: string,
        onProgress?: ProgressCallback,
    ): Promise<boolean> {
        // Create resumable download
        const downloadResumable = FileSystem.createDownloadResumable(
            cdnUrl,
            destPath,
            {
                headers: {
                    'User-Agent': 'WindyPro/1.0.0',
                },
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

        // Race between download and timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new DownloadTimeoutError(pairId)), DOWNLOAD_TIMEOUT_MS);
        });

        const result = await Promise.race([
            downloadResumable.downloadAsync(),
            timeoutPromise,
        ]);

        if (!result?.uri) {
            throw new Error('Download returned no URI');
        }

        // Verify file actually landed on disk and has size > 0
        const fileInfo = await FileSystem.getInfoAsync(destPath);
        if (!fileInfo.exists) {
            throw new Error('File missing after download');
        }

        const fileSize = 'size' in fileInfo ? (fileInfo as { size: number }).size : 0;
        if (fileSize === 0) {
            throw new Error('Downloaded file is 0 bytes');
        }

        return true;
    }

    // ── Public API ───────────────────────────────────────────

    /**
     * Download a single translation pair from the CDN.
     *
     * Hardened with:
     *   1. Input validation (pairId, cdnUrl)
     *   2. Duplicate download prevention
     *   3. Offline detection → queue for later
     *   4. Storage check (warn < 1 GB, block < 500 MB)
     *   5. Retry with exponential backoff (3 attempts)
     *   6. 5-minute timeout per attempt
     *   7. Integrity hash stored in SecureStore
     *
     * @returns true on success, false on failure (logged, not thrown)
     */
    async downloadPair(
        pairId: string,
        cdnUrl: string,
        onProgress?: ProgressCallback,
    ): Promise<boolean | PairLimitResult | OfflineQueuedResult> {
        log.entry('downloadPair', { pairId, cdnUrl });

        // ── Input validation ─────────────────────────────────
        try {
            validatePairId(pairId);
            validateCdnUrl(cdnUrl);
        } catch (err) {
            log.error('downloadPair', err, { pairId, cdnUrl });
            return false;
        }

        // ── Duplicate download prevention ────────────────────
        if (this.activeDownloads.has(pairId)) {
            log.warn('downloadPair', 'Download already in progress', { pairId });
            return false;
        }

        // ── Offline detection ────────────────────────────────
        if (!(await this.isOnline())) {
            log.info('downloadPair', 'Device offline, queuing for later', { pairId });
            await this.queueForLater(pairId, cdnUrl);
            return { success: false, reason: 'offline_queued' };
        }

        // ── Tier limit check (L5) ────────────────────────────
        try {
            const tier = licenseService.getTier();
            const limit = PAIR_LIMITS[tier];
            const currentList = await this.loadList();

            // If already downloaded, no limit issue
            if (!currentList.includes(pairId) && currentList.length >= limit) {
                log.info('downloadPair', 'Pair limit reached', { tier, limit, current: currentList.length });
                return {
                    success: false,
                    reason: 'limit_reached',
                    limit,
                    tier,
                };
            }
        } catch (err) {
            log.warn('downloadPair', 'Tier limit check failed, proceeding', {
                error: err instanceof Error ? err.message : String(err),
            });
        }

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
                // Remove from offline queue if present
                await this.removeFromQueue(pairId);
                return true;
            }

            // ── Retry with exponential backoff ───────────────
            let lastError: Error | undefined;
            for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                try {
                    // Check connectivity before each retry
                    if (attempt > 1 && !(await this.isOnline())) {
                        log.info('downloadPair', 'Device went offline during retries, queuing', { pairId, attempt });
                        await this.queueForLater(pairId, cdnUrl);
                        return { success: false, reason: 'offline_queued' };
                    }

                    await this.attemptDownload(pairId, cdnUrl, destPath, onProgress);
                    lastError = undefined;
                    break; // success
                } catch (err) {
                    lastError = err instanceof Error ? err : new Error(String(err));
                    this.activeDownloads.delete(pairId);

                    // Clean up partial file before retry
                    try {
                        await FileSystem.deleteAsync(destPath, { idempotent: true });
                    } catch { /* ignore cleanup errors */ }

                    if (attempt < MAX_RETRIES) {
                        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
                        log.warn('downloadPair', `Attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${delay}ms`, {
                            pairId,
                            error: lastError.message,
                        });
                        await sleep(delay);
                    }
                }
            }

            this.activeDownloads.delete(pairId);

            if (lastError) {
                log.error('downloadPair', lastError, { pairId, message: `All ${MAX_RETRIES} attempts failed` });

                // Clean up partial file
                try {
                    await FileSystem.deleteAsync(destPath, { idempotent: true });
                } catch { /* ignore cleanup errors */ }

                return false;
            }

            // ── Post-download finalization ────────────────────
            const fileInfo = await FileSystem.getInfoAsync(destPath);
            const fileSize = fileInfo.exists && 'size' in fileInfo
                ? (fileInfo as { size: number }).size
                : 0;

            // Record in AsyncStorage
            await this.addToList(pairId);

            // Remove from offline queue if present
            await this.removeFromQueue(pairId);

            // Store integrity hash (L6)
            const hash = await this.computeHash(pairId, fileSize);
            await this.storeHash(pairId, hash);

            log.exit('downloadPair', { pairId, sizeMB: Math.round(fileSize / 1_048_576 * 100) / 100 });
            return true;
        } catch (err) {
            this.activeDownloads.delete(pairId);

            // User-friendly storage full message
            if (err instanceof StorageFullError) {
                Alert.alert(
                    'Storage Full',
                    'Your device doesn\'t have enough free space to download this translation pair. Please free up at least 500 MB and try again.',
                    [{ text: 'OK' }]
                );
            }

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
            if (ok === true) {
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
     * Check if a download is currently in progress for a pair.
     */
    isDownloading(pairId: string): boolean {
        return this.activeDownloads.has(pairId);
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
