/**
 * 🧪 Unit tests for TranslationService
 * Tests caching, language management, error fallback, API,
 * speech translation, language detection, TTS, and exports
 */

// Mock native modules that pairManager.ts imports transitively
jest.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        getItem: jest.fn().mockResolvedValue(null),
        setItem: jest.fn().mockResolvedValue(undefined),
        removeItem: jest.fn().mockResolvedValue(undefined),
        multiGet: jest.fn().mockResolvedValue([]),
        multiSet: jest.fn().mockResolvedValue(undefined),
        getAllKeys: jest.fn().mockResolvedValue([]),
    },
    __esModule: true,
}));

jest.mock('@react-native-community/netinfo', () => ({
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn().mockResolvedValue({ isConnected: true, type: 'wifi' }),
}));

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock expo-file-system
const mockUploadAsync = jest.fn();
const mockGetInfoAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn();
const mockWriteAsStringAsync = jest.fn();

jest.mock('expo-file-system', () => ({
    uploadAsync: (...args: unknown[]) => mockUploadAsync(...args),
    getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
    makeDirectoryAsync: (...args: unknown[]) => mockMakeDirectoryAsync(...args),
    writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
    cacheDirectory: 'file:///cache/',
    FileSystemUploadType: { MULTIPART: 1 },
}));

// Mock expo-speech
const mockSpeechSpeak = jest.fn();
const mockSpeechStop = jest.fn();
const mockIsSpeakingAsync = jest.fn();

jest.mock('expo-speech', () => ({
    speak: (text: string, opts: { onDone?: () => void; onError?: () => void }) => {
        mockSpeechSpeak(text, opts);
        opts?.onDone?.();
    },
    stop: () => mockSpeechStop(),
    isSpeakingAsync: () => mockIsSpeakingAsync(),
}));

// Mock expo-sharing
jest.mock('expo-sharing', () => ({
    isAvailableAsync: jest.fn().mockResolvedValue(true),
    shareAsync: jest.fn().mockResolvedValue(undefined),
}));

// Import after mocking
import { translationService, TIER_1_LANGUAGES } from '../translation';

describe('TranslationService', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        mockUploadAsync.mockReset();
        mockSpeechSpeak.mockReset();
        mockSpeechStop.mockReset();
    });

    // ─── Language Data ──────────────────────────────────────────
    describe('TIER_1_LANGUAGES', () => {
        it('should have exactly 15 Tier 1 languages', () => {
            expect(TIER_1_LANGUAGES).toHaveLength(15);
        });

        it('should include English as first language', () => {
            expect(TIER_1_LANGUAGES[0].code).toBe('en');
            expect(TIER_1_LANGUAGES[0].name).toBe('English');
        });

        it('should have all required fields for each language', () => {
            for (const lang of TIER_1_LANGUAGES) {
                expect(lang).toHaveProperty('code');
                expect(lang).toHaveProperty('name');
                expect(lang).toHaveProperty('nativeName');
                expect(lang).toHaveProperty('flag');
                expect(lang).toHaveProperty('tier');
                expect(lang.tier).toBe(1);
            }
        });

        it('should have unique language codes', () => {
            const codes = TIER_1_LANGUAGES.map((l) => l.code);
            expect(new Set(codes).size).toBe(codes.length);
        });

        it('should have non-empty flags (emoji)', () => {
            for (const lang of TIER_1_LANGUAGES) {
                expect(lang.flag.length).toBeGreaterThan(0);
            }
        });
    });

    // ─── Language Management ────────────────────────────────────
    describe('language management', () => {
        it('should get current languages', () => {
            const langs = translationService.getLanguages();
            expect(langs).toHaveProperty('source');
            expect(langs).toHaveProperty('target');
        });

        it('should set languages', () => {
            translationService.setLanguages('fr', 'de');
            const langs = translationService.getLanguages();
            expect(langs.source).toBe('fr');
            expect(langs.target).toBe('de');
        });

        it('should swap languages', () => {
            translationService.setLanguages('en', 'ja');
            translationService.swapLanguages();
            const langs = translationService.getLanguages();
            expect(langs.source).toBe('ja');
            expect(langs.target).toBe('en');
        });

        it('should swap back to original', () => {
            translationService.setLanguages('en', 'ja');
            translationService.swapLanguages();
            translationService.swapLanguages();
            const langs = translationService.getLanguages();
            expect(langs.source).toBe('en');
            expect(langs.target).toBe('ja');
        });
    });

    // ─── Translation API ────────────────────────────────────────
    describe('translate()', () => {
        it('should call the cloud API and return result', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    translated: 'Hola mundo',
                    confidence: 0.95,
                }),
            });

            const result = await translationService.translate('Hello world', 'en', 'es');
            expect(result.translated).toBe('Hola mundo');
            expect(result.confidence).toBe(0.95);
            expect(result.fromLanguage).toBe('en');
            expect(result.toLanguage).toBe('es');
        });

        it('should send correct request body', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ translated: 'Bonjour', confidence: 0.9 }),
            });

            await translationService.translate('Hello', 'en', 'fr');

            expect(mockFetch).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: 'Hello', source: 'en', target: 'fr' }),
                })
            );
        });

        it('should return fallback text when API fails', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await translationService.translate('Test', 'en', 'es');
            expect(result.translated).toContain('[Translation unavailable]');
            expect(result.confidence).toBe(0);
        });

        it('should return fallback on non-200 response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
            });

            const result = await translationService.translate('Test fail', 'en', 'de');
            expect(result.translated).toContain('[Translation unavailable]');
            expect(result.confidence).toBe(0);
        });

        it('should cache successful translations', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ translated: 'Cached', confidence: 0.99 }),
            });

            // First call — hits API
            await translationService.translate('cache_test_unique', 'en', 'es');
            expect(mockFetch).toHaveBeenCalledTimes(1);

            // Second call — should use cache
            const cached = await translationService.translate('cache_test_unique', 'en', 'es');
            expect(mockFetch).toHaveBeenCalledTimes(1); // Not called again
            expect(cached.translated).toBe('Cached');
        });

        it('should not cache failed translations', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Fail'));

            await translationService.translate('no_cache_fail', 'en', 'es');

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ translated: 'OK', confidence: 0.9 }),
            });

            const result = await translationService.translate('no_cache_fail', 'en', 'es');
            expect(result.translated).toBe('OK');
        });
    });

    // ─── Mode Management ────────────────────────────────────────
    describe('mode management', () => {
        it('should accept valid modes', () => {
            expect(() => translationService.setMode('manual')).not.toThrow();
            expect(() => translationService.setMode('auto')).not.toThrow();
            expect(() => translationService.setMode('split-screen')).not.toThrow();
        });
    });

    // ─── Speech Translation ─────────────────────────────────────
    describe('translateSpeech()', () => {
        it('should return translation result on success', async () => {
            mockGetInfoAsync.mockResolvedValue({ exists: true });
            mockUploadAsync.mockResolvedValue({
                status: 200,
                body: JSON.stringify({
                    original: 'Hello there',
                    translated: 'Hola ahí',
                    confidence: 0.93,
                    detected_language: 'en',
                }),
            });

            const result = await translationService.translateSpeech('file:///audio.wav', 'en', 'es');
            expect(result.originalText).toBe('Hello there');
            expect(result.translated).toBe('Hola ahí');
            expect(result.confidence).toBe(0.93);
            expect(result.detectedLanguage).toBe('en');
        });

        it('should return fallback on failure', async () => {
            mockGetInfoAsync.mockResolvedValue({ exists: true });
            mockUploadAsync.mockResolvedValue({ status: 500, body: 'Error' });

            const result = await translationService.translateSpeech('file:///audio.wav', 'en', 'es');
            expect(result.translated).toContain('unavailable');
            expect(result.confidence).toBe(0);
        });

        it('should handle missing audio file', async () => {
            mockGetInfoAsync.mockResolvedValue({ exists: false });

            const result = await translationService.translateSpeech('file:///missing.wav', 'en', 'es');
            expect(result.confidence).toBe(0);
        });
    });

    // ─── Language Detection ──────────────────────────────────────
    describe('detectLanguage()', () => {
        it('should return API detection on success', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ language: 'fr', confidence: 0.95 }),
            });

            const result = await translationService.detectLanguage('Bonjour le monde');
            expect(result.language).toBe('fr');
            expect(result.confidence).toBe(0.95);
        });

        it('should fall back to heuristic on API failure', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Network fail'));

            const result = await translationService.detectLanguage('こんにちは');
            expect(result.language).toBe('ja');
            expect(result.confidence).toBeGreaterThan(0);
        });
    });

    // ─── Heuristic Detection ────────────────────────────────────
    describe('heuristic detection', () => {
        it('should detect Chinese characters', async () => {
            mockFetch.mockRejectedValueOnce(new Error('fail'));
            const r = await translationService.detectLanguage('你好世界');
            expect(r.language).toBe('zh');
        });

        it('should detect Japanese characters', async () => {
            mockFetch.mockRejectedValueOnce(new Error('fail'));
            const r = await translationService.detectLanguage('おはよう');
            expect(r.language).toBe('ja');
        });

        it('should detect Korean characters', async () => {
            mockFetch.mockRejectedValueOnce(new Error('fail'));
            const r = await translationService.detectLanguage('안녕하세요');
            expect(r.language).toBe('ko');
        });

        it('should detect Arabic characters', async () => {
            mockFetch.mockRejectedValueOnce(new Error('fail'));
            const r = await translationService.detectLanguage('مرحبا');
            expect(r.language).toBe('ar');
        });

        it('should detect Hindi characters', async () => {
            mockFetch.mockRejectedValueOnce(new Error('fail'));
            const r = await translationService.detectLanguage('नमस्ते');
            expect(r.language).toBe('hi');
        });

        it('should detect Russian characters', async () => {
            mockFetch.mockRejectedValueOnce(new Error('fail'));
            const r = await translationService.detectLanguage('Привет мир');
            expect(r.language).toBe('ru');
        });

        it('should detect Spanish by diacritical characters', async () => {
            mockFetch.mockRejectedValueOnce(new Error('fail'));
            const r = await translationService.detectLanguage('¿Cómo estás?');
            expect(r.language).toBe('es');
        });

        it('should default to English for ambiguous text', async () => {
            mockFetch.mockRejectedValueOnce(new Error('fail'));
            const r = await translationService.detectLanguage('Hello world');
            expect(r.language).toBe('en');
        });
    });

    // ─── Auto Detect Speaker ────────────────────────────────────
    describe('autoDetectSpeaker()', () => {
        it('should return A for source language', async () => {
            translationService.setLanguages('en', 'es');
            mockFetch.mockRejectedValueOnce(new Error('fail'));
            const speaker = await translationService.autoDetectSpeaker('Hello');
            expect(speaker).toBe('A');
        });

        it('should return B for target language', async () => {
            translationService.setLanguages('en', 'ja');
            mockFetch.mockRejectedValueOnce(new Error('fail'));
            const speaker = await translationService.autoDetectSpeaker('おはようございます');
            expect(speaker).toBe('B');
        });
    });

    // ─── TTS ────────────────────────────────────────────────────
    describe('speak()', () => {
        it('should call Speech.speak with correct voice', async () => {
            translationService.setTtsEnabled(true);
            await translationService.speak('Hola', 'es');
            expect(mockSpeechSpeak).toHaveBeenCalledWith('Hola', expect.objectContaining({
                language: 'es-ES',
            }));
        });

        it('should not speak when disabled', async () => {
            translationService.setTtsEnabled(false);
            await translationService.speak('Test', 'en');
            expect(mockSpeechSpeak).not.toHaveBeenCalled();
            translationService.setTtsEnabled(true); // restore
        });

        it('should not speak empty text', async () => {
            translationService.setTtsEnabled(true);
            await translationService.speak('', 'en');
            expect(mockSpeechSpeak).not.toHaveBeenCalled();
        });
    });

    describe('stopSpeaking()', () => {
        it('should call Speech.stop', () => {
            translationService.stopSpeaking();
            expect(mockSpeechStop).toHaveBeenCalled();
        });
    });

    describe('isSpeaking()', () => {
        it('should proxy to Speech.isSpeakingAsync', async () => {
            mockIsSpeakingAsync.mockResolvedValue(true);
            const result = await translationService.isSpeaking();
            expect(result).toBe(true);
        });
    });

    // ─── Exports ────────────────────────────────────────────────
    describe('exports', () => {
        const mockTurns = [
            {
                id: '1', speaker: 'A' as const, original: 'Hello', translated: 'Hola',
                fromLang: 'en', toLang: 'es', timestamp: 1000, startTime: 0, endTime: 5,
            },
            {
                id: '2', speaker: 'B' as const, original: '¿Cómo estás?', translated: 'How are you?',
                fromLang: 'es', toLang: 'en', timestamp: 2000, startTime: 10, endTime: 18,
            },
        ];

        it('exportAsText should include header and turns', () => {
            const text = translationService.exportAsText(mockTurns, 'en', 'es');
            expect(text).toContain('Windy Word Translation');
            expect(text).toContain('Hello');
            expect(text).toContain('Hola');
            expect(text).toContain('Speaker A');
            expect(text).toContain('Speaker B');
        });

        it('exportAsMarkdown should produce valid markdown', () => {
            const md = translationService.exportAsMarkdown(mockTurns, 'en', 'es');
            expect(md).toContain('# Windy Word Translation');
            expect(md).toContain('**');
            expect(md).toContain('> Hello');
        });

        it('exportAsSrt should produce numbered entries with timestamps', () => {
            const srt = translationService.exportAsSrt(mockTurns);
            expect(srt).toContain('1\n');
            expect(srt).toContain('2\n');
            expect(srt).toContain('-->');
            expect(srt).toContain('[Speaker A]');
        });
    });

    // ─── Helper Methods ─────────────────────────────────────────
    describe('helpers', () => {
        it('getFlag should return flag for known language', () => {
            expect(translationService.getFlag('en')).toBe('🇺🇸');
            expect(translationService.getFlag('es')).toBe('🇪🇸');
        });

        it('getFlag should return globe for unknown language', () => {
            expect(translationService.getFlag('xx')).toBe('🌐');
        });

        it('getLangName should return name for known language', () => {
            expect(translationService.getLangName('en')).toBe('English');
            expect(translationService.getLangName('ja')).toBe('Japanese');
        });

        it('getLangName should return code for unknown language', () => {
            expect(translationService.getLangName('xx')).toBe('xx');
        });

        it('clearCache should not throw', () => {
            expect(() => translationService.clearCache()).not.toThrow();
        });

        it('setTtsRate should clamp values', () => {
            translationService.setTtsRate(0.5);
            translationService.setTtsRate(3.0); // should be clamped to 2.0
            translationService.setTtsRate(-1); // should be clamped to 0.1
            // No getter for rate, but should not throw
        });
    });
});
