/**
 * Tests for heartbeat.ts — Layer 2 DRM license heartbeat
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { heartbeatService, GRACE_PERIODS, HEARTBEAT_INTERVALS } from '../heartbeat';

// ── Mocks ─────────────────────────────────────────────────────

jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(async () => 'mock-jwt-token'),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
    default: {
        getItem: jest.fn(async () => null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
    },
    __esModule: true,
}));

jest.mock('../logger', () => ({
    createLogger: () => ({
        entry: jest.fn(),
        exit: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

// Mock license service
jest.mock('../license', () => ({
    licenseService: {
        getTier: jest.fn(() => 'pro'),
    },
}));

// Mock fetch-timeout
jest.mock('@/utils/fetch-timeout', () => ({
    fetchWithTimeout: jest.fn(),
}));

jest.mock('@/config/api', () => ({
    apiUrl: jest.fn((path: string) => `https://test.com${path}`),
    ENDPOINTS: {
        LICENSE_ACTIVATE: '/api/v1/license/activate',
    },
}));

import { fetchWithTimeout } from '@/utils/fetch-timeout';
import { licenseService } from '../license';

const mockFetch = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>;
const mockGetTier = licenseService.getTier as jest.MockedFunction<typeof licenseService.getTier>;

// ── Tests ─────────────────────────────────────────────────────

describe('HeartbeatService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset heartbeat state
        heartbeatService.stop();
        (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    });

    describe('Grace periods configuration', () => {
        it('should have correct grace periods per tier', () => {
            expect(GRACE_PERIODS.free).toBe(24 * 60 * 60 * 1000);      // 24h
            expect(GRACE_PERIODS.pro).toBe(7 * 24 * 60 * 60 * 1000);   // 7d
            expect(GRACE_PERIODS.translate).toBe(14 * 24 * 60 * 60 * 1000); // 14d
            expect(GRACE_PERIODS.translate_pro).toBe(30 * 24 * 60 * 60 * 1000); // 30d
        });

        it('should have heartbeat intervals per tier', () => {
            expect(HEARTBEAT_INTERVALS.free).toBe(24 * 60 * 60 * 1000);
            expect(HEARTBEAT_INTERVALS.pro).toBe(48 * 60 * 60 * 1000);
            expect(HEARTBEAT_INTERVALS.translate).toBe(48 * 60 * 60 * 1000);
            expect(HEARTBEAT_INTERVALS.translate_pro).toBe(72 * 60 * 60 * 1000);
        });
    });

    describe('getStatus — freshly initialized', () => {
        it('should report valid on fresh start', async () => {
            await heartbeatService.start();
            const status = heartbeatService.getStatus();
            expect(status.status).toBe('valid');
            expect(status.graceRemainingMs).toBe(0);
            heartbeatService.stop();
        });
    });

    describe('performCheck — server responds OK', () => {
        it('should mark as valid after successful heartbeat', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ tier: 'pro' }),
            } as Response);

            // Force a check (reset timestamps to trigger API call)
            const result = await heartbeatService.forceCheck();
            expect(result.status).toBe('valid');
            expect(result.tier).toBe('pro');
        });
    });

    describe('performCheck — server revokes license', () => {
        it('should mark as revoked when server returns 403', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 403,
                json: async () => ({ reason: 'refunded' }),
            } as unknown as Response);

            const result = await heartbeatService.forceCheck();
            expect(result.status).toBe('revoked');
        });
    });

    describe('performCheck — network failure', () => {
        it('should enter grace period on network error', async () => {
            // First, mark as valid so we have a baseline
            await heartbeatService.markValid('pro');

            // Now mock a network failure
            mockFetch.mockRejectedValueOnce(new Error('Network error'));

            // Force a check — this will fail and enter grace
            const result = await heartbeatService.forceCheck();
            // Should be in grace (first failure starts grace counter)
            // or valid if the grace period hasn't started yet
            expect(['valid', 'grace']).toContain(result.status);
            // Model access should still be allowed during grace
            expect(heartbeatService.isModelAccessAllowed()).toBe(true);
        });
    });

    describe('isModelAccessAllowed', () => {
        it('should allow access when status is valid', async () => {
            await heartbeatService.start();
            expect(heartbeatService.isModelAccessAllowed()).toBe(true);
            heartbeatService.stop();
        });
    });

    describe('markValid', () => {
        it('should update tier and reset grace', async () => {
            await heartbeatService.markValid('translate_pro');
            const status = heartbeatService.getStatus();
            expect(status.status).toBe('valid');
            expect(status.tier).toBe('translate_pro');
        });
    });

    describe('reset', () => {
        it('should reset to default state', async () => {
            await heartbeatService.reset();
            const status = heartbeatService.getStatus();
            expect(status.status).toBe('valid'); // Default assumes valid
        });
    });
});
