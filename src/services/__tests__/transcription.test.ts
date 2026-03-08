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

jest.mock('expo-file-system', () => ({
    uploadAsync: (...args: unknown[]) => mockUploadAsync(...args),
    getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
    readAsStringAsync: (...args: unknown[]) => mockReadAsStringAsync(...args),
    FileSystemUploadType: { MULTIPART: 1 },
    EncodingType: { Base64: 'base64' },
}));

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
            mockGetInfoAsync.mockResolvedValue({ exists: true, size: 1024 });
            mockUploadAsync.mockResolvedValue({
                status: 500,
                body: JSON.stringify({ error: 'Internal Server Error' }),
            });

            await expect(
                transcriptionService.transcribeFile('file:///audio.wav', 'cloud-standard')
            ).rejects.toThrow();
        });

        it('should handle network timeout', async () => {
            mockGetInfoAsync.mockResolvedValue({ exists: true, size: 1024 });
            mockUploadAsync.mockRejectedValue(new Error('Network request failed'));

            await expect(
                transcriptionService.transcribeFile('file:///audio.wav', 'cloud-standard')
            ).rejects.toThrow();
        });
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
