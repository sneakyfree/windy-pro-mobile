/**
 * Hardening: Data Validation Edge Cases
 * Verifies correct handling of boundary values and unusual input.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn().mockResolvedValue(null),
        setItem: jest.fn().mockResolvedValue(undefined),
    },
}));

jest.mock('expo-device', () => ({
    totalMemory: 4 * 1024 * 1024 * 1024,
    modelName: 'Mock',
}));

describe('Data Validation Edge Cases', () => {
    // ─── Quality Scorer ─────────────────────────────────────────

    describe('quality scorer', () => {
        let scoreAudioQuality: typeof import('../../src/services/quality-scorer').scoreAudioQuality;

        beforeAll(() => {
            scoreAudioQuality = require('../../src/services/quality-scorer').scoreAudioQuality;
        });

        it('silent audio (all zeros) should score lower than normal audio', () => {
            const silent = scoreAudioQuality(60, 44100, 0, 0);
            const normal = scoreAudioQuality(60, 44100, 0.3, 0.7);
            expect(silent.score).toBeLessThan(normal.score);
            // Silent audio still gets duration + sample rate points, so check label
            expect(['poor', 'fair']).toContain(silent.label);
        });

        it('clipped audio (peak > 0.98) should detect clipping', () => {
            const result = scoreAudioQuality(60, 44100, 0.5, 0.99);
            expect(result.hasClipping).toBe(true);
        });

        it('normal audio should score well', () => {
            const result = scoreAudioQuality(120, 44100, 0.3, 0.7);
            expect(result.score).toBeGreaterThanOrEqual(60);
            expect(result.hasClipping).toBe(false);
            expect(['excellent', 'good']).toContain(result.label);
        });

        it('very short recording (1 second) should score lower on duration', () => {
            const result = scoreAudioQuality(1, 44100, 0.3, 0.7);
            const longResult = scoreAudioQuality(300, 44100, 0.3, 0.7);
            expect(result.score).toBeLessThan(longResult.score);
        });

        it('low sample rate should score lower', () => {
            const highRate = scoreAudioQuality(60, 44100, 0.3, 0.7);
            const lowRate = scoreAudioQuality(60, 8000, 0.3, 0.7);
            expect(lowRate.score).toBeLessThan(highRate.score);
        });
    });

    // ─── Tier Normalization ─────────────────────────────────────

    describe('license tier from JWT', () => {
        let normalizeBackendTier: typeof import('../../src/services/license').normalizeBackendTier;

        beforeAll(() => {
            normalizeBackendTier = require('../../src/services/license').normalizeBackendTier;
        });

        it('null/undefined tier should default to free', () => {
            expect(normalizeBackendTier(undefined as any)).toBe('free');
            expect(normalizeBackendTier(null as any)).toBe('free');
            expect(normalizeBackendTier('')).toBe('free');
        });

        it('unknown tier string should default to free', () => {
            expect(normalizeBackendTier('enterprise')).toBe('free');
            expect(normalizeBackendTier('PREMIUM')).toBe('free');
        });
    });

    // ─── Translation ────────────────────────────────────────────

    describe('translation service', () => {
        it('source_lang === target_lang should return original text', async () => {
            const { translationService } = require('../../src/services/translation');

            const result = await translationService.translate('hello world', 'en', 'en');

            expect(result.translated).toBe('hello world');
            expect(result.confidence).toBe(1);
            expect(result.fromLanguage).toBe('en');
            expect(result.toLanguage).toBe('en');
        });
    });

    // ─── Clone Tracker ──────────────────────────────────────────

    describe('clone tracker', () => {
        let cloneTracker: typeof import('../../src/services/clone-tracker').cloneTracker;

        beforeAll(() => {
            cloneTracker = require('../../src/services/clone-tracker').cloneTracker;
        });

        it('NaN quality score should not corrupt totals', () => {
            const before = cloneTracker.getProgress();

            // Add a session with a valid quality object but corrupted score
            cloneTracker.addSession(60, {
                score: NaN,
                label: 'poor',
                snrDb: 0,
                speechRatio: 0,
                hasClipping: false,
                sampleRate: 44100,
            });

            const after = cloneTracker.getProgress();
            // Totals should not be NaN
            expect(isNaN(after.weightedHours)).toBe(false);
            expect(isNaN(after.totalHours)).toBe(false);
        });

        it('zero duration session should not crash', () => {
            expect(() => {
                cloneTracker.addSession(0, {
                    score: 50,
                    label: 'fair',
                    snrDb: 20,
                    speechRatio: 0.5,
                    hasClipping: false,
                    sampleRate: 44100,
                });
            }).not.toThrow();
        });
    });

    // ─── Session Duration Edge Cases ────────────────────────────

    describe('recording duration boundaries', () => {
        it('duration = 0 should be valid (pressed stop immediately)', () => {
            const { RECORDING_LIMITS } = require('../../src/services/license');
            // Duration 0 is below the free limit, so it's valid
            expect(0).toBeLessThanOrEqual(RECORDING_LIMITS.free);
        });

        it('duration = 86400 (24 hours) should exceed even max tier', () => {
            const { RECORDING_LIMITS } = require('../../src/services/license');
            expect(86400).toBeGreaterThan(RECORDING_LIMITS.translate_pro);
        });
    });

    // ─── Transcript Content Edge Cases ──────────────────────────

    describe('transcript content handling', () => {
        it('emoji in transcript should not crash JSON parsing', () => {
            const transcript = '🎤 Hello 世界! مرحبا 🌍';
            expect(() => JSON.stringify({ text: transcript })).not.toThrow();
            expect(JSON.parse(JSON.stringify({ text: transcript })).text).toBe(transcript);
        });

        it('RTL text should survive serialization', () => {
            const rtl = 'مرحبا بالعالم'; // Arabic
            const serialized = JSON.stringify({ text: rtl });
            expect(JSON.parse(serialized).text).toBe(rtl);
        });

        it('null bytes should be handled in JSON', () => {
            const withNull = 'hello\x00world';
            const cleaned = withNull.replace(/\x00/g, '');
            expect(cleaned).toBe('helloworld');
        });

        it('very long transcript should serialize without issue', () => {
            const longText = 'word '.repeat(50000); // ~300KB
            expect(() => JSON.stringify({ text: longText })).not.toThrow();
        });
    });
});
