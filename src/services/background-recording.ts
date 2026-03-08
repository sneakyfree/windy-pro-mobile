/**
 * 🧬 Background Recording Service
 * Smart silence detection, battery warnings, 5-minute chunking,
 * and foreground service notification for Android.
 */
import * as Battery from 'expo-battery';
import * as Notifications from 'expo-notifications';

const CHUNK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const SILENCE_THRESHOLD_DB = -45; // dB level below which is "silence"
const SILENCE_PAUSE_MS = 3000; // Pause video after 3s silence
const BATTERY_WARN_PCT = 25;
const BATTERY_STOP_PCT = 15;

// ─── Types ──────────────────────────────────────────────────────

export interface RecordingChunk {
    index: number;
    startTime: number;
    endTime: number;
    duration: number;
    audioPath: string;
    videoPath?: string;
    transcript: string;
}

export interface BackgroundRecordingState {
    isRecording: boolean;
    isPaused: boolean;
    pauseReason: 'silence' | 'battery' | 'manual' | null;
    currentChunkIndex: number;
    totalDuration: number;
    silenceDuration: number;
    batteryLevel: number;
    chunks: RecordingChunk[];
}

type StateCallback = (state: BackgroundRecordingState) => void;

// ─── Service ────────────────────────────────────────────────────

class BackgroundRecordingService {
    private state: BackgroundRecordingState = {
        isRecording: false,
        isPaused: false,
        pauseReason: null,
        currentChunkIndex: 0,
        totalDuration: 0,
        silenceDuration: 0,
        batteryLevel: 100,
        chunks: [],
    };

    private listeners: Set<StateCallback> = new Set();
    private batteryCheckInterval: ReturnType<typeof setInterval> | null = null;
    private silenceTimer: ReturnType<typeof setTimeout> | null = null;
    private chunkTimer: ReturnType<typeof setInterval> | null = null;
    private chunkStartTime = 0;
    private recordingStartTime = 0;
    private notificationId: string | null = null;

    // ─── State Management ───────────────────────────────────────

    getState(): BackgroundRecordingState {
        return { ...this.state };
    }

    onStateChange(callback: StateCallback): () => void {
        this.listeners.add(callback);
        return () => { this.listeners.delete(callback); };
    }

    private emit(): void {
        const snapshot = this.getState();
        this.listeners.forEach(cb => {
            try { cb(snapshot); } catch (err) { console.warn('[uackgroundrecording] Error:', err); }
        });
    }

    // ─── Recording Lifecycle ────────────────────────────────────

    async startRecording(): Promise<void> {
        if (this.state.isRecording) return;

        this.state = {
            isRecording: true,
            isPaused: false,
            pauseReason: null,
            currentChunkIndex: 0,
            totalDuration: 0,
            silenceDuration: 0,
            batteryLevel: 100,
            chunks: [],
        };

        this.recordingStartTime = Date.now();
        this.chunkStartTime = Date.now();

        // Start battery monitoring
        this.startBatteryMonitoring();

        // Start chunk timer (new chunk every 5 minutes)
        this.chunkTimer = setInterval(() => {
            this.finalizeCurrentChunk();
        }, CHUNK_DURATION_MS);

        // Show persistent notification (Android foreground service)
        await this.showPersistentNotification();

        this.emit();
    }

    async stopRecording(): Promise<RecordingChunk[]> {
        if (!this.state.isRecording) return [];

        // Finalize current chunk
        this.finalizeCurrentChunk();

        // Cleanup
        this.stopBatteryMonitoring();
        if (this.chunkTimer) {
            clearInterval(this.chunkTimer);
            this.chunkTimer = null;
        }
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
        await this.dismissNotification();

        const chunks = [...this.state.chunks];
        this.state.isRecording = false;
        this.state.isPaused = false;
        this.emit();

        return chunks;
    }

    // ─── Silence Detection ──────────────────────────────────────

    /**
     * Called with audio level updates during recording.
     * Pauses video when silence detected, resumes on voice activity.
     */
    processAudioLevel(levelDb: number): void {
        if (!this.state.isRecording) return;

        const isSilent = levelDb < SILENCE_THRESHOLD_DB;

        if (isSilent) {
            this.state.silenceDuration += 100; // Assume ~100ms between callbacks

            if (this.state.silenceDuration >= SILENCE_PAUSE_MS && !this.state.isPaused) {
                // Pause video recording to save storage
                this.state.isPaused = true;
                this.state.pauseReason = 'silence';
                this.emit();
            }
        } else {
            if (this.state.isPaused && this.state.pauseReason === 'silence') {
                // Voice detected — resume
                this.state.isPaused = false;
                this.state.pauseReason = null;
                this.emit();
            }
            this.state.silenceDuration = 0;
        }

        // Update total duration
        this.state.totalDuration = (Date.now() - this.recordingStartTime) / 1000;
    }

    // ─── Chunk Management ───────────────────────────────────────

    private finalizeCurrentChunk(): void {
        const now = Date.now();
        const chunk: RecordingChunk = {
            index: this.state.currentChunkIndex,
            startTime: this.chunkStartTime,
            endTime: now,
            duration: (now - this.chunkStartTime) / 1000,
            audioPath: '', // Set by caller
            transcript: '', // Set by caller
        };

        this.state.chunks.push(chunk);
        this.state.currentChunkIndex++;
        this.chunkStartTime = now;
        this.emit();
    }

    /**
     * Update the audio/video paths and transcript for a completed chunk
     */
    updateChunk(index: number, data: Partial<RecordingChunk>): void {
        const chunk = this.state.chunks.find(c => c.index === index);
        if (chunk) {
            Object.assign(chunk, data);
        }
    }

    // ─── Battery Monitoring ─────────────────────────────────────

    private startBatteryMonitoring(): void {
        this.batteryCheckInterval = setInterval(async () => {
            try {
                const level = await Battery.getBatteryLevelAsync();
                const pct = Math.round(level * 100);
                this.state.batteryLevel = pct;

                if (pct <= BATTERY_STOP_PCT) {
                    // Auto-stop at critical battery
                    this.state.isPaused = true;
                    this.state.pauseReason = 'battery';
                    this.emit();
                } else if (pct <= BATTERY_WARN_PCT && pct > BATTERY_STOP_PCT) {
                    // Warning only — don't auto-pause
                    this.emit();
                }
            } catch (err) { console.warn('[uackgroundrecording] Error:', err); }
        }, 30_000); // Check every 30 seconds
    }

    private stopBatteryMonitoring(): void {
        if (this.batteryCheckInterval) {
            clearInterval(this.batteryCheckInterval);
            this.batteryCheckInterval = null;
        }
    }

    // ─── Persistent Notification ────────────────────────────────

    private async showPersistentNotification(): Promise<void> {
        try {
            this.notificationId = await Notifications.scheduleNotificationAsync({
                content: {
                    title: '🎙️ Windy Pro — Recording',
                    body: 'Recording in progress for clone training',
                    sticky: true,
                    autoDismiss: false,
                },
                trigger: null, // Show immediately
            });
        } catch (err) { console.warn('[uackgroundrecording] Permission error:', err); }
    }

    private async dismissNotification(): Promise<void> {
        if (this.notificationId) {
            try {
                await Notifications.dismissNotificationAsync(this.notificationId);
            } catch (err) { console.warn('[uackgroundrecording] Error:', err); }
            this.notificationId = null;
        }
    }

    // ─── Queries ────────────────────────────────────────────────

    shouldWarnBattery(): boolean {
        return this.state.batteryLevel <= BATTERY_WARN_PCT;
    }

    shouldStopBattery(): boolean {
        return this.state.batteryLevel <= BATTERY_STOP_PCT;
    }

    getCurrentChunkDuration(): number {
        return (Date.now() - this.chunkStartTime) / 1000;
    }

    getTotalChunks(): number {
        return this.state.chunks.length;
    }
}

export const backgroundRecordingService = new BackgroundRecordingService();
