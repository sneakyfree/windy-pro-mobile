/**
 * 🧪 Unit tests for AnalyticsService
 * Tests tracking, summary, and persistence
 */

// Mock AsyncStorage
const mockGetItem = jest.fn();
const mockSetItem = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: (...args: unknown[]) => mockGetItem(...args),
        setItem: (...args: unknown[]) => mockSetItem(...args),
    },
}));

import { analyticsService } from '../analytics';

describe('AnalyticsService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetItem.mockResolvedValue(null);
        mockSetItem.mockResolvedValue(undefined);
    });

    // ─── Initialization ────────────────────────────────────────
    describe('initialize()', () => {
        it('should load analytics from AsyncStorage', async () => {
            const stored = JSON.stringify({
                totalTranslations: 10,
                totalRecordingDurationMs: 5000,
                totalScreenViews: 20,
                languagePairs: { 'en→es': 5 },
                screenViews: { 'translate': 10 },
                lastSessionStart: 1000,
            });
            mockGetItem.mockResolvedValue(stored);

            await analyticsService.initialize();

            const summary = analyticsService.getSummary();
            expect(summary.totalTranslations).toBe(10);
            expect(summary.totalScreenViews).toBe(20);
        });

        it('should handle empty AsyncStorage', async () => {
            mockGetItem.mockResolvedValue(null);
            await analyticsService.initialize();
            const summary = analyticsService.getSummary();
            expect(summary.totalTranslations).toBeGreaterThanOrEqual(0);
        });

        it('should handle corrupted storage gracefully', async () => {
            mockGetItem.mockResolvedValue('not-json{{');
            await expect(analyticsService.initialize()).resolves.not.toThrow();
        });
    });

    // ─── Tracking ──────────────────────────────────────────────
    describe('trackScreenView()', () => {
        it('should increment screen view count', () => {
            const before = analyticsService.getSummary().totalScreenViews;
            analyticsService.trackScreenView('test-screen');
            const after = analyticsService.getSummary().totalScreenViews;
            expect(after).toBe(before + 1);
        });

        it('should track specific screen names', () => {
            analyticsService.trackScreenView('unique-screen-99');
            const summary = analyticsService.getSummary();
            expect(summary.screenViews['unique-screen-99']).toBeGreaterThanOrEqual(1);
        });

        it('should persist after tracking', () => {
            analyticsService.trackScreenView('persist-test');
            // save() is called internally; eventually saves to AsyncStorage
            expect(mockSetItem).toHaveBeenCalled();
        });
    });

    describe('trackTranslation()', () => {
        it('should increment translation count', () => {
            const before = analyticsService.getSummary().totalTranslations;
            analyticsService.trackTranslation('en', 'es');
            const after = analyticsService.getSummary().totalTranslations;
            expect(after).toBe(before + 1);
        });

        it('should track language pairs', () => {
            analyticsService.trackTranslation('en', 'fr');
            const summary = analyticsService.getSummary();
            expect(summary.languagePairs['en→fr']).toBeGreaterThanOrEqual(1);
        });
    });

    describe('trackRecording()', () => {
        it('should add to total recording duration', () => {
            const before = analyticsService.getSummary().totalRecordingDurationMs;
            analyticsService.trackRecording(5000);
            const after = analyticsService.getSummary().totalRecordingDurationMs;
            expect(after).toBe(before + 5000);
        });
    });

    describe('trackOcr()', () => {
        it('should track as a translation with ocr source', () => {
            const before = analyticsService.getSummary().totalTranslations;
            analyticsService.trackOcr('es');
            const after = analyticsService.getSummary().totalTranslations;
            expect(after).toBe(before + 1);
        });
    });

    // ─── Query ─────────────────────────────────────────────────
    describe('getSummary()', () => {
        it('should return a copy (not direct reference)', () => {
            const s1 = analyticsService.getSummary();
            const s2 = analyticsService.getSummary();
            expect(s1).not.toBe(s2);
            expect(s1).toEqual(s2);
        });
    });

    describe('getTopLanguagePairs()', () => {
        it('should return sorted language pairs', () => {
            // Track multiple pairs
            for (let i = 0; i < 5; i++) analyticsService.trackTranslation('en', 'de');
            for (let i = 0; i < 3; i++) analyticsService.trackTranslation('en', 'ja');

            const top = analyticsService.getTopLanguagePairs(2);
            expect(top.length).toBeLessThanOrEqual(2);
            // First should have higher count
            if (top.length >= 2) {
                expect(top[0].count).toBeGreaterThanOrEqual(top[1].count);
            }
        });

        it('should respect N limit', () => {
            const top = analyticsService.getTopLanguagePairs(1);
            expect(top.length).toBeLessThanOrEqual(1);
        });
    });
});
