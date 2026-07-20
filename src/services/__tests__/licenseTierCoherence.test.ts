/**
 * 🧪 Tier coherence — paying web customers must NEVER resolve to 'free' on mobile.
 *
 * Regression test for the launch blocker where account-server tier strings
 * ('translate', 'translate-pro' — hyphen) were missing from
 * normalizeBackendTier's map and fell through to 'free', and where
 * validateLicense stored the RAW server string, so 'translate-pro' indexed
 * RECORDING_LIMITS / FEATURE_MATRIX as undefined (no features, no limit).
 *
 * Mirrors the mock conventions of src/services/__tests__/license.test.ts.
 */

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock expo-secure-store
const mockGetItemAsync = jest.fn();
const mockSetItemAsync = jest.fn();
const mockDeleteItemAsync = jest.fn();

jest.mock('expo-secure-store', () => ({
    getItemAsync: (...args: unknown[]) => mockGetItemAsync(...args),
    setItemAsync: (...args: unknown[]) => mockSetItemAsync(...args),
    deleteItemAsync: (...args: unknown[]) => mockDeleteItemAsync(...args),
}));

import {
    normalizeBackendTier,
    licenseService,
    FEATURE_MATRIX,
    RECORDING_LIMITS,
} from '../license';
import type { LicenseTier } from '@/types';

describe('Tier coherence (account-server ↔ mobile)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockReset();
    });

    // ─── account-server vocabulary (the money path) ─────────────
    describe('normalizeBackendTier — account-server tier strings', () => {
        const cases: [string, LicenseTier][] = [
            ['free', 'free'],
            ['pro', 'pro'],
            ['translate', 'translate'],
            ['translate-pro', 'translate_pro'], // hyphen — the server's dominant spelling
            ['translate_pro', 'translate_pro'], // underscore — used by some server paths
        ];

        test.each(cases)('account-server "%s" → mobile "%s"', (backend, expected) => {
            expect(normalizeBackendTier(backend)).toBe(expected);
        });

        it('paid tiers never resolve to free', () => {
            expect(normalizeBackendTier('pro')).not.toBe('free');
            expect(normalizeBackendTier('translate')).not.toBe('free');
            expect(normalizeBackendTier('translate-pro')).not.toBe('free');
        });
    });

    // ─── legacy cloud vocabulary must keep working ──────────────
    describe('normalizeBackendTier — legacy cloud tier strings', () => {
        it('ultra → translate (unchanged)', () => {
            expect(normalizeBackendTier('ultra')).toBe('translate');
        });

        it('max → translate_pro (unchanged)', () => {
            expect(normalizeBackendTier('max')).toBe('translate_pro');
        });
    });

    // ─── safety ─────────────────────────────────────────────────
    describe('normalizeBackendTier — safety', () => {
        it('unknown / empty / non-string tiers fall back to free', () => {
            expect(normalizeBackendTier('enterprise')).toBe('free');
            expect(normalizeBackendTier('')).toBe('free');
            expect(normalizeBackendTier(undefined as unknown as string)).toBe('free');
            expect(normalizeBackendTier(null as unknown as string)).toBe('free');
        });

        it('every normalized result is a valid RECORDING_LIMITS / FEATURE_MATRIX key', () => {
            const backendStrings = [
                'free', 'pro', 'translate', 'translate-pro', 'translate_pro',
                'ultra', 'max', 'enterprise', 'PREMIUM', '', 'garbage',
            ];
            for (const s of backendStrings) {
                const tier = normalizeBackendTier(s);
                expect(RECORDING_LIMITS[tier]).toBeDefined();
                expect(typeof RECORDING_LIMITS[tier]).toBe('number');
                expect(Array.isArray(FEATURE_MATRIX[tier])).toBe(true);
                expect(FEATURE_MATRIX[tier].length).toBeGreaterThan(0);
            }
        });
    });

    // ─── validateLicense must normalize the raw server tier ─────
    describe('validateLicense() normalizes server tier before indexing', () => {
        function mockActivate(tier: string): void {
            mockGetItemAsync.mockResolvedValue('test-jwt-token');
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    key: 'KEY-1',
                    tier,
                    activatedAt: '2026-01-01',
                    devicesUsed: 1,
                    devicesMax: 5,
                    features: [],
                }),
            });
        }

        it("server 'translate-pro' → translate_pro with valid limits + features", async () => {
            mockActivate('translate-pro');
            const result = await licenseService.validateLicense('KEY-1');
            expect(result.tier).toBe('translate_pro');
            expect(licenseService.getTier()).toBe('translate_pro');
            expect(licenseService.getMaxRecordingDuration()).toBe(RECORDING_LIMITS.translate_pro);
            expect(licenseService.isFeatureUnlocked('translate-offline')).toBe(true);
            expect(licenseService.isFeatureUnlocked('translate-cloud')).toBe(true);
            expect(licenseService.isFeatureUnlocked('cloud-sync')).toBe(true);
        });

        it("server 'translate' → translate with valid limits + features", async () => {
            mockActivate('translate');
            const result = await licenseService.validateLicense('KEY-1');
            expect(result.tier).toBe('translate');
            expect(licenseService.getTier()).toBe('translate');
            expect(licenseService.getMaxRecordingDuration()).toBe(RECORDING_LIMITS.translate);
            expect(licenseService.isFeatureUnlocked('translate-cloud')).toBe(true);
        });

        it("server 'pro' still works", async () => {
            mockActivate('pro');
            const result = await licenseService.validateLicense('KEY-1');
            expect(result.tier).toBe('pro');
            expect(licenseService.getMaxRecordingDuration()).toBe(RECORDING_LIMITS.pro);
            expect(licenseService.isFeatureUnlocked('cloud-sync')).toBe(true);
        });

        it('unknown server tier degrades to free — never an undefined limit', async () => {
            mockActivate('enterprise');
            const result = await licenseService.validateLicense('KEY-1');
            expect(result.tier).toBe('free');
            expect(licenseService.getTier()).toBe('free');
            expect(licenseService.getMaxRecordingDuration()).toBe(RECORDING_LIMITS.free);
            expect(licenseService.getMaxRecordingDuration()).not.toBeUndefined();
        });
    });
});
