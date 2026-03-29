/**
 * 🧬 RP-2.4 — Engine Download Manager
 * Downloads whisper.cpp GGML models from HuggingFace CDN
 */
import * as FileSystem from 'expo-file-system';
import type { EngineId } from '@/types';
import { WHISPER_MODEL_CDN } from '@/config/api';

/**
 * Map engine ID to model filename on HuggingFace
 */
const MODEL_FILES: Partial<Record<EngineId, string>> = {
    'tiny': 'ggml-tiny.bin',
    'base': 'ggml-base.bin',
    'small': 'ggml-small.bin',
    'medium': 'ggml-medium.bin',
    'large-v3': 'ggml-large-v3.bin',
    'large-v3-turbo': 'ggml-large-v3-turbo.bin',
};

class EngineDownloadManager {
    private activeDownloads = new Map<EngineId, FileSystem.DownloadResumable>();
    private engineDir: string;

    constructor() {
        this.engineDir = (FileSystem.documentDirectory || '') + 'windy/engines/';
    }

    /**
     * Download a voice engine model
     */
    async downloadEngine(
        id: EngineId,
        onProgress: (pct: number) => void
    ): Promise<string> {
        const filename = MODEL_FILES[id];
        if (!filename) {
            throw new Error(`No downloadable model for engine: ${id}`);
        }

        // Ensure directory exists
        await FileSystem.makeDirectoryAsync(this.engineDir, { intermediates: true });

        const destPath = this.engineDir + filename;
        const url = `${WHISPER_MODEL_CDN}/${filename}`;

        // Check if already downloaded
        const info = await FileSystem.getInfoAsync(destPath);
        if (info.exists) {
            onProgress(100);
            return destPath;
        }

        // Create resumable download
        const download = FileSystem.createDownloadResumable(
            url,
            destPath,
            {
                headers: { 'User-Agent': 'WindyPro/0.1.0' },
            },
            (progress) => {
                if (progress.totalBytesExpectedToWrite > 0) {
                    const pct = Math.round(
                        (progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 100
                    );
                    onProgress(pct);
                }
            }
        );

        this.activeDownloads.set(id, download);

        try {
            const result = await download.downloadAsync();
            if (!result?.uri) {
                throw new Error('Download returned no URI');
            }
            return result.uri;
        } finally {
            this.activeDownloads.delete(id);
        }
    }

    /**
     * Cancel an active download
     */
    async cancelDownload(id: EngineId): Promise<void> {
        const download = this.activeDownloads.get(id);
        if (download) {
            await download.pauseAsync();
            this.activeDownloads.delete(id);
        }
    }

    /**
     * Delete a downloaded engine
     */
    async deleteEngine(id: EngineId): Promise<void> {
        const filename = MODEL_FILES[id];
        if (!filename) return;
        const path = this.engineDir + filename;
        await FileSystem.deleteAsync(path, { idempotent: true });
    }

    /**
     * Check if an engine is downloaded
     */
    async isDownloaded(id: EngineId): Promise<boolean> {
        const filename = MODEL_FILES[id];
        if (!filename) return false;
        const info = await FileSystem.getInfoAsync(this.engineDir + filename);
        return info.exists;
    }

    /**
     * Get list of all downloaded engines
     */
    async getDownloadedEngines(): Promise<EngineId[]> {
        const downloaded: EngineId[] = [];
        for (const [id, _] of Object.entries(MODEL_FILES)) {
            if (await this.isDownloaded(id as EngineId)) {
                downloaded.push(id as EngineId);
            }
        }
        return downloaded;
    }

    /**
     * Get the file path for a downloaded engine
     */
    getModelPath(id: EngineId): string | null {
        const filename = MODEL_FILES[id];
        if (!filename) return null;
        return this.engineDir + filename;
    }

    /**
     * Get total storage used by downloaded engines
     */
    async getStorageUsed(): Promise<number> {
        let total = 0;
        for (const [id, _] of Object.entries(MODEL_FILES)) {
            const filename = MODEL_FILES[id as EngineId];
            if (!filename) continue;
            const info = await FileSystem.getInfoAsync(this.engineDir + filename);
            if (info.exists && 'size' in info) {
                total += (info as any).size || 0;
            }
        }
        return total;
    }
}

export const engineDownloadManager = new EngineDownloadManager();
