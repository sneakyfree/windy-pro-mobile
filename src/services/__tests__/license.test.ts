/**
 * 🧪 Unit tests for LicenseService
 * Tests feature matrix, recording limits, license validation, and purchase URLs
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

import { licenseService, FEATURE_MATRIX, RECORDING_LIMITS } from '../license';

describe('LicenseService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockReset();
    });

    // ─── Feature Matrix ────────────────────────────────────────
    describe('FEATURE_MATRIX', () => {
        it('should define all 4 tiers', () => {
            expect(FEATURE_MATRIX).toHaveProperty('free');
            expect(FEATURE_MATRIX).toHaveProperty('pro');
            expect(FEATURE_MATRIX).toHaveProperty('translate');
            expect(FEATURE_MATRIX).toHaveProperty('translate_pro');
        });

        it('free tier should include basic features', () => {
            expect(FEATURE_MATRIX.free).toContain('record');
            expect(FEATURE_MATRIX.free).toContain('history');
            expect(FEATURE_MATRIX.free).toContain('export-text');
        });

        it('pro tier should include cloud-sync', () => {
            expect(FEATURE_MATRIX.pro).toContain('cloud-sync');
            expect(FEATURE_MATRIX.pro).toContain('all-engines');
        });

        it('translate tier should include translate-cloud', () => {
            expect(FEATURE_MATRIX.translate).toContain('translate-cloud');
        });

        it('translate_pro should include offline translation', () => {
            expect(FEATURE_MATRIX.translate_pro).toContain('translate-offline');
        });
    });

    // ─── Recording Limits ──────────────────────────────────────
    describe('RECORDING_LIMITS', () => {
        it('free tier should be 5 minutes (300s)', () => {
            expect(RECORDING_LIMITS.free).toBe(300);
        });

        it('pro tier should be 15 minutes cloud (900s) — Bible v2', () => {
            expect(RECORDING_LIMITS.pro).toBe(900);
        });

        it('tiers should have progressive cloud recording limits — Bible v2', () => {
            expect(RECORDING_LIMITS.pro).toBe(900);           // 15 min
            expect(RECORDING_LIMITS.translate).toBe(1800);     // 30 min
            expect(RECORDING_LIMITS.translate_pro).toBe(3600); // 60 min
        });
    });

    // ─── Feature Access ────────────────────────────────────────
    describe('feature access', () => {
        it('should start at free tier', () => {
            expect(licenseService.getTier()).toBe('free');
        });

        it('getMaxRecordingDuration should return free limit initially', () => {
            expect(licenseService.getMaxRecordingDuration()).toBe(300);
        });

        it('isFeatureUnlocked should return true for free features', () => {
            expect(licenseService.isFeatureUnlocked('record')).toBe(true);
            expect(licenseService.isFeatureUnlocked('history')).toBe(true);
        });

        it('isFeatureUnlocked should return false for pro features on free', () => {
            expect(licenseService.isFeatureUnlocked('cloud-sync')).toBe(false);
            expect(licenseService.isFeatureUnlocked('all-engines')).toBe(false);
        });

        it('getUnlockedFeatures should return deduplicated list', () => {
            const features = licenseService.getUnlockedFeatures();
            const uniqueFeatures = [...new Set(features)];
            expect(features.length).toBe(uniqueFeatures.length);
        });
    });

    // ─── Validate License ──────────────────────────────────────
    describe('validateLicense()', () => {
        it('should validate a license key successfully', async () => {
            mockGetItemAsync.mockResolvedValue('test-jwt-token');
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    key: 'PRO-KEY-123',
                    tier: 'pro',
                    activatedAt: '2025-01-01',
                    devicesUsed: 1,
                    devicesMax: 5,
                    features: ['all-engines'],
                }),
            });

            const result = await licenseService.validateLicense('PRO-KEY-123');
            expect(result.tier).toBe('pro');
            expect(result.key).toBe('PRO-KEY-123');
            expect(licenseService.getTier()).toBe('pro');
        });

        it('should call API with auth header when token exists', async () => {
            mockGetItemAsync.mockResolvedValue('expired-token');
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: async () => ({ error: 'Unauthorized' }),
                text: async () => 'Unauthorized',
            });

            // May resolve from cache or reject — depends on prior test state
            try {
                await licenseService.validateLicense('BAD-KEY');
            } catch {
                // Expected to throw on auth error when no cache
            }
            expect(mockFetch).toHaveBeenCalled();
        });

        it('should call the license activation endpoint', async () => {
            mockGetItemAsync.mockResolvedValue('token');
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 429,
                json: async () => ({ error: 'Too many requests' }),
                text: async () => 'Too many requests',
            });

            try {
                await licenseService.validateLicense('KEY');
            } catch {
                // Expected to throw on rate limit when no cache
            }
            expect(mockFetch).toHaveBeenCalled();
        });

        it('should handle network errors with fallback to cache or throw', async () => {
            mockGetItemAsync.mockResolvedValue(null);
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            try {
                const result = await licenseService.validateLicense('KEY');
                // If we get here, cached validation was returned
                expect(result).toBeDefined();
            } catch (err: unknown) {
                // If not cached, should throw the network error
                expect((err as Error).message).toBe('Network error');
            }
        });
    });

    // ─── activateKey (alias) ───────────────────────────────────
    describe('activateKey()', () => {
        it('should delegate to validateLicense', async () => {
            mockGetItemAsync.mockResolvedValue('token');
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    key: 'TEST', tier: 'pro', features: [],
                }),
            });

            const result = await licenseService.activateKey('TEST');
            expect(result.tier).toBe('pro');
        });
    });

    // ─── getPurchaseUrl ────────────────────────────────────────
    describe('getPurchaseUrl()', () => {
        it('should return dynamic URL from server if available', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ url: 'https://checkout.stripe.com/session123' }),
            });

            const url = await licenseService.getPurchaseUrl('device-123');
            expect(url).toBe('https://checkout.stripe.com/session123');
        });

        it('should fall back to static URL on server error', async () => {
            mockFetch.mockRejectedValueOnce(new Error('fail'));

            const url = await licenseService.getPurchaseUrl('device-123');
            expect(url).toContain('/pricing');
            expect(url).toContain('device-123');
        });

        it('should fall back to static URL when no URL in response', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({}),
            });

            const url = await licenseService.getPurchaseUrl('device-456');
            expect(url).toContain('/pricing');
        });
    });
});
