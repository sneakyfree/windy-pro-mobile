/**
 * Tests for dictation.ts — OS-native speech-to-text wrapper (Voice v1).
 */

const mockListeners: Record<string, ((ev: any) => void)[]> = {};
const mockStart = jest.fn();
const mockStop = jest.fn();
const mockAbort = jest.fn();
const mockGetPermissions = jest.fn(async () => ({ granted: true }));
const mockRequestPermissions = jest.fn(async () => ({ granted: true }));
const mockIsRecognitionAvailable = jest.fn(() => true);

jest.mock('expo-speech-recognition', () => ({
    ExpoSpeechRecognitionModule: {
        start: (...args: unknown[]) => mockStart(...args),
        stop: () => mockStop(),
        abort: () => mockAbort(),
        getPermissionsAsync: () => mockGetPermissions(),
        requestPermissionsAsync: () => mockRequestPermissions(),
        isRecognitionAvailable: () => mockIsRecognitionAvailable(),
        supportsOnDeviceRecognition: () => true,
        addListener: (event: string, cb: (ev: any) => void) => {
            (mockListeners[event] ||= []).push(cb);
            return {
                remove: () => {
                    mockListeners[event] = (mockListeners[event] || []).filter(f => f !== cb);
                },
            };
        },
    },
}));

jest.mock('../logger', () => ({
    createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

jest.mock('@/stores/useSettingsStore', () => ({
    useSettingsStore: { getState: () => ({ defaultLanguage: 'en' }) },
}));

import { dictationService } from '../dictation';

function emit(event: string, payload: unknown) {
    for (const cb of [...(mockListeners[event] || [])]) cb(payload);
}

beforeEach(() => {
    jest.clearAllMocks();
    for (const k of Object.keys(mockListeners)) delete mockListeners[k];
    dictationService.abort(); // reset listening state between tests
    jest.clearAllMocks();
});

describe('dictationService', () => {
    it('starts with interim results + continuous and reports availability', async () => {
        expect(dictationService.isAvailable()).toBe(true);

        const onPartial = jest.fn();
        const onFinal = jest.fn();
        const ok = await dictationService.start({ onPartial, onFinal });

        expect(ok).toBe(true);
        expect(dictationService.isListening()).toBe(true);
        const opts = mockStart.mock.calls[0][0];
        expect(opts.interimResults).toBe(true);
        expect(opts.continuous).toBe(true);
        expect(opts.lang).toBe('en-US');
    });

    it('streams partials and finals to the right callbacks', async () => {
        const onPartial = jest.fn();
        const onFinal = jest.fn();
        await dictationService.start({ onPartial, onFinal });

        emit('result', { isFinal: false, results: [{ transcript: 'hello wor' }] });
        emit('result', { isFinal: true, results: [{ transcript: 'hello world' }] });

        expect(onPartial).toHaveBeenCalledWith('hello wor');
        expect(onFinal).toHaveBeenCalledWith('hello world');
    });

    it('maps error codes to friendly messages and ends the session', async () => {
        const onError = jest.fn();
        const onEnd = jest.fn();
        await dictationService.start({ onFinal: jest.fn(), onError, onEnd });

        emit('error', { error: 'not-allowed', message: 'raw native text' });
        emit('end', null);

        expect(onError).toHaveBeenCalledWith(expect.stringMatching(/permission/i));
        expect(onEnd).toHaveBeenCalled();
        expect(dictationService.isListening()).toBe(false);
    });

    it('refuses a second concurrent session', async () => {
        await dictationService.start({ onFinal: jest.fn() });
        const second = await dictationService.start({ onFinal: jest.fn() });
        expect(second).toBe(false);
        expect(mockStart).toHaveBeenCalledTimes(1);
    });

    it('stop() flushes gracefully; listeners cleaned on end', async () => {
        await dictationService.start({ onFinal: jest.fn() });
        dictationService.stop();
        expect(mockStop).toHaveBeenCalled();
        emit('end', null);
        expect((mockListeners['result'] || []).length).toBe(0);
    });

    it('fails cleanly when permission is denied', async () => {
        mockGetPermissions.mockResolvedValueOnce({ granted: false });
        mockRequestPermissions.mockResolvedValueOnce({ granted: false });
        const onError = jest.fn();

        const ok = await dictationService.start({ onFinal: jest.fn(), onError });

        expect(ok).toBe(false);
        expect(onError).toHaveBeenCalledWith(expect.stringMatching(/permission/i));
        expect(mockStart).not.toHaveBeenCalled();
    });

    it('is unavailable (not crashing) when the OS reports no recognizer', () => {
        mockIsRecognitionAvailable.mockReturnValueOnce(false);
        expect(dictationService.isAvailable()).toBe(false);
    });
});
