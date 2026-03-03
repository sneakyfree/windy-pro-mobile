/**
 * 🧬 Analytics Service
 * Lightweight local analytics tracking for Windy Pro.
 * Tracks: screen views, translations, language pairs, recording duration.
 * Data stored in AsyncStorage for future backend sync.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const ANALYTICS_KEY = 'windy-analytics';

export interface AnalyticsEvent {
    type: 'screen_view' | 'translation' | 'recording' | 'ocr' | 'clone' | 'export';
    timestamp: number;
    data: Record<string, string | number | boolean>;
}

interface AnalyticsSummary {
    totalTranslations: number;
    totalRecordingDurationMs: number;
    totalScreenViews: number;
    languagePairs: Record<string, number>; // "en→es": 14
    screenViews: Record<string, number>;    // "translate": 42
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

class AnalyticsService {
    private summary: AnalyticsSummary = { ...DEFAULT_SUMMARY };
    private initialized = false;

    async initialize(): Promise<void> {
        if (this.initialized) return;
        try {
            const raw = await AsyncStorage.getItem(ANALYTICS_KEY);
            if (raw) {
                this.summary = { ...DEFAULT_SUMMARY, ...JSON.parse(raw) };
            }
            this.summary.lastSessionStart = Date.now();
            this.initialized = true;
        } catch { /* ignore */ }
    }

    private async save(): Promise<void> {
        try {
            await AsyncStorage.setItem(ANALYTICS_KEY, JSON.stringify(this.summary));
        } catch { /* ignore */ }
    }

    /** Track a screen view */
    trackScreenView(screenName: string): void {
        this.ensureInit();
        this.summary.totalScreenViews++;
        this.summary.screenViews[screenName] = (this.summary.screenViews[screenName] || 0) + 1;
        this.save();
    }

    /** Track a successful translation */
    trackTranslation(fromLang: string, toLang: string): void {
        this.ensureInit();
        this.summary.totalTranslations++;
        const pair = `${fromLang}→${toLang}`;
        this.summary.languagePairs[pair] = (this.summary.languagePairs[pair] || 0) + 1;
        this.save();
    }

    /** Track recording duration */
    trackRecording(durationMs: number): void {
        this.ensureInit();
        this.summary.totalRecordingDurationMs += durationMs;
        this.save();
    }

    /** Track an OCR capture */
    trackOcr(targetLang: string): void {
        this.ensureInit();
        this.trackTranslation('ocr', targetLang);
    }

    /** Get analytics summary for display */
    getSummary(): AnalyticsSummary {
        return { ...this.summary };
    }

    /** Get the top N language pairs */
    getTopLanguagePairs(n = 5): Array<{ pair: string; count: number }> {
        return Object.entries(this.summary.languagePairs)
            .sort(([, a], [, b]) => b - a)
            .slice(0, n)
            .map(([pair, count]) => ({ pair, count }));
    }

    private ensureInit(): void {
        if (!this.initialized) {
            this.summary.lastSessionStart = Date.now();
            this.initialized = true;
            // Async load will merge later
            this.initialize();
        }
    }
}

export const analyticsService = new AnalyticsService();
