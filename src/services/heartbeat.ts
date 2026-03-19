/**
 * 🫀 License Heartbeat Service — Layer 2 DRM
 * Periodically verifies license validity with tiered offline grace periods.
 *
 * Heartbeat interval: 48 hours (configurable per tier)
 * Grace periods:
 *   Free:            24 hours
 *   Pro:             7 days
 *   Translate:       14 days
 *   Translate Pro:   30 days (Marco Polo / Max)
 *
 * On grace expiry: models are LOCKED (key wiped from SecureStore), NOT deleted.
 * On successful re-verification: key is re-derived, models unlock immediately.
 * On license revocation: all models deleted, reset to free tier.
 */
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, AppState, type AppStateStatus } from 'react-native';
import { fetchWithTimeout } from '@/utils/fetch-timeout';
import { apiUrl, ENDPOINTS } from '@/config/api';
import { licenseService } from './license';
import { createLogger } from './logger';
import type { LicenseTier } from '@/types';

const log = createLogger('Heartbeat');

// ─── Constants ───────────────────────────────────────────────

const HEARTBEAT_STATE_KEY = 'windy-heartbeat-state';
const TOKEN_KEY = 'windy_jwt_token';

/** Heartbeat check interval per tier (ms) */
const HEARTBEAT_INTERVAL: Record<LicenseTier, number> = {
    free: 24 * 60 * 60 * 1000,        // 24 hours
    pro: 48 * 60 * 60 * 1000,         // 48 hours
    translate: 48 * 60 * 60 * 1000,   // 48 hours
    translate_pro: 72 * 60 * 60 * 1000, // 72 hours
};

/** Offline grace period per tier (ms) */
const GRACE_PERIOD: Record<LicenseTier, number> = {
    free: 24 * 60 * 60 * 1000,          // 24 hours
    pro: 7 * 24 * 60 * 60 * 1000,      // 7 days
    translate: 14 * 24 * 60 * 60 * 1000, // 14 days
    translate_pro: 30 * 24 * 60 * 60 * 1000, // 30 days
};

// ─── Types ───────────────────────────────────────────────────

export interface HeartbeatState {
    /** When the last successful heartbeat was received */
    lastSuccessTimestamp: number;
    /** When the last heartbeat attempt was made */
    lastAttemptTimestamp: number;
    /** Number of consecutive failures */
    consecutiveFailures: number;
    /** License tier at last success */
    tier: LicenseTier;
    /** When grace period expires (set on first failure after interval) */
    graceExpiresAt: number;
    /** Whether models are currently locked */
    modelsLocked: boolean;
    /** Whether license was explicitly revoked (vs. just offline) */
    revoked: boolean;
}

export type HeartbeatStatus =
    | 'valid'          // Heartbeat current, models accessible
    | 'grace'          // In grace period, models accessible with warning
    | 'locked'         // Grace expired, models locked
    | 'revoked';       // License revoked, models should be deleted

export interface HeartbeatCheckResult {
    status: HeartbeatStatus;
    /** Remaining grace period in ms (0 if not in grace) */
    graceRemainingMs: number;
    /** Human-readable grace remaining */
    graceRemainingLabel: string;
    /** Current tier */
    tier: LicenseTier;
}

/** Server heartbeat response */
interface HeartbeatResponse {
    valid: boolean;
    tier: LicenseTier;
    graceHours?: number;
    reason?: 'revoked' | 'expired' | 'refunded';
}

// ─── HeartbeatService ────────────────────────────────────────

class HeartbeatService {
    private state: HeartbeatState | null = null;
    private checkTimer: ReturnType<typeof setInterval> | null = null;
    private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

    // ── Initialization ───────────────────────────────────────

    /**
     * Start the heartbeat service. Call once at app startup.
     */
    async start(): Promise<void> {
        log.entry('start');

        // Load persisted state
        await this.loadState();

        // Run an immediate check
        await this.performCheck();

        // Set up periodic checks (every 15 minutes, the check itself rate-limits)
        this.checkTimer = setInterval(() => {
            this.performCheck().catch(err =>
                log.error('periodicCheck', err)
            );
        }, 15 * 60 * 1000); // 15 min

        // Listen for app foregrounding
        this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);

        log.exit('start');
    }

    /**
     * Stop the heartbeat service (cleanup).
     */
    stop(): void {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
        if (this.appStateSubscription) {
            this.appStateSubscription.remove();
            this.appStateSubscription = null;
        }
    }

    // ── Status Query ─────────────────────────────────────────

    /**
     * Get the current heartbeat status without performing a network call.
     */
    getStatus(): HeartbeatCheckResult {
        const state = this.state ?? this.defaultState();

        if (state.revoked) {
            return {
                status: 'revoked',
                graceRemainingMs: 0,
                graceRemainingLabel: '',
                tier: state.tier,
            };
        }

        if (state.modelsLocked) {
            return {
                status: 'locked',
                graceRemainingMs: 0,
                graceRemainingLabel: 'Expired',
                tier: state.tier,
            };
        }

        const interval = HEARTBEAT_INTERVAL[state.tier];
        const timeSinceSuccess = Date.now() - state.lastSuccessTimestamp;

        // Within heartbeat interval → valid
        if (timeSinceSuccess <= interval) {
            return {
                status: 'valid',
                graceRemainingMs: 0,
                graceRemainingLabel: '',
                tier: state.tier,
            };
        }

        // Past interval but within grace period
        if (state.graceExpiresAt > 0 && Date.now() < state.graceExpiresAt) {
            const remaining = state.graceExpiresAt - Date.now();
            return {
                status: 'grace',
                graceRemainingMs: remaining,
                graceRemainingLabel: formatDuration(remaining),
                tier: state.tier,
            };
        }

        // Grace expired
        return {
            status: 'locked',
            graceRemainingMs: 0,
            graceRemainingLabel: 'Expired',
            tier: state.tier,
        };
    }

    /**
     * Check if model access is currently allowed.
     */
    isModelAccessAllowed(): boolean {
        const { status } = this.getStatus();
        return status === 'valid' || status === 'grace';
    }

    /**
     * Check if the license has been explicitly revoked (refund, etc.).
     */
    isRevoked(): boolean {
        return this.state?.revoked === true;
    }

    // ── Core Heartbeat Logic ─────────────────────────────────

    /**
     * Perform a heartbeat check. Rate-limited by the tier's interval.
     */
    async performCheck(): Promise<HeartbeatCheckResult> {
        const state = this.state ?? this.defaultState();
        const tier = licenseService.getTier();
        state.tier = tier;

        const interval = HEARTBEAT_INTERVAL[tier];
        const timeSinceSuccess = Date.now() - state.lastSuccessTimestamp;

        // Not yet time for a check
        if (timeSinceSuccess <= interval) {
            this.state = state;
            return this.getStatus();
        }

        // Time for a check — try to reach the server
        state.lastAttemptTimestamp = Date.now();

        try {
            const response = await this.callHeartbeatApi();

            if (response.valid) {
                // Success — reset everything
                state.lastSuccessTimestamp = Date.now();
                state.consecutiveFailures = 0;
                state.graceExpiresAt = 0;
                state.modelsLocked = false;
                state.revoked = false;
                state.tier = response.tier;
                log.info('performCheck', 'Heartbeat OK', { tier: response.tier });
            } else {
                // License revoked by server
                state.revoked = true;
                state.modelsLocked = true;
                log.warn('performCheck', 'License revoked', { reason: response.reason });
            }
        } catch (err) {
            // Network error — enter/continue grace period
            state.consecutiveFailures++;

            if (state.graceExpiresAt === 0) {
                // First failure — start grace period
                state.graceExpiresAt = Date.now() + GRACE_PERIOD[tier];
                log.info('performCheck', 'Entering grace period', {
                    tier,
                    graceDays: GRACE_PERIOD[tier] / (24 * 60 * 60 * 1000),
                    failures: state.consecutiveFailures,
                });
            }

            // Check if grace has expired
            if (Date.now() >= state.graceExpiresAt) {
                state.modelsLocked = true;
                log.warn('performCheck', 'Grace period expired — models locked');
            }
        }

        this.state = state;
        await this.saveState();

        return this.getStatus();
    }

    /**
     * Force a heartbeat check (e.g., when user taps "Verify License").
     */
    async forceCheck(): Promise<HeartbeatCheckResult> {
        const state = this.state ?? this.defaultState();
        // Reset interval tracking to force an immediate API call
        state.lastSuccessTimestamp = 0;
        this.state = state;
        return this.performCheck();
    }

    /**
     * Mark the heartbeat as freshly validated (called after successful license activation).
     */
    async markValid(tier: LicenseTier): Promise<void> {
        const state = this.state ?? this.defaultState();
        state.lastSuccessTimestamp = Date.now();
        state.consecutiveFailures = 0;
        state.graceExpiresAt = 0;
        state.modelsLocked = false;
        state.revoked = false;
        state.tier = tier;
        this.state = state;
        await this.saveState();
    }

    /**
     * Reset the heartbeat state (e.g., on logout).
     */
    async reset(): Promise<void> {
        this.state = this.defaultState();
        await this.saveState();
    }

    // ── API Call ──────────────────────────────────────────────

    private async callHeartbeatApi(): Promise<HeartbeatResponse> {
        let token: string | null = null;
        try {
            token = await SecureStore.getItemAsync(TOKEN_KEY);
        } catch {
            log.warn('callHeartbeatApi', 'Could not read token');
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-Platform': `mobile-${Platform.OS}`,
            'X-App-Version': '1.0.0',
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // Use license/activate as heartbeat endpoint (reuses existing infra)
        // Server returns current tier + validity
        const response = await fetchWithTimeout(apiUrl(ENDPOINTS.LICENSE_ACTIVATE), {
            method: 'POST',
            headers,
            body: JSON.stringify({ heartbeat: true }),
        });

        if (response.ok) {
            const data = await response.json();
            return {
                valid: true,
                tier: data.tier || 'free',
            };
        }

        if (response.status === 401 || response.status === 403) {
            let reason: HeartbeatResponse['reason'] = 'expired';
            try {
                const errData = await response.json();
                if (errData.reason) reason = errData.reason;
            } catch { /* ignore parse errors */ }

            return {
                valid: false,
                tier: 'free',
                reason,
            };
        }

        // Other errors — treat as network failure (will trigger grace)
        throw new Error(`Heartbeat API returned ${response.status}`);
    }

    // ── App State ────────────────────────────────────────────

    private handleAppStateChange = (nextState: AppStateStatus) => {
        if (nextState === 'active') {
            // App foregrounded — run a check
            this.performCheck().catch(err =>
                log.error('appForeground', err)
            );
        }
    };

    // ── Persistence ──────────────────────────────────────────

    private async loadState(): Promise<void> {
        try {
            const raw = await AsyncStorage.getItem(HEARTBEAT_STATE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as HeartbeatState;
                // Validate shape
                if (typeof parsed.lastSuccessTimestamp === 'number') {
                    this.state = parsed;
                    return;
                }
            }
        } catch {
            log.warn('loadState', 'Could not load heartbeat state');
        }
        this.state = this.defaultState();
    }

    private async saveState(): Promise<void> {
        if (!this.state) return;
        try {
            await AsyncStorage.setItem(HEARTBEAT_STATE_KEY, JSON.stringify(this.state));
        } catch {
            log.warn('saveState', 'Could not persist heartbeat state');
        }
    }

    private defaultState(): HeartbeatState {
        return {
            lastSuccessTimestamp: Date.now(), // Assume valid on first run
            lastAttemptTimestamp: 0,
            consecutiveFailures: 0,
            tier: licenseService.getTier(),
            graceExpiresAt: 0,
            modelsLocked: false,
            revoked: false,
        };
    }
}

// ─── Helpers ─────────────────────────────────────────────────

function formatDuration(ms: number): string {
    const hours = Math.floor(ms / (60 * 60 * 1000));
    if (hours < 24) return `${hours}h remaining`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (remainingHours === 0) return `${days}d remaining`;
    return `${days}d ${remainingHours}h remaining`;
}

// ─── Exports ─────────────────────────────────────────────────

export const heartbeatService = new HeartbeatService();

/** Export grace period config for testing */
export const GRACE_PERIODS = GRACE_PERIOD;
export const HEARTBEAT_INTERVALS = HEARTBEAT_INTERVAL;
