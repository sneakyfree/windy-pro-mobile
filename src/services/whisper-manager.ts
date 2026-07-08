/**
 * 🧬 RP-2.1 — Whisper Manager
 * Wraps whisper.rn for on-device transcription.
 * Handles model loading, transcription with segment callbacks, and cleanup.
 */
import * as FileSystem from 'expo-file-system/legacy';
import type { TranscriptSegment } from '@/types';
import { createLogger } from './logger';

const log = createLogger('WhisperManager');

// whisper.rn types — dynamically loaded to avoid crash if not installed.
// NOTE: whisper.rn's transcribe() does NOT return a promise of the result —
// it returns { stop, promise }. Awaiting the wrapper object resolves
// immediately with no result while inference is still running (and our
// release() then kills it). That exact mistake made every Word-home
// dictation return 0 segments silently (found live 2026-07-08).
interface WhisperTranscribeResult {
    result: string;
    segments?: WhisperSegment[];
}
interface WhisperContext {
    transcribe(
        uri: string,
        options: {
            language?: string;
            maxLen?: number;
            translate?: boolean;
            onNewSegments?: (segments: WhisperSegment[]) => void;
        }
    ): { stop: () => Promise<void>; promise: Promise<WhisperTranscribeResult> } | Promise<WhisperTranscribeResult>;
    release(): Promise<void>;
}

interface WhisperSegment {
    text: string;
    t0: number;  // centiseconds
    t1: number;  // centiseconds
}

type InitWhisperFn = (options: { filePath: string | number }) => Promise<WhisperContext>;

/**
 * The bundled Windy Nano model — whisper.cpp tiny multilingual, q5_1
 * quantized (~32 MB). Shipped INSIDE the app as a Metro asset ("standard
 * for everyone", consolidation plan 2026-07-05); the file itself is
 * fetched at install/build time by scripts/fetch-models.js and is NOT in
 * git. whisper.rn accepts the Metro asset id (a number) as filePath.
 */
export const WINDY_NANO_MODEL_FILE = 'ggml-tiny-q5_1.bin';

async function nanoAssetPath(): Promise<string> {
    // Isolated so tests can run without the 32 MB file (jest maps *.bin
    // to a stub). expo-asset resolves the Metro asset id to a real file
    // in EVERY mode (dev server, release bundle) — passing the raw asset
    // id straight to whisper.rn fails in release builds ("Failed to load
    // the model", found live on the iOS simulator build).
    const { Asset } = require('expo-asset');
    const asset = Asset.fromModule(require('@/assets/models/ggml-tiny-q5_1.bin'));
    if (!asset.localUri) {
        await asset.downloadAsync();
    }
    const uri: string = asset.localUri || asset.uri;
    if (!uri) throw new Error('Bundled Windy Nano model asset could not be resolved');
    return uri;
}

class WhisperManager {
    private ctx: WhisperContext | null = null;
    private currentModel: string | null = null;
    private loading = false;

    /**
     * Load a GGML model. The bundled Windy Nano loads straight from the
     * app package; every other engine loads from the engines directory
     * (download-on-unlock). No-ops if the same model is already loaded.
     */
    async loadModel(modelFileName: string): Promise<void> {
        if (this.currentModel === modelFileName && this.ctx) return;
        if (this.loading) throw new Error('Model is already loading');

        this.loading = true;
        try {
            // Release previous context
            if (this.ctx) {
                await this.ctx.release();
                this.ctx = null;
                this.currentModel = null;
            }

            let source: string | number;
            if (modelFileName === WINDY_NANO_MODEL_FILE) {
                source = await nanoAssetPath();
            } else {
                const dir = FileSystem.documentDirectory + 'windy/engines/';
                const modelPath = dir + modelFileName;

                // Verify model exists
                const info = await FileSystem.getInfoAsync(modelPath);
                if (!info.exists) {
                    throw new Error(`Model not found: ${modelFileName}. Please download it first.`);
                }
                source = modelPath;
            }

            // Dynamically import whisper.rn
            let initWhisper: InitWhisperFn;
            try {
                const whisperModule = require('whisper.rn');
                initWhisper = whisperModule.initWhisper;
            } catch (err) { console.warn('[WhisperManager] Error:', err);
                throw new Error(
                    'whisper.rn is not installed. Run `npm install whisper.rn` and rebuild.'
                );
            }

            this.ctx = await initWhisper({ filePath: source });
            this.currentModel = modelFileName;
        } finally {
            this.loading = false;
        }
    }

    /**
     * Transcribe an audio file.
     * @param audioUri - URI to the WAV file
     * @param language - ISO 639-1 code or 'auto' for auto-detect
     * @param onSegment - Callback fired for each transcribed segment
     * @returns Full transcript text
     */
    async transcribe(
        audioUri: string,
        language: string,
        onSegment?: (segment: TranscriptSegment) => void
    ): Promise<{ text: string; segments: TranscriptSegment[] }> {
        if (!this.ctx) throw new Error('No model loaded. Call loadModel() first.');

        const segments: TranscriptSegment[] = [];
        let segIndex = 0;
        const mapSegment = (seg: WhisperSegment): TranscriptSegment => ({
            id: `seg-${Date.now()}-${segIndex++}`,
            text: seg.text.trim(),
            startTime: seg.t0 / 100,  // centiseconds → seconds
            endTime: seg.t1 / 100,
            confidence: 0.9,  // whisper.rn doesn't expose per-segment confidence
            isPartial: false,
            speakerId: null,
            language: language === 'auto' ? 'en' : language,
        });

        const handle = this.ctx.transcribe(audioUri, {
            language: language === 'auto' ? undefined : language,
            maxLen: 0,
            translate: false,
            onNewSegments: (newSegs: WhisperSegment[]) => {
                for (const seg of newSegs) {
                    const segment = mapSegment(seg);
                    segments.push(segment);
                    onSegment?.(segment);
                }
            },
        });

        // whisper.rn returns { stop, promise }; await the inner promise.
        // Tolerate a plain promise too in case the library changes shape.
        const result: WhisperTranscribeResult = await (
            (handle && typeof (handle as { promise?: Promise<WhisperTranscribeResult> }).promise?.then === 'function')
                ? (handle as { promise: Promise<WhisperTranscribeResult> }).promise
                : (handle as Promise<WhisperTranscribeResult>)
        );

        // The resolved result carries the authoritative segment list; use it
        // when the streaming callback produced nothing (short clips often
        // finish before the first onNewSegments fires).
        if (segments.length === 0 && Array.isArray(result?.segments)) {
            for (const seg of result.segments) {
                const segment = mapSegment(seg);
                segments.push(segment);
                onSegment?.(segment);
            }
        }

        return { text: result?.result ?? '', segments };
    }

    /** Check if a model is currently loaded */
    isLoaded(): boolean {
        return this.ctx !== null;
    }

    /** Get the currently loaded model filename */
    getCurrentModel(): string | null {
        return this.currentModel;
    }

    /** Release the model context and free memory */
    async release(): Promise<void> {
        if (this.ctx) {
            await this.ctx.release();
            this.ctx = null;
            this.currentModel = null;
        }
    }

    /** Map an engine ID to its GGML model filename */
    static getModelFilename(engineId: string): string {
        const MAP: Record<string, string> = {
            'tiny': 'ggml-tiny.bin',
            'base': 'ggml-base.bin',
            'small': 'ggml-small.bin',
            'medium': 'ggml-medium.bin',
            'large-v3': 'ggml-large-v3.bin',
            'large-v3-turbo': 'ggml-large-v3-turbo.bin',
        };
        return MAP[engineId] || `ggml-${engineId}.bin`;
    }
}

export const whisperManager = new WhisperManager();
