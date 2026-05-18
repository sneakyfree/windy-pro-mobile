/**
 * Contract Test: WebSocket Transcription Protocol
 * Verifies the client sends messages in the correct order and handles responses.
 */

jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn().mockResolvedValue('test-jwt-token'),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
    readAsStringAsync: jest.fn().mockResolvedValue(
        // Fake base64 audio data (~48KB to produce 3 chunks of 16KB)
        'A'.repeat(65536)
    ),
    EncodingType: { Base64: 'base64' },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn().mockResolvedValue(null),
        setItem: jest.fn().mockResolvedValue(undefined),
    },
}));

jest.mock('expo-device', () => ({
    totalMemory: 4 * 1024 * 1024 * 1024,
    modelName: 'Mock Device',
    osName: 'iOS',
    osVersion: '17.0',
}));

jest.mock('expo-battery', () => ({
    getBatteryLevelAsync: jest.fn().mockResolvedValue(0.8),
    getBatteryStateAsync: jest.fn().mockResolvedValue(1),
    BatteryState: { UNPLUGGED: 0, CHARGING: 1, FULL: 2, UNKNOWN: -1 },
}));

// Track WebSocket messages
const wsSentMessages: (string | ArrayBuffer)[] = [];
let wsOnOpen: (() => void) | null = null;
let wsOnMessage: ((event: { data: string }) => void) | null = null;
let wsOnClose: (() => void) | null = null;
let wsOnError: (() => void) | null = null;

class MockWebSocket {
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;

    constructor(public url: string) {
        setTimeout(() => {
            wsOnOpen = this.onopen;
            wsOnMessage = this.onmessage;
            wsOnClose = this.onclose;
            wsOnError = this.onerror;
            this.onopen?.();
        }, 10);
    }

    send(data: string | ArrayBuffer) {
        wsSentMessages.push(data);
    }

    close() {
        this.onclose?.();
    }
}

(global as any).WebSocket = MockWebSocket;

describe('WebSocket Transcription Protocol Contract', () => {
    beforeEach(() => {
        wsSentMessages.length = 0;
    });

    describe('message ordering', () => {
        it('sends auth → config → binary chunks → stop in correct order', async () => {
            // Import transcription service (uses our mocked WebSocket)
            const { transcriptionService } = require('../../src/services/transcription');

            // Start a WebSocket transcription
            const transcribePromise = (transcriptionService as any).wsTranscribe(
                'file:///test/audio.wav',
                'cloud-standard'
            );

            // Wait for messages to be sent
            await new Promise(r => setTimeout(r, 100));

            // Simulate server responses
            if (wsOnMessage) {
                wsOnMessage({
                    data: JSON.stringify({
                        type: 'transcript',
                        text: 'hello',
                        startTime: 0,
                        endTime: 1,
                        confidence: 0.9,
                        partial: true,
                        language: 'en',
                    }),
                });
                wsOnMessage({
                    data: JSON.stringify({
                        type: 'transcript',
                        text: 'hello world',
                        startTime: 0,
                        endTime: 2,
                        confidence: 0.95,
                        partial: false,
                        language: 'en',
                    }),
                });
            }

            // Close the connection to resolve the promise
            if (wsOnClose) wsOnClose();

            const segments = await transcribePromise;

            // Verify message order
            expect(wsSentMessages.length).toBeGreaterThanOrEqual(3);

            // Message 1: auth
            const authMsg = JSON.parse(wsSentMessages[0] as string);
            expect(authMsg.type).toBe('auth');
            expect(authMsg.token).toBeDefined();

            // Message 2: config
            const configMsg = JSON.parse(wsSentMessages[1] as string);
            expect(configMsg.type).toBe('config');
            expect(configMsg.language).toBe('auto');
            expect(configMsg.engine).toBe('cloud-standard');

            // Messages 3..N-1: binary audio chunks
            const binaryMessages = wsSentMessages.slice(2, -1);
            for (const msg of binaryMessages) {
                expect(msg).toBeInstanceOf(ArrayBuffer);
            }

            // Last message: stop
            const stopMsg = JSON.parse(wsSentMessages[wsSentMessages.length - 1] as string);
            expect(stopMsg.type).toBe('stop');

            // Verify response parsing
            expect(segments).toHaveLength(2);
            expect(segments[0].text).toBe('hello');
            expect(segments[0].isPartial).toBe(true);
            expect(segments[0].confidence).toBe(0.9);
            expect(segments[1].text).toBe('hello world');
            expect(segments[1].isPartial).toBe(false);
            expect(segments[1].confidence).toBe(0.95);
        });
    });

    describe('response handling', () => {
        it('handles error response from server', async () => {
            const { transcriptionService } = require('../../src/services/transcription');

            const transcribePromise = (transcriptionService as any).wsTranscribe(
                'file:///test/audio.wav',
                'cloud-standard'
            );

            await new Promise(r => setTimeout(r, 100));

            if (wsOnMessage) {
                wsOnMessage({
                    data: JSON.stringify({
                        type: 'error',
                        message: 'Rate limit exceeded',
                    }),
                });
            }

            await expect(transcribePromise).rejects.toThrow('Rate limit exceeded');
        });
    });
});
