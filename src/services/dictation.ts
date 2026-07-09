/**
 * 🧬 Dictation — OS-native speech-to-text (Voice v1).
 *
 * Wraps expo-speech-recognition: iOS SFSpeechRecognizer / Android
 * SpeechRecognizer. This is the "grandma tier" voice input — one tap,
 * talk, words appear — available to every account. It streams interim
 * results so text shows up while you speak, unlike the record-then-
 * transcribe Windy engine path (which stays the long-press voice-note /
 * Word-tab flow).
 *
 * On-device: the OS decides (iOS 17+ runs supported locales on-device
 * automatically). We deliberately do NOT set requiresOnDeviceRecognition
 * — on unsupported locales that flag makes start() fail outright, which
 * flunks the grandma test. The bundled Windy Nano engine (M3) is the
 * guaranteed-offline tier.
 *
 * The native module is lazy-required so Jest / environments without the
 * dev-client build degrade to `isAvailable() === false` instead of
 * crashing at import time.
 */
import { createLogger } from './logger';

const log = createLogger('Dictation');

export interface DictationCallbacks {
    /** Streaming partial transcript (replaces the previous partial). */
    onPartial?: (text: string) => void;
    /** Final transcript for the utterance. */
    onFinal: (text: string) => void;
    /** User-facing error message. */
    onError?: (message: string) => void;
    /** Recognition session ended (after final/error/stop). */
    onEnd?: () => void;
}

export interface DictationOptions {
    /** BCP-47 tag, e.g. "en-US". Defaults to the user's language setting. */
    lang?: string;
    /** Keep listening across pauses (default true — tap again to stop). */
    continuous?: boolean;
}

type NativeModule = {
    start: (opts: Record<string, unknown>) => void;
    stop: () => void;
    abort: () => void;
    requestPermissionsAsync: () => Promise<{ granted: boolean }>;
    getPermissionsAsync: () => Promise<{ granted: boolean }>;
    isRecognitionAvailable: () => boolean;
    supportsOnDeviceRecognition: () => boolean;
    addListener: (event: string, cb: (ev: any) => void) => { remove: () => void };
};

function userFacingError(code: string | undefined, message: string | undefined): string {
    switch (code) {
        case 'not-allowed':
        case 'service-not-allowed':
            return 'Microphone or speech permission is off — enable it in Settings.';
        case 'language-not-supported':
            return 'Dictation is not available for this language on your device.';
        case 'network':
            return 'Dictation needs a connection right now — check your network.';
        case 'no-speech':
            return "Didn't catch that — try speaking again.";
        case 'audio-capture':
            return 'Could not access the microphone.';
        default:
            return message || 'Dictation failed — please try again.';
    }
}

class DictationService {
    private module: NativeModule | null | undefined;
    private subscriptions: { remove: () => void }[] = [];
    private listening = false;
    // Intel session tracking (INTEL-CONTRACT-V2 §1.2) — counts/durations
    // only, never the transcript itself.
    private sessionStartedAt: number | null = null;
    private sessionWordCount = 0;
    private sessionLang = 'en-US';

    /** Lazy-load the native module; null when not present in this build. */
    private native(): NativeModule | null {
        if (this.module !== undefined) return this.module;
        try {
            const { ExpoSpeechRecognitionModule } = require('expo-speech-recognition');
            this.module = ExpoSpeechRecognitionModule as NativeModule;
        } catch {
            log.warn('native', 'expo-speech-recognition not available in this build');
            this.module = null;
        }
        return this.module;
    }

    /** True when the OS speech service exists in this build/device. */
    isAvailable(): boolean {
        const m = this.native();
        if (!m) return false;
        try {
            return m.isRecognitionAvailable();
        } catch {
            return false;
        }
    }

    isListening(): boolean {
        return this.listening;
    }

    /** Ask for mic + speech permissions. Returns granted. */
    async requestPermissions(): Promise<boolean> {
        const m = this.native();
        if (!m) return false;
        try {
            const existing = await m.getPermissionsAsync();
            if (existing.granted) return true;
            const res = await m.requestPermissionsAsync();
            return !!res.granted;
        } catch (err) {
            log.warn('permissions', 'permission request failed', { error: String(err) });
            return false;
        }
    }

    /**
     * Start dictating. Resolves true when the session started. Callbacks
     * fire until onEnd. Only one session at a time — a second start()
     * while listening is a no-op returning false.
     */
    async start(callbacks: DictationCallbacks, options: DictationOptions = {}): Promise<boolean> {
        const m = this.native();
        if (!m) {
            callbacks.onError?.('Dictation is not available in this version of the app.');
            return false;
        }
        if (this.listening) return false;

        if (!(await this.requestPermissions())) {
            callbacks.onError?.('Microphone or speech permission is off — enable it in Settings.');
            try {
                const { intelService } = require('./intel');
                intelService.emitError('mic_permission_denied', 'dictate', { recoverable: true });
            } catch { /* telemetry never affects dictation */ }
            return false;
        }

        let lang = options.lang;
        if (!lang) {
            try {
                const { useSettingsStore } = require('@/stores/useSettingsStore');
                const code = useSettingsStore.getState().defaultLanguage || 'en';
                lang = code.includes('-') ? code : `${code}-${code === 'en' ? 'US' : code.toUpperCase()}`;
            } catch {
                lang = 'en-US';
            }
        }

        this.clearSubscriptions();

        this.subscriptions.push(m.addListener('result', (ev: {
            isFinal: boolean;
            results: { transcript: string }[];
        }) => {
            const transcript = ev.results?.[0]?.transcript ?? '';
            if (!transcript) return;
            if (ev.isFinal) {
                // Intel: count words only — the text itself never leaves.
                this.sessionWordCount += transcript.split(/\s+/).filter(Boolean).length;
                callbacks.onFinal(transcript);
            } else {
                callbacks.onPartial?.(transcript);
            }
        }));

        this.subscriptions.push(m.addListener('error', (ev: { error?: string; message?: string }) => {
            // "no-speech" on a manual stop is noise, not an error state.
            if (ev.error === 'no-speech' && !this.listening) return;
            try {
                const { intelService } = require('./intel');
                intelService.emitError('dictation_error', 'dictate', { recoverable: true });
            } catch { /* telemetry never affects dictation */ }
            callbacks.onError?.(userFacingError(ev.error, ev.message));
        }));

        this.subscriptions.push(m.addListener('end', () => {
            this.listening = false;
            this.clearSubscriptions();
            this.emitDictationUsage();
            callbacks.onEnd?.();
        }));

        try {
            m.start({
                lang,
                interimResults: true,
                continuous: options.continuous !== false,
                addsPunctuation: true,
            });
            this.listening = true;
            this.sessionStartedAt = Date.now();
            this.sessionWordCount = 0;
            this.sessionLang = lang || 'en-US';
            return true;
        } catch (err) {
            log.warn('start', 'dictation start failed', { error: String(err) });
            this.clearSubscriptions();
            callbacks.onError?.('Could not start dictation — please try again.');
            return false;
        }
    }

    /** Graceful stop — flushes the final result, then `end` fires. */
    stop(): void {
        const m = this.native();
        if (!m || !this.listening) return;
        this.listening = false;
        try {
            m.stop();
        } catch (err) {
            log.warn('stop', 'dictation stop failed', { error: String(err) });
        }
    }

    /** Hard abort — discards pending results. */
    abort(): void {
        const m = this.native();
        if (!m) return;
        this.listening = false;
        this.clearSubscriptions();
        // Aborted session = discarded results; no usage event.
        this.sessionStartedAt = null;
        this.sessionWordCount = 0;
        try {
            m.abort();
        } catch { /* already stopped */ }
    }

    /**
     * feature.usage.dictation (INTEL-CONTRACT-V2 §1.2) — fired once per
     * completed OS-dictation session (any consumer: Quick Dictate, chat
     * voice input). Emits seconds/word_count/language only — never text.
     * OS dictation maps to engine_tier "light", on_device true.
     */
    private emitDictationUsage(): void {
        try {
            if (!this.sessionStartedAt || this.sessionWordCount === 0) {
                this.sessionStartedAt = null;
                this.sessionWordCount = 0;
                return;
            }
            const seconds = (Date.now() - this.sessionStartedAt) / 1000;
            const wordCount = this.sessionWordCount;
            this.sessionStartedAt = null;
            this.sessionWordCount = 0;
            const { intelService } = require('./intel');
            intelService.emitDictation({
                seconds,
                language: this.sessionLang,
                osDictation: true,
                wordCount,
            });
        } catch { /* telemetry never affects dictation */ }
    }

    private clearSubscriptions(): void {
        for (const sub of this.subscriptions) {
            try { sub.remove(); } catch { /* already removed */ }
        }
        this.subscriptions = [];
    }
}

export const dictationService = new DictationService();
