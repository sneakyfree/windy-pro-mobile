/**
 * Identity API — OAuth2 device-code flow against windy-pro account-server.
 *
 * Replaces the password login in cloudApi. Owns:
 *   - OAuth2 device-code flow (start + poll)
 *   - Refresh-token rotation
 *   - authedFetch wrapper that refreshes on 401 and retries once
 *   - SecureStore persistence (keys kept bit-identical with legacy cloudApi)
 *   - Auth state subscription for screens
 */
import * as SecureStore from 'expo-secure-store';
import {
    ACCOUNT_SERVER_URL,
    OAUTH_CLIENT_ID,
    OAUTH_SCOPES,
    OAUTH_ENDPOINTS,
    DEVICE_GRANT_TYPE,
    REFRESH_GRANT_TYPE,
    DEFAULT_POLL_INTERVAL_MS,
    DEFAULT_DEVICE_CODE_TTL_MS,
    IDENTITY_REQUEST_TIMEOUT_MS,
} from '@/config/identity';
import { createLogger } from './logger';
import { normalizeBackendTier } from './license';

const log = createLogger('IdentityApi');

// Shared SecureStore keys — kept bit-identical with legacy cloudApi so
// existing readers (heartbeat, license, pairManager, model-crypto, translation,
// push-notifications) keep working unmodified.
const TOKEN_KEY = 'windy_jwt_token';
const REFRESH_TOKEN_KEY = 'windy_cloud_refresh_token';
const USER_ID_KEY = 'windy_cloud_user_id';
const USER_EMAIL_KEY = 'windy_cloud_email';
const IDENTITY_ID_KEY = 'windy_identity_id';

export interface DeviceCodeStart {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
    expires_in: number;
    interval: number;
}

export type DeviceCodeOutcome =
    | { success: true; token: string; userId: string | null; email: string | null }
    | { success: false; error: 'expired' | 'denied' | 'cancelled' | 'network'; message?: string };

export type RegisterOutcome =
    | { success: true }
    | { success: false; message: string };

/** Account-server registration endpoint (returns the session JWT directly). */
const REGISTER_ENDPOINT = '/api/v1/auth/register';

export interface PollForTokenOptions {
    /**
     * Fires once after the first consecutive transient poll failure (5xx or
     * network). The UI can surface a "Having trouble reaching the server"
     * warning so the user isn't staring at a silent spinner for 15 minutes.
     */
    onWarning?: () => void;
}

/** Start the exponential backoff after this many consecutive transient failures. */
const POLL_BACKOFF_START_AFTER = 3;
/** Abort the whole session after this many consecutive transient failures. */
const POLL_MAX_CONSECUTIVE_FAILURES = 6;
/** Cap the backoff at this many ms so we don't wait 5 minutes between polls. */
const POLL_BACKOFF_CAP_MS = 30_000;

type Listener = () => void;
type AuthExpiredCallback = () => void;

class IdentityApiClient {
    private accessToken: string | null = null;
    private refreshTokenValue: string | null = null;
    private userId: string | null = null;
    private email: string | null = null;
    private windyIdentityId: string | null = null;
    private listeners = new Set<Listener>();
    private onAuthExpired: AuthExpiredCallback | null = null;
    private isRefreshing: Promise<boolean> | null = null;

    private deviceSession: {
        device_code: string;
        interval: number;
        expiresAt: number;
        abort: AbortController;
    } | null = null;

    // ─── Session restore / logout ───────────────────────────────

    async restoreSession(): Promise<boolean> {
        try {
            const [token, refresh, userId, email, identityId] = await Promise.all([
                SecureStore.getItemAsync(TOKEN_KEY),
                SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
                SecureStore.getItemAsync(USER_ID_KEY),
                SecureStore.getItemAsync(USER_EMAIL_KEY),
                SecureStore.getItemAsync(IDENTITY_ID_KEY),
            ]);
            if (!token) return false;

            // Respect the access token's `exp` claim. If it's past (with
            // a 30 s grace window), proactively refresh or log out — we
            // don't want to spray a known-dead token to every service the
            // mobile talks to until the first 401 bounces back.
            if (this.isTokenExpired(token)) {
                if (!refresh) {
                    await this.logout();
                    return false;
                }
                this.refreshTokenValue = refresh;
                this.userId = userId;
                this.email = email;
                this.windyIdentityId = identityId;
                const ok = await this.refresh();
                if (!ok) {
                    await this.logout();
                    return false;
                }
                this.emitChange();
                return true;
            }

            this.accessToken = token;
            this.refreshTokenValue = refresh;
            this.userId = userId;
            this.email = email;
            this.windyIdentityId = identityId;
            this.syncIdentityToStore();
            this.emitChange();
            return true;
        } catch {
            return false;
        }
    }

    async logout(): Promise<void> {
        this.cancelDeviceFlow();
        this.accessToken = null;
        this.refreshTokenValue = null;
        this.userId = null;
        this.email = null;
        this.windyIdentityId = null;
        await Promise.all([
            SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {}),
            SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => {}),
            SecureStore.deleteItemAsync(USER_ID_KEY).catch(() => {}),
            SecureStore.deleteItemAsync(USER_EMAIL_KEY).catch(() => {}),
            SecureStore.deleteItemAsync(IDENTITY_ID_KEY).catch(() => {}),
        ]);
        this.syncIdentityToStore();
        this.emitChange();
    }

    // ─── State getters ──────────────────────────────────────────

    isAuthenticated(): boolean {
        if (!this.accessToken) return false;
        // Treat a JWT past its `exp` as unauthenticated so the UI stops
        // pretending we're signed in after a long background sleep — the
        // next call will run a refresh via authedFetch's 401 path.
        return !this.isTokenExpired(this.accessToken);
    }
    getToken(): string | null { return this.accessToken; }

    /**
     * Access token guaranteed non-expired (refreshes first when needed).
     * Callers that bypass authedFetch (e.g. the hatch SSE XHR) MUST use
     * this — the raw token lives only ~15 min, so "signed in ten minutes
     * ago" + getToken() = a guaranteed 401 (hatch died exactly this way,
     * 2026-07-17).
     */
    async getFreshToken(): Promise<string | null> {
        if (this.accessToken && !this.isTokenExpired(this.accessToken)) {
            return this.accessToken;
        }
        if (this.refreshTokenValue && await this.refresh()) {
            return this.accessToken;
        }
        return null;
    }
    getUserId(): string | null { return this.userId; }
    getEmail(): string | null { return this.email; }
    getWindyIdentityId(): string | null { return this.windyIdentityId; }
    getRefreshToken(): string | null { return this.refreshTokenValue; }

    // ─── Subscriptions ──────────────────────────────────────────

    onChange(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    setAuthExpiredHandler(handler: AuthExpiredCallback): void {
        this.onAuthExpired = handler;
    }

    private emitChange(): void {
        for (const l of this.listeners) {
            try { l(); } catch { /* ignore listener errors */ }
        }
    }

    // ─── Device-code flow ───────────────────────────────────────

    async startDeviceFlow(): Promise<DeviceCodeStart> {
        this.cancelDeviceFlow();
        const res = await this.fetchWithTimeout(
            `${ACCOUNT_SERVER_URL}${OAUTH_ENDPOINTS.DEVICE}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: OAUTH_CLIENT_ID,
                    scope: OAUTH_SCOPES,
                }),
            }
        );
        if (!res.ok) {
            const body = await this.safeJson(res);
            throw new Error(
                (body?.error_description as string) ||
                (body?.error as string) ||
                `Device init failed (${res.status})`
            );
        }
        const data = await res.json() as DeviceCodeStart;
        const intervalMs = Math.max((data.interval || 5) * 1000, DEFAULT_POLL_INTERVAL_MS);
        const ttlMs = Math.min((data.expires_in || 900) * 1000, DEFAULT_DEVICE_CODE_TTL_MS);
        this.deviceSession = {
            device_code: data.device_code,
            interval: intervalMs,
            expiresAt: Date.now() + ttlMs,
            abort: new AbortController(),
        };
        return data;
    }

    async pollForToken(opts: PollForTokenOptions = {}): Promise<DeviceCodeOutcome> {
        if (!this.deviceSession) return { success: false, error: 'cancelled' };
        const session = this.deviceSession;
        const signal = session.abort.signal;

        let consecutiveFailures = 0;
        let warningFired = false;

        while (!signal.aborted) {
            if (Date.now() >= session.expiresAt) {
                this.deviceSession = null;
                return { success: false, error: 'expired' };
            }

            let hadTransientFailure = false;

            try {
                const res = await this.fetchWithTimeout(
                    `${ACCOUNT_SERVER_URL}${OAUTH_ENDPOINTS.TOKEN}`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            grant_type: DEVICE_GRANT_TYPE,
                            device_code: session.device_code,
                            client_id: OAUTH_CLIENT_ID,
                        }),
                        signal,
                    }
                );
                if (res.ok) {
                    const data = await res.json();
                    await this.persistTokens(data.access_token, data.refresh_token ?? null);
                    this.deviceSession = null;
                    this.emitChange();
                    return {
                        success: true,
                        token: data.access_token,
                        userId: this.userId,
                        email: this.email,
                    };
                }
                const body = await this.safeJson(res);
                const errorCode = (body?.error as string) || '';
                if (errorCode === 'authorization_pending' || errorCode === 'slow_down') {
                    // Server responded with a known pending state — reset any
                    // transient-failure counter so a brief outage doesn't
                    // accumulate across successful "still waiting" replies.
                    consecutiveFailures = 0;
                } else if (errorCode === 'expired_token') {
                    this.deviceSession = null;
                    return { success: false, error: 'expired' };
                } else if (errorCode === 'access_denied') {
                    this.deviceSession = null;
                    return { success: false, error: 'denied' };
                } else if (res.status >= 500 || (!errorCode && res.status >= 400)) {
                    // Transient server failure (5xx) or an unknown-code 4xx
                    // that may be a CDN challenge page. Retry with backoff
                    // rather than bail immediately.
                    hadTransientFailure = true;
                    log.warn('pollForToken', 'transient server failure, will back off', {
                        status: res.status, errorCode,
                    });
                } else {
                    // Genuine 4xx with a known-unrecognised error code
                    // (invalid_grant, invalid_client, invalid_request) — the
                    // request itself is bad, no amount of retrying helps.
                    this.deviceSession = null;
                    return {
                        success: false,
                        error: 'network',
                        message: (body?.error_description as string) || errorCode,
                    };
                }
            } catch (err: unknown) {
                if (signal.aborted) return { success: false, error: 'cancelled' };
                hadTransientFailure = true;
                log.warn('pollForToken', 'poll attempt threw, will retry', {
                    message: err instanceof Error ? err.message : String(err),
                });
            }

            let nextDelay = session.interval;
            if (hadTransientFailure) {
                consecutiveFailures++;
                if (consecutiveFailures >= POLL_MAX_CONSECUTIVE_FAILURES) {
                    this.deviceSession = null;
                    return {
                        success: false,
                        error: 'network',
                        message: `Server unreachable after ${consecutiveFailures} attempts`,
                    };
                }
                if (consecutiveFailures >= POLL_BACKOFF_START_AFTER) {
                    const exponent = consecutiveFailures - POLL_BACKOFF_START_AFTER + 1;
                    nextDelay = Math.min(
                        session.interval * Math.pow(2, exponent),
                        POLL_BACKOFF_CAP_MS,
                    );
                    if (!warningFired) {
                        warningFired = true;
                        try { opts.onWarning?.(); } catch { /* listener error */ }
                    }
                }
            }

            await this.wait(nextDelay, signal);
        }
        return { success: false, error: 'cancelled' };
    }

    cancelDeviceFlow(): void {
        if (this.deviceSession) {
            try { this.deviceSession.abort.abort(); } catch { /* already aborted */ }
            this.deviceSession = null;
        }
    }

    // ─── Registration ───────────────────────────────────────────

    /**
     * Create a Windy account directly from the app and sign the session in.
     *
     * POST /api/v1/auth/register returns the same JWT the OAuth token
     * endpoint issues (camelCase `token`/`refreshToken` fields), so on
     * success we persist it exactly like a device-code sign-in — no second
     * sign-in step for a brand-new user.
     */
    async register(name: string, email: string, password: string): Promise<RegisterOutcome> {
        try {
            const res = await this.fetchWithTimeout(
                `${ACCOUNT_SERVER_URL}${REGISTER_ENDPOINT}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password }),
                }
            );
            const body = await this.safeJson(res);
            if (res.ok && typeof body?.token === 'string') {
                await this.persistTokens(
                    body.token,
                    typeof body.refreshToken === 'string' ? body.refreshToken : null,
                );
                this.emitChange();
                return { success: true };
            }
            // Server sends human-readable messages: either a single `error`
            // string ("An account with this email already exists") or a
            // `details` array of per-field validation messages.
            const details = Array.isArray(body?.details)
                ? (body.details as Array<{ message?: string }>)
                    .map((d) => d.message)
                    .filter((m): m is string => typeof m === 'string')
                : [];
            const message = details.length > 0
                ? details.join('\n')
                : (typeof body?.error === 'string' && body.error) ||
                  'Could not create the account. Please try again.';
            return { success: false, message };
        } catch (err: unknown) {
            log.warn('register', 'request failed', {
                message: err instanceof Error ? err.message : String(err),
            });
            return {
                success: false,
                message: 'Could not reach the server. Check your connection and try again.',
            };
        }
    }

    // ─── Refresh ────────────────────────────────────────────────

    async refresh(): Promise<boolean> {
        if (this.isRefreshing) return this.isRefreshing;
        this.isRefreshing = this._doRefresh();
        try { return await this.isRefreshing; } finally { this.isRefreshing = null; }
    }

    private async _doRefresh(): Promise<boolean> {
        if (!this.refreshTokenValue) return false;
        try {
            const res = await this.fetchWithTimeout(
                `${ACCOUNT_SERVER_URL}${OAUTH_ENDPOINTS.TOKEN}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        grant_type: REFRESH_GRANT_TYPE,
                        refresh_token: this.refreshTokenValue,
                        client_id: OAUTH_CLIENT_ID,
                    }),
                }
            );
            if (!res.ok) {
                log.warn('refresh', `failed (${res.status})`);
                return false;
            }
            const data = await res.json();
            const newRefresh = (data.refresh_token as string | undefined) ?? this.refreshTokenValue;
            await this.persistTokens(data.access_token, newRefresh);
            this.emitChange();
            return true;
        } catch (err: unknown) {
            log.warn('refresh', 'error', { message: err instanceof Error ? err.message : String(err) });
            return false;
        }
    }

    // ─── authedFetch ────────────────────────────────────────────

    async authedFetch(url: string, init?: RequestInit): Promise<Response | null> {
        if (!this.accessToken) {
            this.onAuthExpired?.();
            return null;
        }
        const firstHeaders = this.buildAuthHeaders(init?.headers);
        const res = await this.fetchWithTimeout(url, { ...init, headers: firstHeaders });
        if (res.status !== 401) return res;

        const refreshed = await this.refresh();
        if (!refreshed || !this.accessToken) {
            await this.handleAuthExpired();
            return res;
        }
        const retryRes = await this.fetchWithTimeout(url, {
            ...init,
            headers: this.buildAuthHeaders(init?.headers),
        });
        if (retryRes.status === 401) await this.handleAuthExpired();
        return retryRes;
    }

    private buildAuthHeaders(incoming: HeadersInit | undefined): Record<string, string> {
        const headers: Record<string, string> = {
            ...(incoming as Record<string, string> | undefined),
            'Authorization': `Bearer ${this.accessToken}`,
        };
        if (this.windyIdentityId) headers['X-Windy-Identity-Id'] = this.windyIdentityId;
        return headers;
    }

    private async handleAuthExpired(): Promise<void> {
        this.accessToken = null;
        this.refreshTokenValue = null;
        await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => {});
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => {});
        this.onAuthExpired?.();
        this.emitChange();
    }

    // ─── Persistence ────────────────────────────────────────────

    private async persistTokens(accessToken: string, refreshToken: string | null): Promise<void> {
        this.accessToken = accessToken;
        if (refreshToken !== null) this.refreshTokenValue = refreshToken;

        const payload = this.decodeJwtPayload(accessToken);
        const sub = typeof payload?.sub === 'string' ? payload.sub : null;
        const identityId =
            (typeof payload?.windy_identity_id === 'string' && payload.windy_identity_id) ||
            sub;
        const emailClaim = typeof payload?.email === 'string' ? payload.email : null;

        this.userId = sub;
        this.email = emailClaim;
        this.windyIdentityId = identityId;

        await SecureStore.setItemAsync(TOKEN_KEY, accessToken).catch(() => {});
        if (sub) await SecureStore.setItemAsync(USER_ID_KEY, sub).catch(() => {});
        if (emailClaim) await SecureStore.setItemAsync(USER_EMAIL_KEY, emailClaim).catch(() => {});
        if (this.refreshTokenValue) {
            await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, this.refreshTokenValue).catch(() => {});
        }
        if (identityId) {
            await SecureStore.setItemAsync(IDENTITY_ID_KEY, identityId).catch(() => {});
        }

        // Mirror tier into the Zustand settings store (same behavior as legacy cloudApi)
        if (typeof payload?.tier === 'string') {
            try {
                const { useSettingsStore } = require('@/stores/useSettingsStore');
                const tier = normalizeBackendTier(payload.tier as string);
                useSettingsStore.getState().setTier?.(tier);
            } catch { /* store may not be ready during early init */ }
        }

        this.syncIdentityToStore();
        void this.fetchEcosystemStatus();
    }

    private syncIdentityToStore(): void {
        try {
            const { useSettingsStore } = require('@/stores/useSettingsStore');
            useSettingsStore.getState().setWindyIdentityId(this.windyIdentityId);
        } catch { /* store may not be ready during early init */ }
    }

    private async fetchEcosystemStatus(): Promise<void> {
        try {
            const { getEcosystemStatus } = require('./ecosystem-status');
            const status = await getEcosystemStatus();
            if (status) {
                const { useSettingsStore } = require('@/stores/useSettingsStore');
                useSettingsStore.getState().setEcosystemStatus(status);
            }
        } catch { /* ecosystem status is supplementary */ }
    }

    // ─── Utilities ──────────────────────────────────────────────

    private decodeJwtPayload(token: string): Record<string, unknown> | null {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;
            const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
            return JSON.parse(payload);
        } catch { return null; }
    }

    /**
     * Client-side `exp` check with a 30 s grace window so a token that expires
     * mid-request isn't retried against a server that just rotated it. The
     * server is still the authority — this is only an optimisation to avoid
     * known-dead requests and to make `isAuthenticated()` honest after long
     * background sleeps.
     */
    private isTokenExpired(token: string, graceSeconds = 30): boolean {
        const payload = this.decodeJwtPayload(token);
        if (!payload || typeof payload.exp !== 'number') {
            // No exp claim — trust the server and don't short-circuit.
            return false;
        }
        const expMs = (payload.exp as number) * 1000;
        return expMs <= Date.now() + graceSeconds * 1000;
    }

    private async fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
        const controller = new AbortController();
        const forward = init?.signal ?? null;
        const onForward = () => controller.abort();
        if (forward) {
            if (forward.aborted) controller.abort();
            else forward.addEventListener('abort', onForward);
        }
        const timeoutId = setTimeout(() => controller.abort(), IDENTITY_REQUEST_TIMEOUT_MS);
        try {
            return await fetch(url, { ...init, signal: controller.signal });
        } finally {
            clearTimeout(timeoutId);
            if (forward) forward.removeEventListener('abort', onForward);
        }
    }

    private async safeJson(res: Response): Promise<Record<string, unknown> | null> {
        try { return await res.json(); } catch { return null; }
    }

    private wait(ms: number, signal: AbortSignal): Promise<void> {
        return new Promise((resolve) => {
            if (signal.aborted) return resolve();
            const onAbort = () => {
                clearTimeout(timer);
                signal.removeEventListener('abort', onAbort);
                resolve();
            };
            const timer = setTimeout(() => {
                signal.removeEventListener('abort', onAbort);
                resolve();
            }, ms);
            signal.addEventListener('abort', onAbort);
        });
    }
}

export const identityApi = new IdentityApiClient();
export type { IdentityApiClient };
