/**
 * Trust Monitor — polls Eternitas for passports the app is tracking.
 *
 *   - 60-second interval while the app is foregrounded.
 *   - Paused when the app is backgrounded; resumes (with one immediate tick)
 *     when it returns to the foreground.
 *   - When a tracked passport's band *or* clearance_level changes, fires a
 *     local notification via expo-notifications.
 *   - No SSE on mobile — polling is authoritative.
 */
import { AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
    getTrustOrNull,
    peekTrust,
    type TrustBand,
    type TrustClearance,
    type TrustProfile,
} from './trustApi';
import { createLogger } from './logger';

const log = createLogger('TrustMonitor');

const POLL_INTERVAL_MS = 60_000;

interface Tracked {
    /** Human-readable name used in the notification body. */
    label: string;
    /** Last band + clearance we saw — used for change detection. */
    lastBand?: TrustBand;
    lastClearance?: TrustClearance;
}

class TrustMonitor {
    private tracked = new Map<string, Tracked>();
    private timer: ReturnType<typeof setInterval> | null = null;
    private appStateSub: { remove(): void } | null = null;
    private started = false;

    start(): void {
        if (this.started) return;
        this.started = true;
        this.appStateSub = AppState.addEventListener('change', this.onAppStateChange);
        if (AppState.currentState === 'active') this.resumePolling();
    }

    stop(): void {
        this.pausePolling();
        this.appStateSub?.remove();
        this.appStateSub = null;
        this.started = false;
    }

    /**
     * Register a passport for polling. Seeds the change-detection baseline
     * from the cache if we've seen it before.
     */
    track(passport: string, label: string): void {
        if (!passport) return;
        if (this.tracked.has(passport)) return;
        const seed = peekTrust(passport);
        this.tracked.set(passport, {
            label,
            lastBand: seed?.band,
            lastClearance: seed?.clearance_level,
        });
    }

    untrack(passport: string): void {
        this.tracked.delete(passport);
    }

    getTracked(): string[] { return Array.from(this.tracked.keys()); }

    private onAppStateChange = (next: AppStateStatus): void => {
        if (next === 'active') this.resumePolling();
        else this.pausePolling();
    };

    private resumePolling(): void {
        if (this.timer) return;
        // Immediate first tick so the user sees fresh state on re-foreground.
        void this.tick();
        this.timer = setInterval(() => { void this.tick(); }, POLL_INTERVAL_MS);
    }

    private pausePolling(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private async tick(): Promise<void> {
        for (const [passport, meta] of this.tracked) {
            try {
                const profile = await getTrustOrNull(passport, { fresh: true });
                if (!profile) continue;
                this.detectChange(passport, meta, profile);
            } catch (err: unknown) {
                log.warn('tick', 'poll failed', {
                    passport,
                    message: err instanceof Error ? err.message : String(err),
                });
            }
        }
    }

    private detectChange(passport: string, meta: Tracked, profile: TrustProfile): void {
        const prevBand = meta.lastBand;
        const prevClearance = meta.lastClearance;
        meta.lastBand = profile.band;
        meta.lastClearance = profile.clearance_level;

        if (prevBand === undefined && prevClearance === undefined) {
            // First observation — no notification, just seed the baseline.
            return;
        }
        if (prevBand === profile.band && prevClearance === profile.clearance_level) return;

        const parts: string[] = [];
        if (prevBand && prevBand !== profile.band) parts.push(`band ${prevBand} → ${profile.band}`);
        if (prevClearance && prevClearance !== profile.clearance_level) parts.push(`clearance ${prevClearance} → ${profile.clearance_level}`);
        const body = `${meta.label}: ${parts.join(', ')}`;

        Notifications.scheduleNotificationAsync({
            content: {
                title: 'Trust level changed',
                body,
                data: { passport, type: 'trust_change' },
            },
            trigger: null,
        }).catch((err: unknown) => {
            log.warn('detectChange', 'notification failed', {
                message: err instanceof Error ? err.message : String(err),
            });
        });
    }
}

export const trustMonitor = new TrustMonitor();
