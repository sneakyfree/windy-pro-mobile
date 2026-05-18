/**
 * Tests for pairManager.ts — Translation pair download + encryption manager
 */

// ── Mocks ─────────────────────────────────────────────────────

jest.mock('expo-file-system', () => ({
    documentDirectory: '/mock/documents/',
    getInfoAsync: jest.fn(async () => ({ exists: false })),
    makeDirectoryAsync: jest.fn(),
    deleteAsync: jest.fn(),
    getFreeDiskStorageAsync: jest.fn(async () => 5_000_000_000), // 5 GB
    readAsStringAsync: jest.fn(async () => 'base64data'),
    writeAsStringAsync: jest.fn(),
    createDownloadResumable: jest.fn(() => ({
        downloadAsync: jest.fn(async () => ({ uri: '/mock/file.bin' })),
        pauseAsync: jest.fn(),
    })),
    EncodingType: { Base64: 'base64' },
    FileSystemSessionType: { BACKGROUND: 0 },
}));

jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(async () => 'mock-license-token'),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        getItem: jest.fn(async () => null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
    },
    __esModule: true,
}));

jest.mock('@react-native-community/netinfo', () => ({
    default: {
        fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
    },
    __esModule: true,
}));

jest.mock('react-native', () => ({
    Alert: { alert: jest.fn() },
    Platform: { OS: 'ios' },
}));

jest.mock('../logger', () => ({
    createLogger: () => ({
        entry: jest.fn(),
        exit: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

jest.mock('../license', () => ({
    licenseService: {
        getTier: jest.fn(() => 'pro'),
    },
}));

jest.mock('../model-crypto', () => ({
    modelCrypto: {
        encryptModel: jest.fn(async (_id: string, data: string) => `encrypted-${data}`),
        decryptModel: jest.fn(async (_id: string, data: string) => data.replace('encrypted-', '')),
        isEncrypted: jest.fn(async () => true),
        wipeKeyHash: jest.fn(),
    },
    ModelDecryptionError: class extends Error { name = 'ModelDecryptionError'; },
}));

jest.mock('../heartbeat', () => ({
    heartbeatService: {
        getStatus: jest.fn(() => ({ status: 'valid', tier: 'pro', graceRemainingMs: 0 })),
    },
}));

jest.mock('expo-crypto', () => ({
    digestStringAsync: jest.fn(async (_algo: string, data: string) => `sha256-${data}`),
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

jest.mock('expo-constants', () => ({
    default: { expoConfig: { version: '1.0.0', extra: {} } },
}));

import { pairManager, PAIR_LIMITS, StorageFullError, InvalidInputError } from '../pairManager';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { licenseService } from '../license';
import { heartbeatService } from '../heartbeat';
import { Alert } from 'react-native';

// ── Tests ─────────────────────────────────────────────────────

describe('PairManager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
        (FileSystem.getFreeDiskStorageAsync as jest.Mock).mockResolvedValue(5_000_000_000);
        (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
        (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true, isInternetReachable: true });
    });

    describe('PAIR_LIMITS', () => {
        it('should define limits for all tiers', () => {
            expect(PAIR_LIMITS.free).toBe(1);
            expect(PAIR_LIMITS.pro).toBe(5);
            expect(PAIR_LIMITS.translate).toBe(25);
            expect(PAIR_LIMITS.translate_pro).toBe(100);
        });
    });

    describe('downloadPair — input validation', () => {
        it('should reject empty pairId', async () => {
            const result = await pairManager.downloadPair('', 'https://cdn.example.com/pair.bin');
            expect(result).toBe(false);
        });

        it('should reject non-HTTPS cdnUrl', async () => {
            const result = await pairManager.downloadPair('en-fr', 'http://cdn.example.com/pair.bin');
            expect(result).toBe(false);
        });

        it('should reject invalid URL', async () => {
            const result = await pairManager.downloadPair('en-fr', 'not-a-url');
            expect(result).toBe(false);
        });
    });

    describe('downloadPair — offline queueing', () => {
        it('should queue download when offline', async () => {
            (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: false, isInternetReachable: false });

            const result = await pairManager.downloadPair('en-fr', 'https://cdn.example.com/pair.bin');
            expect(result).toEqual({ success: false, reason: 'offline_queued' });
            expect(AsyncStorage.setItem).toHaveBeenCalledWith(
                expect.stringContaining('offline'),
                expect.stringContaining('en-fr'),
            );
        });
    });

    describe('downloadPair — tier limits', () => {
        it('should reject download when pair limit reached', async () => {
            (licenseService.getTier as jest.Mock).mockReturnValue('free');
            // Simulate 1 already downloaded pair (free limit = 1)
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(['existing-pair']));

            const result = await pairManager.downloadPair('new-pair', 'https://cdn.example.com/pair.bin');
            expect(result).toEqual(
                expect.objectContaining({ success: false, reason: 'limit_reached', limit: 1, tier: 'free' }),
            );
        });

        it('should allow re-download of already-downloaded pair even at limit', async () => {
            (licenseService.getTier as jest.Mock).mockReturnValue('free');
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(['en-fr']));
            // File exists on disk
            (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 50_000_000 });

            const result = await pairManager.downloadPair('en-fr', 'https://cdn.example.com/pair.bin');
            expect(result).toBe(true);
        });
    });

    describe('downloadPair — storage check', () => {
        it('should block download when storage is critically low', async () => {
            // Reset internal dirReady state by calling ensureDir path
            (FileSystem.getInfoAsync as jest.Mock)
                .mockResolvedValueOnce({ exists: true }) // ensureDir
                .mockResolvedValueOnce({ exists: false }); // file check
            (FileSystem.getFreeDiskStorageAsync as jest.Mock).mockResolvedValue(100_000_000); // 100 MB

            const result = await pairManager.downloadPair('en-es', 'https://cdn.example.com/pair.bin');
            expect(result).toBe(false);
            expect(Alert.alert).toHaveBeenCalledWith(
                'Storage Full',
                expect.stringContaining('500 MB'),
                expect.anything(),
            );
        });
    });

    describe('downloadPair — already exists', () => {
        it('should skip download when file exists on disk', async () => {
            (FileSystem.getInfoAsync as jest.Mock)
                .mockResolvedValueOnce({ exists: true }) // ensureDir
                .mockResolvedValueOnce({ exists: true, size: 50_000_000 }); // file check

            const result = await pairManager.downloadPair('en-de', 'https://cdn.example.com/pair.bin');
            expect(result).toBe(true);
            // Should not attempt download
            expect(FileSystem.createDownloadResumable).not.toHaveBeenCalled();
        });
    });

    describe('isDownloaded', () => {
        it('should return true when file exists', async () => {
            (FileSystem.getInfoAsync as jest.Mock).mockReset();
            (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 100 });
            expect(await pairManager.isDownloaded('en-fr')).toBe(true);
        });

        it('should return false when file does not exist', async () => {
            (FileSystem.getInfoAsync as jest.Mock).mockReset();
            (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
            expect(await pairManager.isDownloaded('en-fr')).toBe(false);
        });
    });

    describe('isDownloading', () => {
        it('should return false when no download active', () => {
            expect(pairManager.isDownloading('en-fr')).toBe(false);
        });
    });

    describe('getDownloadedPairs', () => {
        it('should return empty array when none downloaded', async () => {
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
            expect(await pairManager.getDownloadedPairs()).toEqual([]);
        });

        it('should return list from AsyncStorage', async () => {
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(['en-fr', 'en-de']));
            expect(await pairManager.getDownloadedPairs()).toEqual(['en-fr', 'en-de']);
        });

        it('should handle corrupt storage gracefully', async () => {
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue('not json');
            expect(await pairManager.getDownloadedPairs()).toEqual([]);
        });
    });

    describe('deletePair', () => {
        it('should delete file and remove from list', async () => {
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(['en-fr', 'en-de']));

            await pairManager.deletePair('en-fr');
            expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
                expect.stringContaining('en-fr.bin'),
                { idempotent: true },
            );
            expect(AsyncStorage.setItem).toHaveBeenCalledWith(
                expect.any(String),
                JSON.stringify(['en-de']),
            );
        });
    });

    describe('loadModel — heartbeat gating', () => {
        it('should throw ModelsLockedError when license revoked', async () => {
            (heartbeatService.getStatus as jest.Mock).mockReturnValue({ status: 'revoked' });
            await expect(pairManager.loadModel('en-fr')).rejects.toThrow('License has been revoked');
        });

        it('should throw ModelsLockedError when grace expired', async () => {
            (heartbeatService.getStatus as jest.Mock).mockReturnValue({ status: 'locked' });
            await expect(pairManager.loadModel('en-fr')).rejects.toThrow('Offline grace period expired');
        });

        it('should allow loading during grace period', async () => {
            (heartbeatService.getStatus as jest.Mock).mockReturnValue({
                status: 'grace',
                graceRemainingLabel: '5d',
            });
            (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
            (FileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('encrypted-data');

            const result = await pairManager.loadModel('en-fr');
            expect(result).toBeDefined();
        });
    });

    describe('getStorageInfo', () => {
        it('should return storage info with per-pair sizes', async () => {
            (AsyncStorage.getItem as jest.Mock).mockReset();
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(['en-fr']));
            (FileSystem.getInfoAsync as jest.Mock).mockReset();
            (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 52_428_800 });
            (FileSystem.getFreeDiskStorageAsync as jest.Mock).mockResolvedValue(10_000_000_000);

            const info = await pairManager.getStorageInfo();
            expect(info.usedBytes).toBe(52_428_800);
            expect(info.freeBytes).toBe(10_000_000_000);
            expect(info.pairs).toHaveLength(1);
            expect(info.pairs[0].id).toBe('en-fr');
            expect(info.pairs[0].sizeMB).toBe(50);
        });
    });

    describe('getOfflineQueue', () => {
        it('should return empty array when no queue', async () => {
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
            expect(await pairManager.getOfflineQueue()).toEqual([]);
        });

        it('should parse and validate queue items', async () => {
            (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
                JSON.stringify([
                    { id: 'en-fr', cdnUrl: 'https://cdn.example.com/en-fr.bin' },
                    { invalid: true }, // should be filtered
                ]),
            );
            const queue = await pairManager.getOfflineQueue();
            expect(queue).toHaveLength(1);
            expect(queue[0].id).toBe('en-fr');
        });
    });

    describe('downloadBundle', () => {
        it('should track successes and failures independently', async () => {
            // First pair: file exists (success)
            // Second pair: invalid URL (failure)
            (FileSystem.getInfoAsync as jest.Mock)
                .mockResolvedValueOnce({ exists: true }) // ensureDir
                .mockResolvedValueOnce({ exists: true, size: 100 }); // first pair exists

            const result = await pairManager.downloadBundle([
                { id: 'en-fr', cdnUrl: 'https://cdn.example.com/en-fr.bin' },
                { id: 'bad', cdnUrl: 'not-a-url' },
            ]);

            expect(result.success).toContain('en-fr');
            expect(result.failed).toContain('bad');
        });
    });
});
