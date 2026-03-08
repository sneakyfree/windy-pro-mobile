/**
 * 🧬 Rating Prompt Service
 * Triggers app store rating after 5th successful translation.
 * Uses expo-store-review with rate-limiting (max once per 30 days).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

const TRANSLATION_COUNT_KEY = 'windy-translation-count';
const LAST_PROMPT_KEY = 'windy-last-rating-prompt';
const TRIGGER_COUNT = 5;
const MIN_DAYS_BETWEEN_PROMPTS = 30;

class RatingPromptService {
    private translationCount = 0;
    private lastPromptDate: number | null = null;
    private initialized = false;

    async initialize(): Promise<void> {
        if (this.initialized) return;
        try {
            const count = await AsyncStorage.getItem(TRANSLATION_COUNT_KEY);
            const lastPrompt = await AsyncStorage.getItem(LAST_PROMPT_KEY);
            this.translationCount = count ? parseInt(count, 10) : 0;
            this.lastPromptDate = lastPrompt ? parseInt(lastPrompt, 10) : null;
            this.initialized = true;
        } catch (err) { console.warn("[RatingPrompt] Error:", err); }
    }

    /**
     * Record a successful translation. If conditions are met, prompt for rating.
     */
    async recordTranslation(): Promise<void> {
        await this.initialize();
        this.translationCount++;

        try {
            await AsyncStorage.setItem(TRANSLATION_COUNT_KEY, String(this.translationCount));
        } catch (err) { console.warn("[RatingPrompt] Error:", err); }

        // Check if we should prompt
        if (this.translationCount >= TRIGGER_COUNT && this.shouldPrompt()) {
            await this.promptRating();
        }
    }

    private shouldPrompt(): boolean {
        // Only prompt on exact multiples of TRIGGER_COUNT (5, 10, 15...)
        if (this.translationCount % TRIGGER_COUNT !== 0) return false;

        // Rate-limit: max once per 30 days
        if (this.lastPromptDate) {
            const daysSinceLastPrompt = (Date.now() - this.lastPromptDate) / (1000 * 60 * 60 * 24);
            if (daysSinceLastPrompt < MIN_DAYS_BETWEEN_PROMPTS) return false;
        }

        return true;
    }

    private async promptRating(): Promise<void> {
        try {
            const isAvailable = await StoreReview.isAvailableAsync();
            if (!isAvailable) return;

            await StoreReview.requestReview();
            this.lastPromptDate = Date.now();
            await AsyncStorage.setItem(LAST_PROMPT_KEY, String(this.lastPromptDate));
        } catch (err) { console.warn("[RatingPrompt] Error:", err);
            // Store review not available on this device/emulator
        }
    }

    get count(): number {
        return this.translationCount;
    }
}

export const ratingPromptService = new RatingPromptService();
