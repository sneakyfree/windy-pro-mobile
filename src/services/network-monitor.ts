/**
 * 🧬 Network Monitor Service
 * Detects connectivity to windypro.thewindstorm.uk and manages a translation queue
 * for offline fallback. Queued items are processed on reconnect.
 */
import * as FileSystem from 'expo-file-system';
import { ENDPOINTS, apiUrl } from '@/config/api';
import { createLogger } from './logger';

const log = createLogger('NetworkMonitor');

const HEALTH_URL = apiUrl(ENDPOINTS.HEALTH);
const PING_INTERVAL_MS = 30_000;
const PING_TIMEOUT_MS = 5_000;

export interface QueuedTranslation {
    id: string;
    audioUri: string;
    sourceLang: string;
    targetLang: string;
    timestamp: number;
}

export type NetworkStatus = 'online' | 'offline' | 'checking';
export type StatusListener = (status: NetworkStatus) => void;

class NetworkMonitor {
    private _status: NetworkStatus = 'online';
    private _listeners: Set<StatusListener> = new Set();
    private _queue: QueuedTranslation[] = [];
    private _intervalId: ReturnType<typeof setInterval> | null = null;
    private _started = false;

    // ─── Status ─────────────────────────────────────────────────

    get isOnline(): boolean {
        return this._status === 'online';
    }

    get status(): NetworkStatus {
        return this._status;
    }

    // ─── Lifecycle ──────────────────────────────────────────────

    /**
     * Start periodic connectivity checks
     */
    start(): void {
        if (this._started) return;
        this._started = true;
        // Initial check
        this.checkConnectivity();
        // Periodic checks
        this._intervalId = setInterval(() => this.checkConnectivity(), PING_INTERVAL_MS);
    }

    /**
     * Stop periodic checks (cleanup)
     */
    stop(): void {
        if (this._intervalId) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
        this._started = false;
    }

    // ─── Connectivity Check ─────────────────────────────────────

    /**
     * Ping the health endpoint to check connectivity
     */
    async checkConnectivity(): Promise<boolean> {
        const prevStatus = this._status;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

            const response = await fetch(HEALTH_URL, {
                method: 'HEAD',
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                this._setStatus('online');
                // Process queue on reconnect
                if (prevStatus === 'offline' && this._queue.length > 0) {
                    this._notifyQueueReady();
                }
                return true;
            }
        } catch (err) {
            // Network error, timeout, or abort — expected when offline
            if (__DEV__) console.warn('[NetworkMonitor] Connectivity check failed:', err);
        }

        this._setStatus('offline');
        return false;
    }

    private _setStatus(newStatus: NetworkStatus): void {
        if (this._status !== newStatus) {
            this._status = newStatus;
            this._listeners.forEach(cb => {
                try { cb(newStatus); } catch (err) { console.warn('[NetworkMonitor] Listener error:', err); }
            });
        }
    }

    // ─── Listeners ──────────────────────────────────────────────

    /**
     * Subscribe to status changes. Returns an unsubscribe function.
     */
    onStatusChange(listener: StatusListener): () => void {
        this._listeners.add(listener);
        return () => { this._listeners.delete(listener); };
    }

    // ─── Translation Queue ──────────────────────────────────────

    /**
     * Queue a translation for when connectivity returns
     */
    queueTranslation(audioUri: string, sourceLang: string, targetLang: string): string {
        const id = `queued-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this._queue.push({
            id,
            audioUri,
            sourceLang,
            targetLang,
            timestamp: Date.now(),
        });
        return id;
    }

    /**
     * Get all queued translations (for processing)
     */
    getQueue(): QueuedTranslation[] {
        return [...this._queue];
    }

    /**
     * Get queue size (for badge UI)
     */
    getQueueSize(): number {
        return this._queue.length;
    }

    /**
     * Remove a specific item from the queue (after processing)
     */
    dequeue(id: string): QueuedTranslation | undefined {
        const idx = this._queue.findIndex(q => q.id === id);
        if (idx >= 0) {
            return this._queue.splice(idx, 1)[0];
        }
        return undefined;
    }

    /**
     * Clear the entire queue
     */
    clearQueue(): void {
        // Clean up queued audio files
        for (const item of this._queue) {
            FileSystem.deleteAsync(item.audioUri, { idempotent: true }).catch(() => { });
        }
        this._queue = [];
    }

    /**
     * Internal: notify that queue items are ready to process (on reconnect)
     * Listeners should call processQueue externally.
     */
    private _onQueueReady: (() => void) | null = null;

    onQueueReady(handler: () => void): () => void {
        this._onQueueReady = handler;
        return () => { this._onQueueReady = null; };
    }

    private _notifyQueueReady(): void {
        if (this._onQueueReady) {
            try { this._onQueueReady(); } catch (err) { console.warn('[NetworkMonitor] Queue ready handler error:', err); }
        }
    }
}

export const networkMonitor = new NetworkMonitor();
