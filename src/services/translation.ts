/**
 * 🧬 M6.1 — Translation Service
 * Routes translation through on-device NLLB models or cloud API
 */
import type { LicenseTier } from '@/types';

/** Cloud translation API */
const TRANSLATE_API = 'https://windypro.thewindstorm.uk/api/translate';

/** Translation result */
export interface TranslationResult {
    translated: string;
    confidence: number;
    fromLanguage: string;
    toLanguage: string;
}

/** Supported language with display info */
export interface SupportedLanguage {
    code: string;       // ISO 639-1
    name: string;       // Display name
    nativeName: string; // Name in native script
    flag: string;       // Emoji flag
    tier: 1 | 2 | 3;   // Which launch tier
}

/**
 * 🧬 M6.1.2 — Tier 1 launch languages (15)
 */
export const TIER_1_LANGUAGES: SupportedLanguage[] = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸', tier: 1 },
    { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', tier: 1 },
    { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', tier: 1 },
    { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', tier: 1 },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷', tier: 1 },
    { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹', tier: 1 },
    { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳', tier: 1 },
    { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', tier: 1 },
    { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷', tier: 1 },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', tier: 1 },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', tier: 1 },
    { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', tier: 1 },
    { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', tier: 1 },
    { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳', tier: 1 },
    { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱', tier: 1 },
];

class TranslationService {
    private sourceLang = 'en';
    private targetLang = 'es';
    private isActive = false;
    private mode: 'manual' | 'auto' | 'split-screen' = 'manual';
    private cache = new Map<string, TranslationResult>();
    private readonly MAX_CACHE = 100;

    /**
     * Translate text from one language to another
     */
    async translate(
        text: string,
        from: string,
        to: string
    ): Promise<TranslationResult> {
        // Check cache first
        const cacheKey = `${from}:${to}:${text}`;
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;

        // Cloud translation (requires internet + Translate tier)
        try {
            const response = await fetch(TRANSLATE_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, source: from, target: to }),
            });

            if (!response.ok) {
                throw new Error(`Translation failed: ${response.status}`);
            }

            const data = await response.json();
            const result: TranslationResult = {
                translated: data.translated,
                confidence: data.confidence,
                fromLanguage: from,
                toLanguage: to,
            };

            // Populate cache (LRU: evict oldest if full)
            if (this.cache.size >= this.MAX_CACHE) {
                const firstKey = this.cache.keys().next().value;
                if (firstKey) this.cache.delete(firstKey);
            }
            this.cache.set(cacheKey, result);

            return result;
        } catch (error) {
            // Fallback: return original text with a note when cloud is unavailable
            // On-device NLLB model could be loaded here when available
            console.warn('[Translation] Cloud failed, returning original text:', error);
            return {
                translated: `[Translation unavailable] ${text}`,
                confidence: 0,
                fromLanguage: from,
                toLanguage: to,
            };
        }
    }

    /**
     * Swap source and target languages
     */
    swapLanguages(): void {
        const temp = this.sourceLang;
        this.sourceLang = this.targetLang;
        this.targetLang = temp;
    }

    /**
     * Set conversation mode
     */
    setMode(mode: 'manual' | 'auto' | 'split-screen'): void {
        this.mode = mode;
    }

    /**
     * Get current languages
     */
    getLanguages(): { source: string; target: string } {
        return { source: this.sourceLang, target: this.targetLang };
    }

    /**
     * Set languages
     */
    setLanguages(source: string, target: string): void {
        this.sourceLang = source;
        this.targetLang = target;
    }
}

// Singleton instance
export const translationService = new TranslationService();
