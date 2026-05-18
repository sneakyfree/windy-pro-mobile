/**
 * 🧪 Unit tests for TranscriptionService
 * Tests engine management, HTTP transcription, error handling, cancellation
 */

// Mock AsyncStorage (required by transitive imports)
jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn().mockResolvedValue(null),
        setItem: jest.fn().mockResolvedValue(undefined),
    },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock expo-file-system
const mockUploadAsync = jest.fn();
const mockGetInfoAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
    uploadAsync: (...args: unknown[]) => mockUploadAsync(...args),
    getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
    readAsStringAsync: (...args: unknown[]) => mockReadAsStringAsync(...args),
    FileSystemUploadType: { MULTIPART: 1 },
    EncodingType: { Base64: 'base64' },
}));

// Mock license service — cloud STT enabled by default for tests
jest.mock('../license', () => ({
    licenseService: {
        isCloudSttEnabled: jest.fn().mockReturnValue(true),
        getTier: jest.fn().mockReturnValue('pro'),
        getBillingType: jest.fn().mockReturnValue('subscription'),
    },
}));

// Mock WebSocket — triggers onerror after a 10ms delay (controlled by fake timers)
class MockWebSocket {
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: ((err: unknown) => void) | null = null;
    onmessage: ((msg: unknown) => void) | null = null;
    close() { this.onclose?.(); }
    send() {}
    constructor() {
        // Use setTimeout (will be controlled by fake timers)
        setTimeout(() => {
            if (this.onerror) {
                this.onerror({ message: 'Mock WS error' });
            } else if (this.onclose) {
                this.onclose();
            }
        }, 10);
    }
}
(global as any).WebSocket = MockWebSocket;

import { transcriptionService } from '../transcription';

describe('TranscriptionService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockReset();
        mockUploadAsync.mockReset();
        mockGetInfoAsync.mockReset();
    });

    // ─── Engine Management ─────────────────────────────────────
    describe('engine management', () => {
        it('should start with cloud-standard engine', () => {
            expect(transcriptionService.getActiveEngine()).toBe('cloud-standard');
        });

        it('should set engine', () => {
            transcriptionService.setEngine('cloud-standard');
            expect(transcriptionService.getActiveEngine()).toBe('cloud-standard');
        });

        it('should not be processing initially', () => {
            expect(transcriptionService.getIsProcessing()).toBe(false);
        });
    });

    // ─── HTTP Transcription ────────────────────────────────────
    describe('transcribeFile()', () => {
        it('should return segments on successful cloud transcription', async () => {
            mockGetInfoAsync.mockResolvedValue({ exists: true, size: 1024 });
            mockUploadAsync.mockResolvedValue({
                status: 200,
                body: JSON.stringify({
                    segments: [
                        { text: 'Hello world', start: 0, end: 5, confidence: 0.95 },
                    ],
                }),
            });

            const segments = await transcriptionService.transcribeFile(
                'file:///audio.wav',
                'cloud-standard'
            );
            expect(segments.length).toBeGreaterThanOrEqual(1);
            expect(segments[0].text).toBe('Hello world');
        });

        it('should handle file not found', async () => {
            mockGetInfoAsync.mockResolvedValue({ exists: false });

            await expect(
                transcriptionService.transcribeFile('file:///missing.wav', 'cloud-standard')
            ).rejects.toThrow();
        });

        it('should handle server errors', async () => {
            jest.useFakeTimers();
            mockGetInfoAsync.mockResolvedValue({ exists: true, size: 1024 });
            mockUploadAsync.mockResolvedValue({
                status: 500,
                body: JSON.stringify({ error: 'Internal Server Error' }),
            });

            const promise = transcriptionService.transcribeFile('file:///audio.wav', 'cloud-standard');

            // Race: advance timers while waiting for the rejection
            await expect(
                Promise.all([
                    promise,
                    jest.advanceTimersByTimeAsync(31000),
                ])
            ).rejects.toThrow();
            jest.useRealTimers();
        }, 15000);

        it('should handle network timeout', async () => {
            jest.useFakeTimers();
            mockGetInfoAsync.mockResolvedValue({ exists: true, size: 1024 });
            mockUploadAsync.mockRejectedValue(new Error('Network request failed'));

            const promise = transcriptionService.transcribeFile('file:///audio.wav', 'cloud-standard');

            await expect(
                Promise.all([
                    promise,
                    jest.advanceTimersByTimeAsync(31000),
                ])
            ).rejects.toThrow();
            jest.useRealTimers();
        }, 15000);
    });

    // ─── Cancellation ──────────────────────────────────────────
    describe('cancel()', () => {
        it('should not throw when called with no active transcription', () => {
            expect(() => transcriptionService.cancel()).not.toThrow();
        });
    });

    // ─── Switch Engines ────────────────────────────────────────
    describe('switchToCloud()', () => {
        it('should switch to cloud-standard engine', async () => {
            await transcriptionService.switchToCloud();
            expect(transcriptionService.getActiveEngine()).toBe('cloud-standard');
        });
    });

    describe('switchToLocal()', () => {
        it('should switch to specified local engine', async () => {
            await transcriptionService.switchToLocal('tiny');
            expect(transcriptionService.getActiveEngine()).toBe('tiny');
        });
    });
});
