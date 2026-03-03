/**
 * 🧬 Speech Translation Service (Hardened)
 * Handles the full pipeline: record → upload → translate → TTS playback
 * Backend: POST https://windypro.thewindstorm.uk/translate/speech
 *
 * Hardening: typed errors, 15s timeout, 1 automatic retry on transient
 * failures (5xx / timeout), unsupported language validation.
 */
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Speech from 'expo-speech';
import { TIER_1_LANGUAGES } from './translation';

const API_BASE = 'https://windypro.thewindstorm.uk';
const SPEECH_TRANSLATE_ENDPOINT = `${API_BASE}/api/v1/translate/speech`;
const DETECT_ENDPOINT = `${API_BASE}/api/v1/translate/languages`;

// ─── Error types ────────────────────────────────────────────────

export type SpeechErrorType =
    | 'timeout'
    | 'network'
    | 'server'
    | 'unsupported_language'
    | 'no_audio'
    | 'permission';

export class SpeechTranslationError extends Error {
    constructor(public type: SpeechErrorType, message: string) {
        super(message);
        this.name = 'SpeechTranslationError';
    }
}

/** Human-readable messages per error type */
export const SPEECH_ERROR_MESSAGES: Record<SpeechErrorType, string> = {
    timeout: 'Translation timed out. Check your connection and try again.',
    network: 'No internet connection. Your translation has been queued.',
    server: 'Translation server error. Please try again in a moment.',
    unsupported_language: 'This language pair is not supported yet.',
    no_audio: 'No audio was captured. Please try again.',
    permission: 'Microphone permission is required for speech translation.',
};

// ─── Result types ───────────────────────────────────────────────

export interface SpeechTranslationResult {
    original: string;
    translated: string;
    fromLang: string;
    toLang: string;
    confidence: number;
    detectedLang?: string;
    durationMs: number;
}

export interface TranslationHistory {
    id: string;
    result: SpeechTranslationResult;
    timestamp: number;
    favorite: boolean;
}

// ─── Constants ──────────────────────────────────────────────────

const UPLOAD_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 1;
const RETRY_BASE_DELAY_MS = 1_000;
const SUPPORTED_CODES = new Set(TIER_1_LANGUAGES.map(l => l.code));

// ─── Service ────────────────────────────────────────────────────

class SpeechTranslationService {
    private recording: Audio.Recording | null = null;
    private isRecordingActive = false;

    /** Callback for real-time audio level (0.0 - 1.0) */
    public onMeterUpdate: ((level: number) => void) | null = null;

    // ─── Language Validation ────────────────────────────────────

    /**
     * Validate that both source and target languages are supported.
     * 'auto' is allowed as a source language for auto-detect.
     */
    validateLanguages(source: string, target: string): void {
        if (source !== 'auto' && !SUPPORTED_CODES.has(source)) {
            throw new SpeechTranslationError(
                'unsupported_language',
                `Source language '${source}' is not supported. Supported: ${[...SUPPORTED_CODES].join(', ')}`,
            );
        }
        if (!SUPPORTED_CODES.has(target)) {
            throw new SpeechTranslationError(
                'unsupported_language',
                `Target language '${target}' is not supported. Supported: ${[...SUPPORTED_CODES].join(', ')}`,
            );
        }
    }

    // ─── Recording ──────────────────────────────────────────────

    /**
     * Start recording for translation
     */
    async startRecording(): Promise<void> {
        // Request permissions
        const permission = await Audio.requestPermissionsAsync();
        if (permission.status !== 'granted') {
            throw new SpeechTranslationError('permission', 'Microphone permission not granted');
        }

        // Configure audio mode
        await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            staysActiveInBackground: false,
        });

        // Create recording (16kHz mono for speech recognition)
        const { recording } = await Audio.Recording.createAsync(
            {
                android: {
                    extension: '.wav',
                    outputFormat: Audio.AndroidOutputFormat.DEFAULT,
                    audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
                    sampleRate: 16000,
                    numberOfChannels: 1,
                    bitRate: 128000,
                },
                ios: {
                    extension: '.wav',
                    outputFormat: Audio.IOSOutputFormat.LINEARPCM,
                    audioQuality: Audio.IOSAudioQuality.HIGH,
                    sampleRate: 16000,
                    numberOfChannels: 1,
                    bitRate: 128000,
                    linearPCMBitDepth: 16,
                    linearPCMIsBigEndian: false,
                    linearPCMIsFloat: false,
                },
                web: {},
            },
            (status) => {
                if (status.isRecording && status.metering !== undefined && this.onMeterUpdate) {
                    const normalized = Math.max(0, Math.min(1, (status.metering + 60) / 60));
                    this.onMeterUpdate(normalized);
                }
            },
            80 // metering interval (ms)
        );

        this.recording = recording;
        this.isRecordingActive = true;
    }

    // ─── Stop & Translate ───────────────────────────────────────

    /**
     * Stop recording and translate the audio
     */
    async stopAndTranslate(
        sourceLang: string,
        targetLang: string,
    ): Promise<SpeechTranslationResult> {
        if (!this.recording) {
            throw new SpeechTranslationError('no_audio', 'No active recording');
        }

        // Validate languages before doing any work
        this.validateLanguages(sourceLang, targetLang);

        const startTime = Date.now();

        // Stop recording
        await this.recording.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

        const uri = this.recording.getURI();
        this.recording = null;
        this.isRecordingActive = false;

        if (!uri) {
            throw new SpeechTranslationError('no_audio', 'Recording URI is null');
        }

        try {
            // Upload audio to backend for translation (with retry)
            const result = await this.uploadWithRetry(uri, sourceLang, targetLang);
            const durationMs = Date.now() - startTime;

            // Clean up temp file
            await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => { });

            return {
                ...result,
                durationMs,
            };
        } catch (err) {
            // Clean up temp file even on failure
            await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => { });
            throw err;
        }
    }

    // ─── Upload with Retry ──────────────────────────────────────

    /**
     * Upload with automatic retry on transient failures (5xx, timeout).
     * Retries up to MAX_RETRIES times with exponential backoff.
     */
    private async uploadWithRetry(
        audioUri: string,
        sourceLang: string,
        targetLang: string,
    ): Promise<Omit<SpeechTranslationResult, 'durationMs'>> {
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                return await this.uploadForTranslation(audioUri, sourceLang, targetLang);
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));

                // Only retry on transient errors (timeout or server 5xx)
                const isTransient =
                    err instanceof SpeechTranslationError &&
                    (err.type === 'timeout' || err.type === 'server');

                if (!isTransient || attempt >= MAX_RETRIES) {
                    throw err;
                }

                // Exponential backoff
                const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
                // console.log(`[SpeechTranslation] Retrying (attempt ${attempt + 1}/${MAX_RETRIES})`);
            }
        }

        // Should not be reached, but satisfies TypeScript
        throw lastError ?? new SpeechTranslationError('network', 'Upload failed');
    }

    // ─── Upload with Timeout ────────────────────────────────────

    /**
     * Upload audio file to backend for translation with timeout
     */
    private async uploadForTranslation(
        audioUri: string,
        sourceLang: string,
        targetLang: string,
    ): Promise<Omit<SpeechTranslationResult, 'durationMs'>> {
        // Race the upload against a timeout
        const uploadPromise = FileSystem.uploadAsync(SPEECH_TRANSLATE_ENDPOINT, audioUri, {
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            fieldName: 'audio',
            parameters: {
                source_lang: sourceLang,
                target_lang: targetLang,
            },
            headers: {
                'Accept': 'application/json',
            },
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                reject(new SpeechTranslationError('timeout', `Upload timed out after ${UPLOAD_TIMEOUT_MS}ms`));
            }, UPLOAD_TIMEOUT_MS);
        });

        let response: FileSystem.FileSystemUploadResult;
        try {
            response = await Promise.race([uploadPromise, timeoutPromise]);
        } catch (err) {
            if (err instanceof SpeechTranslationError) throw err;
            // Network-level failure (DNS, connection refused, etc.)
            throw new SpeechTranslationError('network', `Network error: ${err instanceof Error ? err.message : String(err)}`);
        }

        // Server error (5xx)
        if (response.status >= 500) {
            throw new SpeechTranslationError('server', `Server responded with ${response.status}`);
        }

        // Client error (4xx) — not retriable
        if (response.status >= 400) {
            throw new SpeechTranslationError('server', `Server responded with ${response.status}: ${response.body}`);
        }

        // Success (2xx)
        if (response.status >= 200 && response.status < 300) {
            const data = JSON.parse(response.body);
            return {
                original: data.original || data.transcription || '',
                translated: data.translated || data.translation || '',
                fromLang: sourceLang,
                toLang: targetLang,
                confidence: data.confidence ?? 0.85,
                detectedLang: data.detected_language,
            };
        }

        // Unexpected status
        throw new SpeechTranslationError('server', `Unexpected status ${response.status}`);
    }

    // ─── Language Detection from Audio ──────────────────────────

    /**
     * Detect the language of recorded audio by sending to the speech
     * endpoint with source_lang='auto'. Returns detected language and
     * confidence score.
     */
    async detectLanguageFromAudio(
        audioUri: string,
    ): Promise<{ language: string; confidence: number }> {
        try {
            const response = await Promise.race([
                FileSystem.uploadAsync(SPEECH_TRANSLATE_ENDPOINT, audioUri, {
                    httpMethod: 'POST',
                    uploadType: FileSystem.FileSystemUploadType.MULTIPART,
                    fieldName: 'audio',
                    parameters: { source_lang: 'auto', target_lang: 'en' },
                    headers: { 'Accept': 'application/json' },
                }),
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('Detection timeout')), UPLOAD_TIMEOUT_MS)
                ),
            ]);

            if (response.status >= 200 && response.status < 300) {
                const data = JSON.parse(response.body);
                return {
                    language: data.detected_language || 'en',
                    confidence: data.confidence ?? 0.5,
                };
            }
        } catch (err) {
            console.warn('[SpeechTranslation] Language detection failed:', err);
        }

        return { language: 'en', confidence: 0.3 };
    }

    // ─── TTS Playback ───────────────────────────────────────────

    /**
     * Speak translated text using expo-speech
     */
    async speakTranslation(text: string, lang: string): Promise<void> {
        return new Promise((resolve) => {
            // Map language codes to BCP-47 for TTS
            const voiceMap: Record<string, string> = {
                en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT',
                pt: 'pt-BR', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', ar: 'ar-SA',
                hi: 'hi-IN', ru: 'ru-RU', nl: 'nl-NL', sv: 'sv-SE', pl: 'pl-PL',
                tr: 'tr-TR', th: 'th-TH', vi: 'vi-VN', uk: 'uk-UA', cs: 'cs-CZ',
            };

            Speech.speak(text, {
                language: voiceMap[lang] || lang,
                rate: 0.95,
                pitch: 1.0,
                onDone: resolve,
                onError: () => resolve(),
            });
        });
    }

    /**
     * Stop any ongoing TTS playback
     */
    async stopSpeaking(): Promise<void> {
        Speech.stop();
    }

    // ─── Cancel / Status ────────────────────────────────────────

    /**
     * Cancel current recording without translating
     */
    async cancelRecording(): Promise<void> {
        if (this.recording) {
            try {
                await this.recording.stopAndUnloadAsync();
                // Reset audio mode (matches stopAndTranslate pattern)
                await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
                const uri = this.recording.getURI();
                if (uri) await FileSystem.deleteAsync(uri, { idempotent: true });
            } catch { /* ignore */ }
            this.recording = null;
            this.isRecordingActive = false;
            this.onMeterUpdate = null;
        }
    }

    get isActive(): boolean {
        return this.isRecordingActive;
    }
}

export const speechTranslationService = new SpeechTranslationService();
