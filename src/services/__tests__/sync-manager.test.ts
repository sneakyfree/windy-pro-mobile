/**
 * SyncManager Unit Tests
 * Tests: settings, queue priority, duplicates, state, cleanup
 */

// Mock dependencies BEFORE importing anything
jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('@react-native-community/netinfo', () => ({
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn(() =>
        Promise.resolve({ isConnected: true, isInternetReachable: true, type: 'wifi' })
    ),
    NetInfoStateType: { wifi: 'wifi', cellular: 'cellular', ethernet: 'ethernet' },
}));

jest.mock('expo-file-system', () => ({
    getInfoAsync: jest.fn(() => Promise.resolve({ exists: true, size: 1024 })),
    uploadAsync: jest.fn(() => Promise.resolve({ status: 200, body: '{}' })),
    readAsStringAsync: jest.fn(() => Promise.resolve('base64data')),
    FileSystemUploadType: { MULTIPART: 1 },
    EncodingType: { Base64: 'base64' },
}));

jest.mock('expo-background-fetch', () => ({
    registerTaskAsync: jest.fn(() => Promise.resolve()),
    BackgroundFetchResult: { NewData: 2, NoData: 1, Failed: 3 },
}));

jest.mock('expo-task-manager', () => ({
    defineTask: jest.fn(),
}));

jest.mock('expo-notifications', () => ({
    scheduleNotificationAsync: jest.fn(() => Promise.resolve('notif-id')),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';

describe('SyncManager', () => {
    let syncManager: any;

    beforeEach(() => {
        jest.clearAllMocks();
        (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
        (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

        // Get a fresh module each test
        jest.isolateModules(() => {
            const mod = require('../sync-manager');
            syncManager = mod.syncManager;
        });
    });

    describe('Settings', () => {
        it('has correct default settings', () => {
            const settings = syncManager.getSettings();
            expect(settings.auto_sync).toBe(true);
            expect(settings.sync_on_cellular).toBe(false);
            expect(settings.sync_wifi_only_threshold).toBe(5242880);
        });

        it('persists settings updates', async () => {
            await syncManager.updateSettings({ sync_on_cellular: true });
            expect(AsyncStorage.setItem).toHaveBeenCalledWith(
                'windy-sync-settings',
                expect.stringContaining('"sync_on_cellular":true')
            );
        });
    });

    describe('Queue Management', () => {
        it('adds items to queue with correct priority', async () => {
            await syncManager.initialize();

            await syncManager.addToQueue({
                bundleId: 'test-1',
                filePath: '/test/audio.m4a',
                fileType: 'audio',
            });

            const queue = syncManager.getQueue();
            expect(queue.length).toBe(1);
            expect(queue[0].priority).toBe('medium');
            expect(queue[0].bundle_id).toBe('test-1');
            expect(queue[0].status).toBe('queued');
        });

        it('assigns correct priority: transcript=high, audio=medium, video=low', async () => {
            await syncManager.initialize();

            await syncManager.addToQueue({ bundleId: 't1', filePath: '/t.json', fileType: 'transcript' });
            await syncManager.addToQueue({ bundleId: 't1', filePath: '/a.m4a', fileType: 'audio' });
            await syncManager.addToQueue({ bundleId: 't1', filePath: '/v.mp4', fileType: 'video' });

            const queue = syncManager.getQueue();
            expect(queue.find((q: any) => q.file_type === 'transcript')?.priority).toBe('high');
            expect(queue.find((q: any) => q.file_type === 'audio')?.priority).toBe('medium');
            expect(queue.find((q: any) => q.file_type === 'video')?.priority).toBe('low');
        });
    });

    describe('State', () => {
        it('reports correct initial state', () => {
            const state = syncManager.getState();
            expect(state.isSyncing).toBe(false);
            expect(state.queueLength).toBe(0);
            expect(state.pendingCount).toBe(0);
            expect(state.settings.auto_sync).toBe(true);
        });

        it('notifies listeners on settings change', async () => {
            const listener = jest.fn();
            syncManager.onStateChange(listener);
            await syncManager.updateSettings({ sync_on_cellular: true });
            expect(listener).toHaveBeenCalled();
        });
    });

    describe('Cleanup', () => {
        it('clears completed items from queue', async () => {
            // Pre-populate with mixed statuses
            (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
                JSON.stringify([
                    { id: '1', status: 'completed', bundle_id: 'b1', file_type: 'audio', file_size: 100, priority: 'medium', progress: 100, bytes_uploaded: 100, total_bytes: 100, chunk_index: 0, created_at: '', last_attempt: null, error: null, retry_count: 0, metadata: {}, file_path: '/a' },
                    { id: '2', status: 'queued', bundle_id: 'b2', file_type: 'audio', file_size: 100, priority: 'medium', progress: 0, bytes_uploaded: 0, total_bytes: 100, chunk_index: 0, created_at: '', last_attempt: null, error: null, retry_count: 0, metadata: {}, file_path: '/b' },
                ])
            );

            await syncManager.initialize();
            expect(syncManager.getQueue().length).toBe(2);

            await syncManager.clearCompleted();
            const queue = syncManager.getQueue();
            expect(queue.length).toBe(1);
            expect(queue[0].status).toBe('queued');
        });

        it('clears all items', async () => {
            await syncManager.initialize();
            await syncManager.addToQueue({ bundleId: 'b1', filePath: '/a.m4a', fileType: 'audio' });
            expect(syncManager.getQueue().length).toBe(1);

            await syncManager.clearAll();
            expect(syncManager.getQueue().length).toBe(0);
        });
    });
});
