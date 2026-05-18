/**
 * Unit tests for trustMonitor.
 *
 * Covers:
 *   - start / stop lifecycle (AppState listener attach/detach)
 *   - track / untrack / getTracked
 *   - baseline seeding: first tick after track() must NOT fire a notification
 *   - band change fires exactly one notification with the right body
 *   - clearance change fires exactly one notification
 *   - unchanged tick emits nothing
 *   - pause on background, resume on foreground
 *   - polling failures (null profile, thrown error) don't crash the loop
 */

const mockAppStateListeners: Array<(state: string) => void> = [];
const mockAppStateRemove = jest.fn();
const mockScheduleNotification = jest.fn().mockResolvedValue(undefined);

jest.mock('react-native', () => {
    let currentState = 'active';
    return {
        AppState: {
            get currentState() { return currentState; },
            addEventListener: (event: string, listener: (state: string) => void) => {
                if (event === 'change') mockAppStateListeners.push(listener);
                return { remove: mockAppStateRemove };
            },
            // Test-only helper: swap AppState.currentState without triggering listeners.
            __setCurrentState(state: string) { currentState = state; },
            __fireChange(state: string) {
                currentState = state;
                mockAppStateListeners.forEach(l => l(state));
            },
        },
        Platform: { OS: 'ios', select: (obj: Record<string, unknown>) => obj.ios ?? obj.default },
    };
});

jest.mock('expo-file-system/legacy', () => ({
    documentDirectory: '/mock/doc/',
    cacheDirectory: '/mock/cache/',
    getInfoAsync: jest.fn(() => Promise.resolve({ exists: false })),
    writeAsStringAsync: jest.fn(() => Promise.resolve()),
    readAsStringAsync: jest.fn(() => Promise.resolve('')),
    deleteAsync: jest.fn(() => Promise.resolve()),
    moveAsync: jest.fn(() => Promise.resolve()),
    makeDirectoryAsync: jest.fn(() => Promise.resolve()),
    EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));

jest.mock('expo-notifications', () => ({
    scheduleNotificationAsync: (...args: unknown[]) => mockScheduleNotification(...args),
}));

jest.mock('../trustApi', () => ({
    getTrustOrNull: jest.fn(),
    peekTrust: jest.fn(),
    TrustBand: {},
    TrustClearance: {},
}));

import { trustMonitor } from '../trust-monitor';
import { getTrustOrNull, peekTrust } from '../trustApi';
import type { TrustProfile } from '../trustApi';

const mockGetTrust = getTrustOrNull as jest.Mock;
const mockPeekTrust = peekTrust as jest.Mock;
const RN = jest.requireMock('react-native') as {
    AppState: {
        __setCurrentState(state: string): void;
        __fireChange(state: string): void;
    };
};

function profile(band: TrustProfile['band'] = 'good', clearance: TrustProfile['clearance_level'] = 'cleared'): TrustProfile {
    return {
        passport_number: 'ET26-TEST',
        status: 'active',
        integrity_score: 800,
        band,
        clearance_level: clearance,
        tier_multiplier: 2.0,
        dimensions: { honesty: 800, reliability: 800, compliance: 800, safety: 800, reputation: 800 },
        allowed_actions: [],
        denied_actions: [],
        cache_ttl_seconds: 300,
        evaluated_at: '2026-04-16T00:00:00Z',
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockAppStateListeners.length = 0;
    mockAppStateRemove.mockClear();
    RN.AppState.__setCurrentState('active');
    // Fresh tracked-map for every test.
    for (const p of trustMonitor.getTracked()) trustMonitor.untrack(p);
    trustMonitor.stop();
});

afterEach(() => {
    trustMonitor.stop();
    jest.useRealTimers();
});

describe('start / stop lifecycle', () => {
    it('attaches an AppState listener on start and removes it on stop', () => {
        trustMonitor.start();
        expect(mockAppStateListeners).toHaveLength(1);
        trustMonitor.stop();
        expect(mockAppStateRemove).toHaveBeenCalled();
    });

    it('is idempotent on double-start', () => {
        trustMonitor.start();
        trustMonitor.start();
        expect(mockAppStateListeners).toHaveLength(1);
    });
});

describe('track / untrack / getTracked', () => {
    it('adds passports and returns them', () => {
        trustMonitor.track('ET26-A', 'alpha');
        trustMonitor.track('ET26-B', 'beta');
        expect(trustMonitor.getTracked().sort()).toEqual(['ET26-A', 'ET26-B']);
    });

    it('ignores empty passports', () => {
        trustMonitor.track('', 'blank');
        expect(trustMonitor.getTracked()).toEqual([]);
    });

    it('does not double-track a passport', () => {
        trustMonitor.track('ET26-A', 'alpha');
        trustMonitor.track('ET26-A', 'alpha-renamed');
        expect(trustMonitor.getTracked()).toEqual(['ET26-A']);
    });

    it('untrack removes the entry', () => {
        trustMonitor.track('ET26-A', 'alpha');
        trustMonitor.untrack('ET26-A');
        expect(trustMonitor.getTracked()).toEqual([]);
    });
});

describe('change detection', () => {
    it('does NOT fire a notification on the first observation', async () => {
        mockPeekTrust.mockReturnValue(null);
        mockGetTrust.mockResolvedValue(profile('good', 'cleared'));
        trustMonitor.track('ET26-A', 'alpha');
        trustMonitor.start();
        // flush the immediate tick (polling schedules a microtask)
        await Promise.resolve();
        await Promise.resolve();
        expect(mockScheduleNotification).not.toHaveBeenCalled();
    });

    it('fires a single notification on band change', async () => {
        mockPeekTrust.mockReturnValue(profile('good', 'cleared'));
        // 1st tick no change, 2nd tick band flips
        mockGetTrust
            .mockResolvedValueOnce(profile('good', 'cleared'))
            .mockResolvedValueOnce(profile('exceptional', 'cleared'));
        trustMonitor.track('ET26-A', 'alpha');
        trustMonitor.start();
        await Promise.resolve(); await Promise.resolve();
        expect(mockScheduleNotification).not.toHaveBeenCalled();

        jest.advanceTimersByTime(60_000);
        await Promise.resolve(); await Promise.resolve();
        expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
        const arg = mockScheduleNotification.mock.calls[0][0];
        expect(arg.content.title).toBe('Trust level changed');
        expect(arg.content.body).toContain('alpha');
        expect(arg.content.body).toContain('band good → exceptional');
        expect(arg.content.data.passport).toBe('ET26-A');
    });

    it('fires on clearance change', async () => {
        mockPeekTrust.mockReturnValue(profile('good', 'cleared'));
        mockGetTrust
            .mockResolvedValueOnce(profile('good', 'cleared'))
            .mockResolvedValueOnce(profile('good', 'top_secret'));
        trustMonitor.track('ET26-A', 'alpha');
        trustMonitor.start();
        await Promise.resolve(); await Promise.resolve();
        jest.advanceTimersByTime(60_000);
        await Promise.resolve(); await Promise.resolve();
        expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
        expect(mockScheduleNotification.mock.calls[0][0].content.body).toContain('clearance cleared → top_secret');
    });

    it('silent on an unchanged tick', async () => {
        mockPeekTrust.mockReturnValue(profile('good', 'cleared'));
        mockGetTrust.mockResolvedValue(profile('good', 'cleared'));
        trustMonitor.track('ET26-A', 'alpha');
        trustMonitor.start();
        await Promise.resolve(); await Promise.resolve();
        jest.advanceTimersByTime(60_000);
        await Promise.resolve(); await Promise.resolve();
        expect(mockScheduleNotification).not.toHaveBeenCalled();
    });

    it('silent when server returns null (no profile)', async () => {
        mockPeekTrust.mockReturnValue(null);
        mockGetTrust.mockResolvedValue(null);
        trustMonitor.track('ET26-A', 'alpha');
        trustMonitor.start();
        await Promise.resolve(); await Promise.resolve();
        expect(mockScheduleNotification).not.toHaveBeenCalled();
    });

    it('does not crash the loop on a thrown fetch error', async () => {
        mockPeekTrust.mockReturnValue(null);
        mockGetTrust.mockRejectedValue(new Error('ETIMEDOUT'));
        trustMonitor.track('ET26-A', 'alpha');
        expect(() => trustMonitor.start()).not.toThrow();
        await Promise.resolve(); await Promise.resolve();
    });
});

describe('background / foreground', () => {
    it('pauses polling on background and resumes on foreground', async () => {
        mockPeekTrust.mockReturnValue(profile('good', 'cleared'));
        mockGetTrust.mockResolvedValue(profile('good', 'cleared'));
        trustMonitor.track('ET26-A', 'alpha');
        trustMonitor.start();
        await Promise.resolve(); await Promise.resolve();
        const callsAfterImmediate = mockGetTrust.mock.calls.length;

        RN.AppState.__fireChange('background');
        jest.advanceTimersByTime(60_000 * 5); // no polls should happen while background
        expect(mockGetTrust.mock.calls.length).toBe(callsAfterImmediate);

        RN.AppState.__fireChange('active');
        await Promise.resolve(); await Promise.resolve();
        expect(mockGetTrust.mock.calls.length).toBeGreaterThan(callsAfterImmediate);
    });
});
