/**
 * 🧬 Windy Chat — Translation Middleware
 * On-device translation for chat messages.
 *
 * Features:
 *   - Before send: attach original language as metadata
 *   - On receive: detect language, translate if different from user's
 *   - Uses existing translationService (same as voice-to-text translation)
 *   - LRU cache (100 entries) to avoid re-translating same messages
 *   - All translation happens ON DEVICE — never sent to any server
 */
import { translationService, TIER_1_LANGUAGES } from './translation';
import type { ChatMessage } from './chatClient';
import { createLogger } from './logger';
import { pairManager } from './pairManager';

const log = createLogger('ChatTranslate');

// ─── Types ──────────────────────────────────────────────────────

export interface TranslatedMessage extends ChatMessage {
    /** Translated body (null if same language or untranslatable) */
    translatedBody: string | null;
    /** Source language of the original message */
    detectedLang: string | null;
    /** Flag emoji for detected language */
    langFlag: string | null;
    /** Human-readable language name */
    langName: string | null;
    /** Whether translation was applied */
    wasTranslated: boolean;
}

/** Result returned when a chat message needs a missing translation pair */
export interface ChatPairNeededResult {
    translated: false;
    originalText: string;
    detectedLang: string;
    pairNeeded: string;
}

// ─── LRU Cache ──────────────────────────────────────────────────

const MAX_CACHE = 100;

class LRUCache<K, V> {
    private cache = new Map<K, V>();
    private readonly maxSize: number;

    constructor(maxSize: number) {
        this.maxSize = maxSize;
    }

    get(key: K): V | undefined {
        if (!this.cache.has(key)) return undefined;
        // Move to end (most recently used)
        const value = this.cache.get(key)!;
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key: K, value: V): void {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Evict oldest (first entry)
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }

    clear(): void {
        this.cache.clear();
    }

    get size(): number {
        return this.cache.size;
    }
}

// ─── Service ────────────────────────────────────────────────────

class ChatTranslateService {
    private cache = new LRUCache<string, TranslatedMessage>(MAX_CACHE);
    private userLanguage = 'en';

    /**
     * Set the user's preferred language (messages will be translated TO this).
     */
    setUserLanguage(langCode: string): void {
        log.state('setUserLanguage', `changed to ${langCode}`);
        this.userLanguage = langCode;
    }

    getUserLanguage(): string {
        return this.userLanguage;
    }

    /**
     * Get the language code to attach when sending a message.
     * This tells recipients what language the original is in.
     */
    getSendLanguage(): string {
        return this.userLanguage;
    }

    /**
     * Translate a received message if it's in a different language.
     * Returns a TranslatedMessage with translation data.
     */
    async translateMessage(message: ChatMessage): Promise<TranslatedMessage> {
        const cacheKey = `${message.eventId}:${this.userLanguage}`;
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;

        log.entry('translateMessage', { eventId: message.eventId, bodyLen: message.body.length, isOwn: message.isOwn });

        // Own messages don't need translation
        if (message.isOwn) {
            const result: TranslatedMessage = {
                ...message,
                translatedBody: null,
                detectedLang: this.userLanguage,
                langFlag: null,
                langName: null,
                wasTranslated: false,
            };
            this.cache.set(cacheKey, result);
            return result;
        }

        // If sender attached language metadata, use it; otherwise detect
        let sourceLang = message.originalLang || null;

        if (!sourceLang && message.body.trim()) {
            try {
                const detected = await translationService.detectLanguage(message.body);
                sourceLang = detected.language;
            } catch (err) {
                log.error('translateMessage', err, { phase: 'detection' });
            }
        }

        // Same language — no translation needed
        if (!sourceLang || sourceLang === this.userLanguage) {
            const result: TranslatedMessage = {
                ...message,
                translatedBody: null,
                detectedLang: sourceLang,
                langFlag: null,
                langName: null,
                wasTranslated: false,
            };
            this.cache.set(cacheKey, result);
            return result;
        }

        // Translate the message
        try {
            const translation = await translationService.translate(
                message.body,
                sourceLang,
                this.userLanguage,
            );

            const langInfo = TIER_1_LANGUAGES.find(l => l.code === sourceLang);

            const result: TranslatedMessage = {
                ...message,
                translatedBody: translation.translated,
                detectedLang: sourceLang,
                langFlag: langInfo?.flag || '🌐',
                langName: langInfo?.name || sourceLang,
                wasTranslated: true,
            };

            this.cache.set(cacheKey, result);
            log.exit('translateMessage', { from: sourceLang, to: this.userLanguage, wasTranslated: true });
            return result;
        } catch (err) {
            log.error('translateMessage', err, { from: sourceLang, to: this.userLanguage });

            // Check if a local pair is needed for this language pair
            const pairId = `windy-pair-${sourceLang}-${this.userLanguage}`;
            let pairDownloaded = false;
            try { pairDownloaded = await pairManager.isDownloaded(pairId); } catch { /* ignore */ }

            // Attach pairNeeded metadata if pair is missing
            const base: TranslatedMessage = {
                ...message,
                translatedBody: null,
                detectedLang: sourceLang,
                langFlag: null,
                langName: null,
                wasTranslated: false,
            };

            if (!pairDownloaded) {
                // Attach pair-needed info as extra properties for the UI to consume
                return Object.assign(base, {
                    pairNeeded: pairId,
                });
            }

            return base;
        }
    }

    /**
     * Batch-translate multiple messages.
     * RC-3: Process in batches of 5 to avoid overwhelming the translation engine.
     */
    async translateMessages(messages: ChatMessage[]): Promise<TranslatedMessage[]> {
        log.entry('translateMessages', { count: messages.length });
        const BATCH_SIZE = 5;
        const results: TranslatedMessage[] = [];
        for (let i = 0; i < messages.length; i += BATCH_SIZE) {
            const batch = messages.slice(i, i + BATCH_SIZE);
            const translated = await Promise.all(batch.map(m => this.translateMessage(m)));
            results.push(...translated);
        }
        log.exit('translateMessages', { translated: results.filter(r => r.wasTranslated).length });
        return results;
    }

    /**
     * Clear the translation cache.
     */
    clearCache(): void {
        log.state('clearCache', `cleared ${this.cache.size} entries`);
        this.cache.clear();
    }
}

export const chatTranslateService = new ChatTranslateService();
