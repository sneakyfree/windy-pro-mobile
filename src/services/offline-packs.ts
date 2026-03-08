/**
 * 🧬 Offline Language Pack Service
 * Download + store offline translation models
 * Tracks download progress, storage usage, and pack management
 */
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PACKS_DIR = (FileSystem.documentDirectory || '') + 'language-packs/';
const PACKS_META_KEY = 'windy-offline-packs';
const PACK_BASE_URL = 'https://windypro.thewindstorm.uk/models';

export interface LanguagePack {
    code: string;
    name: string;
    flag: string;
    sizeBytes: number;       // estimated download size
    downloadedBytes: number; // 0 if not downloaded
    status: 'available' | 'downloading' | 'downloaded' | 'error';
    progress: number;        // 0.0 - 1.0
    version: string;
    lastUpdated?: string;
}

/** All available packs */
const AVAILABLE_PACKS: Omit<LanguagePack, 'downloadedBytes' | 'status' | 'progress' | 'lastUpdated'>[] = [
    { code: 'en', name: 'English', flag: '🇺🇸', sizeBytes: 45_000_000, version: '1.0' },
    { code: 'es', name: 'Spanish', flag: '🇪🇸', sizeBytes: 42_000_000, version: '1.0' },
    { code: 'fr', name: 'French', flag: '🇫🇷', sizeBytes: 43_000_000, version: '1.0' },
    { code: 'de', name: 'German', flag: '🇩🇪', sizeBytes: 44_000_000, version: '1.0' },
    { code: 'it', name: 'Italian', flag: '🇮🇹', sizeBytes: 41_000_000, version: '1.0' },
    { code: 'pt', name: 'Portuguese', flag: '🇧🇷', sizeBytes: 42_000_000, version: '1.0' },
    { code: 'zh', name: 'Chinese', flag: '🇨🇳', sizeBytes: 65_000_000, version: '1.0' },
    { code: 'ja', name: 'Japanese', flag: '🇯🇵', sizeBytes: 60_000_000, version: '1.0' },
    { code: 'ko', name: 'Korean', flag: '🇰🇷', sizeBytes: 55_000_000, version: '1.0' },
    { code: 'ar', name: 'Arabic', flag: '🇸🇦', sizeBytes: 48_000_000, version: '1.0' },
    { code: 'hi', name: 'Hindi', flag: '🇮🇳', sizeBytes: 50_000_000, version: '1.0' },
    { code: 'ru', name: 'Russian', flag: '🇷🇺', sizeBytes: 47_000_000, version: '1.0' },
];

class OfflinePackService {
    private packs: LanguagePack[] = [];
    private activeDownloads = new Map<string, FileSystem.DownloadResumable>();

    /** Callback for download progress updates */
    public onProgressUpdate: ((code: string, progress: number) => void) | null = null;

    /**
     * Initialize — load saved pack metadata
     */
    async initialize(): Promise<void> {
        try {
            // Ensure packs directory exists
            const dirInfo = await FileSystem.getInfoAsync(PACKS_DIR);
            if (!dirInfo.exists) {
                await FileSystem.makeDirectoryAsync(PACKS_DIR, { intermediates: true });
            }

            // Load saved metadata
            const raw = await AsyncStorage.getItem(PACKS_META_KEY);
            if (raw) {
                const saved: LanguagePack[] = JSON.parse(raw);
                this.packs = AVAILABLE_PACKS.map(p => {
                    const existing = saved.find(s => s.code === p.code);
                    return existing || { ...p, downloadedBytes: 0, status: 'available', progress: 0 };
                });
            } else {
                this.packs = AVAILABLE_PACKS.map(p => ({
                    ...p, downloadedBytes: 0, status: 'available' as const, progress: 0,
                }));
            }

            // Verify downloaded packs still exist on disk
            for (const pack of this.packs) {
                if (pack.status === 'downloaded') {
                    const packPath = `${PACKS_DIR}${pack.code}.bin`;
                    const info = await FileSystem.getInfoAsync(packPath);
                    if (!info.exists) {
                        pack.status = 'available';
                        pack.downloadedBytes = 0;
                        pack.progress = 0;
                    }
                }
            }

            await this.saveMeta();
        } catch (err) {
            console.error('[OfflinePacks] Init error:', err);
            this.packs = AVAILABLE_PACKS.map(p => ({
                ...p, downloadedBytes: 0, status: 'available' as const, progress: 0,
            }));
        }
    }

    /**
     * Get all packs with their current status
     */
    getPacks(): LanguagePack[] {
        return [...this.packs];
    }

    /**
     * Get downloaded packs only
     */
    getDownloadedPacks(): LanguagePack[] {
        return this.packs.filter(p => p.status === 'downloaded');
    }

    /**
     * Get total storage used by downloaded packs
     */
    getTotalStorageUsed(): number {
        return this.packs
            .filter(p => p.status === 'downloaded')
            .reduce((sum, p) => sum + p.downloadedBytes, 0);
    }

    /**
     * Download a language pack
     */
    async downloadPack(code: string): Promise<void> {
        const pack = this.packs.find(p => p.code === code);
        if (!pack) throw new Error(`Unknown pack: ${code}`);
        if (pack.status === 'downloading') return;

        pack.status = 'downloading';
        pack.progress = 0;
        await this.saveMeta();

        const url = `${PACK_BASE_URL}/${code}/model-v${pack.version}.bin`;
        const destPath = `${PACKS_DIR}${code}.bin`;

        try {
            const downloadResumable = FileSystem.createDownloadResumable(
                url,
                destPath,
                {},
                (downloadProgress) => {
                    const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
                    pack.progress = progress;
                    pack.downloadedBytes = downloadProgress.totalBytesWritten;
                    this.onProgressUpdate?.(code, progress);
                }
            );

            this.activeDownloads.set(code, downloadResumable);

            const result = await downloadResumable.downloadAsync();
            this.activeDownloads.delete(code);

            if (result) {
                pack.status = 'downloaded';
                pack.progress = 1;
                pack.downloadedBytes = pack.sizeBytes;
                pack.lastUpdated = new Date().toISOString();
            } else {
                pack.status = 'error';
            }
        } catch (err) {
            console.error(`[OfflinePacks] Download ${code} failed:`, err);
            pack.status = 'error';
            pack.progress = 0;
            this.activeDownloads.delete(code);
        }

        await this.saveMeta();
    }

    /**
     * Delete a downloaded pack
     */
    async deletePack(code: string): Promise<void> {
        const pack = this.packs.find(p => p.code === code);
        if (!pack) return;

        const packPath = `${PACKS_DIR}${code}.bin`;
        await FileSystem.deleteAsync(packPath, { idempotent: true });

        pack.status = 'available';
        pack.downloadedBytes = 0;
        pack.progress = 0;
        pack.lastUpdated = undefined;

        await this.saveMeta();
    }

    /**
     * Cancel an active download
     */
    async cancelDownload(code: string): Promise<void> {
        const resumable = this.activeDownloads.get(code);
        if (resumable) {
            await resumable.pauseAsync();
            this.activeDownloads.delete(code);
        }

        const pack = this.packs.find(p => p.code === code);
        if (pack) {
            pack.status = 'available';
            pack.progress = 0;
            pack.downloadedBytes = 0;
        }

        // Clean up partial file
        const packPath = `${PACKS_DIR}${code}.bin`;
        await FileSystem.deleteAsync(packPath, { idempotent: true });
        await this.saveMeta();
    }

    /**
     * Check if a language is available offline
     */
    isAvailableOffline(code: string): boolean {
        return this.packs.some(p => p.code === code && p.status === 'downloaded');
    }

    /**
     * Save pack metadata to AsyncStorage
     */
    private async saveMeta(): Promise<void> {
        try {
            await AsyncStorage.setItem(PACKS_META_KEY, JSON.stringify(this.packs));
        } catch (err) { console.warn("[OfflinePacks] Error:", err); }
    }
}

export const offlinePackService = new OfflinePackService();
