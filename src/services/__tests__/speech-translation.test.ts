/**
 * 🧪 Unit tests for SpeechTranslationService
 * Tests recording, upload, timeout, retry, language validation, TTS, and error handling
 */

// ─── Mocks ──────────────────────────────────────────────────────

// Mock expo-av
const mockRequestPermissions = jest.fn();
const mockSetAudioMode = jest.fn();
const mockCreateAsync = jest.fn();
const mockStopAndUnload = jest.fn();
const mockGetURI = jest.fn();

jest.mock('expo-av', () => ({
    Audio: {
        requestPermissionsAsync: () => mockRequestPermissions(),
        setAudioModeAsync: (opts: unknown) => mockSetAudioMode(opts),
        Recording: {
            createAsync: (...args: unknown[]) => mockCreateAsync(...args),
        },
        RecordingOptionsPresets: { HIGH_QUALITY: {} },
        AndroidOutputFormat: { DEFAULT: 0 },
        AndroidAudioEncoder: { DEFAULT: 0 },
        IOSOutputFormat: { LINEARPCM: 'lpcm' },
        IOSAudioQuality: { HIGH: 127 },
    },
}));

// Mock expo-file-system
const mockUploadAsync = jest.fn();
const mockDeleteAsync = jest.fn();
const mockGetInfoAsync = jest.fn();

jest.mock('expo-file-system', () => ({
    uploadAsync: (...args: unknown[]) => mockUploadAsync(...args),
    deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
    getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
    FileSystemUploadType: { MULTIPART: 1 },
}));

// Mock expo-speech
const mockSpeak = jest.fn();
const mockStop = jest.fn();

jest.mock('expo-speech', () => ({
    speak: (text: string, opts: { onDone?: () => void; onError?: () => void }) => {
        mockSpeak(text, opts);
        opts?.onDone?.();
    },
    stop: () => mockStop(),
}));

import {
    speechTranslationService,
    SpeechTranslationError,
    SPEECH_ERROR_MESSAGES,
} from '../speech-translation';

// ─── Test Suite ─────────────────────────────────────────────────

describe('SpeechTranslationService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    // ─── SpeechTranslationError ─────────────────────────────────

    describe('SpeechTranslationError', () => {
        it('should create error with correct type and message', () => {
            const err = new SpeechTranslationError('timeout', 'Timed out');
            expect(err.type).toBe('timeout');
            expect(err.message).toBe('Timed out');
            expect(err.name).toBe('SpeechTranslationError');
            expect(err).toBeInstanceOf(Error);
        });

        it('should have all error type messages defined', () => {
            const types: Array<keyof typeof SPEECH_ERROR_MESSAGES> = [
                'timeout', 'network', 'server', 'unsupported_language', 'no_audio', 'permission',
            ];
            for (const type of types) {
                expect(SPEECH_ERROR_MESSAGES[type]).toBeTruthy();
                expect(typeof SPEECH_ERROR_MESSAGES[type]).toBe('string');
            }
        });
    });

    // ─── Language Validation ────────────────────────────────────

    describe('validateLanguages()', () => {
        it('should accept valid TIER_1_LANGUAGES codes', () => {
            expect(() => speechTranslationService.validateLanguages('en', 'es')).not.toThrow();
            expect(() => speechTranslationService.validateLanguages('fr', 'ja')).not.toThrow();
        });

        it('should accept "auto" as source language', () => {
            expect(() => speechTranslationService.validateLanguages('auto', 'en')).not.toThrow();
        });

        it('should reject unsupported source language', () => {
            expect(() => speechTranslationService.validateLanguages('xx', 'en')).toThrow(SpeechTranslationError);
            try {
                speechTranslationService.validateLanguages('xx', 'en');
            } catch (e) {
                expect((e as SpeechTranslationError).type).toBe('unsupported_language');
            }
        });

        it('should reject unsupported target language', () => {
            expect(() => speechTranslationService.validateLanguages('en', 'zz')).toThrow(SpeechTranslationError);
            try {
                speechTranslationService.validateLanguages('en', 'zz');
            } catch (e) {
                expect((e as SpeechTranslationError).type).toBe('unsupported_language');
            }
        });

        it('should reject "auto" as target language', () => {
            expect(() => speechTranslationService.validateLanguages('en', 'auto')).toThrow(SpeechTranslationError);
        });
    });

    // ─── startRecording ─────────────────────────────────────────

    describe('startRecording()', () => {
        it('should throw permission error when denied', async () => {
            mockRequestPermissions.mockResolvedValue({ status: 'denied' });

            await expect(speechTranslationService.startRecording()).rejects.toThrow(SpeechTranslationError);

            try {
                await speechTranslationService.startRecording();
            } catch (e) {
                expect((e as SpeechTranslationError).type).toBe('permission');
            }
        });

        it('should create recording when permission granted', async () => {
            mockRequestPermissions.mockResolvedValue({ status: 'granted' });
            mockSetAudioMode.mockResolvedValue(undefined);
            mockCreateAsync.mockResolvedValue({
                recording: {
                    stopAndUnloadAsync: mockStopAndUnload,
                    getURI: mockGetURI,
                },
            });

            await speechTranslationService.startRecording();
            expect(mockSetAudioMode).toHaveBeenCalledWith(expect.objectContaining({
                allowsRecordingIOS: true,
            }));
            expect(mockCreateAsync).toHaveBeenCalled();
            expect(speechTranslationService.isActive).toBe(true);
        });
    });

    // ─── stopAndTranslate ───────────────────────────────────────

    describe('stopAndTranslate()', () => {
        it('should throw no_audio if no recording exists', async () => {
            // Cancel any existing recording first
            await speechTranslationService.cancelRecording();

            await expect(
                speechTranslationService.stopAndTranslate('en', 'es')
            ).rejects.toThrow(SpeechTranslationError);
        });

        it('should throw unsupported_language for invalid langs', async () => {
            // Set up a recording first
            mockRequestPermissions.mockResolvedValue({ status: 'granted' });
            mockSetAudioMode.mockResolvedValue(undefined);
            mockCreateAsync.mockResolvedValue({
                recording: {
                    stopAndUnloadAsync: mockStopAndUnload,
                    getURI: () => 'file:///audio.wav',
                },
            });
            await speechTranslationService.startRecording();

            await expect(
                speechTranslationService.stopAndTranslate('xx', 'es')
            ).rejects.toThrow(SpeechTranslationError);
        });

        it('should throw no_audio when URI is null', async () => {
            mockRequestPermissions.mockResolvedValue({ status: 'granted' });
            mockSetAudioMode.mockResolvedValue(undefined);
            mockStopAndUnload.mockResolvedValue(undefined);
            mockGetURI.mockReturnValue(null);
            mockCreateAsync.mockResolvedValue({
                recording: {
                    stopAndUnloadAsync: mockStopAndUnload,
                    getURI: mockGetURI,
                },
            });
            await speechTranslationService.startRecording();

            await expect(
                speechTranslationService.stopAndTranslate('en', 'es')
            ).rejects.toThrow(SpeechTranslationError);
        });

        it('should return result on successful translation', async () => {
            jest.useRealTimers();

            mockRequestPermissions.mockResolvedValue({ status: 'granted' });
            mockSetAudioMode.mockResolvedValue(undefined);
            mockStopAndUnload.mockResolvedValue(undefined);
            mockGetURI.mockReturnValue('file:///audio.wav');
            mockCreateAsync.mockResolvedValue({
                recording: {
                    stopAndUnloadAsync: mockStopAndUnload,
                    getURI: mockGetURI,
                },
            });
            mockUploadAsync.mockResolvedValue({
                status: 200,
                body: JSON.stringify({
                    original: 'Hello',
                    translated: 'Hola',
                    confidence: 0.95,
                    detected_language: 'en',
                }),
            });
            mockDeleteAsync.mockResolvedValue(undefined);

            await speechTranslationService.startRecording();
            const result = await speechTranslationService.stopAndTranslate('en', 'es');

            expect(result.original).toBe('Hello');
            expect(result.translated).toBe('Hola');
            expect(result.confidence).toBe(0.95);
            expect(result.fromLang).toBe('en');
            expect(result.toLang).toBe('es');
            expect(result.durationMs).toBeGreaterThanOrEqual(0);
        });
    });

    // ─── Upload Error Handling ──────────────────────────────────

    describe('upload error handling', () => {
        async function setupRecordingAndTranslate(
            uploadMock: () => Promise<unknown>,
            source = 'en',
            target = 'es',
        ) {
            jest.useRealTimers();
            mockRequestPermissions.mockResolvedValue({ status: 'granted' });
            mockSetAudioMode.mockResolvedValue(undefined);
            mockStopAndUnload.mockResolvedValue(undefined);
            mockGetURI.mockReturnValue('file:///audio.wav');
            mockCreateAsync.mockResolvedValue({
                recording: {
                    stopAndUnloadAsync: mockStopAndUnload,
                    getURI: mockGetURI,
                },
            });
            mockUploadAsync.mockImplementation(uploadMock);
            mockDeleteAsync.mockResolvedValue(undefined);

            await speechTranslationService.startRecording();
            return speechTranslationService.stopAndTranslate(source, target);
        }

        it('should throw server error on 500 response', async () => {
            await expect(
                setupRecordingAndTranslate(async () => ({ status: 500, body: 'Internal Error' }))
            ).rejects.toThrow(SpeechTranslationError);
        });

        it('should throw network error on fetch failure', async () => {
            await expect(
                setupRecordingAndTranslate(async () => { throw new TypeError('Network request failed'); })
            ).rejects.toThrow(SpeechTranslationError);
        });
    });

    // ─── speakTranslation ───────────────────────────────────────

    describe('speakTranslation()', () => {
        it('should call Speech.speak with correct language mapping', async () => {
            await speechTranslationService.speakTranslation('Hola', 'es');
            expect(mockSpeak).toHaveBeenCalledWith('Hola', expect.objectContaining({
                language: 'es-ES',
                rate: 0.95,
                pitch: 1.0,
            }));
        });

        it('should use raw code when no mapping exists', async () => {
            await speechTranslationService.speakTranslation('Test', 'xx');
            expect(mockSpeak).toHaveBeenCalledWith('Test', expect.objectContaining({
                language: 'xx',
            }));
        });
    });

    // ─── stopSpeaking ───────────────────────────────────────────

    describe('stopSpeaking()', () => {
        it('should call Speech.stop', async () => {
            await speechTranslationService.stopSpeaking();
            expect(mockStop).toHaveBeenCalled();
        });
    });

    // ─── cancelRecording ────────────────────────────────────────

    describe('cancelRecording()', () => {
        it('should clean up recording and temp file', async () => {
            mockRequestPermissions.mockResolvedValue({ status: 'granted' });
            mockSetAudioMode.mockResolvedValue(undefined);
            mockStopAndUnload.mockResolvedValue(undefined);
            mockGetURI.mockReturnValue('file:///temp.wav');
            mockCreateAsync.mockResolvedValue({
                recording: {
                    stopAndUnloadAsync: mockStopAndUnload,
                    getURI: mockGetURI,
                },
            });
            mockDeleteAsync.mockResolvedValue(undefined);

            await speechTranslationService.startRecording();
            expect(speechTranslationService.isActive).toBe(true);

            await speechTranslationService.cancelRecording();
            expect(speechTranslationService.isActive).toBe(false);
            expect(mockStopAndUnload).toHaveBeenCalled();
            expect(mockDeleteAsync).toHaveBeenCalledWith('file:///temp.wav', { idempotent: true });
        });

        it('should be safe to call when no recording exists', async () => {
            await speechTranslationService.cancelRecording();
            // Should not throw
            expect(speechTranslationService.isActive).toBe(false);
        });
    });

    // ─── detectLanguageFromAudio ─────────────────────────────────

    describe('detectLanguageFromAudio()', () => {
        it('should return detected language on success', async () => {
            jest.useRealTimers();
            mockUploadAsync.mockResolvedValue({
                status: 200,
                body: JSON.stringify({
                    detected_language: 'fr',
                    confidence: 0.92,
                }),
            });

            const result = await speechTranslationService.detectLanguageFromAudio('file:///audio.wav');
            expect(result.language).toBe('fr');
            expect(result.confidence).toBe(0.92);
        });

        it('should return fallback on failure', async () => {
            jest.useRealTimers();
            mockUploadAsync.mockRejectedValue(new Error('Network fail'));

            const result = await speechTranslationService.detectLanguageFromAudio('file:///audio.wav');
            expect(result.language).toBe('en');
            expect(result.confidence).toBe(0.3);
        });
    });
});
