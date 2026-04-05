/**
 * 🧬 Analytics Service
 * Tracks key mobile events, batches them, and POSTs to the account-server.
 *
 * - Events cached in AsyncStorage (offline-safe)
 * - Batch flush every 30 seconds (or on app background)
 * - Falls back to local-only if server is unreachable
 * - No PII in events (no email, no name, just anonymous IDs)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createLogger } from './logger';

const log = createLogger('Analytics');

const ANALYTICS_KEY = 'windy-analytics';
const EVENT_QUEUE_KEY = 'windy-analytics-queue';
const FLUSH_INTERVAL_MS = 30_000; // 30 seconds
const MAX_QUEUE_SIZE = 200;

// ─── Types ──────────────────────────────────────────────────────

export type AnalyticsEventType =
    | 'app_opened'
    | 'recording_started'
    | 'recording_completed'
    | 'translation_made'
    | 'chat_message_sent'
    | 'agent_hatched'
    | 'voice_input_used'
    | 'ecosystem_tab_viewed'
    | 'screen_view'
    | 'ocr_capture'
    | 'clone_started'
    | 'export_completed'
    | 'purchase_started'
    | 'purchase_completed';

export interface AnalyticsEvent {
    type: AnalyticsEventType;
    timestamp: number;
    properties: Record<string, string | number | boolean>;
}

interface AnalyticsSummary {
    totalTranslations: number;
    totalRecordingDurationMs: number;
    totalScreenViews: number;
    languagePairs: Record<string, number>;
    screenViews: Record<string, number>;
    lastSessionStart: number;
}

const DEFAULT_SUMMARY: AnalyticsSummary = {
    totalTranslations: 0,
    totalRecordingDurationMs: 0,
    totalScreenViews: 0,
    languagePairs: {},
    screenViews: {},
    lastSessionStart: Date.now(),
};

// ─── Service ────────────────────────────────────────────────────

class AnalyticsService {
    private summary: AnalyticsSummary = { ...DEFAULT_SUMMARY };
    private queue: AnalyticsEvent[] = [];
    private initialized = false;
    private flushTimer: ReturnType<typeof setInterval> | null = null;

    async initialize(): Promise<void> {
        if (this.initialized) return;
        try {
            const [rawSummary, rawQueue] = await Promise.all([
                AsyncStorage.getItem(ANALYTICS_KEY),
                AsyncStorage.getItem(EVENT_QUEUE_KEY),
            ]);
            if (rawSummary) this.summary = { ...DEFAULT_SUMMARY, ...JSON.parse(rawSummary) };
            if (rawQueue) this.queue = JSON.parse(rawQueue);
            this.summary.lastSessionStart = Date.now();
            this.initialized = true;

            // Start batch flush timer
            this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);

            // Track app open
            this.track('app_opened', {});

            // Flush any events from previous session
            this.flush();
        } catch { /* ignore */ }
    }

    destroy(): void {
        if (this.flushTimer) clearInterval(this.flushTimer);
        this.flush(); // Final flush
    }

    // ─── Track Events ───────────────────────────────────────────

    track(type: AnalyticsEventType, properties: Record<string, string | number | boolean>): void {
        this.ensureInit();
        const event: AnalyticsEvent = { type, timestamp: Date.now(), properties };
        this.queue.push(event);

        // Cap queue size
        if (this.queue.length > MAX_QUEUE_SIZE) {
            this.queue = this.queue.slice(-MAX_QUEUE_SIZE);
        }

        // Persist queue
        AsyncStorage.setItem(EVENT_QUEUE_KEY, JSON.stringify(this.queue)).catch(() => {});

        // Update local summary
        this.updateSummary(type, properties);
    }

    /** Track a screen view */
    trackScreenView(screenName: string): void {
        this.track('screen_view', { screen: screenName });
    }

    /** Track a successful translation */
    trackTranslation(fromLang: string, toLang: string): void {
        this.track('translation_made', { from: fromLang, to: toLang });
    }

    /** Track recording */
    trackRecording(durationMs: number): void {
        this.track('recording_completed', { duration_ms: durationMs });
    }

    /** Track an OCR capture */
    trackOcr(targetLang: string): void {
        this.track('ocr_capture', { target_lang: targetLang });
    }

    // ─── Flush to Server ────────────────────────────────────────

    async flush(): Promise<void> {
        if (this.queue.length === 0) return;

        const batch = [...this.queue];
        this.queue = [];

        try {
            const { API_BASE_URL } = require('@/config/api');
            const { cloudApi } = require('./cloudApi');
            const token = cloudApi.getToken();

            const res = await fetch(`${API_BASE_URL}/api/v1/analytics`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ events: batch }),
                signal: AbortSignal.timeout(10000),
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            // Clear persisted queue on success
            AsyncStorage.setItem(EVENT_QUEUE_KEY, '[]').catch(() => {});
        } catch {
            // Server unreachable — put events back in queue
            this.queue = [...batch, ...this.queue].slice(-MAX_QUEUE_SIZE);
            AsyncStorage.setItem(EVENT_QUEUE_KEY, JSON.stringify(this.queue)).catch(() => {});
        }
    }

    // ─── Summary ────────────────────────────────────────────────

    getSummary(): AnalyticsSummary {
        return { ...this.summary };
    }

    getTopLanguagePairs(n = 5): Array<{ pair: string; count: number }> {
        return Object.entries(this.summary.languagePairs)
            .sort(([, a], [, b]) => b - a)
            .slice(0, n)
            .map(([pair, count]) => ({ pair, count }));
    }

    // ─── Internal ───────────────────────────────────────────────

    private updateSummary(type: AnalyticsEventType, props: Record<string, string | number | boolean>): void {
        switch (type) {
            case 'screen_view':
            case 'ecosystem_tab_viewed':
                this.summary.totalScreenViews++;
                const screen = String(props.screen || type);
                this.summary.screenViews[screen] = (this.summary.screenViews[screen] || 0) + 1;
                break;
            case 'translation_made':
                this.summary.totalTranslations++;
                const pair = `${props.from}→${props.to}`;
                this.summary.languagePairs[pair] = (this.summary.languagePairs[pair] || 0) + 1;
                break;
            case 'recording_completed':
                this.summary.totalRecordingDurationMs += Number(props.duration_ms) || 0;
                break;
        }
        AsyncStorage.setItem(ANALYTICS_KEY, JSON.stringify(this.summary)).catch(() => {});
    }

    private ensureInit(): void {
        if (!this.initialized) {
            this.summary.lastSessionStart = Date.now();
            this.initialized = true;
            this.initialize();
        }
    }
}

export const analyticsService = new AnalyticsService();
