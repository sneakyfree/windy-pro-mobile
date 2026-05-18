/**
 * 🧬 Clone Training Bundle Service
 * Manages standardized bundles: audio + video + transcript.
 * Each recording produces a bundle for digital clone training.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Battery from 'expo-battery';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { networkMonitor } from './network-monitor';

const BUNDLES_KEY = 'windy-clone-bundles';
import { apiUrl } from '@/config/api';
import { createLogger } from './logger';

const log = createLogger('CloneBundle');

const UPLOAD_API = apiUrl('/api/v1/recordings/upload');

// ─── Types ──────────────────────────────────────────────────────

export interface TranscriptSegment {
    start: number;
    end: number;
    text: string;
    confidence: number;
}

export interface CloneBundle {
    bundle_id: string;
    created_at: string;
    duration_seconds: number;
    audio: {
        format: 'aac' | 'wav';
        file: string;
        size_bytes: number;
    };
    video: {
        format: 'h264';
        resolution: '720p' | '1080p';
        file: string;
        size_bytes: number;
        camera: 'front' | 'back';
    } | null;
    transcript: {
        text: string;
        segments: TranscriptSegment[];
        language: string;
    };
    device: {
        platform: 'android' | 'ios' | 'desktop';
        model: string;
        app_version: string;
    };
    sync_status: 'pending' | 'uploading' | 'synced' | 'failed';
    clone_training_ready: boolean;
    tags: string[];
}

export interface BundleStats {
    total_bundles: number;
    video_bundles: number;
    audio_only_bundles: number;
    training_ready: number;
    synced: number;
    pending: number;
    local_bytes: number;
    cloud_bytes: number;
    total_duration_seconds: number;
}

// ─── Service ────────────────────────────────────────────────────

class CloneBundleService {
    private bundles: CloneBundle[] = [];
    private loaded = false;

    // ─── Initialization ─────────────────────────────────────────

    async initialize(): Promise<void> {
        if (this.loaded) return;
        try {
            const raw = await AsyncStorage.getItem(BUNDLES_KEY);
            this.bundles = raw ? JSON.parse(raw) : [];
        } catch (err) { console.warn('[CloneBundle] Error:', err);
            this.bundles = [];
        }
        this.loaded = true;
    }

    private async save(): Promise<void> {
        await AsyncStorage.setItem(BUNDLES_KEY, JSON.stringify(this.bundles));
    }

    // ─── Create Bundle ──────────────────────────────────────────

    async createBundle(params: {
        sessionId: string;
        duration: number;
        audioPath: string;
        audioFormat?: 'aac' | 'wav';
        videoPath?: string;
        videoResolution?: '720p' | '1080p';
        videoCameraFacing?: 'front' | 'back';
        transcript: string;
        segments?: TranscriptSegment[];
        language?: string;
    }): Promise<CloneBundle> {
        await this.initialize();

        // Get file sizes
        let audioSize = 0;
        let videoSize = 0;

        try {
            const audioInfo = await FileSystem.getInfoAsync(params.audioPath);
            audioSize = audioInfo.exists && 'size' in audioInfo ? (audioInfo as any).size : 0;
        } catch (err) { console.warn('[clonebundle] File error:', err); }

        if (params.videoPath) {
            try {
                const videoInfo = await FileSystem.getInfoAsync(params.videoPath);
                videoSize = videoInfo.exists && 'size' in videoInfo ? (videoInfo as any).size : 0;
            } catch (err) { console.warn('[clonebundle] File error:', err); }
        }

        const hasVideo = !!params.videoPath && videoSize > 0;
        const hasTranscript = params.transcript.trim().length > 0;
        const hasAudio = audioSize > 0;

        const bundle: CloneBundle = {
            bundle_id: params.sessionId,
            created_at: new Date().toISOString(),
            duration_seconds: params.duration,
            audio: {
                format: params.audioFormat || 'wav',
                file: params.audioPath,
                size_bytes: audioSize,
            },
            video: hasVideo ? {
                format: 'h264',
                resolution: params.videoResolution || '720p',
                file: params.videoPath!,
                size_bytes: videoSize,
                camera: params.videoCameraFacing || 'front',
            } : null,
            transcript: {
                text: params.transcript,
                segments: params.segments || [],
                language: params.language || 'en',
            },
            sync_status: 'pending',
            clone_training_ready: hasVideo && hasAudio && hasTranscript && params.duration >= 10,
            device: {
                platform: Platform.OS === 'ios' ? 'ios' : 'android',
                model: Constants.deviceName || 'Unknown',
                app_version: Constants.expoConfig?.version || '2.0.0',
            },
            tags: [],
        };

        // Replace existing bundle with same ID, or add new
        const idx = this.bundles.findIndex(b => b.bundle_id === params.sessionId);
        if (idx >= 0) {
            this.bundles[idx] = bundle;
        } else {
            this.bundles.unshift(bundle);
        }

        await this.save();
        return bundle;
    }

    // ─── Query ──────────────────────────────────────────────────

    async getBundles(filter?: {
        hasVideo?: boolean;
        syncStatus?: CloneBundle['sync_status'];
        trainingReady?: boolean;
    }): Promise<CloneBundle[]> {
        await this.initialize();
        let result = [...this.bundles];

        if (filter) {
            if (filter.hasVideo !== undefined) {
                result = result.filter(b => filter.hasVideo ? b.video !== null : b.video === null);
            }
            if (filter.syncStatus) {
                result = result.filter(b => b.sync_status === filter.syncStatus);
            }
            if (filter.trainingReady !== undefined) {
                result = result.filter(b => b.clone_training_ready === filter.trainingReady);
            }
        }

        return result;
    }

    async getBundle(bundleId: string): Promise<CloneBundle | null> {
        await this.initialize();
        return this.bundles.find(b => b.bundle_id === bundleId) || null;
    }

    // ─── Stats ──────────────────────────────────────────────────

    async getStats(): Promise<BundleStats> {
        await this.initialize();

        let localBytes = 0;
        let totalDuration = 0;

        for (const b of this.bundles) {
            localBytes += b.audio.size_bytes + (b.video?.size_bytes || 0);
            totalDuration += b.duration_seconds;
        }

        return {
            total_bundles: this.bundles.length,
            video_bundles: this.bundles.filter(b => b.video !== null).length,
            audio_only_bundles: this.bundles.filter(b => b.video === null).length,
            training_ready: this.bundles.filter(b => b.clone_training_ready).length,
            synced: this.bundles.filter(b => b.sync_status === 'synced').length,
            pending: this.bundles.filter(b => b.sync_status === 'pending').length,
            local_bytes: localBytes,
            cloud_bytes: 0, // Populated from server
            total_duration_seconds: totalDuration,
        };
    }

    // ─── Upload ─────────────────────────────────────────────────

    async uploadBundle(bundleId: string, authToken: string): Promise<{ success: boolean; error?: string }> {
        const bundle = await this.getBundle(bundleId);
        if (!bundle) return { success: false, error: 'Bundle not found' };

        if (!networkMonitor.isOnline) {
            return { success: false, error: 'Offline — queued for sync' };
        }

        // Mark as uploading
        bundle.sync_status = 'uploading';
        await this.save();

        try {
            // Upload audio
            const audioResult = await FileSystem.uploadAsync(UPLOAD_API, bundle.audio.file, {
                httpMethod: 'POST',
                uploadType: FileSystem.FileSystemUploadType.MULTIPART,
                fieldName: 'audio',
                headers: { Authorization: `Bearer ${authToken}` },
                parameters: {
                    bundle_id: bundle.bundle_id,
                    duration: String(bundle.duration_seconds),
                    transcript: bundle.transcript.text,
                    segments: JSON.stringify(bundle.transcript.segments),
                    language: bundle.transcript.language,
                    has_video: String(bundle.video !== null),
                },
            });

            // Upload video if exists
            if (bundle.video) {
                await FileSystem.uploadAsync(UPLOAD_API, bundle.video.file, {
                    httpMethod: 'POST',
                    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
                    fieldName: 'video',
                    headers: { Authorization: `Bearer ${authToken}` },
                    parameters: {
                        bundle_id: bundle.bundle_id,
                        part: 'video',
                        resolution: bundle.video.resolution,
                        camera: bundle.video.camera,
                    },
                });
            }

            if (audioResult.status >= 200 && audioResult.status < 300) {
                bundle.sync_status = 'synced';
                await this.save();
                return { success: true };
            } else {
                bundle.sync_status = 'failed';
                await this.save();
                return { success: false, error: `HTTP ${audioResult.status}` };
            }
        } catch (err) {
            bundle.sync_status = 'failed';
            await this.save();
            return { success: false, error: String(err) };
        }
    }

    // ─── Delete ─────────────────────────────────────────────────

    async deleteBundle(bundleId: string): Promise<void> {
        await this.initialize();
        const bundle = this.bundles.find(b => b.bundle_id === bundleId);
        if (bundle) {
            // Delete local files
            await FileSystem.deleteAsync(bundle.audio.file, { idempotent: true }).catch(() => { });
            if (bundle.video) {
                await FileSystem.deleteAsync(bundle.video.file, { idempotent: true }).catch(() => { });
            }
        }
        this.bundles = this.bundles.filter(b => b.bundle_id !== bundleId);
        await this.save();
    }

    // ─── Battery & Storage Awareness ────────────────────────────

    async getBatteryInfo(): Promise<{
        level: number;
        shouldWarn: boolean;
        shouldStop: boolean;
        estimatedMinutesLeft: number;
    }> {
        try {
            const level = await Battery.getBatteryLevelAsync();
            const pct = Math.round(level * 100);

            // Rough estimate: recording uses ~10% per hour
            const estimatedMinutesLeft = Math.max(0, (pct - 15) * 6);

            return {
                level: pct,
                shouldWarn: pct <= 25,
                shouldStop: pct <= 15,
                estimatedMinutesLeft,
            };
        } catch (err) { console.warn('[CloneBundle] Error:', err);
            return { level: 100, shouldWarn: false, shouldStop: false, estimatedMinutesLeft: 600 };
        }
    }

    async getStorageInfo(): Promise<{
        freeBytes: number;
        estimatedMinutesLeft: number;
    }> {
        try {
            const free = await FileSystem.getFreeDiskStorageAsync();
            // WAV audio: ~5 MB/min, 720p video: ~15 MB/min = ~20 MB/min total
            const estMinutes = Math.floor(free / (20 * 1024 * 1024));
            return { freeBytes: free, estimatedMinutesLeft: estMinutes };
        } catch (err) { console.warn('[CloneBundle] Error:', err);
            return { freeBytes: 0, estimatedMinutesLeft: 0 };
        }
    }
}

export const cloneBundleService = new CloneBundleService();
