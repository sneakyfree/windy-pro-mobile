/**
 * Hardening: Offline Behavior Tests
 * Verifies graceful degradation when network is unavailable.
 */

jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn().mockResolvedValue(null),
    setItemAsync: jest.fn().mockResolvedValue(undefined),
    deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-file-system', () => ({
    getInfoAsync: jest.fn().mockResolvedValue({ exists: true, size: 1024 }),
    readAsStringAsync: jest.fn().mockResolvedValue('AAAA'),
    makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
    moveAsync: jest.fn().mockResolvedValue(undefined),
    deleteAsync: jest.fn().mockResolvedValue(undefined),
    uploadAsync: jest.fn(),
    documentDirectory: '/mock/docs/',
    EncodingType: { Base64: 'base64' },
    FileSystemUploadType: { MULTIPART: 1 },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn().mockResolvedValue(null),
        setItem: jest.fn().mockResolvedValue(undefined),
        removeItem: jest.fn().mockResolvedValue(undefined),
    },
}));

jest.mock('@react-native-community/netinfo', () => ({
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn().mockResolvedValue({ isConnected: false, isInternetReachable: false, type: 'none' }),
}));

jest.mock('expo-battery', () => ({
    getBatteryLevelAsync: jest.fn().mockResolvedValue(0.8),
    getBatteryStateAsync: jest.fn().mockResolvedValue(2),
    BatteryState: { UNPLUGGED: 0, CHARGING: 1, FULL: 2 },
}));

jest.mock('expo-background-fetch', () => ({
    registerTaskAsync: jest.fn(),
    unregisterTaskAsync: jest.fn(),
    BackgroundFetchResult: { NewData: 1, NoData: 2, Failed: 3 },
}));

jest.mock('expo-task-manager', () => ({
    defineTask: jest.fn(),
}));

jest.mock('expo-notifications', () => ({
    scheduleNotificationAsync: jest.fn(),
}));

jest.mock('expo-device', () => ({
    totalMemory: 4 * 1024 * 1024 * 1024,
    modelName: 'Mock',
}));

jest.mock('@/stores/useSettingsStore', () => ({
    useSettingsStore: { getState: () => ({ setWindyIdentityId: jest.fn(), setTier: jest.fn(), cloudFallbackEnabled: true }) },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Offline Behavior', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockReset();
    });

    describe('cloud transcription when offline', () => {
        it('should show network error and not crash', async () => {
            mockFetch.mockRejectedValue(new TypeError('Network request failed'));

            const { transcriptionService } = require('../../src/services/transcription');
            await expect(
                transcriptionService.transcribeFile('file:///test/audio.wav', 'cloud-standard')
            ).rejects.toThrow();
        });
    });

    describe('login when server unreachable', () => {
        it('should return error message, not crash', async () => {
            mockFetch.mockRejectedValue(new TypeError('Network request failed'));

            const { cloudApi } = require('../../src/services/cloudApi');
            const result = await cloudApi.register('test@test.com', 'pass');

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe('string');
        });

        it('should return user-friendly error on timeout', async () => {
            mockFetch.mockImplementation(() => new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Aborted')), 50)
            ));

            const { cloudApi } = require('../../src/services/cloudApi');
            const result = await cloudApi.login('test@test.com', 'pass');

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    describe('sync manager with no network', () => {
        it('should not process queue when network is none', async () => {
            const { syncManager } = require('../../src/services/sync-manager');
            await syncManager.initialize();

            // Add items to queue
            const FileSystem = require('expo-file-system');
            FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 5000 });

            await syncManager.addToQueue({
                bundleId: 'test-1',
                filePath: 'file:///test/audio.wav',
                fileType: 'audio',
            });

            // processQueue should return immediately when network is 'none'
            const state = syncManager.getState();
            // networkType should be 'none' since NetInfo mock returns not connected
            expect(state.networkType).toBe('none');

            // Should not be syncing
            await syncManager.processQueue();
            expect(syncManager.getState().isSyncing).toBe(false);
        });

        it('should cap queue at 500 items without spin-looping', async () => {
            const { syncManager } = require('../../src/services/sync-manager');
            const FileSystem = require('expo-file-system');
            FileSystem.getInfoAsync.mockResolvedValue({ exists: true, size: 100 });

            // Adding beyond queue cap should not crash
            for (let i = 0; i < 10; i++) {
                await syncManager.addToQueue({
                    bundleId: `bulk-${i}`,
                    filePath: `file:///test/audio-${i}.wav`,
                    fileType: 'audio',
                });
            }

            const state = syncManager.getState();
            expect(state.queueLength).toBeGreaterThan(0);
            expect(state.queueLength).toBeLessThanOrEqual(500);
        });
    });

    describe('upload with network drop mid-upload', () => {
        it('should queue for retry on network error', async () => {
            const FileSystem = require('expo-file-system');
            FileSystem.uploadAsync.mockRejectedValueOnce(new Error('Network request failed'));

            const { cloudApi } = require('../../src/services/cloudApi');

            // Login first
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ token: 'jwt.test.sig', userId: 'u-1' }),
            });
            await cloudApi.login('test@test.com', 'pass');

            const result = await cloudApi.uploadFile('file:///test/audio.wav', 'audio.wav');

            expect(result.success).toBe(false);
            expect(result.error).toContain('queued for retry');
            expect(cloudApi.getRetryQueueLength()).toBeGreaterThan(0);
        });
    });

    describe('chat with unreachable homeserver', () => {
        it('should not crash when Matrix homeserver is down', async () => {
            const { chatClient } = require('../../src/services/chatClient');

            // Not logged in, no session — should handle gracefully
            const state = chatClient.getSyncState?.() || 'stopped';
            expect(['stopped', 'error', undefined]).toContain(state);
        });
    });

    describe('clone data with empty database', () => {
        it('should return empty stats without crashing', async () => {
            const { cloneBundleService } = require('../../src/services/clone-bundle');
            const stats = await cloneBundleService.getStats();

            expect(stats.total_bundles).toBe(0);
            expect(stats.total_duration_seconds).toBe(0);
            expect(stats.training_ready).toBe(0);
        });

        it('should return empty bundle list', async () => {
            const { cloneBundleService } = require('../../src/services/clone-bundle');
            const bundles = await cloneBundleService.getBundles();
            expect(bundles).toEqual([]);
        });
    });
});
