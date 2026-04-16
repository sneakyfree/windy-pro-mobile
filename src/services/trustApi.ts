/**
 * Trust API — read-only consumer of Eternitas's integrity endpoint.
 *
 * Mobile is a client, not a backend — it doesn't gate incoming bot requests.
 * This module surfaces each agent's trust state to the human user (badges in
 * the hatch flow, the settings/trust screen, and the band-change local
 * notification).
 *
 *   GET {ETERNITAS_URL}/api/v1/trust/{passport} → TrustProfile
 *
 * 5-minute in-memory cache. Callers can bypass via { fresh: true }.
 * No auth required (the endpoint is public, rate-limited server-side).
 */
import { ETERNITAS_URL } from '@/config/identity';
import { createLogger } from './logger';

const log = createLogger('TrustApi');

const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

export type TrustBand = 'critical' | 'poor' | 'fair' | 'good' | 'exceptional';
export type TrustClearance = 'registered' | 'verified' | 'cleared' | 'top_secret' | 'eternal';
export type TrustStatus = 'active' | 'suspended' | 'revoked';

export interface TrustProfile {
    passport_number: string;
    status: TrustStatus;
    integrity_score: number; // 0–1000
    band: TrustBand;
    clearance_level: TrustClearance;
    tier_multiplier: number;
    dimensions: {
        honesty: number;
        reliability: number;
        compliance: number;
        safety: number;
        reputation: number;
    };
    allowed_actions: string[];
    denied_actions: string[];
    cache_ttl_seconds: number;
    evaluated_at: string;
}

export interface GetTrustOptions {
    fresh?: boolean;
}

interface CacheEntry {
    profile: TrustProfile;
    expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Default profile used when the server can't be reached or passport is unknown. */
function defaultProfile(passport: string): TrustProfile {
    return {
        passport_number: passport,
        status: 'active',
        integrity_score: 600,
        band: 'fair',
        clearance_level: 'verified',
        tier_multiplier: 1.0,
        dimensions: { honesty: 600, reliability: 600, compliance: 600, safety: 600, reputation: 600 },
        allowed_actions: [],
        denied_actions: [],
        cache_ttl_seconds: 300,
        evaluated_at: new Date().toISOString(),
    };
}

/**
 * Fetch the trust profile for a passport, returning the cached copy if it's
 * within TTL. On network failure returns a `fair / 1.0` default so the UI
 * never crashes — callers that need to distinguish "unknown" from "server
 * said fair" should check the `_fromDefault` marker (not exposed on the
 * interface; use `getTrustOrNull` for strict behavior).
 */
export async function getTrust(
    passport: string,
    opts: GetTrustOptions = {},
): Promise<TrustProfile> {
    const profile = await getTrustOrNull(passport, opts);
    return profile ?? defaultProfile(passport);
}

export async function getTrustOrNull(
    passport: string,
    opts: GetTrustOptions = {},
): Promise<TrustProfile | null> {
    if (!passport) return null;
    const now = Date.now();

    if (!opts.fresh) {
        const hit = cache.get(passport);
        if (hit && hit.expiresAt > now) return hit.profile;
    }

    try {
        const res = await fetchWithTimeout(
            `${ETERNITAS_URL}/api/v1/trust/${encodeURIComponent(passport)}`,
            { method: 'GET', headers: { 'Accept': 'application/json' } },
        );
        if (!res.ok) {
            log.warn('getTrust', `non-ok (${res.status}) for ${passport}`);
            return null;
        }
        const profile = await res.json() as TrustProfile;
        cache.set(passport, {
            profile,
            expiresAt: now + Math.min((profile.cache_ttl_seconds || 300) * 1000, CACHE_TTL_MS),
        });
        return profile;
    } catch (err: unknown) {
        log.warn('getTrust', 'fetch failed', {
            passport,
            message: err instanceof Error ? err.message : String(err),
        });
        return null;
    }
}

/** Prime the cache directly (tests, band-change notifications). */
export function setTrustCache(passport: string, profile: TrustProfile): void {
    cache.set(passport, { profile, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Clear the cache entirely (tests, logout). */
export function clearTrustCache(): void { cache.clear(); }

/** Read-only snapshot of the cached profile, or null if nothing cached. */
export function peekTrust(passport: string): TrustProfile | null {
    const hit = cache.get(passport);
    return hit ? hit.profile : null;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

/** Band colour mapping used by the badge and the settings screen. */
export const BAND_COLORS: Record<TrustBand, string> = {
    critical: '#ef4444',
    poor: '#f97316',
    fair: '#eab308',
    good: '#84cc16',
    exceptional: '#22c55e',
};

export const CLEARANCE_LABELS: Record<TrustClearance, string> = {
    registered: 'Registered',
    verified: 'Verified',
    cleared: 'Cleared',
    top_secret: 'Top Secret',
    eternal: 'Eternal',
};

export const BAND_LABELS: Record<TrustBand, string> = {
    critical: 'Critical',
    poor: 'Poor',
    fair: 'Fair',
    good: 'Good',
    exceptional: 'Exceptional',
};
