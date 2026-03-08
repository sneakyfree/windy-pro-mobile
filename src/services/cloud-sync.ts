/**
 * 🧬 Cloud Sync Service
 * Unified sync with offline queue, conflict resolution, and download.
 *
 * Features:
 *   - Upload recordings with auth + multipart audio
 *   - Download recordings from cloud to local storage
 *   - Offline queue: queue uploads when offline, sync when back
 *   - Conflict resolution: newer transcript wins
 *   - Exponential backoff retry on failure
 *   - Storage management: clear synced recordings
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { cloudStorageClient, type CloudRecording } from './storage-cloud';
import { localStorageService } from './storage-local';
import { networkMonitor, type NetworkStatus } from './network-monitor';
import type { Session, SessionSource } from '@/types';

const QUEUE_KEY = 'windy_sync_queue';
const LAST_SYNC_KEY = 'windy_last_sync';
const MAX_RETRIES = 5;
const BASE_DELAY_MS = 2000;

/** Queued upload item */
interface QueueItem {
    sessionId: string;
    addedAt: string;
    retries: number;
    lastError?: string;
}

/** Conflict resolution result */
interface ConflictResult {
    resolution: 'keep-local' | 'keep-cloud' | 'no-conflict';
    localUpdatedAt?: string;
    cloudUpdatedAt?: string;
}

/** Sync progress callback */
type SyncProgressCallback = (progress: {
    phase: 'uploading' | 'downloading' | 'resolving';
    current: number;
    total: number;
    sessionId?: string;
}) => void;

class CloudSyncService {
    private queue: QueueItem[] = [];
    private isSyncing = false;
    private unsubNetwork: (() => void) | null = null;

    // ─── Initialize ─────────────────────────────────────────────

    async initialize(): Promise<void> {
        await this.loadQueue();
        this.startNetworkListener();
    }

    private startNetworkListener(): void {
        // Watch for network changes — auto-sync when coming online
        this.unsubNetwork = networkMonitor.onStatusChange((status: NetworkStatus) => {
            if (status === 'online' && this.queue.length > 0 && !this.isSyncing) {
                this.processQueue().catch(() => { /* silent retry later */ });
            }
        });
    }

    destroy(): void {
        this.unsubNetwork?.();
    }

    // ─── Upload ─────────────────────────────────────────────────

    /**
     * Upload a recording. If offline, queues for later.
     */
    async uploadRecording(sessionId: string): Promise<{ success: boolean; queued?: boolean; error?: string }> {
        // Input validation
        if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 200) {
            return { success: false, error: 'Invalid session ID' };
        }

        if (!networkMonitor.isOnline) {
            await this.addToQueue(sessionId);
            return { success: false, queued: true };
        }

        if (!cloudStorageClient.isAuthenticated()) {
            return { success: false, error: 'Not authenticated' };
        }

        try {
            const session = await localStorageService.getSession(sessionId);
            if (!session) return { success: false, error: 'Session not found' };

            const result = await cloudStorageClient.uploadRecording(
                sessionId,
                {
                    title: session.transcript?.slice(0, 100) || `Recording ${sessionId.slice(0, 8)}`,
                    duration: session.duration,
                    transcript: session.transcript || '',
                    quality: session.quality.score,
                    engineUsed: session.engineUsed || 'cloud',
                    languages: session.languages || ['en'],
                    source: session.source || 'record',
                    createdAt: session.createdAt,
                },
                session.audioFilePath || undefined
            );

            if (result.success) {
                await this.removeFromQueue(sessionId);
                await this.updateLastSync();
            }

            return result;
        } catch (error) {
            await this.addToQueue(sessionId);
            return { success: false, queued: true, error: String(error) };
        }
    }

    /**
     * Upload with exponential backoff retry
     */
    async uploadWithRetry(sessionId: string): Promise<{ success: boolean; error?: string }> {
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            const result = await this.uploadRecording(sessionId);
            if (result.success || result.queued) return result;

            const delay = BASE_DELAY_MS * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
        return { success: false, error: `Failed after ${MAX_RETRIES} retries` };
    }

    // ─── Download ───────────────────────────────────────────────

    /**
     * Download recordings from cloud that don't exist locally
     */
    async downloadRecordings(onProgress?: SyncProgressCallback): Promise<{
        downloaded: number;
        skipped: number;
        conflicts: number;
    }> {
        if (!cloudStorageClient.isAuthenticated()) {
            return { downloaded: 0, skipped: 0, conflicts: 0 };
        }

        let downloaded = 0, skipped = 0, conflicts = 0;

        try {
            const { recordings } = await cloudStorageClient.listRecordings(1, 200);
            const localSessions = await localStorageService.getSessions();
            const localIds = new Set(localSessions.map(s => s.id));

            for (let i = 0; i < recordings.length; i++) {
                const cloud = recordings[i];
                onProgress?.({
                    phase: 'downloading',
                    current: i + 1,
                    total: recordings.length,
                    sessionId: cloud.id,
                });

                if (localIds.has(cloud.id)) {
                    // Check for conflict
                    const conflict = await this.resolveConflict(cloud.id, cloud);
                    if (conflict.resolution === 'keep-cloud') {
                        await this.applyCloudVersion(cloud);
                        conflicts++;
                    } else {
                        skipped++;
                    }
                } else {
                    // Download new recording
                    await this.saveCloudRecording(cloud);
                    downloaded++;
                }
            }
        } catch (error) {
            console.warn('[CloudSync] Download failed:', error);
        }

        return { downloaded, skipped, conflicts };
    }

    /**
     * Download a single recording's audio file
     */
    async downloadAudio(recordingId: string): Promise<string | null> {
        try {
            const recording = await cloudStorageClient.getRecording(recordingId);
            if (!recording?.audioUrl) return null;

            const dir = (FileSystem.documentDirectory || '') + 'recordings/';
            await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
            const localPath = `${dir}${recordingId}.wav`;

            const download = await FileSystem.downloadAsync(recording.audioUrl, localPath);

            return download.status === 200 ? localPath : null;
        } catch (err) {
            console.warn('[CloudSync] downloadAudio failed:', err);
            return null;
        }
    }

    // ─── Conflict Resolution ────────────────────────────────────

    /**
     * Resolve conflict between local and cloud versions.
     * Strategy: keep the newer version based on timestamps.
     */
    async resolveConflict(sessionId: string, cloudRecording: CloudRecording): Promise<ConflictResult> {
        try {
            const local = await localStorageService.getSession(sessionId);
            if (!local) return { resolution: 'keep-cloud' };

            const localTime = new Date(local.syncedAt || local.createdAt).getTime();
            const cloudTime = new Date(cloudRecording.createdAt).getTime();

            // If transcripts differ, keep newer
            const localTranscript = local.transcript || '';
            const cloudTranscript = cloudRecording.transcript || '';

            if (localTranscript === cloudTranscript) {
                return { resolution: 'no-conflict' };
            }

            return {
                resolution: localTime >= cloudTime ? 'keep-local' : 'keep-cloud',
                localUpdatedAt: local.syncedAt || local.createdAt,
                cloudUpdatedAt: cloudRecording.createdAt,
            };
        } catch (err) {
            console.warn('[CloudSync] resolveConflict failed:', err);
            return { resolution: 'keep-cloud' };
        }
    }

    private async applyCloudVersion(cloud: CloudRecording): Promise<void> {
        // Re-fetch and merge — save full Session with cloud transcript
        const existing = await localStorageService.getSession(cloud.id);
        if (existing) {
            await localStorageService.saveSession({
                ...existing,
                transcript: cloud.transcript || existing.transcript,
                synced: true,
                syncedAt: new Date().toISOString(),
            });
        }
    }

    private async saveCloudRecording(cloud: CloudRecording): Promise<void> {
        const session: Session = {
            id: cloud.id,
            createdAt: cloud.createdAt,
            duration: cloud.duration,
            transcript: cloud.transcript || '',
            segments: [],
            audioFilePath: null,
            videoFilePath: null,
            quality: {
                score: cloud.quality || 80,
                label: 'good' as const,
                snrDb: 0,
                speechRatio: 0,
                hasClipping: false,
                sampleRate: 44100,
            },
            engineUsed: cloud.engineUsed || 'cloud',
            source: (cloud.source as SessionSource) || 'record',
            languages: cloud.languages || ['en'],
            mediaCapture: { audio: true, video: false, text: true },
            fileSize: 0,
            synced: true,
            syncedAt: new Date().toISOString(),
            cloneUsable: false,
            tags: [],
            location: null,
            deviceModel: 'cloud',
        };
        await localStorageService.saveSession(session);
    }

    // ─── Offline Queue ──────────────────────────────────────────

    async addToQueue(sessionId: string): Promise<void> {
        // Don't add duplicates
        if (this.queue.some(q => q.sessionId === sessionId)) return;

        this.queue.push({
            sessionId,
            addedAt: new Date().toISOString(),
            retries: 0,
        });
        await this.saveQueue();
    }

    async removeFromQueue(sessionId: string): Promise<void> {
        this.queue = this.queue.filter(q => q.sessionId !== sessionId);
        await this.saveQueue();
    }

    /**
     * Process the offline queue — called when network comes back
     */
    async processQueue(onProgress?: SyncProgressCallback): Promise<{
        synced: number;
        failed: number;
    }> {
        if (this.isSyncing || this.queue.length === 0) return { synced: 0, failed: 0 };
        this.isSyncing = true;

        let synced = 0, failed = 0;
        const itemsToProcess = [...this.queue];

        for (let i = 0; i < itemsToProcess.length; i++) {
            const item = itemsToProcess[i];
            onProgress?.({
                phase: 'uploading',
                current: i + 1,
                total: itemsToProcess.length,
                sessionId: item.sessionId,
            });

            const result = await this.uploadRecording(item.sessionId);
            if (result.success) {
                synced++;
            } else {
                item.retries++;
                item.lastError = result.error;
                if (item.retries >= MAX_RETRIES) {
                    await this.removeFromQueue(item.sessionId);
                }
                failed++;
            }
        }

        this.isSyncing = false;
        await this.updateLastSync();
        return { synced, failed };
    }

    // ─── Full Sync (Upload + Download + Conflict Resolution) ───

    async fullSync(onProgress?: SyncProgressCallback): Promise<{
        uploaded: number;
        downloaded: number;
        conflicts: number;
        failed: number;
    }> {
        this.isSyncing = true;

        try {
            // Upload queued items
            const uploadResult = await this.processQueue(onProgress);

            // Download new recordings from cloud
            const downloadResult = await this.downloadRecordings(onProgress);

            await this.updateLastSync();

            return {
                uploaded: uploadResult.synced,
                downloaded: downloadResult.downloaded,
                conflicts: downloadResult.conflicts,
                failed: uploadResult.failed,
            };
        } finally {
            this.isSyncing = false;
        }
    }

    // ─── Storage Management ─────────────────────────────────────

    /**
     * Get total local storage used by recordings
     */
    async getLocalStorageUsed(): Promise<{
        totalBytes: number;
        syncedBytes: number;
        unsyncedBytes: number;
        syncedCount: number;
        unsyncedCount: number;
    }> {
        const sessions = await localStorageService.getSessions();
        let totalBytes = 0, syncedBytes = 0, unsyncedBytes = 0;
        let syncedCount = 0, unsyncedCount = 0;

        for (const session of sessions) {
            const session_full = await localStorageService.getSession(session.id);
            if (!session_full?.audioFilePath) continue;

            try {
                const info = await FileSystem.getInfoAsync(session_full.audioFilePath);
                const size = (info as any).size || 0;
                totalBytes += size;

                if (session.synced) {
                    syncedBytes += size;
                    syncedCount++;
                } else {
                    unsyncedBytes += size;
                    unsyncedCount++;
                }
            } catch (err) { console.warn('[CloudSync] getLocalStorageUsed file error:', err); }
        }

        return { totalBytes, syncedBytes, unsyncedBytes, syncedCount, unsyncedCount };
    }

    /**
     * Delete local audio files for recordings that are safely synced to cloud.
     * Keeps metadata so they appear in history, but frees disk space.
     */
    async clearSyncedAudio(): Promise<{ freedBytes: number; count: number }> {
        const sessions = await localStorageService.getSessions();
        let freedBytes = 0, count = 0;

        for (const session of sessions) {
            if (!session.synced) continue;

            const full = await localStorageService.getSession(session.id);
            if (!full?.audioFilePath) continue;

            try {
                const info = await FileSystem.getInfoAsync(full.audioFilePath);
                if (info.exists) {
                    freedBytes += (info as any).size || 0;
                    await FileSystem.deleteAsync(full.audioFilePath, { idempotent: true });
                    count++;
                }
            } catch (err) { console.warn('[CloudSync] clearSyncedAudio file error:', err); }
        }

        return { freedBytes, count };
    }

    // ─── Status ─────────────────────────────────────────────────

    getQueueLength(): number { return this.queue.length; }
    getIsSyncing(): boolean { return this.isSyncing; }

    async getLastSyncTime(): Promise<string | null> {
        return AsyncStorage.getItem(LAST_SYNC_KEY);
    }

    private async updateLastSync(): Promise<void> {
        await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    }

    // ─── Persistence ────────────────────────────────────────────

    private async loadQueue(): Promise<void> {
        try {
            const raw = await AsyncStorage.getItem(QUEUE_KEY);
            this.queue = raw ? JSON.parse(raw) : [];
        } catch (err) {
            console.warn('[CloudSync] loadQueue failed:', err);
            this.queue = [];
        }
    }

    private async saveQueue(): Promise<void> {
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(this.queue));
    }
}

export const cloudSyncService = new CloudSyncService();
