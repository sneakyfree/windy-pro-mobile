/**
 * 🧪 Unit tests for scoreAudioQuality()
 * Tests audio quality scoring logic used by the clone pipeline
 */
import { scoreAudioQuality } from '../audio-capture';
import type { AudioQuality } from '@/types';

describe('scoreAudioQuality', () => {
    // ─── Label Classification ───────────────────────────────────
    describe('quality label classification', () => {
        it('should return "excellent" for score >= 80', () => {
            // 60s, 44100 Hz, avgLevel 0.3, peak 0.7 → high score
            const result = scoreAudioQuality(60, 44100, 0.3, 0.7);
            expect(result.label).toBe('excellent');
            expect(result.score).toBeGreaterThanOrEqual(80);
        });

        it('should return "good" for score 60-79', () => {
            // 15s, 44100 Hz, avgLevel 0.08, peak 0.5
            const result = scoreAudioQuality(15, 44100, 0.08, 0.5);
            expect(result.label).toBe('good');
            expect(result.score).toBeGreaterThanOrEqual(60);
            expect(result.score).toBeLessThan(80);
        });

        it('should return "fair" for score 40-59', () => {
            // 15s, 16000 Hz, avgLevel 0.05, peak 0.3
            const result = scoreAudioQuality(15, 16000, 0.05, 0.3);
            expect(result.label).toBe('fair');
            expect(result.score).toBeGreaterThanOrEqual(40);
            expect(result.score).toBeLessThan(60);
        });

        it('should return "poor" for score < 40', () => {
            // 2s, 8000Hz, avgLevel 0.01, peak 0.99 (clipping)
            const result = scoreAudioQuality(2, 8000, 0.01, 0.99);
            expect(result.label).toBe('poor');
            expect(result.score).toBeLessThan(40);
        });
    });

    // ─── Duration Scoring ───────────────────────────────────────
    describe('duration factor', () => {
        it('should give max duration points at 60 seconds', () => {
            const short = scoreAudioQuality(10, 44100, 0.3, 0.7);
            const full = scoreAudioQuality(60, 44100, 0.3, 0.7);
            expect(full.score).toBeGreaterThan(short.score);
        });

        it('should cap duration points beyond 60 seconds', () => {
            const at60 = scoreAudioQuality(60, 44100, 0.3, 0.7);
            const at120 = scoreAudioQuality(120, 44100, 0.3, 0.7);
            expect(at60.score).toBe(at120.score);
        });

        it('should handle 0 duration gracefully', () => {
            const result = scoreAudioQuality(0, 44100, 0.3, 0.7);
            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(result.score).toBeLessThanOrEqual(100);
        });
    });

    // ─── Sample Rate Scoring ────────────────────────────────────
    describe('sample rate factor', () => {
        it('should reward 44100+ Hz with full points', () => {
            const hi = scoreAudioQuality(30, 44100, 0.3, 0.7);
            const lo = scoreAudioQuality(30, 8000, 0.3, 0.7);
            expect(hi.score).toBeGreaterThan(lo.score);
        });

        it('should give partial points for 16000 Hz', () => {
            const mid = scoreAudioQuality(30, 16000, 0.3, 0.7);
            const lo = scoreAudioQuality(30, 8000, 0.3, 0.7);
            expect(mid.score).toBeGreaterThan(lo.score);
        });

        it('should record the sample rate in result', () => {
            const result = scoreAudioQuality(30, 48000, 0.3, 0.7);
            expect(result.sampleRate).toBe(48000);
        });
    });

    // ─── Signal Level Scoring ───────────────────────────────────
    describe('signal level factor', () => {
        it('should reward optimal level range (0.1-0.7)', () => {
            const optimal = scoreAudioQuality(30, 44100, 0.3, 0.7);
            const quiet = scoreAudioQuality(30, 44100, 0.01, 0.05);
            expect(optimal.score).toBeGreaterThan(quiet.score);
        });

        it('should give partial credit for levels >= 0.05', () => {
            const partial = scoreAudioQuality(30, 44100, 0.06, 0.3);
            const silent = scoreAudioQuality(30, 44100, 0.01, 0.05);
            expect(partial.score).toBeGreaterThan(silent.score);
        });
    });

    // ─── Clipping Detection ─────────────────────────────────────
    describe('clipping detection', () => {
        it('should detect clipping when peak > 0.98', () => {
            const result = scoreAudioQuality(30, 44100, 0.3, 0.99);
            expect(result.hasClipping).toBe(true);
        });

        it('should not detect clipping when peak <= 0.98', () => {
            const result = scoreAudioQuality(30, 44100, 0.3, 0.7);
            expect(result.hasClipping).toBe(false);
        });

        it('should penalize score for clipping', () => {
            const clean = scoreAudioQuality(30, 44100, 0.3, 0.7);
            const clipped = scoreAudioQuality(30, 44100, 0.3, 0.99);
            expect(clean.score).toBeGreaterThan(clipped.score);
        });
    });

    // ─── Speech Ratio Estimation ────────────────────────────────
    describe('speech ratio estimation', () => {
        it('should estimate speech ratio from avgLevel', () => {
            const loud = scoreAudioQuality(30, 44100, 0.5, 0.7);
            expect(loud.speechRatio).toBeGreaterThan(0);
            expect(loud.speechRatio).toBeLessThanOrEqual(1);
        });

        it('should cap speech ratio at 1.0', () => {
            const very = scoreAudioQuality(30, 44100, 0.9, 0.95);
            expect(very.speechRatio).toBeLessThanOrEqual(1);
        });
    });

    // ─── SNR Calculation ────────────────────────────────────────
    describe('SNR dB calculation', () => {
        it('should calculate positive SNR for reasonable levels', () => {
            const result = scoreAudioQuality(30, 44100, 0.3, 0.7);
            expect(result.snrDb).toBeGreaterThan(0);
        });

        it('should return 0 SNR for 0 avgLevel', () => {
            const result = scoreAudioQuality(30, 44100, 0, 0.01);
            expect(result.snrDb).toBe(0);
        });
    });

    // ─── Score Bounds ───────────────────────────────────────────
    describe('score bounds', () => {
        it('should never exceed 100', () => {
            // Best possible inputs
            const result = scoreAudioQuality(120, 96000, 0.5, 0.5);
            expect(result.score).toBeLessThanOrEqual(100);
        });

        it('should never go below 0', () => {
            // Worst possible inputs
            const result = scoreAudioQuality(0, 1, 0, 0.99);
            expect(result.score).toBeGreaterThanOrEqual(0);
        });
    });
});
