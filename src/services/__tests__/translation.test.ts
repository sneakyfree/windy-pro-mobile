/**
 * 🧪 Unit tests for TranslationService
 * Tests caching, language management, error fallback, and API
 */

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Import after mocking
import { translationService, TIER_1_LANGUAGES } from '../translation';

describe('TranslationService', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        // Clear internal cache by resetting the service
        // Since it's a singleton, we need to clear cache indirectly
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
});
