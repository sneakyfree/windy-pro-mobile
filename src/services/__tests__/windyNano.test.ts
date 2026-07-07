/**
 * Tests for the bundled Windy Nano engine (M3) — whisper-manager's
 * bundled-asset path, transcription default routing, and registry brand.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn(async () => null),
        setItem: jest.fn(async () => undefined),
        removeItem: jest.fn(async () => undefined),
    },
}));

jest.mock('expo-file-system/legacy', () => ({
    documentDirectory: 'file:///docs/',
    getInfoAsync: jest.fn(async () => ({ exists: false })),
}));

const mockInitWhisper = jest.fn(async (_opts: { filePath: string | number }) => ({
    transcribe: jest.fn(async () => ({ result: 'hello from nano' })),
    release: jest.fn(async () => undefined),
}));
jest.mock('whisper.rn', () => ({
    initWhisper: (opts: { filePath: string | number }) => mockInitWhisper(opts),
}), { virtual: true });

jest.mock('../logger', () => ({
    createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

import { whisperManager, WINDY_NANO_MODEL_FILE } from '../whisper-manager';
import { ENGINE_REGISTRY } from '../windy-tune';

beforeEach(async () => {
    jest.clearAllMocks();
    await whisperManager.release();
});

describe('Windy Nano (bundled engine)', () => {
    it('loads the nano model from the in-app asset, not the downloads dir', async () => {
        await whisperManager.loadModel(WINDY_NANO_MODEL_FILE);

        expect(mockInitWhisper).toHaveBeenCalledTimes(1);
        const { filePath } = mockInitWhisper.mock.calls[0][0];
        // Metro asset requires resolve to a numeric asset id (jest maps
        // *.bin to a numeric stub) — NOT a documents-directory path.
        expect(typeof filePath).not.toBe('undefined');
        expect(String(filePath)).not.toContain('windy/engines');
        expect(whisperManager.getCurrentModel()).toBe(WINDY_NANO_MODEL_FILE);
    });

    it('still requires a download for non-bundled engines', async () => {
        await expect(whisperManager.loadModel('ggml-base.bin')).rejects.toThrow(/not found/i);
        expect(mockInitWhisper).not.toHaveBeenCalled();
    });

    it('registry brands tiny as Windy Nano, multilingual, real bundle size', () => {
        const nano = ENGINE_REGISTRY['tiny'];
        expect(nano.displayName).toBe('Windy Nano');
        expect(nano.sizeBytes).toBe(32_152_673);
        expect(nano.isOnDevice).toBe(true);
        expect(nano.languages.length).toBeGreaterThan(1);
    });

    it('transcription service defaults to the bundled engine (not cloud)', () => {
        jest.isolateModules(() => {
            jest.doMock('@/config/api', () => ({
                API_BASE_URL: 'https://account.windyword.ai',
                ENDPOINTS: { TRANSCRIBE: '/api/v1/transcribe', WS_TRANSCRIBE: '/ws/transcribe' },
                apiUrl: (p: string) => `https://account.windyword.ai${p}`,
                wsUrl: (p: string) => `wss://account.windyword.ai${p}`,
            }));
            const { transcriptionService } = require('../transcription');
            expect(transcriptionService.getActiveEngine?.() ?? (transcriptionService as any).activeEngine).toBe('tiny');
        });
    });
});
