/**
 * Tests for storage-local.ts — SQLite persistence layer
 */

// ── Mocks ─────────────────────────────────────────────────────

const mockExecAsync = jest.fn();
const mockRunAsync = jest.fn();
const mockGetAllAsync = jest.fn().mockResolvedValue([]);
const mockGetFirstAsync = jest.fn().mockResolvedValue(null);

jest.mock('expo-sqlite', () => ({
    openDatabaseAsync: jest.fn(async () => ({
        execAsync: mockExecAsync,
        runAsync: mockRunAsync,
        getAllAsync: mockGetAllAsync,
        getFirstAsync: mockGetFirstAsync,
    })),
}));

jest.mock('expo-file-system', () => ({
    documentDirectory: '/mock/documents/',
    makeDirectoryAsync: jest.fn(),
    moveAsync: jest.fn(),
    deleteAsync: jest.fn(),
    getInfoAsync: jest.fn(async () => ({ exists: true, size: 1024 })),
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

jest.mock('@/stores/useSettingsStore', () => ({
    useSettingsStore: {
        getState: () => ({ syncEnabled: false }),
    },
}));

import { localStorageService } from '../storage-local';
import * as FileSystem from 'expo-file-system';
import type { Session } from '@/types';

// ── Helpers ───────────────────────────────────────────────────

function makeSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'test-session-1',
        createdAt: '2026-03-29T12:00:00Z',
        duration: 120,
        transcript: 'Hello world test transcript',
        segments: [],
        audioFilePath: '/tmp/test.wav',
        videoFilePath: null,
        quality: { score: 75, label: 'good', snrDb: 30, speechRatio: 0.8, hasClipping: false, sampleRate: 44100 },
        engineUsed: 'cloud-standard',
        source: 'record',
        languages: ['en'],
        mediaCapture: { audio: true, video: false, text: true },
        fileSize: 1024,
        synced: false,
        syncedAt: null,
        cloneUsable: false,
        tags: [],
        location: null,
        deviceModel: 'iPhone 15',
        ...overrides,
    } as Session;
}

// ── Tests ─────────────────────────────────────────────────────

describe('LocalStorageService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('initialize', () => {
        it('should open database and create tables on first call', async () => {
            await localStorageService.initialize();
            // execAsync is called for CREATE_TABLES
            expect(mockExecAsync).toHaveBeenCalled();
        });

        it('should be idempotent on repeated calls', async () => {
            await localStorageService.initialize();
            const callCount = mockExecAsync.mock.calls.length;
            await localStorageService.initialize();
            expect(mockExecAsync.mock.calls.length).toBe(callCount);
        });
    });

    describe('saveSession', () => {
        it('should insert session into database', async () => {
            const session = makeSession();
            await localStorageService.saveSession(session);
            expect(mockRunAsync).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO sessions'),
                // 21 bind parameters (one per column)
                session.id,
                expect.any(String), // createdAt
                expect.any(Number), // duration
                expect.any(String), // transcript
                expect.any(String), // segments_json
                expect.any(String), // audio_path
                null,               // video_path
                expect.any(Number), // quality_score
                expect.any(String), // quality_json
                expect.any(String), // engine_used
                expect.any(String), // source
                expect.any(String), // languages_json
                expect.any(Number), // media_audio
                expect.any(Number), // media_video
                expect.any(Number), // file_size
                expect.any(Number), // synced
                expect.any(Number), // clone_usable
                expect.any(String), // tags_json
                null,               // latitude
                null,               // longitude
                'iPhone 15',        // device_model
            );
        });

        it('should move audio file to permanent location', async () => {
            const session = makeSession({ audioFilePath: '/tmp/recording.wav' });
            await localStorageService.saveSession(session);
            expect(FileSystem.moveAsync).toHaveBeenCalledWith(
                expect.objectContaining({
                    from: '/tmp/recording.wav',
                    to: expect.stringContaining('windy/audio/'),
                }),
            );
        });

        it('should handle missing audio file gracefully', async () => {
            (FileSystem.moveAsync as jest.Mock).mockRejectedValueOnce(new Error('File not found'));
            const session = makeSession();
            // Should not throw
            await expect(localStorageService.saveSession(session)).resolves.not.toThrow();
        });
    });

    describe('getSession', () => {
        it('should return null for non-existent session', async () => {
            mockGetFirstAsync.mockResolvedValueOnce(null);
            const result = await localStorageService.getSession('non-existent');
            expect(result).toBeNull();
        });

        it('should parse JSON fields correctly', async () => {
            mockGetFirstAsync.mockResolvedValueOnce({
                id: 'sess-1',
                created_at: '2026-03-29T12:00:00Z',
                duration: 60,
                transcript: 'test',
                segments_json: '[]',
                audio_path: '/mock/audio.wav',
                video_path: null,
                quality_score: 80,
                quality_json: '{"score":80,"label":"excellent"}',
                engine_used: 'cloud-standard',
                source: 'record',
                languages_json: '["en","fr"]',
                media_audio: 1,
                media_video: 0,
                file_size: 2048,
                synced: 0,
                synced_at: null,
                clone_usable: 0,
                tags_json: '["important"]',
                latitude: null,
                longitude: null,
                device_model: 'Pixel 8',
            });

            const session = await localStorageService.getSession('sess-1');
            expect(session).not.toBeNull();
            expect(session!.id).toBe('sess-1');
            expect(session!.languages).toEqual(['en', 'fr']);
            expect(session!.tags).toEqual(['important']);
            expect(session!.mediaCapture.audio).toBe(true);
            expect(session!.mediaCapture.video).toBe(false);
            expect(session!.deviceModel).toBe('Pixel 8');
        });

        it('should handle corrupt quality JSON', async () => {
            mockGetFirstAsync.mockResolvedValueOnce({
                id: 'sess-corrupt',
                created_at: '2026-03-29T12:00:00Z',
                duration: 30,
                transcript: '',
                segments_json: '[]',
                audio_path: null,
                video_path: null,
                quality_score: 50,
                quality_json: 'NOT VALID JSON',
                engine_used: 'cloud-standard',
                source: 'record',
                languages_json: '["en"]',
                media_audio: 1,
                media_video: 0,
                file_size: 0,
                synced: 0,
                synced_at: null,
                clone_usable: 0,
                tags_json: '[]',
                latitude: null,
                longitude: null,
                device_model: null,
            });

            const session = await localStorageService.getSession('sess-corrupt');
            expect(session).not.toBeNull();
            expect(session!.quality.score).toBe(50);
        });
    });

    describe('getSessions', () => {
        it('should return empty array when no sessions', async () => {
            mockGetAllAsync.mockResolvedValueOnce([]);
            const sessions = await localStorageService.getSessions();
            expect(sessions).toEqual([]);
        });

        it('should apply search filter', async () => {
            mockGetAllAsync.mockResolvedValueOnce([]);
            await localStorageService.getSessions({ searchQuery: 'hello' } as any);
            expect(mockGetAllAsync).toHaveBeenCalledWith(
                expect.stringContaining('transcript LIKE'),
                expect.arrayContaining(['%hello%']),
            );
        });

        it('should apply source filter', async () => {
            mockGetAllAsync.mockResolvedValueOnce([]);
            await localStorageService.getSessions({ source: 'import' } as any);
            expect(mockGetAllAsync).toHaveBeenCalledWith(
                expect.stringContaining('source = ?'),
                expect.arrayContaining(['import']),
            );
        });

        it('should apply quality filter', async () => {
            mockGetAllAsync.mockResolvedValueOnce([]);
            await localStorageService.getSessions({ minQuality: 60 } as any);
            expect(mockGetAllAsync).toHaveBeenCalledWith(
                expect.stringContaining('quality_score >= ?'),
                expect.arrayContaining([60]),
            );
        });
    });

    describe('deleteSession', () => {
        it('should delete session and associated files', async () => {
            mockGetFirstAsync.mockResolvedValueOnce({
                audio_path: '/mock/audio.wav',
                video_path: '/mock/video.mp4',
            });

            await localStorageService.deleteSession('sess-del');
            expect(FileSystem.deleteAsync).toHaveBeenCalledWith('/mock/audio.wav', { idempotent: true });
            expect(FileSystem.deleteAsync).toHaveBeenCalledWith('/mock/video.mp4', { idempotent: true });
            expect(mockRunAsync).toHaveBeenCalledWith(
                'DELETE FROM sessions WHERE id = ?',
                'sess-del',
            );
            expect(mockRunAsync).toHaveBeenCalledWith(
                'DELETE FROM sync_queue WHERE session_id = ?',
                'sess-del',
            );
        });

        it('should handle session with no files', async () => {
            mockGetFirstAsync.mockResolvedValueOnce(null);
            await expect(localStorageService.deleteSession('no-files')).resolves.not.toThrow();
        });
    });

    describe('markSynced', () => {
        it('should update session and sync queue', async () => {
            await localStorageService.markSynced('sess-sync');
            expect(mockRunAsync).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE sessions SET synced = 1'),
                expect.any(String),
                'sess-sync',
            );
            expect(mockRunAsync).toHaveBeenCalledWith(
                expect.stringContaining("UPDATE sync_queue SET status = 'done'"),
                'sess-sync',
            );
        });
    });

    describe('getStorageUsage', () => {
        it('should return storage breakdown', async () => {
            mockGetFirstAsync.mockResolvedValueOnce({ cnt: 5, total: 10240 });
            const usage = await localStorageService.getStorageUsage();
            expect(usage).toHaveProperty('audioBytes');
            expect(usage).toHaveProperty('videoBytes');
            expect(usage).toHaveProperty('totalBytes');
            expect(usage.sessionCount).toBe(5);
        });
    });

    describe('getSessionCount', () => {
        it('should return count from database', async () => {
            mockGetFirstAsync.mockResolvedValueOnce({ cnt: 42 });
            const count = await localStorageService.getSessionCount();
            expect(count).toBe(42);
        });

        it('should return 0 when no sessions', async () => {
            mockGetFirstAsync.mockResolvedValueOnce({ cnt: 0 });
            const count = await localStorageService.getSessionCount();
            expect(count).toBe(0);
        });
    });
});
