/**
 * 🧬 M3.1 — WindyTune: Intelligent Engine Auto-Configuration
 * Detects device hardware capabilities and recommends the
 * optimal voice engine. Like an orchestra conductor choosing
 * the best instrument for each performance.
 */
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DeviceProfile, EngineConfig, EngineId, WindyTuneResult } from '@/types';
import { createLogger } from './logger';

const log = createLogger('WindyTune');

/**
 * 🧬 M3.1.1 — Device capability detection
 */
export async function detectDeviceProfile(): Promise<DeviceProfile> {
    const totalRam = Device.totalMemory
        ? Math.round(Device.totalMemory / (1024 * 1024))
        : 4000; // Default 4GB if unavailable

    return {
        model: Device.modelName || 'Unknown',
        platform: Platform.OS as 'ios' | 'android',
        osVersion: Platform.Version?.toString() || 'unknown',
        totalRam,
        availableStorage: 0, // Will be populated by FileSystem check
        cpuCores: 4, // Default; native module needed for exact count
        hasNeuralEngine: Platform.OS === 'ios' && totalRam >= 3000, // A11+ ~= 3GB+
        hasNPU: Platform.OS === 'android' && totalRam >= 8000, // Snapdragon 8 Gen 1+
        chipset: Device.modelName || null,
    };
}

/**
 * 🧬 M3.1.2 — Engine Registry
 * All available voice engines with their requirements
 */
export const ENGINE_REGISTRY: Record<EngineId, Omit<EngineConfig, 'isDownloaded' | 'downloadProgress'>> = {
    'tiny': {
        id: 'tiny',
        displayName: 'Tiny',
        description: 'Fastest, English only, lowest quality',
        sizeBytes: 75_000_000,
        ramRequired: 1000,
        isOnDevice: true,
        languages: ['en'],
        quality: 3,
        speed: 10,
    },
    'base': {
        id: 'base',
        displayName: 'Base',
        description: 'Good balance for older devices',
        sizeBytes: 140_000_000,
        ramRequired: 1500,
        isOnDevice: true,
        languages: ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'ko', 'ar', 'hi', 'ru'],
        quality: 5,
        speed: 8,
    },
    'small': {
        id: 'small',
        displayName: 'Small',
        description: 'Great quality for mid-range devices',
        sizeBytes: 460_000_000,
        ramRequired: 2500,
        isOnDevice: true,
        languages: ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'ko', 'ar', 'hi', 'ru'],
        quality: 7,
        speed: 6,
    },
    'medium': {
        id: 'medium',
        displayName: 'Medium',
        description: 'High quality for powerful devices',
        sizeBytes: 1_500_000_000,
        ramRequired: 4000,
        isOnDevice: true,
        languages: ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'ko', 'ar', 'hi', 'ru'],
        quality: 8,
        speed: 4,
    },
    'large-v3': {
        id: 'large-v3',
        displayName: 'Large v3',
        description: 'Maximum on-device quality (requires 8GB+ RAM)',
        sizeBytes: 3_000_000_000,
        ramRequired: 8000,
        isOnDevice: true,
        languages: ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'ko', 'ar', 'hi', 'ru'],
        quality: 10,
        speed: 3,
    },
    'large-v3-turbo': {
        id: 'large-v3-turbo',
        displayName: 'Large v3 Turbo',
        description: 'Best quality + speed with GPU/NPU acceleration',
        sizeBytes: 3_000_000_000,
        ramRequired: 6000,
        isOnDevice: true,
        languages: ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'ko', 'ar', 'hi', 'ru'],
        quality: 10,
        speed: 7,
    },
    'cloud-standard': {
        id: 'cloud-standard',
        displayName: 'Cloud',
        description: 'Cloud processing — works on any device',
        sizeBytes: 0,
        ramRequired: 0,
        isOnDevice: false,
        languages: ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'ko', 'ar', 'hi', 'ru',
            'tr', 'vi', 'nl', 'pl', 'sv', 'no', 'da', 'fi', 'th', 'id', 'ms', 'tl',
            'uk', 'cs', 'ro', 'hu', 'el', 'he', 'fa'],
        quality: 9,
        speed: 8,
    },
    'cloud-turbo': {
        id: 'cloud-turbo',
        displayName: 'Cloud Turbo',
        description: 'NVIDIA 5090 — maximum quality, blazing speed',
        sizeBytes: 0,
        ramRequired: 0,
        isOnDevice: false,
        languages: ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'ko', 'ar', 'hi', 'ru',
            'tr', 'vi', 'nl', 'pl', 'sv', 'no', 'da', 'fi', 'th', 'id', 'ms', 'tl',
            'uk', 'cs', 'ro', 'hu', 'el', 'he', 'fa'],
        quality: 10,
        speed: 10,
    },
};

/**
 * 🧬 M3.1 — WindyTune recommendation engine
 * Given a device profile, recommend the best engine
 */
export function getWindyTuneRecommendation(
    profile: DeviceProfile,
    downloadedEngines: Set<EngineId> = new Set(),
    cloudFallbackEnabled: boolean = false
): WindyTuneResult {
    const ram = profile.totalRam;
    let recommendedEngine: EngineId;
    let reason: string;

    if (profile.hasNeuralEngine && ram >= 6000) {
        recommendedEngine = 'large-v3-turbo';
        reason = 'Your device has Apple Neural Engine — turbo mode for maximum quality + speed';
    } else if (profile.hasNPU && ram >= 6000) {
        recommendedEngine = 'large-v3-turbo';
        reason = 'Your device has an NPU — turbo mode for maximum quality + speed';
    } else if (ram >= 8000) {
        recommendedEngine = 'large-v3';
        reason = 'Your device has plenty of RAM for the highest quality model';
    } else if (ram >= 4000) {
        recommendedEngine = 'medium';
        reason = 'Great balance of quality and speed for your device';
    } else if (ram >= 2500) {
        recommendedEngine = 'small';
        reason = 'Optimized for your device\'s memory';
    } else if (ram >= 1500) {
        recommendedEngine = 'base';
        reason = 'Lightweight model that runs smoothly on your device';
    } else if (cloudFallbackEnabled) {
        recommendedEngine = 'cloud-standard';
        reason = 'Cloud processing gives you the best experience on this device';
    } else {
        // Even low-RAM devices stay local when cloud fallback is off
        recommendedEngine = 'tiny';
        reason = 'Local-only mode — using the lightest model for your device. Enable "Cloud fallback" in Settings for better quality.';
    }

    // If recommended on-device engine isn't downloaded and cloud fallback is enabled, suggest cloud
    const engineInfo = ENGINE_REGISTRY[recommendedEngine];
    if (engineInfo.isOnDevice && !downloadedEngines.has(recommendedEngine) && cloudFallbackEnabled) {
        reason += ' (download required — using cloud in the meantime)';
    } else if (engineInfo.isOnDevice && !downloadedEngines.has(recommendedEngine)) {
        reason += ' (download required to use this engine)';
    }

    // Build sorted engine list
    const allEngines: EngineConfig[] = (Object.values(ENGINE_REGISTRY) as (Omit<EngineConfig, 'isDownloaded' | 'downloadProgress'>)[])
        .filter((e) => !e.isOnDevice || e.ramRequired <= ram)
        .map((e) => ({
            ...e,
            isDownloaded: downloadedEngines.has(e.id),
            downloadProgress: downloadedEngines.has(e.id) ? 100 : 0,
        }))
        .sort((a, b) => b.quality - a.quality);

    return {
        recommendedEngine,
        reason,
        deviceProfile: profile,
        allEngines,
    };
}

// ─── WindyTuneManager: Download Manager ──────────────────────

/**
 * 🧬 M3.1.3 — WindyTune Manager
 * Wraps detection + recommendation + download lifecycle.
 * Download from CDN, track progress, resume interrupted downloads,
 * persist state to AsyncStorage.
 */

/** Engine model CDN base URL */
import { WINDY_CDN_BASE } from '@/config/api';
const ENGINE_CDN_BASE = WINDY_CDN_BASE;

/** AsyncStorage key for downloaded engines */
const STORAGE_KEY = 'windy_downloaded_engines';

type DownloadState = 'idle' | 'downloading' | 'paused' | 'complete' | 'error';

interface EngineDownloadInfo {
    engineId: EngineId;
    state: DownloadState;
    progress: number;          // 0-100
    bytesDownloaded: number;
    totalBytes: number;
    filePath: string | null;
    errorMessage: string | null;
    completedAt: string | null; // ISO 8601
}

type ProgressCallback = (engineId: EngineId, progress: number, state: DownloadState) => void;

class WindyTuneManager {
    private downloadedEngines: Map<EngineId, EngineDownloadInfo> = new Map();
    private activeDownloads: Map<EngineId, AbortController> = new Map();
    private progressListeners: ProgressCallback[] = [];
    private initialized = false;

    /**
     * Initialize — load persisted download state from AsyncStorage
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            const stored = await AsyncStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed: EngineDownloadInfo[] = JSON.parse(stored);
                for (const info of parsed) {
                    this.downloadedEngines.set(info.engineId, info);
                }
            }
        } catch (err) { console.warn('[WindyTune] Error:', err);
            // First launch or corrupt data — start fresh
        }

        this.initialized = true;
    }

    /**
     * Get the full WindyTune recommendation, incorporating download state
     */
    async getRecommendation(): Promise<WindyTuneResult> {
        await this.initialize();
        const profile = await detectDeviceProfile();
        const downloaded = new Set(
            Array.from(this.downloadedEngines.entries())
                .filter(([, info]) => info.state === 'complete')
                .map(([id]) => id)
        );
        return getWindyTuneRecommendation(profile, downloaded);
    }

    /**
     * Get download info for a specific engine
     */
    getDownloadInfo(engineId: EngineId): EngineDownloadInfo | null {
        return this.downloadedEngines.get(engineId) ?? null;
    }

    /**
     * Get set of fully downloaded engine IDs
     */
    getDownloadedEngineIds(): Set<EngineId> {
        const ids = new Set<EngineId>();
        for (const [id, info] of this.downloadedEngines) {
            if (info.state === 'complete') ids.add(id);
        }
        return ids;
    }

    /**
     * Check if specific engine is downloaded and ready
     */
    isEngineReady(engineId: EngineId): boolean {
        const info = this.downloadedEngines.get(engineId);
        return info?.state === 'complete';
    }

    /**
     * Start downloading an engine model
     */
    async downloadEngine(engineId: EngineId): Promise<void> {
        await this.initialize();

        const engineConfig = ENGINE_REGISTRY[engineId];
        if (!engineConfig) throw new Error(`Unknown engine: ${engineId}`);
        if (!engineConfig.isOnDevice) throw new Error(`${engineId} is a cloud engine — no download needed`);

        // Don't re-download if already complete
        const existing = this.downloadedEngines.get(engineId);
        if (existing?.state === 'complete') return;

        // Cancel any existing download for this engine
        this.cancelDownload(engineId);

        const modelDir = `${FileSystem.documentDirectory}windy/engines/`;
        await FileSystem.makeDirectoryAsync(modelDir, { intermediates: true }).catch(() => { });

        const filePath = `${modelDir}ggml-${engineId}.bin`;
        const downloadUrl = `${ENGINE_CDN_BASE}/${engineId}.bin`;

        const info: EngineDownloadInfo = {
            engineId,
            state: 'downloading',
            progress: 0,
            bytesDownloaded: 0,
            totalBytes: engineConfig.sizeBytes,
            filePath,
            errorMessage: null,
            completedAt: null,
        };
        this.downloadedEngines.set(engineId, info);
        this.notifyProgress(engineId, 0, 'downloading');

        try {
            const controller = new AbortController();
            this.activeDownloads.set(engineId, controller);

            // Use expo-file-system createDownloadResumable for resumable downloads
            const downloadResumable = FileSystem.createDownloadResumable(
                downloadUrl,
                filePath,
                {},
                (downloadProgress: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => {
                    const pct = downloadProgress.totalBytesExpectedToWrite > 0
                        ? Math.round((downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 100)
                        : 0;
                    info.progress = pct;
                    info.bytesDownloaded = downloadProgress.totalBytesWritten;
                    info.totalBytes = downloadProgress.totalBytesExpectedToWrite;
                    this.notifyProgress(engineId, pct, 'downloading');
                }
            );

            const result = await downloadResumable.downloadAsync();

            if (result) {
                // Validate file size
                const fileInfo = await FileSystem.getInfoAsync(result.uri);
                if (fileInfo.exists && 'size' in fileInfo && fileInfo.size > 0) {
                    info.state = 'complete';
                    info.progress = 100;
                    info.bytesDownloaded = fileInfo.size;
                    info.filePath = result.uri;
                    info.completedAt = new Date().toISOString();
                    this.notifyProgress(engineId, 100, 'complete');
                } else {
                    throw new Error('Downloaded file is empty or missing');
                }
            }

            this.activeDownloads.delete(engineId);
            await this.persistState();
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : 'Download failed';

            // Check if it was a deliberate cancellation
            if (errMsg === 'Download paused') {
                info.state = 'paused';
                this.notifyProgress(engineId, info.progress, 'paused');
            } else {
                info.state = 'error';
                info.errorMessage = errMsg;
                this.notifyProgress(engineId, info.progress, 'error');
            }

            this.activeDownloads.delete(engineId);
            await this.persistState();
        }
    }

    /**
     * Pause an active download
     */
    cancelDownload(engineId: EngineId): void {
        const controller = this.activeDownloads.get(engineId);
        if (controller) {
            controller.abort();
            this.activeDownloads.delete(engineId);
        }
    }

    /**
     * Delete a downloaded engine model
     */
    async deleteEngine(engineId: EngineId): Promise<void> {
        this.cancelDownload(engineId);

        const info = this.downloadedEngines.get(engineId);
        if (info?.filePath) {
            try {
                await FileSystem.deleteAsync(info.filePath, { idempotent: true });
            } catch (err) { console.warn('[WindyTune] Error:', err);
                // File already gone
            }
        }

        this.downloadedEngines.delete(engineId);
        await this.persistState();
    }

    /**
     * Get total storage used by downloaded engines
     */
    getTotalStorageUsed(): number {
        let total = 0;
        for (const info of this.downloadedEngines.values()) {
            if (info.state === 'complete') {
                total += info.bytesDownloaded;
            }
        }
        return total;
    }

    /**
     * Add a progress listener
     */
    onProgress(callback: ProgressCallback): () => void {
        this.progressListeners.push(callback);
        return () => {
            this.progressListeners = this.progressListeners.filter((cb) => cb !== callback);
        };
    }

    // ─── Private Helpers ─────────────────────────────────────────

    private notifyProgress(engineId: EngineId, progress: number, state: DownloadState): void {
        for (const listener of this.progressListeners) {
            try { listener(engineId, progress, state); } catch (err) { console.warn('[windytune] Error:', err); }
        }
    }

    private async persistState(): Promise<void> {
        try {
            const data = Array.from(this.downloadedEngines.values());
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (err) { console.warn('[WindyTune] Error:', err);
            // Persistence failed — non-fatal
        }
    }
}

/** Singleton instance */
export const windyTuneManager = new WindyTuneManager();
