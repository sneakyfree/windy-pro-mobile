/**
 * 🧪 Unit tests for ChatTranslateService
 * Tests LRU cache, language detection, translation middleware, edge cases.
 */

// ─── Mocks ──────────────────────────────────────────────────────

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn().mockResolvedValue(null),
        setItem: jest.fn().mockResolvedValue(undefined),
    },
}));

const mockTranslate = jest.fn();
const mockDetectLanguage = jest.fn();

jest.mock('../translation', () => ({
    translationService: {
        translate: (...args: unknown[]) => mockTranslate(...args),
        detectLanguage: (...args: unknown[]) => mockDetectLanguage(...args),
    },
    TIER_1_LANGUAGES: [
        { code: 'en', name: 'English', flag: '🇬🇧' },
        { code: 'es', name: 'Spanish', flag: '🇪🇸' },
        { code: 'fr', name: 'French', flag: '🇫🇷' },
        { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
    ],
}));

import { chatTranslateService } from '../chatTranslate';
import type { ChatMessage } from '../chatClient';

// Helper: create a ChatMessage
function makeMsg(opts: Partial<ChatMessage> & { body: string }): ChatMessage {
    const { body, ...rest } = opts;
    return {
        eventId: `evt-${Math.random().toString(36).slice(2, 8)}`,
        roomId: '!room:matrix.org',
        sender: '@other:matrix.org',
        body,
        timestamp: Date.now(),
        type: 'text',
        isOwn: false,
        ...rest,
    };
}

describe('ChatTranslateService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockTranslate.mockReset();
        mockDetectLanguage.mockReset();
        chatTranslateService.clearCache();
        chatTranslateService.setUserLanguage('en');
    });

    // ─── translateMessage: basics ───────────────────────────────

    describe('translateMessage()', () => {
        it('should skip translation for own messages', async () => {
            const msg = makeMsg({ body: 'Hello', isOwn: true });
            const result = await chatTranslateService.translateMessage(msg);

            expect(result.wasTranslated).toBe(false);
            expect(result.translatedBody).toBeNull();
            expect(mockTranslate).not.toHaveBeenCalled();
        });

        it('should skip translation when source lang matches user lang', async () => {
            const msg = makeMsg({ body: 'Hello', originalLang: 'en' });
            const result = await chatTranslateService.translateMessage(msg);

            expect(result.wasTranslated).toBe(false);
            expect(mockTranslate).not.toHaveBeenCalled();
        });

        it('should translate when source lang differs from user lang', async () => {
            mockTranslate.mockResolvedValue({ translated: 'Hello' });
            const msg = makeMsg({ body: 'Hola', originalLang: 'es' });

            const result = await chatTranslateService.translateMessage(msg);

            expect(result.wasTranslated).toBe(true);
            expect(result.translatedBody).toBe('Hello');
            expect(result.detectedLang).toBe('es');
            expect(result.langName).toBe('Spanish');
            expect(result.langFlag).toBe('🇪🇸');
            expect(mockTranslate).toHaveBeenCalledWith('Hola', 'es', 'en');
        });

        it('should auto-detect language when no originalLang', async () => {
            mockDetectLanguage.mockResolvedValue({ language: 'fr', confidence: 0.95 });
            mockTranslate.mockResolvedValue({ translated: 'Hello' });
            const msg = makeMsg({ body: 'Bonjour' });

            const result = await chatTranslateService.translateMessage(msg);

            expect(mockDetectLanguage).toHaveBeenCalledWith('Bonjour');
            expect(result.wasTranslated).toBe(true);
            expect(result.detectedLang).toBe('fr');
        });

        it('should not translate when auto-detected lang matches user lang', async () => {
            mockDetectLanguage.mockResolvedValue({ language: 'en', confidence: 0.99 });
            const msg = makeMsg({ body: 'Hello' });

            const result = await chatTranslateService.translateMessage(msg);

            expect(result.wasTranslated).toBe(false);
            expect(mockTranslate).not.toHaveBeenCalled();
        });

        it('should handle translation failure gracefully', async () => {
            mockTranslate.mockRejectedValue(new Error('Translation engine unavailable'));
            const msg = makeMsg({ body: 'Hola', originalLang: 'es' });

            const result = await chatTranslateService.translateMessage(msg);

            expect(result.wasTranslated).toBe(false);
            expect(result.translatedBody).toBeNull();
        });

        it('should handle detection failure gracefully', async () => {
            mockDetectLanguage.mockRejectedValue(new Error('Detection failed'));
            const msg = makeMsg({ body: 'Something' });

            const result = await chatTranslateService.translateMessage(msg);

            expect(result.wasTranslated).toBe(false);
        });
    });

    // ─── LRU Cache ─────────────────────────────────────────────

    describe('LRU cache', () => {
        it('should cache translated results', async () => {
            mockTranslate.mockResolvedValue({ translated: 'Hello' });
            const msg = makeMsg({ body: 'Hola', originalLang: 'es', eventId: 'evt-cache-1' });

            await chatTranslateService.translateMessage(msg);
            await chatTranslateService.translateMessage(msg);

            expect(mockTranslate).toHaveBeenCalledTimes(1);
        });

        it('should cache own messages too', async () => {
            const msg = makeMsg({ body: 'Hello', isOwn: true, eventId: 'evt-own-cache' });

            const r1 = await chatTranslateService.translateMessage(msg);
            const r2 = await chatTranslateService.translateMessage(msg);

            expect(r1).toEqual(r2);
        });

        it('should evict oldest when exceeding 100 entries', async () => {
            mockTranslate.mockImplementation((_: string) =>
                Promise.resolve({ translated: `translated` })
            );

            for (let i = 0; i < 101; i++) {
                const msg = makeMsg({ body: `text_${i}`, originalLang: 'es', eventId: `evt-evict-${i}` });
                await chatTranslateService.translateMessage(msg);
            }

            // First entry should be evicted, requesting again should re-translate
            const firstMsg = makeMsg({ body: 'text_0', originalLang: 'es', eventId: 'evt-evict-0' });
            await chatTranslateService.translateMessage(firstMsg);

            // 101 initial + 1 re-translation = 102
            expect(mockTranslate).toHaveBeenCalledTimes(102);
        });

        it('should clear cache entirely', async () => {
            mockTranslate.mockResolvedValue({ translated: 'Hello' });
            const msg = makeMsg({ body: 'Hola', originalLang: 'es', eventId: 'evt-clear' });

            await chatTranslateService.translateMessage(msg);
            chatTranslateService.clearCache();
            await chatTranslateService.translateMessage(msg);

            expect(mockTranslate).toHaveBeenCalledTimes(2);
        });
    });

    // ─── Language Config ────────────────────────────────────────

    describe('language config', () => {
        it('should get/set user language', () => {
            chatTranslateService.setUserLanguage('fr');
            expect(chatTranslateService.getUserLanguage()).toBe('fr');
        });

        it('should return send language matching user language', () => {
            chatTranslateService.setUserLanguage('es');
            expect(chatTranslateService.getSendLanguage()).toBe('es');
        });
    });

    // ─── translateMessages (batch) ─────────────────────────────

    describe('translateMessages()', () => {
        it('should translate multiple messages in parallel', async () => {
            mockTranslate
                .mockResolvedValueOnce({ translated: 'Hello' })
                .mockResolvedValueOnce({ translated: 'Goodbye' });

            const msgs = [
                makeMsg({ body: 'Hola', originalLang: 'es', eventId: 'evt-batch-1' }),
                makeMsg({ body: 'Adiós', originalLang: 'es', eventId: 'evt-batch-2' }),
            ];

            const results = await chatTranslateService.translateMessages(msgs);

            expect(results).toHaveLength(2);
            expect(results[0].translatedBody).toBe('Hello');
            expect(results[1].translatedBody).toBe('Goodbye');
        });
    });

    // ─── Edge Cases ─────────────────────────────────────────────

    describe('edge cases', () => {
        it('should handle empty body', async () => {
            const msg = makeMsg({ body: '', originalLang: 'es' });
            const result = await chatTranslateService.translateMessage(msg);

            // Empty body should not trigger translation
            expect(result.wasTranslated).toBe(false);
        });

        it('should handle RTL text (Arabic)', async () => {
            mockTranslate.mockResolvedValue({ translated: 'Hello world' });
            const msg = makeMsg({ body: 'مرحبا بالعالم', originalLang: 'ar' });

            const result = await chatTranslateService.translateMessage(msg);

            expect(result.wasTranslated).toBe(true);
            expect(result.translatedBody).toBe('Hello world');
            expect(result.langFlag).toBe('🇸🇦');
        });

        it('should handle very long message (10K chars)', async () => {
            const longText = 'a'.repeat(10000);
            mockTranslate.mockResolvedValue({ translated: 'b'.repeat(10000) });
            const msg = makeMsg({ body: longText, originalLang: 'es' });

            const result = await chatTranslateService.translateMessage(msg);

            expect(result.translatedBody?.length).toBe(10000);
        });

        it('should use globe emoji for unknown languages', async () => {
            mockTranslate.mockResolvedValue({ translated: 'Hello' });
            const msg = makeMsg({ body: 'Test', originalLang: 'xx' });

            const result = await chatTranslateService.translateMessage(msg);

            expect(result.langFlag).toBe('🌐');
        });
    });
});
