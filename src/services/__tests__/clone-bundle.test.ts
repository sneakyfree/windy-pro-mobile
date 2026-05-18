/**
 * Unit tests for clone-bundle.ts — voice-clone training bundle service.
 *
 * Covers:
 *   - createBundle: audio-only, audio+video, training_ready flag, replace-by-id,
 *                   file-size probing, unshift ordering
 *   - getBundles:   filter by hasVideo / syncStatus / trainingReady
 *   - getBundle:    lookup + miss
 *   - getStats:     aggregation (count, training-ready, synced/pending, byte sums)
 *   - uploadBundle: offline short-circuit, missing-bundle, happy path,
 *                   non-2xx failure, exception path, video upload triggered
 *                   only when bundle has video, sync_status state machine
 *   - deleteBundle: files deleted, bundle removed from list
 *
 * This module was 19.8% line-coverage pre-patch — the biggest gap in any
 * money / PII-touching service. GAP_ANALYSIS P2-7.
 */

const mockAsyncStorage: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn((k: string) => Promise.resolve(mockAsyncStorage[k] ?? null)),
        setItem: jest.fn((k: string, v: string) => {
            mockAsyncStorage[k] = v;
            return Promise.resolve();
        }),
        removeItem: jest.fn((k: string) => { delete mockAsyncStorage[k]; return Promise.resolve(); }),
    },
}));

jest.mock('expo-file-system', () => ({
    getInfoAsync: jest.fn(),
    uploadAsync: jest.fn(),
    deleteAsync: jest.fn().mockResolvedValue(undefined),
    getFreeDiskStorageAsync: jest.fn().mockResolvedValue(100 * 1024 * 1024 * 1024),
    FileSystemUploadType: { MULTIPART: 1 },
}));

jest.mock('expo-battery', () => ({
    getBatteryLevelAsync: jest.fn().mockResolvedValue(0.8), // 80%
}));

jest.mock('expo-constants', () => ({
    __esModule: true,
    default: {
        deviceName: 'Test iPhone',
        expoConfig: { version: '2.0.0' },
    },
}));

jest.mock('react-native', () => ({
    Platform: { OS: 'ios' },
}));

jest.mock('../network-monitor', () => ({
    networkMonitor: { isOnline: true },
}));

jest.mock('@/config/api', () => ({
    apiUrl: (p: string) => `https://test.example.com${p}`,
}));

jest.mock('../logger', () => ({
    createLogger: () => ({
        entry: jest.fn(), exit: jest.fn(),
        info: jest.fn(), warn: jest.fn(), error: jest.fn(),
    }),
}));

import { cloneBundleService, type CloneBundle } from '../clone-bundle';
import { networkMonitor } from '../network-monitor';
import * as FileSystem from 'expo-file-system/legacy';

const mockNetwork = networkMonitor as unknown as { isOnline: boolean };
const mockFs = FileSystem as unknown as {
    getInfoAsync: jest.Mock;
    uploadAsync: jest.Mock;
    deleteAsync: jest.Mock;
    getFreeDiskStorageAsync: jest.Mock;
    FileSystemUploadType: { MULTIPART: number };
};
const BUNDLES_KEY = 'windy-clone-bundles';

function mockFileSize(size: number) {
    mockFs.getInfoAsync.mockResolvedValue({ exists: true, size, isDirectory: false, uri: 'file://x' });
}

function resetService() {
    // Wipe persistent storage and reach into the singleton's private state so
    // every test boots against an empty bundle list. We deliberately avoid
    // calling `deleteBundle` here because it triggers FileSystem.deleteAsync,
    // which muddles the mock-call-count assertions in other tests.
    for (const k of Object.keys(mockAsyncStorage)) delete mockAsyncStorage[k];
    const svc = cloneBundleService as unknown as { loaded: boolean; bundles: CloneBundle[] };
    svc.loaded = false;
    svc.bundles = [];
}

beforeEach(() => {
    // Reset only the call history, not the mock *implementations* — we want
    // the defaults (resolved undefined / large free-disk) to stay in place.
    mockFs.getInfoAsync.mockReset();
    mockFs.uploadAsync.mockReset();
    mockFs.deleteAsync.mockReset().mockResolvedValue(undefined);
    mockFs.getFreeDiskStorageAsync.mockReset().mockResolvedValue(100 * 1024 * 1024 * 1024);
    mockNetwork.isOnline = true;
    resetService();
});

describe('createBundle', () => {
    it('builds an audio-only bundle with probed size', async () => {
        mockFileSize(2048);
        const b = await cloneBundleService.createBundle({
            sessionId: 's1',
            duration: 30,
            audioPath: 'file://audio-1.wav',
            transcript: 'hello world',
        });
        expect(b.bundle_id).toBe('s1');
        expect(b.audio.size_bytes).toBe(2048);
        expect(b.audio.format).toBe('wav');
        expect(b.video).toBeNull();
        expect(b.transcript.language).toBe('en');
        expect(b.sync_status).toBe('pending');
        expect(b.device.platform).toBe('ios');
    });

    it('marks training_ready=true for audio+video+transcript ≥10s', async () => {
        // Both getInfoAsync calls return the same size in this simple mock.
        mockFileSize(5000);
        const b = await cloneBundleService.createBundle({
            sessionId: 's2', duration: 12,
            audioPath: 'file://a.wav',
            videoPath: 'file://v.mp4',
            transcript: 'training-ready',
        });
        expect(b.video).not.toBeNull();
        expect(b.video!.resolution).toBe('720p');
        expect(b.video!.camera).toBe('front');
        expect(b.clone_training_ready).toBe(true);
    });

    it('marks training_ready=false when duration < 10s', async () => {
        mockFileSize(500);
        const b = await cloneBundleService.createBundle({
            sessionId: 's3', duration: 5,
            audioPath: 'file://a.wav',
            videoPath: 'file://v.mp4',
            transcript: 'too short',
        });
        expect(b.clone_training_ready).toBe(false);
    });

    it('marks training_ready=false when no transcript', async () => {
        mockFileSize(500);
        const b = await cloneBundleService.createBundle({
            sessionId: 's4', duration: 60,
            audioPath: 'file://a.wav',
            videoPath: 'file://v.mp4',
            transcript: '   ',
        });
        expect(b.clone_training_ready).toBe(false);
    });

    it('marks training_ready=false when audio probe returns 0 bytes', async () => {
        mockFs.getInfoAsync.mockResolvedValue({ exists: true, size: 0, isDirectory: false, uri: 'x' });
        const b = await cloneBundleService.createBundle({
            sessionId: 's5', duration: 60,
            audioPath: 'file://missing.wav',
            videoPath: 'file://v.mp4',
            transcript: 'has-transcript',
        });
        expect(b.audio.size_bytes).toBe(0);
        expect(b.clone_training_ready).toBe(false);
    });

    it('persists to AsyncStorage under the canonical key', async () => {
        mockFileSize(100);
        await cloneBundleService.createBundle({
            sessionId: 's6', duration: 5, audioPath: 'file://a.wav', transcript: 't',
        });
        expect(mockAsyncStorage[BUNDLES_KEY]).toBeDefined();
        const parsed = JSON.parse(mockAsyncStorage[BUNDLES_KEY]);
        expect(Array.isArray(parsed)).toBe(true);
        expect(parsed[0].bundle_id).toBe('s6');
    });

    it('replaces an existing bundle with the same sessionId', async () => {
        mockFileSize(100);
        await cloneBundleService.createBundle({
            sessionId: 'dup', duration: 5, audioPath: 'file://a.wav', transcript: 'v1',
        });
        mockFileSize(200);
        await cloneBundleService.createBundle({
            sessionId: 'dup', duration: 10, audioPath: 'file://a.wav', transcript: 'v2',
        });
        const bundles = await cloneBundleService.getBundles();
        expect(bundles.length).toBe(1);
        expect(bundles[0].transcript.text).toBe('v2');
        expect(bundles[0].audio.size_bytes).toBe(200);
    });

    it('prepends new bundles (unshift — newest first)', async () => {
        mockFileSize(100);
        await cloneBundleService.createBundle({
            sessionId: 'a', duration: 5, audioPath: 'f://a', transcript: 't',
        });
        await cloneBundleService.createBundle({
            sessionId: 'b', duration: 5, audioPath: 'f://b', transcript: 't',
        });
        const bundles = await cloneBundleService.getBundles();
        expect(bundles.map(x => x.bundle_id)).toEqual(['b', 'a']);
    });
});

describe('getBundles filters', () => {
    beforeEach(async () => {
        mockFileSize(1000);
        await cloneBundleService.createBundle({
            sessionId: 'audio-only', duration: 20,
            audioPath: 'file://a.wav', transcript: 'text-here',
        });
        await cloneBundleService.createBundle({
            sessionId: 'with-video', duration: 20,
            audioPath: 'file://a.wav', videoPath: 'file://v.mp4', transcript: 'text',
        });
    });

    it('filters by hasVideo=true', async () => {
        const r = await cloneBundleService.getBundles({ hasVideo: true });
        expect(r.map(b => b.bundle_id)).toEqual(['with-video']);
    });

    it('filters by hasVideo=false', async () => {
        const r = await cloneBundleService.getBundles({ hasVideo: false });
        expect(r.map(b => b.bundle_id)).toEqual(['audio-only']);
    });

    it('filters by syncStatus', async () => {
        const r = await cloneBundleService.getBundles({ syncStatus: 'pending' });
        expect(r.length).toBe(2);
        const none = await cloneBundleService.getBundles({ syncStatus: 'synced' });
        expect(none.length).toBe(0);
    });

    it('filters by trainingReady', async () => {
        const r = await cloneBundleService.getBundles({ trainingReady: true });
        expect(r.map(b => b.bundle_id)).toEqual(['with-video']);
    });
});

describe('getBundle', () => {
    it('returns the bundle by id', async () => {
        mockFileSize(100);
        await cloneBundleService.createBundle({
            sessionId: 'id-1', duration: 5, audioPath: 'f', transcript: 't',
        });
        const b = await cloneBundleService.getBundle('id-1');
        expect(b).not.toBeNull();
        expect(b!.bundle_id).toBe('id-1');
    });
    it('returns null for a missing id', async () => {
        const b = await cloneBundleService.getBundle('nope');
        expect(b).toBeNull();
    });
});

describe('getStats', () => {
    it('aggregates across mixed bundles', async () => {
        mockFileSize(1_000_000); // 1 MB each
        await cloneBundleService.createBundle({
            sessionId: 'a', duration: 30,
            audioPath: 'f://a', transcript: 't',
        });
        await cloneBundleService.createBundle({
            sessionId: 'b', duration: 60,
            audioPath: 'f://a', videoPath: 'f://v', transcript: 't',
        });
        const s = await cloneBundleService.getStats();
        expect(s.total_bundles).toBe(2);
        expect(s.video_bundles).toBe(1);
        expect(s.audio_only_bundles).toBe(1);
        expect(s.training_ready).toBe(1);
        expect(s.pending).toBe(2);
        expect(s.synced).toBe(0);
        expect(s.total_duration_seconds).toBe(90);
        // audio: 1 MB + 1 MB = 2 MB ; video: 1 MB = 1 MB ; total = 3 MB
        expect(s.local_bytes).toBe(3_000_000);
    });
});

describe('uploadBundle', () => {
    async function seedOne(opts: { withVideo?: boolean } = {}) {
        mockFileSize(500);
        await cloneBundleService.createBundle({
            sessionId: 'up', duration: 20,
            audioPath: 'file://a.wav',
            videoPath: opts.withVideo ? 'file://v.mp4' : undefined,
            transcript: 't',
        });
    }

    it('fails when the bundle is not in the store', async () => {
        const r = await cloneBundleService.uploadBundle('missing', 'tok');
        expect(r.success).toBe(false);
        expect(r.error).toBe('Bundle not found');
    });

    it('short-circuits offline without touching the file system', async () => {
        await seedOne();
        mockNetwork.isOnline = false;
        mockFs.uploadAsync.mockClear();
        const r = await cloneBundleService.uploadBundle('up', 'tok');
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/offline/i);
        expect(mockFs.uploadAsync).not.toHaveBeenCalled();
        // Status stays pending — offline should not flip it to uploading.
        const b = await cloneBundleService.getBundle('up');
        expect(b!.sync_status).toBe('pending');
    });

    it('happy path: 2xx response flips sync_status to synced', async () => {
        await seedOne();
        mockFs.uploadAsync.mockResolvedValue({ status: 200, body: '' });
        const r = await cloneBundleService.uploadBundle('up', 'tok');
        expect(r.success).toBe(true);
        const b = await cloneBundleService.getBundle('up');
        expect(b!.sync_status).toBe('synced');
    });

    it('non-2xx response flips sync_status to failed with HTTP code in error', async () => {
        await seedOne();
        mockFs.uploadAsync.mockResolvedValue({ status: 500, body: '' });
        const r = await cloneBundleService.uploadBundle('up', 'tok');
        expect(r.success).toBe(false);
        expect(r.error).toBe('HTTP 500');
        const b = await cloneBundleService.getBundle('up');
        expect(b!.sync_status).toBe('failed');
    });

    it('network exception flips sync_status to failed', async () => {
        await seedOne();
        mockFs.uploadAsync.mockRejectedValue(new Error('ETIMEDOUT'));
        const r = await cloneBundleService.uploadBundle('up', 'tok');
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/ETIMEDOUT/);
        const b = await cloneBundleService.getBundle('up');
        expect(b!.sync_status).toBe('failed');
    });

    it('uploads the video part only when the bundle has video', async () => {
        await seedOne({ withVideo: true });
        mockFs.uploadAsync.mockResolvedValue({ status: 201, body: '' });
        await cloneBundleService.uploadBundle('up', 'tok');
        expect(mockFs.uploadAsync).toHaveBeenCalledTimes(2);
        const secondCallOpts = mockFs.uploadAsync.mock.calls[1][2];
        expect(secondCallOpts.fieldName).toBe('video');
        expect(secondCallOpts.parameters.part).toBe('video');
    });

    it('does NOT upload a video part for audio-only bundles', async () => {
        await seedOne({ withVideo: false });
        mockFs.uploadAsync.mockResolvedValue({ status: 200, body: '' });
        await cloneBundleService.uploadBundle('up', 'tok');
        expect(mockFs.uploadAsync).toHaveBeenCalledTimes(1);
        const firstCallOpts = mockFs.uploadAsync.mock.calls[0][2];
        expect(firstCallOpts.fieldName).toBe('audio');
    });

    it('passes the auth token in the Authorization header', async () => {
        await seedOne();
        mockFs.uploadAsync.mockResolvedValue({ status: 200, body: '' });
        await cloneBundleService.uploadBundle('up', 'my-jwt');
        const opts = mockFs.uploadAsync.mock.calls[0][2];
        expect(opts.headers.Authorization).toBe('Bearer my-jwt');
    });
});

describe('deleteBundle', () => {
    it('removes the bundle from the list and deletes the local files', async () => {
        mockFileSize(500);
        await cloneBundleService.createBundle({
            sessionId: 'del', duration: 5,
            audioPath: 'file://a.wav', videoPath: 'file://v.mp4',
            transcript: 't',
        });
        await cloneBundleService.deleteBundle('del');
        const remaining = await cloneBundleService.getBundles();
        expect(remaining.length).toBe(0);
        // Both audio + video files should have been deleted.
        expect(mockFs.deleteAsync).toHaveBeenCalledTimes(2);
    });

    it('is a no-op when the bundle id is unknown', async () => {
        await cloneBundleService.deleteBundle('nope');
        expect(mockFs.deleteAsync).not.toHaveBeenCalled();
    });

    it('swallows file-delete errors (idempotent)', async () => {
        mockFileSize(100);
        await cloneBundleService.createBundle({
            sessionId: 'del2', duration: 5, audioPath: 'f://a', transcript: 't',
        });
        mockFs.deleteAsync.mockRejectedValue(new Error('ENOENT'));
        await expect(cloneBundleService.deleteBundle('del2')).resolves.not.toThrow();
    });
});

describe('getBatteryInfo + getStorageInfo', () => {
    it('returns battery level + warn/stop thresholds', async () => {
        const info = await cloneBundleService.getBatteryInfo();
        expect(info.level).toBe(80);
        expect(info.shouldWarn).toBe(false);
        expect(info.shouldStop).toBe(false);
    });

    it('falls back on battery-read errors', async () => {
        const battery = jest.requireMock('expo-battery');
        battery.getBatteryLevelAsync.mockRejectedValueOnce(new Error('no battery'));
        const info = await cloneBundleService.getBatteryInfo();
        expect(info.level).toBe(100);
        expect(info.shouldWarn).toBe(false);
    });

    it('returns free bytes + estimated minutes', async () => {
        mockFs.getFreeDiskStorageAsync.mockResolvedValueOnce(20 * 1024 * 1024); // 20 MB
        const info = await cloneBundleService.getStorageInfo();
        expect(info.freeBytes).toBe(20 * 1024 * 1024);
        expect(info.estimatedMinutesLeft).toBe(1); // 20 MB / 20 MB/min
    });
});
