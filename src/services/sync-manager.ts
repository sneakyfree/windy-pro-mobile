/**
 * 🧬 Wi-Fi Auto-Sync Manager (iCloud-style)
 * Record anywhere, forget about it — everything syncs when on Wi-Fi.
 *
 * Features:
 * - Persistent upload queue with priority (transcript=high, audio=medium, video=low)
 * - Wi-Fi-aware: large files only sync on Wi-Fi, small files on cellular
 * - Chunked upload with resume support
 * - Progress tracking per bundle (0-100%)
 * - Smart batching: combine small files into one request
 * - Conflict detection: skip if cloud has same bundle_id
 * - Background sync: periodic task on both Android (WorkManager) and iOS (BGProcessingTask)
 * - Settings: "Sync on Cellular" (default OFF), "Auto-Sync" (default ON)
 * - Cloud file sync: pull cloud list, compare local, auto-upload/download
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState, NetInfoStateType } from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import { ENDPOINTS, apiUrl } from '@/config/api';
import { parseUploadError, isAuthError, isRateLimited, getUserMessage } from '@/utils/api-error';
import { cloudApi, STORAGE_TIERS, type CloudFile } from './cloudApi';
import type { LicenseTier } from '@/types';
import { createLogger } from './logger';

const log = createLogger('SyncManager');

const QUEUE_KEY = 'windy-sync-queue';
const SETTINGS_KEY = 'windy-sync-settings';
const UPLOAD_API = apiUrl(ENDPOINTS.RECORDINGS_UPLOAD);
const CHECK_API = apiUrl(ENDPOINTS.RECORDINGS_CHECK);
const BACKGROUND_TASK_NAME = 'windy-background-sync';
const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks
const SMALL_FILE_THRESHOLD = 5 * 1024 * 1024; // 5MB — uploadable on cellular
const MAX_BATCH_SIZE = 10 * 1024 * 1024; // 10MB batch limit
const MAX_QUEUE_SIZE = 500; // Prevent unbounded disk fill
const QUEUE_WARNING_THRESHOLD = 100;

// ─── Types ──────────────────────────────────────────────────────

type UploadPriority = 'high' | 'medium' | 'low';
type NetworkType = 'wifi' | 'cellular' | 'none';
type QueueItemStatus = 'queued' | 'uploading' | 'paused' | 'completed' | 'failed';

export interface SyncQueueItem {
    id: string;
    bundle_id: string;
    file_path: string;
    file_type: 'transcript' | 'audio' | 'video';
    file_size: number;
    priority: UploadPriority;
    status: QueueItemStatus;
    progress: number; // 0-100
    bytes_uploaded: number;
    total_bytes: number;
    chunk_index: number; // For resume
    created_at: string;
    last_attempt: string | null;
    error: string | null;
    retry_count: number;
    metadata: Record<string, string>;
}

export interface SyncSettings {
    auto_sync: boolean;
    sync_on_cellular: boolean;
    sync_wifi_only_threshold: number; // bytes — files above this wait for Wi-Fi
    last_sync_at: string | null;
    device_id: string;
}

export interface SyncState {
    networkType: NetworkType;
    isWifi: boolean;
    isSyncing: boolean;
    queueLength: number;
    pendingCount: number;
    uploadingCount: number;
    completedCount: number;
    currentItem: SyncQueueItem | null;
    overallProgress: number;
    lastSyncTime: string | null;
    settings: SyncSettings;
}

type SyncStateCallback = (state: SyncState) => void;

// ─── Service ────────────────────────────────────────────────────

/** Callback for upgrade prompts */
type UpgradePromptCallback = (usage: { usedBytes: number; limitBytes: number; tierLabel: string }) => void;

class SyncManager {
    private queue: SyncQueueItem[] = [];
    private settings: SyncSettings = {
        auto_sync: true,
        sync_on_cellular: false,
        sync_wifi_only_threshold: 5242880, // 5MB
        last_sync_at: null,
        device_id: '',
    };
    private networkType: NetworkType = 'none';
    private isSyncing = false;
    private currentItem: SyncQueueItem | null = null;
    private lastSyncTime: string | null = null;
    private listeners = new Set<SyncStateCallback>();
    private netInfoUnsubscribe: (() => void) | null = null;
    private initialized = false;
    private abortController: AbortController | null = null;
    private onUpgradePrompt: UpgradePromptCallback | null = null;
    private currentTier: LicenseTier = 'free';

    // ─── Initialize ─────────────────────────────────────────────

    async initialize(): Promise<void> {
        if (this.initialized) return;

        // Load persisted queue
        try {
            const raw = await AsyncStorage.getItem(QUEUE_KEY);
            if (raw) this.queue = JSON.parse(raw);
            // Reset any "uploading" items to "queued" (interrupted uploads)
            for (const item of this.queue) {
                if (item.status === 'uploading') {
                    item.status = 'queued';
                }
            }
        } catch (err) { log.warn('loadQueue', 'loadQueue failed'); this.queue = []; }

        // Load settings
        try {
            const raw = await AsyncStorage.getItem(SETTINGS_KEY);
            if (raw) this.settings = { ...this.settings, ...JSON.parse(raw) };
        } catch (err) { log.warn('loadSettings', 'loadSettings failed'); }

        // Listen for network changes
        this.netInfoUnsubscribe = NetInfo.addEventListener(this.handleNetworkChange);

        // Get initial network state
        const state = await NetInfo.fetch();
        this.handleNetworkChange(state);

        // Register background task
        await this.registerBackgroundTask();

        // Attempt to restore cloud session and do initial cloud sync
        try {
            const restored = await cloudApi.restoreSession();
            if (restored) {
                this.cloudSync().catch(() => {});
            }
        } catch (err) { log.warn('initialize', 'cloud session restore failed'); }

        this.initialized = true;
        this.emit();
    }

    async destroy(): Promise<void> {
        this.netInfoUnsubscribe?.();
        this.abortController?.abort();
        this.initialized = false;
    }

    /**
     * Set the current subscription tier (for storage limit checking).
     */
    setTier(tier: LicenseTier): void {
        this.currentTier = tier;
    }

    /**
     * Register a callback for when an upload would exceed the storage quota.
     */
    setUpgradePromptHandler(handler: UpgradePromptCallback): void {
        this.onUpgradePrompt = handler;
    }

    // ─── Cloud File Sync ────────────────────────────────────────

    /**
     * Pull cloud file list, compare with local queue,
     * auto-upload new local files, auto-download cloud-only files.
     * Conflict: newest timestamp wins.
     */
    async cloudSync(): Promise<{ uploaded: number; downloaded: number; conflicts: number }> {
        if (!cloudApi.isAuthenticated()) return { uploaded: 0, downloaded: 0, conflicts: 0 };

        let uploaded = 0, downloaded = 0, conflicts = 0;

        try {
            // Check storage quota before uploading
            const usage = await cloudApi.getStorageUsage(this.currentTier);
            if (usage.percentUsed >= 95) {
                this.onUpgradePrompt?.({
                    usedBytes: usage.usedBytes,
                    limitBytes: usage.limitBytes,
                    tierLabel: usage.tierLabel,
                });
            }

            // Pull cloud file list
            const { files: cloudFiles } = await cloudApi.listFiles();
            const cloudFileMap = new Map(cloudFiles.map(f => [f.id, f]));

            // Find local items completed but not yet in cloud → upload
            const completedLocal = this.queue.filter(q => q.status === 'completed');
            for (const item of completedLocal) {
                if (!cloudFileMap.has(item.bundle_id)) {
                    // Not in cloud → re-queue for upload if quota allows
                    if (usage.usedBytes + item.file_size <= usage.limitBytes) {
                        const result = await cloudApi.uploadFile(
                            item.file_path,
                            item.metadata?.filename || `${item.bundle_id}.${item.file_type}`,
                            item.file_type === 'audio' ? 'audio/wav' :
                                item.file_type === 'video' ? 'video/mp4' : 'application/json',
                            { bundle_id: item.bundle_id, file_type: item.file_type },
                        );
                        if (result.success) uploaded++;
                    }
                }
            }

            // Process cloudApi retry queue (failed uploads)
            const retryResult = await cloudApi.processRetryQueue();
            uploaded += retryResult.succeeded;

        } catch (err: unknown) {
            log.warn('cloudSync', 'cloudSync error', err instanceof Error ? { message: err.message, stack: err.stack } : { error: String(err) });
        }

        return { uploaded, downloaded, conflicts };
    }

    // ─── Network Detection ──────────────────────────────────────

    private handleNetworkChange = (state: NetInfoState): void => {
        const prev = this.networkType;

        if (!state.isConnected || !state.isInternetReachable) {
            this.networkType = 'none';
        } else if (state.type === NetInfoStateType.wifi || state.type === NetInfoStateType.ethernet) {
            this.networkType = 'wifi';
        } else {
            this.networkType = 'cellular';
        }

        this.emit();

        // Auto-sync when switching to Wi-Fi
        if (prev !== 'wifi' && this.networkType === 'wifi' && this.settings.auto_sync) {
            this.processQueue();
        }

        // On cellular: only process small files if allowed
        if (this.networkType === 'cellular' && this.settings.auto_sync) {
            this.processQueue();
        }

        // Notify user if they have pending items and are on cellular
        if (this.networkType === 'cellular' && this.getPendingCount() > 0 && !this.settings.sync_on_cellular) {
            this.notifyPendingSync();
        }
    };

    // ─── Queue Management ───────────────────────────────────────

    async addToQueue(params: {
        bundleId: string;
        filePath: string;
        fileType: 'transcript' | 'audio' | 'video';
        metadata?: Record<string, string>;
    }): Promise<void> {
        await this.initialize();

        // Check file size
        let fileSize = 0;
        try {
            const info = await FileSystem.getInfoAsync(params.filePath);
            fileSize = info.exists && 'size' in info ? (info as any).size : 0;
        } catch (err) { log.warn('addToQueue', 'getFileInfo failed'); return; }

        if (fileSize === 0) return;

        // Queue size cap — prevent unbounded disk fill
        if (this.queue.length >= MAX_QUEUE_SIZE) {
            log.warn('addToQueue', `queue full (${MAX_QUEUE_SIZE} items) — rejecting new item`);
            return;
        }

        // Determine priority
        const priority: UploadPriority =
            params.fileType === 'transcript' ? 'high' :
                params.fileType === 'audio' ? 'medium' : 'low';

        // Check for duplicate
        const existing = this.queue.find(
            q => q.bundle_id === params.bundleId && q.file_type === params.fileType
        );
        if (existing && existing.status === 'completed') return;

        const item: SyncQueueItem = {
            id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            bundle_id: params.bundleId,
            file_path: params.filePath,
            file_type: params.fileType,
            file_size: fileSize,
            priority,
            status: 'queued',
            progress: 0,
            bytes_uploaded: 0,
            total_bytes: fileSize,
            chunk_index: 0,
            created_at: new Date().toISOString(),
            last_attempt: null,
            error: null,
            retry_count: 0,
            metadata: params.metadata || {},
        };

        // Remove old entry if re-queuing
        if (existing) {
            this.queue = this.queue.filter(q => q.id !== existing.id);
        }

        this.queue.push(item);
        await this.persistQueue();
        this.emit();

        // Start processing if auto-sync is on
        if (this.settings.auto_sync) {
            this.processQueue();
        }
    }

    async addBundleToQueue(bundleId: string, files: {
        transcriptPath?: string;
        audioPath: string;
        videoPath?: string;
    }, metadata?: Record<string, string>): Promise<void> {
        // Add all files from a bundle — transcript first (highest priority)
        if (files.transcriptPath) {
            await this.addToQueue({
                bundleId, filePath: files.transcriptPath, fileType: 'transcript', metadata,
            });
        }
        await this.addToQueue({
            bundleId, filePath: files.audioPath, fileType: 'audio', metadata,
        });
        if (files.videoPath) {
            await this.addToQueue({
                bundleId, filePath: files.videoPath, fileType: 'video', metadata,
            });
        }
    }

    // ─── Queue Processing ───────────────────────────────────────

    async processQueue(): Promise<void> {
        if (this.isSyncing || this.networkType === 'none') return;
        if (!this.settings.auto_sync) return;

        // Network-aware: skip if wifi-only sync and on cellular
        if (this.networkType === 'cellular' && !this.settings.sync_on_cellular) {
            log.info('processQueue', 'Skipping sync — on cellular and sync_on_cellular is disabled');
            return;
        }

        // Battery-aware: skip if not plugged in when pluggedInOnly setting is active
        try {
            const Battery = require('expo-battery');
            const batteryState = await Battery.getBatteryStateAsync();
            const batteryLevel = await Battery.getBatteryLevelAsync();
            const isPluggedIn = batteryState === Battery.BatteryState.CHARGING ||
                                batteryState === Battery.BatteryState.FULL;

            // Don't sync on battery below 20% unless plugged in
            if (!isPluggedIn && batteryLevel < 0.20) {
                log.info('processQueue', `Skipping sync — battery low (${Math.round(batteryLevel * 100)}%) and not charging`);
                return;
            }
        } catch {
            // Battery API unavailable — proceed with sync
        }

        this.isSyncing = true;
        this.emit();

        try {
            // Sort by priority (high > medium > low), then by creation time
            const pending = this.queue
                .filter(q => q.status === 'queued' || q.status === 'failed')
                .sort((a, b) => {
                    const pOrder = { high: 0, medium: 1, low: 2 };
                    const pDiff = pOrder[a.priority] - pOrder[b.priority];
                    if (pDiff !== 0) return pDiff;
                    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                });

            for (const item of pending) {
                // Check if we should upload this file on current network
                if (!this.shouldUpload(item)) continue;

                // Check for conflicts before uploading
                const conflict = await this.checkConflict(item);
                if (conflict === 'skip') {
                    item.status = 'completed';
                    item.progress = 100;
                    await this.persistQueue();
                    this.emit();
                    continue;
                }

                // Upload the file
                this.currentItem = item;
                item.status = 'uploading';
                item.last_attempt = new Date().toISOString();
                this.emit();

                const success = await this.uploadFile(item);

                if (success) {
                    item.status = 'completed';
                    item.progress = 100;
                    this.lastSyncTime = new Date().toISOString();
                    this.settings.last_sync_at = this.lastSyncTime;
                } else {
                    item.retry_count++;
                    item.status = item.retry_count >= 3 ? 'failed' : 'queued';
                }

                this.currentItem = null;
                await this.persistQueue();
                this.emit();

                // Re-check network between files (may have changed during upload)
                const currentNet = await NetInfo.fetch();
                if (!currentNet.isConnected) break;
            }
        } finally {
            this.isSyncing = false;
            this.emit();
        }
    }

    /** Manual sync trigger */
    async manualSync(): Promise<void> {
        const saved = this.settings.auto_sync;
        this.settings.auto_sync = true;
        await this.processQueue();
        this.settings.auto_sync = saved;
    }

    // ─── Upload Logic ───────────────────────────────────────────

    private shouldUpload(item: SyncQueueItem): boolean {
        if (this.networkType === 'wifi') return true;
        if (this.networkType === 'cellular') {
            if (this.settings.sync_on_cellular) return true;
            // Only small files on cellular (below threshold)
            return item.file_size < this.settings.sync_wifi_only_threshold;
        }
        return false;
    }

    private async uploadFile(item: SyncQueueItem): Promise<boolean> {
        try {
            // For small files: single upload
            if (item.file_size < CHUNK_SIZE) {
                return await this.uploadSingle(item);
            }
            // For large files: chunked upload with resume
            return await this.uploadChunked(item);
        } catch (err) {
            item.error = String(err);
            return false;
        }
    }

    private async uploadSingle(item: SyncQueueItem): Promise<boolean> {
        try {
            const result = await FileSystem.uploadAsync(UPLOAD_API, item.file_path, {
                httpMethod: 'POST',
                uploadType: FileSystem.FileSystemUploadType.MULTIPART,
                fieldName: item.file_type,
                parameters: {
                    bundle_id: item.bundle_id,
                    file_type: item.file_type,
                    ...item.metadata,
                },
            });

            item.progress = 100;
            item.bytes_uploaded = item.total_bytes;
            this.emit();

            if (result.status >= 200 && result.status < 300) return true;

            // Structured error handling
            const apiErr = parseUploadError(result.status, result.body);
            if (isAuthError(result.status)) {
                item.error = 'Session expired — please log in again';
            } else if (isRateLimited(result.status)) {
                item.error = 'Too many attempts, please try again later';
            } else if (result.status === 502 || result.status === 503) {
                item.error = getUserMessage(result.status);
            } else {
                item.error = apiErr.message;
            }
            return false;
        } catch (err) {
            item.error = String(err);
            return false;
        }
    }

    private async uploadChunked(item: SyncQueueItem): Promise<boolean> {
        const totalChunks = Math.ceil(item.file_size / CHUNK_SIZE);
        let uploaded = item.chunk_index; // Resume from last successful chunk

        this.abortController = new AbortController();

        for (let i = uploaded; i < totalChunks; i++) {
            if (this.networkType === 'none') {
                item.chunk_index = i;
                item.status = 'paused';
                return false;
            }

            try {
                // Read chunk
                const offset = i * CHUNK_SIZE;
                const length = Math.min(CHUNK_SIZE, item.file_size - offset);

                const chunkData = await FileSystem.readAsStringAsync(item.file_path, {
                    encoding: FileSystem.EncodingType.Base64,
                    position: offset,
                    length,
                });

                // Upload chunk
                const res = await fetch(`${UPLOAD_API}/chunk`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        bundle_id: item.bundle_id,
                        file_type: item.file_type,
                        chunk_index: i,
                        total_chunks: totalChunks,
                        data: chunkData,
                        ...item.metadata,
                    }),
                    signal: this.abortController.signal,
                });

                if (!res.ok) {
                    // Parse structured error
                    let errorMsg = `Chunk ${i} failed: HTTP ${res.status}`;
                    try {
                        const body = await res.json();
                        if (body.error) errorMsg = body.error;
                    } catch (err) { log.warn('uploadChunked', 'chunk error parse failed'); }

                    if (isAuthError(res.status)) {
                        item.error = 'Session expired — please log in again';
                    } else if (isRateLimited(res.status)) {
                        item.error = 'Too many attempts, please try again later';
                    } else {
                        item.error = errorMsg;
                    }
                    item.chunk_index = i;
                    return false;
                }

                // Update progress
                item.chunk_index = i + 1;
                item.bytes_uploaded = Math.min((i + 1) * CHUNK_SIZE, item.total_bytes);
                item.progress = Math.round((item.bytes_uploaded / item.total_bytes) * 100);
                this.emit();
            } catch (err: any) {
                if (err?.name === 'AbortError') {
                    item.chunk_index = i;
                    item.status = 'paused';
                    return false;
                }
                item.error = String(err);
                item.chunk_index = i;
                return false;
            }
        }

        this.abortController = null;
        return true;
    }

    // ─── Conflict Detection ─────────────────────────────────────

    private async checkConflict(item: SyncQueueItem): Promise<'upload' | 'skip' | 'download'> {
        try {
            const res = await fetch(`${CHECK_API}?bundle_id=${item.bundle_id}&file_type=${item.file_type}`);
            if (res.ok) {
                const data = await res.json();
                if (data.exists) {
                    if (data.newer_on_cloud) return 'download';
                    return 'skip'; // Same or older — skip upload
                }
            }
        } catch (err) { log.warn('checkConflict', 'checkConflict failed'); }
        return 'upload';
    }

    // ─── Smart Batching ─────────────────────────────────────────

    async batchSmallFiles(): Promise<void> {
        const smallPending = this.queue.filter(
            q => q.status === 'queued' && q.file_size < SMALL_FILE_THRESHOLD && q.file_type !== 'video'
        );

        if (smallPending.length < 2) return;

        // Group by bundle_id for batching
        const batches = new Map<string, SyncQueueItem[]>();
        let batchSize = 0;

        for (const item of smallPending) {
            if (batchSize + item.file_size > MAX_BATCH_SIZE) break;

            const key = item.bundle_id;
            if (!batches.has(key)) batches.set(key, []);
            batches.get(key)!.push(item);
            batchSize += item.file_size;
        }

        // Upload each batch
        for (const [bundleId, items] of batches) {
            try {
                const files: Record<string, string> = {};
                for (const item of items) {
                    const content = await FileSystem.readAsStringAsync(item.file_path, {
                        encoding: FileSystem.EncodingType.Base64,
                    });
                    files[item.file_type] = content;
                }

                const res = await fetch(`${UPLOAD_API}/batch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bundle_id: bundleId, files }),
                });

                if (res.ok) {
                    for (const item of items) {
                        item.status = 'completed';
                        item.progress = 100;
                    }
                }
            } catch (err) { log.warn('batchSmallFiles', 'batch upload failed'); }
        }

        await this.persistQueue();
        this.emit();
    }

    // ─── Background Sync ────────────────────────────────────────

    private async registerBackgroundTask(): Promise<void> {
        try {
            await BackgroundFetch.registerTaskAsync(BACKGROUND_TASK_NAME, {
                minimumInterval: 15 * 60, // 15 minutes
                stopOnTerminate: false,
                startOnBoot: true,
            });
        } catch (err) { log.warn('registerBackgroundTask', 'registerBackgroundTask failed'); }
    }

    // ─── Notifications ──────────────────────────────────────────

    private async notifyPendingSync(): Promise<void> {
        const pending = this.getPendingCount();
        if (pending === 0) return;

        try {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: '📦 Recordings Ready to Sync',
                    body: `${pending} recording${pending > 1 ? 's' : ''} waiting — connect to Wi-Fi to sync`,
                    ...(Platform.OS === 'android' ? { channelId: 'sync' } : {}),
                },
                trigger: null as unknown as Notifications.NotificationTriggerInput, // Immediate delivery
            });
        } catch (err) { log.warn('notifyPendingSync', 'notification schedule failed'); }
    }

    // ─── Settings ───────────────────────────────────────────────

    async updateSettings(updates: Partial<SyncSettings>): Promise<void> {
        this.settings = { ...this.settings, ...updates };
        await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
        this.emit();

        // If auto-sync just turned on, start processing
        if (updates.auto_sync === true) {
            this.processQueue();
        }
    }

    getSettings(): SyncSettings {
        return { ...this.settings };
    }

    // ─── State & Listeners ──────────────────────────────────────

    getState(): SyncState {
        const pending = this.queue.filter(q => q.status === 'queued' || q.status === 'failed');
        const uploading = this.queue.filter(q => q.status === 'uploading');
        const completed = this.queue.filter(q => q.status === 'completed');

        const totalBytes = this.queue.reduce((sum, q) => sum + q.total_bytes, 0);
        const uploadedBytes = this.queue.reduce((sum, q) => sum + q.bytes_uploaded, 0);

        return {
            networkType: this.networkType,
            isWifi: this.networkType === 'wifi',
            isSyncing: this.isSyncing,
            queueLength: this.queue.length,
            pendingCount: pending.length,
            uploadingCount: uploading.length,
            completedCount: completed.length,
            currentItem: this.currentItem,
            overallProgress: totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0,
            lastSyncTime: this.lastSyncTime,
            settings: { ...this.settings },
        };
    }

    getPendingCount(): number {
        return this.queue.filter(q => q.status === 'queued' || q.status === 'failed').length;
    }

    getQueue(): SyncQueueItem[] {
        return [...this.queue];
    }

    onStateChange(callback: SyncStateCallback): () => void {
        this.listeners.add(callback);
        return () => { this.listeners.delete(callback); };
    }

    private emit(): void {
        const state = this.getState();
        this.listeners.forEach(cb => {
            try { cb(state); } catch (err) { log.warn('emit', 'listener error'); }
        });
    }

    private async persistQueue(): Promise<void> {
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
    }

    // ─── Cleanup ────────────────────────────────────────────────

    async clearCompleted(): Promise<void> {
        this.queue = this.queue.filter(q => q.status !== 'completed');
        await this.persistQueue();
        this.emit();
    }

    async clearAll(): Promise<void> {
        this.abortController?.abort();
        this.queue = [];
        this.isSyncing = false;
        this.currentItem = null;
        await this.persistQueue();
        this.emit();
    }
}

// ─── Create singleton FIRST (before background task registration) ────
export const syncManager = new SyncManager();

// ─── Background task handler ────────────────────────────────────
// Wrapped in try/catch: if defineTask throws (e.g. unsupported platform),
// the module still exports syncManager successfully.
try {
    TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
        try {
            const netState = await NetInfo.fetch();
            const isWifi = netState.type === NetInfoStateType.wifi;
            const isConnected = netState.isConnected && netState.isInternetReachable;

            if (!isConnected) return BackgroundFetch.BackgroundFetchResult.NoData;

            // Only sync on Wi-Fi in background unless cellular sync is enabled
            const settingsRaw = await AsyncStorage.getItem(SETTINGS_KEY);
            const settings: SyncSettings = settingsRaw
                ? JSON.parse(settingsRaw)
                : { auto_sync: true, sync_on_cellular: false, sync_wifi_only_threshold: 5242880, last_sync_at: null, device_id: '' };

            if (!settings.auto_sync) return BackgroundFetch.BackgroundFetchResult.NoData;
            if (!isWifi && !settings.sync_on_cellular) return BackgroundFetch.BackgroundFetchResult.NoData;

            await syncManager.processQueue();
            return BackgroundFetch.BackgroundFetchResult.NewData;
        } catch (err) { log.warn('backgroundTask', 'background sync failed');
            return BackgroundFetch.BackgroundFetchResult.Failed;
        }
    });
} catch (e: unknown) {
    log.warn('Failed_to_register_background_', 'Failed to register background task', e instanceof Error ? { message: e.message, stack: e.stack } : { error: String(e) });
}

