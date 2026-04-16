/**
 * Unit tests for trustApi. Covers:
 *   - getTrust returns server profile on ok
 *   - getTrust falls back to fair/1.0 default on server error
 *   - 5-minute cache reuses within TTL; `{ fresh: true }` bypasses
 *   - setTrustCache + peekTrust prime + read
 *
 * Usage pattern — tests can override per-passport by queueing fetch
 * responses before calling getTrust.
 */

const mockFetch = jest.fn();
global.fetch = mockFetch;

import {
    getTrust,
    getTrustOrNull,
    setTrustCache,
    clearTrustCache,
    peekTrust,
    type TrustProfile,
} from '../trustApi';

function profile(overrides: Partial<TrustProfile> = {}): TrustProfile {
    return {
        passport_number: 'ET26-AAAA-AAAA',
        status: 'active',
        integrity_score: 800,
        band: 'good',
        clearance_level: 'cleared',
        tier_multiplier: 2.0,
        dimensions: { honesty: 800, reliability: 800, compliance: 800, safety: 800, reputation: 800 },
        allowed_actions: ['read', 'send'],
        denied_actions: ['commit_push'],
        cache_ttl_seconds: 300,
        evaluated_at: '2026-04-16T00:00:00Z',
        ...overrides,
    };
}

function okJson(body: TrustProfile) {
    return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

beforeEach(() => {
    mockFetch.mockReset();
    clearTrustCache();
});

describe('trustApi.getTrust', () => {
    it('returns the server profile on 200', async () => {
        const p = profile({ passport_number: 'ET26-X' });
        mockFetch.mockResolvedValueOnce(okJson(p));
        const got = await getTrust('ET26-X');
        expect(got.passport_number).toBe('ET26-X');
        expect(got.band).toBe('good');
        const url = mockFetch.mock.calls[0][0];
        expect(url).toMatch(/\/api\/v1\/trust\/ET26-X$/);
    });

    it('falls back to fair/1.0 default on server error', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: () => Promise.resolve({}) });
        const got = await getTrust('ET26-Y');
        expect(got.band).toBe('fair');
        expect(got.tier_multiplier).toBe(1.0);
        expect(got.passport_number).toBe('ET26-Y');
    });

    it('falls back to default on network error', async () => {
        mockFetch.mockRejectedValueOnce(new Error('ETIMEDOUT'));
        const got = await getTrust('ET26-Z');
        expect(got.band).toBe('fair');
    });
});

describe('trustApi.getTrustOrNull strict mode', () => {
    it('returns null on error (no fallback)', async () => {
        mockFetch.mockResolvedValueOnce({ ok: false, status: 503, json: () => Promise.resolve({}) });
        const got = await getTrustOrNull('ET26-Q');
        expect(got).toBeNull();
    });
});

describe('trustApi cache', () => {
    it('reuses a cached hit within TTL', async () => {
        const p = profile({ passport_number: 'ET26-CACHE', band: 'exceptional' });
        mockFetch.mockResolvedValueOnce(okJson(p));

        const first = await getTrust('ET26-CACHE');
        const second = await getTrust('ET26-CACHE');
        expect(first.band).toBe('exceptional');
        expect(second.band).toBe('exceptional');
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('bypasses cache when { fresh: true }', async () => {
        const p1 = profile({ passport_number: 'ET26-F', band: 'good' });
        const p2 = profile({ passport_number: 'ET26-F', band: 'exceptional' });
        mockFetch
            .mockResolvedValueOnce(okJson(p1))
            .mockResolvedValueOnce(okJson(p2));

        const first = await getTrust('ET26-F');
        const second = await getTrust('ET26-F', { fresh: true });
        expect(first.band).toBe('good');
        expect(second.band).toBe('exceptional');
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('setTrustCache primes and peekTrust reads back', () => {
        const p = profile({ passport_number: 'ET26-SEED', band: 'critical' });
        setTrustCache('ET26-SEED', p);
        expect(peekTrust('ET26-SEED')?.band).toBe('critical');
    });

    it('clearTrustCache drops all entries', () => {
        setTrustCache('ET26-A', profile({ passport_number: 'ET26-A' }));
        setTrustCache('ET26-B', profile({ passport_number: 'ET26-B' }));
        clearTrustCache();
        expect(peekTrust('ET26-A')).toBeNull();
        expect(peekTrust('ET26-B')).toBeNull();
    });
});

describe('trustApi per-passport override pattern', () => {
    it('tests can override by priming the cache', async () => {
        // This is the pattern for tests in other modules that want deterministic
        // trust responses: prime with setTrustCache then call getTrust (skips network).
        setTrustCache('ET26-OVER', profile({ passport_number: 'ET26-OVER', band: 'exceptional', integrity_score: 950 }));
        const got = await getTrust('ET26-OVER');
        expect(got.band).toBe('exceptional');
        expect(got.integrity_score).toBe(950);
        expect(mockFetch).not.toHaveBeenCalled();
    });
});
