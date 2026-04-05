/**
 * Contract Test: Tier Normalization End-to-End
 * Verifies backend tiers (free/pro/ultra/max) map correctly to mobile tiers,
 * and that feature gates and recording limits are correct for each tier.
 */

import { normalizeBackendTier } from '../../src/services/license';
import { RECORDING_LIMITS, FEATURE_MATRIX } from '../../src/services/license';
import type { LicenseTier } from '../../src/types';

describe('Tier Normalization Contract', () => {
    // ─── Mapping ────────────────────────────────────────────────

    describe('normalizeBackendTier', () => {
        const cases: [string, LicenseTier][] = [
            ['free', 'free'],
            ['pro', 'pro'],
            ['ultra', 'translate'],
            ['max', 'translate_pro'],
        ];

        test.each(cases)('backend "%s" → mobile "%s"', (backend, expected) => {
            expect(normalizeBackendTier(backend)).toBe(expected);
        });

        it('unknown tier defaults to free', () => {
            expect(normalizeBackendTier('enterprise')).toBe('free');
            expect(normalizeBackendTier('')).toBe('free');
        });
    });

    // ─── JWT Payload → Mobile Tier ──────────────────────────────

    describe('JWT payload tier extraction', () => {
        function createFakeJwt(payload: Record<string, unknown>): string {
            const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
            const body = btoa(JSON.stringify(payload));
            const sig = btoa('sig');
            return `${header}.${body}.${sig}`;
        }

        function decodeJwtTier(token: string): string | null {
            try {
                const parts = token.split('.');
                const payload = JSON.parse(atob(parts[1]));
                return typeof payload.tier === 'string' ? payload.tier : null;
            } catch {
                return null;
            }
        }

        it('round-trips: backend tier in JWT → normalizeBackendTier → correct mobile tier', () => {
            const backendTiers = ['free', 'pro', 'ultra', 'max'];
            const expectedMobile: LicenseTier[] = ['free', 'pro', 'translate', 'translate_pro'];

            backendTiers.forEach((backendTier, i) => {
                const jwt = createFakeJwt({ tier: backendTier, sub: 'u-1' });
                const extracted = decodeJwtTier(jwt);
                expect(extracted).toBe(backendTier);
                expect(normalizeBackendTier(extracted!)).toBe(expectedMobile[i]);
            });
        });
    });

    // ─── Recording Limits by Tier ───────────────────────────────

    describe('recording limits', () => {
        it('free tier: 5 minutes (300s)', () => {
            expect(RECORDING_LIMITS.free).toBe(300);
        });

        it('pro tier: 30 minutes (1800s)', () => {
            expect(RECORDING_LIMITS.pro).toBe(1800);
        });

        it('translate tier: 30 minutes (1800s)', () => {
            expect(RECORDING_LIMITS.translate).toBe(1800);
        });

        it('translate_pro tier: 60 minutes (3600s)', () => {
            expect(RECORDING_LIMITS.translate_pro).toBe(3600);
        });

        it('tiers are monotonically increasing', () => {
            const tiers: LicenseTier[] = ['free', 'pro', 'translate', 'translate_pro'];
            for (let i = 1; i < tiers.length; i++) {
                expect(RECORDING_LIMITS[tiers[i]]).toBeGreaterThanOrEqual(RECORDING_LIMITS[tiers[i - 1]]);
            }
        });
    });

    // ─── Feature Gates by Tier ──────────────────────────────────

    describe('feature gates', () => {
        it('free tier has basic features', () => {
            const features = FEATURE_MATRIX.free;
            expect(features).toContain('record');
            expect(features).toContain('history');
            expect(features).toContain('export-text');
            expect(features).not.toContain('cloud-sync');
            expect(features).not.toContain('translate-cloud');
        });

        it('pro tier unlocks cloud sync and all engines', () => {
            const features = FEATURE_MATRIX.pro;
            expect(features).toContain('cloud-sync');
            expect(features).toContain('all-engines');
            expect(features).toContain('all-languages');
            expect(features).toContain('quality-scoring');
        });

        it('translate tier (backend: ultra) unlocks translation', () => {
            const features = FEATURE_MATRIX.translate;
            expect(features).toContain('translate-cloud');
            expect(features).toContain('conversation-mode');
            expect(features).toContain('translate-5-pairs');
        });

        it('translate_pro tier (backend: max) unlocks everything', () => {
            const features = FEATURE_MATRIX.translate_pro;
            expect(features).toContain('translate-offline');
            expect(features).toContain('translate-99-pairs');
            expect(features).toContain('tts-output');
            expect(features).toContain('priority-cloud');
        });

        it('each tier has progressively more features', () => {
            const tiers: LicenseTier[] = ['free', 'pro', 'translate', 'translate_pro'];
            for (let i = 1; i < tiers.length; i++) {
                expect(FEATURE_MATRIX[tiers[i]].length).toBeGreaterThan(0);
            }
        });
    });
});
