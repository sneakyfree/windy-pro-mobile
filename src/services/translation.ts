/**
 * 🧬 M6.1 — Translation Service
 * Routes translation through cloud API or on-device model.
 * Includes TTS output, language detection, and conversation export.
 */
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { LicenseTier } from '@/types';

/** Cloud translation API */
const TRANSLATE_API = 'https://windypro.thewindstorm.uk/api/translate';
const SPEECH_API = 'https://windypro.thewindstorm.uk/translate/speech';
const DETECT_API = 'https://windypro.thewindstorm.uk/api/detect-language';

/** Translation result */
export interface TranslationResult {
    translated: string;
    confidence: number;
    fromLanguage: string;
    toLanguage: string;
    detectedLanguage?: string;
}

/** Conversation turn for export */
export interface ConversationTurn {
    id: string;
    speaker: 'A' | 'B';
    original: string;
    translated: string;
    fromLang: string;
    toLang: string;
    timestamp: number;
    startTime?: number;  // seconds from start (for SRT)
    endTime?: number;
    confidence?: number; // translation quality 0-1
    detectedLang?: string; // auto-detected source language
    favorite?: boolean; // pinned/favorited by user
}

/** Supported language with display info */
export interface SupportedLanguage {
    code: string;
    name: string;
    nativeName: string;
    flag: string;
    tier: 1 | 2 | 3;
    ttsVoice?: string;
}

/** Conversation mode */
export type ConversationMode = 'manual' | 'auto' | 'split-screen';

/**
 * 🧬 M6.1.2 — Tier 1 launch languages (15)
 */
export const TIER_1_LANGUAGES: SupportedLanguage[] = [
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸', tier: 1, ttsVoice: 'en-US' },
    { code: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸', tier: 1, ttsVoice: 'es-ES' },
    { code: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷', tier: 1, ttsVoice: 'fr-FR' },
    { code: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪', tier: 1, ttsVoice: 'de-DE' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português', flag: '🇧🇷', tier: 1, ttsVoice: 'pt-BR' },
    { code: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹', tier: 1, ttsVoice: 'it-IT' },
    { code: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳', tier: 1, ttsVoice: 'zh-CN' },
    { code: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵', tier: 1, ttsVoice: 'ja-JP' },
    { code: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷', tier: 1, ttsVoice: 'ko-KR' },
    { code: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦', tier: 1, ttsVoice: 'ar-SA' },
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', tier: 1, ttsVoice: 'hi-IN' },
    { code: 'ru', name: 'Russian', nativeName: 'Русский', flag: '🇷🇺', tier: 1, ttsVoice: 'ru-RU' },
    { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', flag: '🇹🇷', tier: 1, ttsVoice: 'tr-TR' },
    { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', flag: '🇻🇳', tier: 1, ttsVoice: 'vi-VN' },
    { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', flag: '🇳🇱', tier: 1, ttsVoice: 'nl-NL' },
];

class TranslationService {
    private sourceLang = 'en';
    private targetLang = 'es';
    private mode: ConversationMode = 'manual';
    private ttsEnabled = true;
    private ttsRate = 0.9;
    private cache = new Map<string, TranslationResult>();
    private readonly MAX_CACHE = 200;

    // ─── Translation ───────────────────────────────────────────

    /**
     * Translate text from one language to another
     */
    async translate(text: string, from: string, to: string): Promise<TranslationResult> {
        if (!text.trim()) {
            return { translated: '', confidence: 0, fromLanguage: from, toLanguage: to };
        }

        // Same language = no-op
        if (from === to) {
            return { translated: text, confidence: 1, fromLanguage: from, toLanguage: to };
        }

        // Check cache
        const cacheKey = `${from}:${to}:${text.trim().toLowerCase()}`;
        const cached = this.cache.get(cacheKey);
        if (cached) return cached;

        // Cloud translation
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
                translated: data.translated || data.text || text,
                confidence: data.confidence ?? 0.9,
                fromLanguage: from,
                toLanguage: to,
            };

            // Cache (LRU eviction)
            if (this.cache.size >= this.MAX_CACHE) {
                const firstKey = this.cache.keys().next().value;
                if (firstKey) this.cache.delete(firstKey);
            }
            this.cache.set(cacheKey, result);

            return result;
        } catch (error) {
            console.warn('[Translation] Cloud failed:', error);
            return {
                translated: `[Translation unavailable] ${text}`,
                confidence: 0,
                fromLanguage: from,
                toLanguage: to,
            };
        }
    }

    // ─── Speech-to-Speech Translation ──────────────────────────

    /**
     * Translate speech audio to text + translated text.
     * Sends audio file to the speech translation API as multipart/form-data.
     * @param audioUri - Local file URI of the recorded audio (WAV/M4A)
     * @param from - Source language code
     * @param to - Target language code
     * @returns TranslationResult with original transcript and translation
     */
    async translateSpeech(
        audioUri: string,
        from: string,
        to: string
    ): Promise<TranslationResult & { originalText: string }> {
        try {
            const fileInfo = await FileSystem.getInfoAsync(audioUri);
            if (!fileInfo.exists) {
                throw new Error('Audio file not found');
            }

            // Upload audio as multipart/form-data
            const uploadResult = await FileSystem.uploadAsync(SPEECH_API, audioUri, {
                httpMethod: 'POST',
                uploadType: FileSystem.FileSystemUploadType.MULTIPART,
                fieldName: 'audio',
                parameters: {
                    source: from,
                    target: to,
                },
                headers: {
                    Accept: 'application/json',
                },
            });

            if (uploadResult.status < 200 || uploadResult.status >= 300) {
                throw new Error(`Speech API returned ${uploadResult.status}`);
            }

            const data = JSON.parse(uploadResult.body);
            return {
                originalText: data.original || data.transcript || '',
                translated: data.translated || data.translation || '',
                confidence: data.confidence ?? 0.85,
                fromLanguage: from,
                toLanguage: to,
                detectedLanguage: data.detected_language || data.detectedLanguage,
            };
        } catch (error) {
            console.warn('[Translation] Speech API failed:', error);

            // Fallback: return error state
            return {
                originalText: '',
                translated: '[Speech translation unavailable]',
                confidence: 0,
                fromLanguage: from,
                toLanguage: to,
            };
        }
    }

    // ─── Language Detection (for Auto mode) ────────────────────

    /**
     * Detect the language of input text
     */
    async detectLanguage(text: string): Promise<{ language: string; confidence: number }> {
        try {
            const response = await fetch(DETECT_API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });

            if (response.ok) {
                const data = await response.json();
                return { language: data.language || 'en', confidence: data.confidence || 0.5 };
            }
        } catch { /* fallback below */ }

        // Heuristic fallback: check against known patterns
        return this.heuristicDetect(text);
    }

    private heuristicDetect(text: string): { language: string; confidence: number } {
        // Simple character-range detection
        if (/[\u4e00-\u9fff]/.test(text)) return { language: 'zh', confidence: 0.8 };
        if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return { language: 'ja', confidence: 0.8 };
        if (/[\uac00-\ud7af]/.test(text)) return { language: 'ko', confidence: 0.8 };
        if (/[\u0600-\u06ff]/.test(text)) return { language: 'ar', confidence: 0.8 };
        if (/[\u0900-\u097f]/.test(text)) return { language: 'hi', confidence: 0.8 };
        if (/[\u0400-\u04ff]/.test(text)) return { language: 'ru', confidence: 0.7 };
        if (/[àâäéèêëïîôùûüÿçœæ]/i.test(text)) return { language: 'fr', confidence: 0.5 };
        if (/[ñ¿¡áéíóú]/i.test(text)) return { language: 'es', confidence: 0.5 };
        if (/[äöüß]/i.test(text)) return { language: 'de', confidence: 0.5 };
        return { language: 'en', confidence: 0.3 };
    }

    /**
     * Auto-detect speaker based on detected language
     * Returns 'A' if detected lang matches sourceLang, 'B' if it matches targetLang
     */
    async autoDetectSpeaker(text: string): Promise<'A' | 'B'> {
        const detected = await this.detectLanguage(text);
        if (detected.language === this.targetLang) return 'B';
        return 'A'; // default to A (source)
    }

    // ─── TTS (Text-to-Speech) ──────────────────────────────────

    /**
     * Speak translated text aloud via expo-speech
     */
    async speak(text: string, languageCode: string): Promise<void> {
        if (!this.ttsEnabled || !text.trim()) return;

        const lang = TIER_1_LANGUAGES.find((l) => l.code === languageCode);
        const voice = lang?.ttsVoice || languageCode;

        try {
            await Speech.speak(text, {
                language: voice,
                rate: this.ttsRate,
                pitch: 1.0,
                onDone: () => console.log('[TTS] Done speaking'),
                onError: (err) => console.warn('[TTS] Error:', err),
            });
        } catch (err) {
            console.warn('[TTS] Speak failed:', err);
        }
    }

    /** Stop any active TTS playback */
    stopSpeaking(): void {
        Speech.stop();
    }

    /** Check if TTS is currently speaking */
    async isSpeaking(): Promise<boolean> {
        return Speech.isSpeakingAsync();
    }

    // ─── Conversation Export ───────────────────────────────────

    /**
     * Export conversation as plain text
     */
    exportAsText(turns: ConversationTurn[], sourceLang: string, targetLang: string): string {
        const header = `Windy Pro Translation — ${this.getLangName(sourceLang)} ↔ ${this.getLangName(targetLang)}\n` +
            `Date: ${new Date().toLocaleString()}\n` +
            `Turns: ${turns.length}\n${'─'.repeat(40)}\n\n`;

        return header + turns.map((t, i) => {
            const speakerLabel = t.speaker === 'A'
                ? `${this.getFlag(t.fromLang)} Speaker A (${this.getLangName(t.fromLang)})`
                : `${this.getFlag(t.fromLang)} Speaker B (${this.getLangName(t.fromLang)})`;
            return `[${i + 1}] ${speakerLabel}\n` +
                `  Original: ${t.original}\n` +
                `  ${this.getFlag(t.toLang)} Translated: ${t.translated}\n`;
        }).join('\n');
    }

    /**
     * Export conversation as Markdown
     */
    exportAsMarkdown(turns: ConversationTurn[], sourceLang: string, targetLang: string): string {
        const header = `# Windy Pro Translation\n\n` +
            `**Languages:** ${this.getFlag(sourceLang)} ${this.getLangName(sourceLang)} ↔ ` +
            `${this.getFlag(targetLang)} ${this.getLangName(targetLang)}\n` +
            `**Date:** ${new Date().toLocaleString()}\n` +
            `**Turns:** ${turns.length}\n\n---\n\n`;

        return header + turns.map((t, i) => {
            const side = t.speaker === 'A' ? 'left' : 'right';
            return `### ${i + 1}. ${this.getFlag(t.fromLang)} Speaker ${t.speaker}\n\n` +
                `> ${t.original}\n\n` +
                `**${this.getFlag(t.toLang)} Translation:** ${t.translated}\n\n`;
        }).join('---\n\n');
    }

    /**
     * Export conversation as SRT subtitles
     */
    exportAsSrt(turns: ConversationTurn[]): string {
        return turns.map((t, i) => {
            const start = t.startTime ?? i * 10;
            const end = t.endTime ?? start + 8;
            return `${i + 1}\n` +
                `${this.formatSrtTime(start)} --> ${this.formatSrtTime(end)}\n` +
                `[Speaker ${t.speaker}] ${t.original}\n` +
                `${t.translated}\n`;
        }).join('\n');
    }

    private formatSrtTime(seconds: number): string {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 1000);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    }

    /**
     * Save and share an export file
     */
    async shareExport(
        content: string,
        filename: string,
        mimeType: string = 'text/plain'
    ): Promise<void> {
        const dir = (FileSystem.cacheDirectory || '') + 'exports/';
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        const path = dir + filename;
        await FileSystem.writeAsStringAsync(path, content);

        if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(path, { mimeType, dialogTitle: 'Export Conversation' });
        }
    }

    // ─── Configuration ─────────────────────────────────────────

    setMode(mode: ConversationMode): void { this.mode = mode; }
    getMode(): ConversationMode { return this.mode; }

    setLanguages(source: string, target: string): void {
        this.sourceLang = source;
        this.targetLang = target;
    }

    getLanguages(): { source: string; target: string } {
        return { source: this.sourceLang, target: this.targetLang };
    }

    swapLanguages(): void {
        [this.sourceLang, this.targetLang] = [this.targetLang, this.sourceLang];
    }

    setTtsEnabled(enabled: boolean): void { this.ttsEnabled = enabled; }
    getTtsEnabled(): boolean { return this.ttsEnabled; }
    setTtsRate(rate: number): void { this.ttsRate = Math.max(0.1, Math.min(2.0, rate)); }

    // ─── Helpers ───────────────────────────────────────────────

    getFlag(code: string): string {
        return TIER_1_LANGUAGES.find((l) => l.code === code)?.flag || '🌐';
    }

    getLangName(code: string): string {
        return TIER_1_LANGUAGES.find((l) => l.code === code)?.name || code;
    }

    clearCache(): void { this.cache.clear(); }
}

export const translationService = new TranslationService();
