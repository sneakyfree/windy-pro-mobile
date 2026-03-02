/**
 * 🧬 M8.1 — Cloud Sync Engine
 * Syncs mobile sessions to windypro.thewindstorm.uk account server
 *
 * Flow:
 *   1. Check conditions (Wi-Fi, battery)
 *   2. Get pending sessions from local SQLite
 *   3. Authenticate via JWT (auto-restore / refresh)
 *   4. Upload each session via POST /api/v1/recordings
 *   5. Mark synced in local DB
 *   6. Background task repeats every 15 min
 */
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import NetInfo from '@react-native-community/netinfo';
import * as Battery from 'expo-battery';
import type { SyncConditions, SyncStatus } from '@/types';
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

class SyncEngine {
    private isEnabled = false;
    private isSyncing = false;
    private conditions: SyncConditions = DEFAULT_CONDITIONS;
    private retryCount = 0;
    private maxRetries = 5;
    private lastSyncTimestamp: string | null = null;

    /** Progress callback for UI */
    public onProgress: ((status: {
        current: number; total: number; sessionId: string; phase: string;
    }) => void) | null = null;

    /** Error callback for UI */
    public onError: ((error: string) => void) | null = null;

    // ─── Configuration ─────────────────────────────────────────

    /**
     * Enable sync with account server credentials
     */
    async enableSync(
        email: string,
        password: string,
        conditions?: Partial<SyncConditions>
    ): Promise<{ success: boolean; error?: string }> {
        this.conditions = { ...DEFAULT_CONDITIONS, ...conditions };

        // Authenticate
        const loginResult = await cloudStorageClient.login(email, password);
        if (!loginResult.success) {
            return { success: false, error: loginResult.error };
        }

        this.isEnabled = true;
        console.log('[Sync] Enabled for:', email);
        return { success: true };
    }

    /**
     * Restore sync from saved session (app startup)
     */
    async restoreSync(): Promise<boolean> {
        const restored = await cloudStorageClient.restoreSession();
        if (restored) {
            this.isEnabled = true;
            console.log('[Sync] Restored from saved session');
        }
        return restored;
    }

    /**
     * Disable sync and logout
     */
    async disableSync(): Promise<void> {
        this.isEnabled = false;
        await cloudStorageClient.logout();
        await this.unregisterBackgroundSync();
        console.log('[Sync] Disabled');
    }

    /**
     * Update sync conditions
     */
    setConditions(conditions: Partial<SyncConditions>): void {
        this.conditions = { ...this.conditions, ...conditions };
    }

    // ─── Sync Cycle ────────────────────────────────────────────

    /**
     * Run a full sync cycle — the main workhorse
     */
    async startSync(): Promise<{ synced: number; failed: number; total: number }> {
        if (!this.isEnabled || this.isSyncing) {
            return { synced: 0, failed: 0, total: 0 };
        }

        // Verify authenticated
        if (!cloudStorageClient.isAuthenticated()) {
            const restored = await cloudStorageClient.restoreSession();
            if (!restored) {
                this.onError?.('Not logged in — go to Settings → Cloud Sync to sign in');
                return { synced: 0, failed: 0, total: 0 };
            }
        }

        // Check conditions
        const conditionsMet = await this.checkConditions();
        if (!conditionsMet) {
            console.log('[Sync] Conditions not met, skipping');
            return { synced: 0, failed: 0, total: 0 };
        }

        this.isSyncing = true;
        console.log('[Sync] Starting sync cycle...');

        let synced = 0;
        let failed = 0;
        let total = 0;

        try {
            const pending = await localStorageService.getPendingSyncSessions();
            total = pending.length;

            if (total === 0) {
                console.log('[Sync] Nothing to sync');
                return { synced: 0, failed: 0, total: 0 };
            }

            for (const session of pending) {
                try {
                    this.onProgress?.({
                        current: synced + 1,
                        total,
                        sessionId: session.id,
                        phase: 'uploading',
                    });

                    // Get full session data for metadata
                    const fullSession = await localStorageService.getSession(session.id);
                    if (!fullSession) {
                        console.warn(`[Sync] Session ${session.id} not found, skipping`);
                        continue;
                    }

                    // Upload via account server API
                    const result = await cloudStorageClient.uploadRecording(
                        session.id,
                        {
                            title: fullSession.transcript
                                ? fullSession.transcript.slice(0, 80)
                                : `Recording ${new Date(fullSession.createdAt).toLocaleString()}`,
                            duration: fullSession.duration,
                            transcript: fullSession.transcript,
                            quality: fullSession.quality?.score || 0,
                            engineUsed: fullSession.engineUsed,
                            languages: fullSession.languages,
                            source: fullSession.source,
                            createdAt: fullSession.createdAt,
                        },
                        this.conditions.syncAudio ? session.audioPath : undefined,
                        (pct) => {
                            this.onProgress?.({
                                current: synced + 1,
                                total,
                                sessionId: session.id,
                                phase: pct < 50 ? 'metadata' : 'audio',
                            });
                        }
                    );

                    if (result.success) {
                        await localStorageService.markSynced(session.id);
                        synced++;
                        this.retryCount = 0;
                        console.log(`[Sync] ✓ ${session.id} (${synced}/${total})`);
                    } else {
                        failed++;
                        console.error(`[Sync] ✗ ${session.id}: ${result.error}`);
                    }
                } catch (err: any) {
                    failed++;
                    console.error(`[Sync] ✗ ${session.id}:`, err.message);

                    // If auth error, try refresh once
                    if (err.message?.includes('Not authenticated')) {
                        const refreshed = await cloudStorageClient.refreshAuth();
                        if (!refreshed) {
                            this.onError?.('Session expired — please log in again');
                            break;
                        }
                    }
                }
            }

            this.lastSyncTimestamp = new Date().toISOString();
            console.log(`[Sync] Cycle complete: ${synced} synced, ${failed} failed, ${total} total`);
        } catch (error: any) {
            console.error('[Sync] Sync cycle failed:', error);
            this.retryCount++;
            this.onError?.(error.message || 'Sync failed');
        } finally {
            this.isSyncing = false;
            this.onProgress?.(null as any); // Clear progress
        }

        return { synced, failed, total };
    }

    // ─── Condition Checking ────────────────────────────────────

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
            if (this.retryCount > 0 && this.retryCount <= this.maxRetries) {
                const backoffMs = Math.min(
                    1000 * Math.pow(2, this.retryCount),
                    30 * 60 * 1000 // Max 30 minutes
                );
                console.log(`[Sync] Backing off ${backoffMs}ms (retry ${this.retryCount})`);
                await new Promise((r) => setTimeout(r, backoffMs));
            } else if (this.retryCount > this.maxRetries) {
                console.log('[Sync] Max retries exceeded, stopping');
                return false;
            }

            return true;
        } catch (err) {
            console.warn('[Sync] Condition check failed:', err);
            return false;
        }
    }

    // ─── Status ────────────────────────────────────────────────

    /**
     * Get current sync status
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

    // ─── Background Sync ───────────────────────────────────────

    /**
     * Register for background sync (every 15 min)
     */
    async registerBackgroundSync(): Promise<void> {
        try {
            await BackgroundFetch.registerTaskAsync(SYNC_TASK_NAME, {
                minimumInterval: 15 * 60,
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
     * Manual sync trigger (used by SyncStatusBanner and Settings)
     */
    async syncNow(): Promise<{ synced: number; failed: number; total: number }> {
        return this.startSync();
    }

    getIsSyncing(): boolean {
        return this.isSyncing;
    }

    getIsEnabled(): boolean {
        return this.isEnabled;
    }

    getLastSyncTime(): string | null {
        return this.lastSyncTimestamp;
    }
}

// Define the background task
TaskManager.defineTask(SYNC_TASK_NAME, async () => {
    try {
        const result = await syncEngine.startSync();
        return result.synced > 0
            ? BackgroundFetch.BackgroundFetchResult.NewData
            : BackgroundFetch.BackgroundFetchResult.NoData;
    } catch {
        return BackgroundFetch.BackgroundFetchResult.Failed;
    }
});

export const syncEngine = new SyncEngine();
