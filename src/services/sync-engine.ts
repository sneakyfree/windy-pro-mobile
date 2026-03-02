/**
 * 🧬 M8.1 — Cloud Sync Engine
 * RP-6.1 + RP-6.2: Real upload logic + background sync registration
 */
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import NetInfo from '@react-native-community/netinfo';
import * as Battery from 'expo-battery';
import * as Notifications from 'expo-notifications';
import type { SyncDestination, SyncConditions, SyncStatus } from '@/types';
import { localStorageService } from './storage-local';
import { cloudStorageClient } from './storage-cloud';

const SYNC_TASK_NAME = 'WINDY_BACKGROUND_SYNC';

/** Default sync conditions */
const DEFAULT_CONDITIONS: SyncConditions = {
    wifiOnly: true,
    pluggedInOnly: true,
    syncAudio: true,
    syncVideo: true,
    syncText: true,
};

/** Windy Cloud MinIO configuration */
const WINDY_CLOUD_ENDPOINT = 'https://windypro.thewindstorm.uk';

class SyncEngine {
    private isEnabled = false;
    private isSyncing = false;
    private destination: SyncDestination | null = null;
    private conditions: SyncConditions = DEFAULT_CONDITIONS;
    private retryCount = 0;
    private maxRetries = 5;
    private lastSyncTimestamp: string | null = null;

    /** Progress callback */
    public onProgress: ((status: {
        current: number; total: number; sessionId: string;
    }) => void) | null = null;

    /**
     * Configure sync destination
     */
    configure(destination: SyncDestination, conditions?: Partial<SyncConditions>): void {
        this.destination = destination;
        this.conditions = { ...DEFAULT_CONDITIONS, ...conditions };
        this.isEnabled = destination.type !== 'none';

        // Configure cloud storage client
        if (this.isEnabled && destination.endpoint) {
            cloudStorageClient.configure({
                endpoint: destination.endpoint,
                bucket: destination.bucket || 'windy-users',
                region: destination.region || 'us-east-1',
                accessKey: destination.accessKey || '',
                secretKey: destination.secretKey || '',
            });
        }
    }

    /**
     * Start a sync cycle — real upload logic
     */
    async startSync(): Promise<void> {
        if (!this.isEnabled || this.isSyncing || !this.destination) {
            return;
        }

        // Check conditions
        const conditionsMet = await this.checkConditions();
        if (!conditionsMet) {
            console.log('[Sync] Conditions not met, skipping');
            return;
        }

        this.isSyncing = true;
        console.log('[Sync] Starting sync cycle...');

        try {
            const pending = await localStorageService.getPendingSyncSessions();

            if (pending.length === 0) {
                console.log('[Sync] Nothing to sync');
                return;
            }

            let synced = 0;
            for (const session of pending) {
                try {
                    // Build remote path: {userId}/audio/{sessionId}.wav
                    const userId = this.destination.accessKey || 'anonymous';
                    const remotePath = `${userId}/audio/${session.id}.wav`;

                    // Upload audio file
                    if (session.audioPath) {
                        await cloudStorageClient.uploadFile(
                            session.audioPath,
                            remotePath,
                            (pct) => {
                                this.onProgress?.({
                                    current: synced,
                                    total: pending.length,
                                    sessionId: session.id,
                                });
                            }
                        );
                    }

                    // Upload session metadata
                    const fullSession = await localStorageService.getSession(session.id);
                    if (fullSession) {
                        await cloudStorageClient.uploadMetadata(session.id, {
                            createdAt: fullSession.createdAt,
                            duration: fullSession.duration,
                            transcript: fullSession.transcript,
                            quality: fullSession.quality,
                            engineUsed: fullSession.engineUsed,
                            languages: fullSession.languages,
                        });
                    }

                    // Mark as synced in database
                    await localStorageService.markSynced(session.id);
                    synced++;
                    this.retryCount = 0; // Reset retry on success

                    this.onProgress?.({
                        current: synced,
                        total: pending.length,
                        sessionId: session.id,
                    });

                    console.log(`[Sync] Synced ${session.id} (${synced}/${pending.length})`);
                } catch (err) {
                    console.error(`[Sync] Failed to sync ${session.id}:`, err);
                    // Continue with next session
                }
            }

            console.log(`[Sync] Cycle complete: ${synced}/${pending.length} synced`);
        } catch (error) {
            console.error('[Sync] Sync cycle failed:', error);
            this.retryCount++;
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Check if conditions are met for syncing
     */
    private async checkConditions(): Promise<boolean> {
        try {
            // Check Wi-Fi
            if (this.conditions.wifiOnly) {
                const netState = await NetInfo.fetch();
                if (netState.type !== 'wifi') {
                    console.log('[Sync] Not on Wi-Fi, skipping');
                    return false;
                }
            }

            // Check battery / charging
            if (this.conditions.pluggedInOnly) {
                const batteryState = await Battery.getBatteryStateAsync();
                if (batteryState !== Battery.BatteryState.CHARGING &&
                    batteryState !== Battery.BatteryState.FULL) {
                    console.log('[Sync] Not plugged in, skipping');
                    return false;
                }
            }

            // Exponential backoff on failures
            if (this.retryCount > 0) {
                const backoffMs = Math.min(
                    1000 * Math.pow(2, this.retryCount),
                    30 * 60 * 1000 // Max 30 minutes
                );
                console.log(`[Sync] Backing off ${backoffMs}ms (retry ${this.retryCount})`);
                await new Promise((r) => setTimeout(r, backoffMs));
            }

            return true;
        } catch (err) {
            console.warn('[Sync] Condition check failed:', err);
            return false;
        }
    }

    /**
     * Get current sync status from database
     */
    async getSyncStatus(): Promise<SyncStatus> {
        try {
            const usage = await localStorageService.getStorageUsage();
            const sessionCount = await localStorageService.getSessionCount();
            const pending = await localStorageService.getPendingSyncSessions();

            return {
                totalSessions: sessionCount,
                syncedSessions: sessionCount - pending.length,
                pendingUploadBytes: pending.reduce((sum, s) => sum + (s.audioPath ? 1024 * 1024 : 0), 0),
                lastSyncAt: this.lastSyncTimestamp,
                storageUsed: usage.totalBytes,
                storageQuota: 10 * 1024 * 1024 * 1024, // 10 GB default
            };
        } catch {
            return {
                totalSessions: 0,
                syncedSessions: 0,
                pendingUploadBytes: 0,
                lastSyncAt: null,
                storageUsed: 0,
                storageQuota: 0,
            };
        }
    }

    /**
     * Register for background sync
     */
    async registerBackgroundSync(): Promise<void> {
        try {
            await BackgroundFetch.registerTaskAsync(SYNC_TASK_NAME, {
                minimumInterval: 15 * 60, // 15 minutes
                stopOnTerminate: false,
                startOnBoot: true,
            });
            console.log('[Sync] Background sync registered');
        } catch (err) {
            console.warn('[Sync] Failed to register background sync:', err);
        }
    }

    /**
     * Unregister background sync
     */
    async unregisterBackgroundSync(): Promise<void> {
        try {
            await BackgroundFetch.unregisterTaskAsync(SYNC_TASK_NAME);
        } catch { /* ignore */ }
    }

    /**
     * Manual sync trigger (used by SyncStatusBanner)
     */
    async syncNow(): Promise<void> {
        await this.startSync();
        this.lastSyncTimestamp = new Date().toISOString();
    }

    getIsSyncing(): boolean {
        return this.isSyncing;
    }
}

// Define the background task
TaskManager.defineTask(SYNC_TASK_NAME, async () => {
    try {
        await syncEngine.startSync();
        return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch {
        return BackgroundFetch.BackgroundFetchResult.Failed;
    }
});

export const syncEngine = new SyncEngine();
