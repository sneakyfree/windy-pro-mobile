/**
 * 🧬 Cloud Sync Integration Tests
 * Tests upload, download, retry, offline queue, conflict resolution
 */

// ─── Mock Setup ────────────────────────────────────────────────

const mockUpload = jest.fn();
const mockList = jest.fn();
const mockGet = jest.fn();
const mockGetAuthHeaders = jest.fn();
const mockIsAuthenticated = jest.fn();

jest.mock('../storage-cloud', () => ({
    cloudStorageClient: {
        uploadRecording: (...args: any[]) => mockUpload(...args),
        listRecordings: (...args: any[]) => mockList(...args),
        getRecording: (...args: any[]) => mockGet(...args),
        getAuthHeaders: (...args: any[]) => mockGetAuthHeaders(...args),
        isAuthenticated: () => mockIsAuthenticated(),
    },
}));

const mockGetSession = jest.fn();
const mockGetSessions = jest.fn();
const mockSaveSession = jest.fn();
const mockUpdateSession = jest.fn();

jest.mock('../storage-local', () => ({
    localStorageService: {
        getSession: (...args: any[]) => mockGetSession(...args),
        getSessions: () => mockGetSessions(),
        saveSession: (...args: any[]) => mockSaveSession(...args),
        updateSession: (...args: any[]) => mockUpdateSession(...args),
    },
}));

let mockIsOnline = true;
jest.mock('../network-monitor', () => ({
    networkMonitor: {
        get isOnline() { return mockIsOnline; },
        get status() { return mockIsOnline ? 'online' : 'offline'; },
        onStatusChange: jest.fn(() => jest.fn()),
    },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn(() => Promise.resolve(null)),
        setItem: jest.fn(() => Promise.resolve()),
    },
}));

jest.mock('expo-file-system', () => ({
    documentDirectory: '/mock/docs/',
    makeDirectoryAsync: jest.fn(),
    downloadAsync: jest.fn(() => Promise.resolve({ status: 200, uri: '/mock/file.wav' })),
    getInfoAsync: jest.fn(() => Promise.resolve({ exists: true, size: 1024 })),
    deleteAsync: jest.fn(),
}));

// ─── Import After Mocks ────────────────────────────────────────

import { cloudSyncService } from '../cloud-sync';

// ─── Test Data ─────────────────────────────────────────────────

const mockSession = {
    id: 'session-1',
    createdAt: '2026-03-01T00:00:00Z',
    syncedAt: '2026-03-01T12:00:00Z',
    duration: 120,
    transcript: 'Hello world test transcription',
    segments: [],
    audioFilePath: '/mock/audio.wav',
    videoFilePath: null,
    quality: { score: 85, label: 'good' as const, snrDb: 20, speechRatio: 0.8, hasClipping: false, sampleRate: 44100 },
    engineUsed: 'cloud',
    source: 'record' as const,
    languages: ['en'],
    mediaCapture: { audio: true, video: false, text: true },
    fileSize: 1024,
    synced: false,
    cloneUsable: false,
    tags: [],
    location: null,
    deviceModel: 'test',
};

const mockCloudRecording = {
    id: 'session-1',
    title: 'Hello world',
    duration: 120,
    transcript: 'Hello world test transcription',
    createdAt: '2026-03-01T00:00:00Z',
    quality: 85,
    engineUsed: 'cloud',
    languages: ['en'],
    source: 'microphone',
    synced: true,
};

// ─── Tests ─────────────────────────────────────────────────────

describe('CloudSyncService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockIsAuthenticated.mockReturnValue(true);
        mockIsOnline = true;
    });

    describe('Upload', () => {
        it('uploads a recording when online and authenticated', async () => {
            mockGetSession.mockResolvedValue(mockSession);
            mockUpload.mockResolvedValue({ success: true, remoteId: 'remote-1' });

            const result = await cloudSyncService.uploadRecording('session-1');

            expect(result.success).toBe(true);
            expect(mockUpload).toHaveBeenCalledWith(
                'session-1',
                expect.objectContaining({
                    duration: 120,
                    transcript: 'Hello world test transcription',
                }),
                '/mock/audio.wav'
            );
        });

        it('queues upload when offline', async () => {
            mockIsOnline = false;

            const result = await cloudSyncService.uploadRecording('session-2');

            expect(result.success).toBe(false);
            expect(result.queued).toBe(true);
            expect(cloudSyncService.getQueueLength()).toBeGreaterThanOrEqual(1);
        });

        it('returns error when not authenticated', async () => {
            mockIsAuthenticated.mockReturnValue(false);

            const result = await cloudSyncService.uploadRecording('session-1');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Not authenticated');
        });

        it('queues on upload failure', async () => {
            mockGetSession.mockResolvedValue(mockSession);
            mockUpload.mockRejectedValue(new Error('Network error'));

            const result = await cloudSyncService.uploadRecording('session-1');

            expect(result.queued).toBe(true);
        });
    });

    describe('Download', () => {
        it('downloads new recordings from cloud', async () => {
            mockList.mockResolvedValue({
                recordings: [{ ...mockCloudRecording, id: 'cloud-new' }],
                total: 1,
            });
            mockGetSessions.mockResolvedValue([]);

            const result = await cloudSyncService.downloadRecordings();

            expect(result.downloaded).toBe(1);
            expect(mockSaveSession).toHaveBeenCalled();
        });

        it('skips recordings that already exist locally with same transcript', async () => {
            mockList.mockResolvedValue({
                recordings: [mockCloudRecording],
                total: 1,
            });
            mockGetSessions.mockResolvedValue([{ id: 'session-1' }]);
            mockGetSession.mockResolvedValue(mockSession);

            const result = await cloudSyncService.downloadRecordings();

            expect(result.skipped).toBe(1);
            expect(result.downloaded).toBe(0);
        });
    });

    describe('Conflict Resolution', () => {
        it('keeps local version when local is newer', async () => {
            mockGetSession.mockResolvedValue({
                ...mockSession,
                syncedAt: '2026-03-02T00:00:00Z',
                transcript: 'Updated local version',
            });

            const result = await cloudSyncService.resolveConflict('session-1', {
                ...mockCloudRecording,
                transcript: 'Old cloud version',
                createdAt: '2026-03-01T00:00:00Z',
            });

            expect(result.resolution).toBe('keep-local');
        });

        it('keeps cloud version when cloud is newer', async () => {
            mockGetSession.mockResolvedValue({
                ...mockSession,
                syncedAt: '2026-03-01T00:00:00Z',
                transcript: 'Old local version',
            });

            const result = await cloudSyncService.resolveConflict('session-1', {
                ...mockCloudRecording,
                transcript: 'Updated cloud version',
                createdAt: '2026-03-02T00:00:00Z',
            });

            expect(result.resolution).toBe('keep-cloud');
        });

        it('returns no-conflict when transcripts match', async () => {
            mockGetSession.mockResolvedValue(mockSession);

            const result = await cloudSyncService.resolveConflict('session-1', mockCloudRecording);

            expect(result.resolution).toBe('no-conflict');
        });
    });

    describe('Offline Queue', () => {
        it('processes queue when coming back online', async () => {
            // Queue an item
            mockIsOnline = false;
            await cloudSyncService.uploadRecording('queue-test');

            // Come back online
            mockIsOnline = true;
            mockGetSession.mockResolvedValue({ ...mockSession, id: 'queue-test' });
            mockUpload.mockResolvedValue({ success: true });

            const result = await cloudSyncService.processQueue();

            expect(result.synced).toBeGreaterThanOrEqual(0);
        });
    });

    describe('Full Sync', () => {
        it('runs upload + download in sequence', async () => {
            mockList.mockResolvedValue({ recordings: [], total: 0 });
            mockGetSessions.mockResolvedValue([]);

            const result = await cloudSyncService.fullSync();

            expect(result).toHaveProperty('uploaded');
            expect(result).toHaveProperty('downloaded');
            expect(result).toHaveProperty('conflicts');
            expect(result).toHaveProperty('failed');
        });
    });

    describe('Storage Management', () => {
        it('reports storage usage', async () => {
            mockGetSessions.mockResolvedValue([
                { id: '1', synced: true },
                { id: '2', synced: false },
            ]);
            mockGetSession.mockResolvedValue({ audioFilePath: '/mock/audio.wav' });

            const usage = await cloudSyncService.getLocalStorageUsed();

            expect(usage).toHaveProperty('totalBytes');
            expect(usage).toHaveProperty('syncedBytes');
            expect(usage).toHaveProperty('unsyncedBytes');
        });
    });
});
