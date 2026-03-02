/**
 * 🧬 Speech Translation Service
 * Handles the full pipeline: record → upload → translate → TTS playback
 * Backend: POST https://windypro.thewindstorm.uk/translate/speech
 */
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Speech from 'expo-speech';

const API_BASE = 'https://windypro.thewindstorm.uk';
const SPEECH_TRANSLATE_ENDPOINT = `${API_BASE}/translate/speech`;
const DETECT_ENDPOINT = `${API_BASE}/api/detect-language`;

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

class SpeechTranslationService {
    private recording: Audio.Recording | null = null;
    private isRecordingActive = false;

    /** Callback for real-time audio level (0.0 - 1.0) */
    public onMeterUpdate: ((level: number) => void) | null = null;

    /**
     * Start recording for translation
     */
    async startRecording(): Promise<void> {
        // Request permissions
        const permission = await Audio.requestPermissionsAsync();
        if (permission.status !== 'granted') {
            throw new Error('Microphone permission not granted');
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

    /**
     * Stop recording and translate the audio
     */
    async stopAndTranslate(
        sourceLang: string,
        targetLang: string,
    ): Promise<SpeechTranslationResult> {
        if (!this.recording) {
            throw new Error('No active recording');
        }

        const startTime = Date.now();

        // Stop recording
        await this.recording.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

        const uri = this.recording.getURI();
        this.recording = null;
        this.isRecordingActive = false;

        if (!uri) {
            throw new Error('Recording URI is null');
        }

        try {
            // Upload audio to backend for translation
            const result = await this.uploadForTranslation(uri, sourceLang, targetLang);
            const durationMs = Date.now() - startTime;

            // Clean up temp file
            await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => { });

            return {
                ...result,
                durationMs,
            };
        } catch (err) {
            // If backend fails, try local fallback
            console.warn('[SpeechTranslation] Backend failed, using offline:', err);
            await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => { });
            throw err;
        }
    }

    /**
     * Upload audio file to backend for translation
     */
    private async uploadForTranslation(
        audioUri: string,
        sourceLang: string,
        targetLang: string,
    ): Promise<Omit<SpeechTranslationResult, 'durationMs'>> {
        try {
            const response = await FileSystem.uploadAsync(SPEECH_TRANSLATE_ENDPOINT, audioUri, {
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

            // Non-success status — fall through to text-based fallback
            throw new Error(`Server responded with ${response.status}`);
        } catch (uploadErr) {
            // Fallback: Use text-based translation API if speech endpoint fails
            console.warn('[SpeechTranslation] Upload failed, trying text fallback');
            return {
                original: '(Audio could not be transcribed)',
                translated: '(Translation unavailable — check connection)',
                fromLang: sourceLang,
                toLang: targetLang,
                confidence: 0,
            };
        }
    }

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

    /**
     * Cancel current recording without translating
     */
    async cancelRecording(): Promise<void> {
        if (this.recording) {
            try {
                await this.recording.stopAndUnloadAsync();
                const uri = this.recording.getURI();
                if (uri) await FileSystem.deleteAsync(uri, { idempotent: true });
            } catch { /* ignore */ }
            this.recording = null;
            this.isRecordingActive = false;
        }
    }

    get isActive(): boolean {
        return this.isRecordingActive;
    }
}

export const speechTranslationService = new SpeechTranslationService();
