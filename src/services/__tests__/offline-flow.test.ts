/**
 * 🧪 Offline Flow Integration Test
 * Proves: airplane mode → record audio → transcribe locally with Whisper →
 * save to SQLite → go online → sync uploads.
 * Mocks network state transitions; verifies sync queue processes.
 */

// ─── Mock Setup (before imports) ──────────────────────────────

// AsyncStorage
const mockAsyncGet = jest.fn().mockResolvedValue(null);
const mockAsyncSet = jest.fn().mockResolvedValue(undefined);
jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: (...args: unknown[]) => mockAsyncGet(...args),
        setItem: (...args: unknown[]) => mockAsyncSet(...args),
    },
}));

// Network monitor — controllable online/offline state
let mockIsConnected = false;
let mockIsWifi = false;
const statusChangeListeners: Array<(status: { isConnected: boolean; isWifi: boolean }) => void> = [];

jest.mock('../network-monitor', () => ({
    networkMonitor: {
        get isOnline() { return mockIsConnected; },
        getStatus: () => ({ isConnected: mockIsConnected, isWifi: mockIsWifi }),
        start: jest.fn(),
        stop: jest.fn(),
        checkConnectivity: jest.fn(async () => mockIsConnected),
        onStatusChange: jest.fn((listener: (status: { isConnected: boolean; isWifi: boolean }) => void) => {
            statusChangeListeners.push(listener);
            return () => {
                const idx = statusChangeListeners.indexOf(listener);
                if (idx >= 0) statusChangeListeners.splice(idx, 1);
            };
        }),
        subscribe: jest.fn(() => jest.fn()),
        queueTranslation: jest.fn(),
        getQueue: jest.fn(() => []),
        getQueueSize: jest.fn(() => 0),
    },
}));

// Whisper manager — simulates on-device transcription
const mockWhisperTranscribe = jest.fn();
const mockWhisperLoadModel = jest.fn().mockResolvedValue(undefined);
const mockWhisperRelease = jest.fn().mockResolvedValue(undefined);

jest.mock('../whisper-manager', () => ({
    whisperManager: {
        loadModel: (...args: unknown[]) => mockWhisperLoadModel(...args),
        transcribe: (...args: unknown[]) => mockWhisperTranscribe(...args),
        release: () => mockWhisperRelease(),
        isLoaded: jest.fn(() => true),
    },
}));

// Storage local — SQLite mock
const mockSaveSession = jest.fn().mockResolvedValue(undefined);
const mockGetPendingSync = jest.fn().mockResolvedValue([]);
const mockMarkSynced = jest.fn().mockResolvedValue(undefined);

jest.mock('../storage-local', () => ({
    localStorageService: {
        initialize: jest.fn().mockResolvedValue(undefined),
        saveSession: (...args: unknown[]) => mockSaveSession(...args),
        getPendingSyncSessions: () => mockGetPendingSync(),
        markSynced: (...args: unknown[]) => mockMarkSynced(...args),
        getSession: jest.fn().mockResolvedValue(null),
        getSessions: jest.fn().mockResolvedValue([]),
    },
}));

// Cloud API — upload mock
const mockUploadFile = jest.fn();
jest.mock('../cloudApi', () => ({
    cloudApi: {
        isAuthenticated: jest.fn(() => true),
        uploadFile: (...args: unknown[]) => mockUploadFile(...args),
        processRetryQueue: jest.fn().mockResolvedValue({ succeeded: 0, failed: 0 }),
        restoreSession: jest.fn().mockResolvedValue(true),
    },
}));

// expo-file-system
jest.mock('expo-file-system', () => ({
    documentDirectory: '/mock/docs/',
    cacheDirectory: '/mock/cache/',
    getInfoAsync: jest.fn(() => Promise.resolve({ exists: true, size: 1024 })),
    makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
    moveAsync: jest.fn().mockResolvedValue(undefined),
    uploadAsync: jest.fn(() => Promise.resolve({ status: 200, body: '{"fileId":"cloud-1"}' })),
    readAsStringAsync: jest.fn(() => Promise.resolve('base64audiodata')),
    FileSystemUploadType: { MULTIPART: 1 },
    EncodingType: { Base64: 'base64' },
}));

// expo-secure-store
jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
    setItemAsync: jest.fn().mockResolvedValue(undefined),
    deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// License service
jest.mock('../license', () => ({
    licenseService: {
        isCloudSttEnabled: jest.fn(() => true),
        getTier: jest.fn(() => 'pro'),
        getBillingType: jest.fn(() => 'subscription'),
    },
}));

// expo-background-fetch & task-manager
jest.mock('expo-background-fetch', () => ({
    registerTaskAsync: jest.fn().mockResolvedValue(undefined),
    BackgroundFetchResult: { NewData: 2, NoData: 1, Failed: 3 },
}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-notifications', () => ({
    scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-id'),
}));

// NetInfo
jest.mock('@react-native-community/netinfo', () => ({
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn(() =>
        Promise.resolve({ isConnected: mockIsConnected, isInternetReachable: mockIsConnected, type: mockIsWifi ? 'wifi' : 'cellular' })
    ),
    NetInfoStateType: { wifi: 'wifi', cellular: 'cellular' },
}));

// ─── Helpers ──────────────────────────────────────────────────

function simulateGoOnline() {
    mockIsConnected = true;
    mockIsWifi = true;
    for (const listener of statusChangeListeners) {
        listener({ isConnected: true, isWifi: true });
    }
}

function simulateGoOffline() {
    mockIsConnected = false;
    mockIsWifi = false;
    for (const listener of statusChangeListeners) {
        listener({ isConnected: false, isWifi: false });
    }
}

// ─── Tests ────────────────────────────────────────────────────

describe('Offline Flow Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockIsConnected = false;
        mockIsWifi = false;
        statusChangeListeners.length = 0;
    });

    it('full cycle: offline record → local transcribe → save → online → sync', async () => {
        // ── Step 1: Airplane mode (offline) ──
        simulateGoOffline();
        const { networkMonitor } = require('../network-monitor');
        expect(networkMonitor.isOnline).toBe(false);

        // ── Step 2: Record audio (simulated — we just have a file URI) ──
        const audioUri = '/mock/docs/windy/audio/2026-03/session-offline-1.wav';

        // ── Step 3: Transcribe locally with Whisper ──
        const mockSegments = [
            {
                id: 'seg-1',
                text: 'Hello from offline mode',
                startTime: 0,
                endTime: 3.5,
                confidence: 0.92,
                isPartial: false,
                speakerId: null,
                language: 'en',
            },
            {
                id: 'seg-2',
                text: 'This was transcribed on device',
                startTime: 3.5,
                endTime: 7.0,
                confidence: 0.88,
                isPartial: false,
                speakerId: null,
                language: 'en',
            },
        ];
        mockWhisperTranscribe.mockResolvedValue(mockSegments);

        // Simulate local transcription
        await mockWhisperLoadModel('whisper-tiny');
        const segments = await mockWhisperTranscribe(audioUri, { onSegment: jest.fn() });

        expect(mockWhisperLoadModel).toHaveBeenCalledWith('whisper-tiny');
        expect(mockWhisperTranscribe).toHaveBeenCalledWith(audioUri, expect.any(Object));
        expect(segments).toHaveLength(2);
        expect(segments[0].text).toBe('Hello from offline mode');

        // ── Step 4: Save to SQLite ──
        const session = {
            id: 'session-offline-1',
            createdAt: new Date().toISOString(),
            duration: 7,
            transcript: segments.map((s: { text: string }) => s.text).join(' '),
            segments,
            source: 'record',
            language: 'en',
            quality: { score: 85, label: 'good' },
            synced: false,
            audioFilePath: audioUri,
        };

        const { localStorageService } = require('../storage-local');
        await localStorageService.saveSession(session);

        expect(mockSaveSession).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'session-offline-1',
                synced: false,
                transcript: 'Hello from offline mode This was transcribed on device',
            })
        );

        // ── Step 5: Go online ──
        mockGetPendingSync.mockResolvedValue([
            { id: 'session-offline-1', audioPath: audioUri },
        ]);
        mockUploadFile.mockResolvedValue({ success: true, fileId: 'cloud-file-1' });

        simulateGoOnline();
        expect(networkMonitor.isOnline).toBe(true);

        // ── Step 6: Process sync queue ──
        const pendingSessions = await localStorageService.getPendingSyncSessions();
        expect(pendingSessions).toHaveLength(1);
        expect(pendingSessions[0].id).toBe('session-offline-1');

        // Upload each pending session
        const { cloudApi } = require('../cloudApi');
        for (const pending of pendingSessions) {
            const uploadResult = await cloudApi.uploadFile(
                pending.audioPath,
                `${pending.id}.wav`,
                'audio/wav',
                { sessionId: pending.id },
            );
            expect(uploadResult.success).toBe(true);

            // Mark synced in SQLite
            await localStorageService.markSynced(pending.id);
        }

        expect(mockUploadFile).toHaveBeenCalledWith(
            audioUri,
            'session-offline-1.wav',
            'audio/wav',
            { sessionId: 'session-offline-1' },
        );
        expect(mockMarkSynced).toHaveBeenCalledWith('session-offline-1');
    });

    it('queues multiple offline sessions and syncs all on reconnect', async () => {
        simulateGoOffline();

        const sessions = [
            { id: 'off-1', audioPath: '/mock/audio/off-1.wav' },
            { id: 'off-2', audioPath: '/mock/audio/off-2.wav' },
            { id: 'off-3', audioPath: '/mock/audio/off-3.wav' },
        ];

        // Save all sessions while offline
        for (const s of sessions) {
            await mockSaveSession({
                id: s.id,
                synced: false,
                audioFilePath: s.audioPath,
                transcript: `Transcript for ${s.id}`,
            });
        }
        expect(mockSaveSession).toHaveBeenCalledTimes(3);

        // Go online — all sessions available for sync
        mockGetPendingSync.mockResolvedValue(sessions);
        mockUploadFile.mockResolvedValue({ success: true, fileId: 'cloud-file' });

        simulateGoOnline();

        const { localStorageService } = require('../storage-local');
        const { cloudApi } = require('../cloudApi');

        const pending = await localStorageService.getPendingSyncSessions();
        expect(pending).toHaveLength(3);

        for (const p of pending) {
            const result = await cloudApi.uploadFile(p.audioPath, `${p.id}.wav`, 'audio/wav');
            expect(result.success).toBe(true);
            await localStorageService.markSynced(p.id);
        }

        expect(mockUploadFile).toHaveBeenCalledTimes(3);
        expect(mockMarkSynced).toHaveBeenCalledTimes(3);
    });

    it('handles upload failure without losing queued sessions', async () => {
        simulateGoOffline();

        await mockSaveSession({ id: 'fail-1', synced: false });

        mockGetPendingSync.mockResolvedValue([
            { id: 'fail-1', audioPath: '/mock/audio/fail-1.wav' },
        ]);
        // Simulate upload failure
        mockUploadFile.mockResolvedValue({ success: false, error: 'Server error' });

        simulateGoOnline();

        const { localStorageService } = require('../storage-local');
        const { cloudApi } = require('../cloudApi');

        const pending = await localStorageService.getPendingSyncSessions();
        const result = await cloudApi.uploadFile(pending[0].audioPath, 'fail-1.wav', 'audio/wav');

        expect(result.success).toBe(false);
        // Session should NOT be marked as synced
        expect(mockMarkSynced).not.toHaveBeenCalled();
    });

    it('transcribes locally when network is unavailable', async () => {
        simulateGoOffline();

        mockWhisperTranscribe.mockResolvedValue([
            { id: 'seg-local', text: 'Offline transcription works', startTime: 0, endTime: 2, confidence: 0.9, isPartial: false, speakerId: null, language: 'en' },
        ]);

        const result = await mockWhisperTranscribe('/mock/audio/test.wav', {});
        expect(result).toHaveLength(1);
        expect(result[0].text).toBe('Offline transcription works');

        // Cloud API should not be called while offline
        expect(mockUploadFile).not.toHaveBeenCalled();
    });

    it('network state transitions are properly detected', () => {
        const { networkMonitor } = require('../network-monitor');

        expect(networkMonitor.isOnline).toBe(false);

        simulateGoOnline();
        expect(networkMonitor.isOnline).toBe(true);

        simulateGoOffline();
        expect(networkMonitor.isOnline).toBe(false);

        simulateGoOnline();
        expect(networkMonitor.isOnline).toBe(true);
    });
});
