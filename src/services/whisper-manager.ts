/**
 * 🧬 RP-2.1 — Whisper Manager
 * Wraps whisper.rn for on-device transcription.
 * Handles model loading, transcription with segment callbacks, and cleanup.
 */
import * as FileSystem from 'expo-file-system';
import type { TranscriptSegment } from '@/types';

// whisper.rn types — dynamically loaded to avoid crash if not installed
interface WhisperContext {
    transcribe(
        uri: string,
        options: {
            language?: string;
            maxLen?: number;
            translate?: boolean;
            onNewSegments?: (segments: WhisperSegment[]) => void;
        }
    ): Promise<{ result: string }>;
    release(): Promise<void>;
}

interface WhisperSegment {
    text: string;
    t0: number;  // centiseconds
    t1: number;  // centiseconds
}

type InitWhisperFn = (options: { filePath: string }) => Promise<WhisperContext>;

class WhisperManager {
    private ctx: WhisperContext | null = null;
    private currentModel: string | null = null;
    private loading = false;

    /**
     * Load a GGML model file from the engines directory.
     * No-ops if the same model is already loaded.
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

            const dir = FileSystem.documentDirectory + 'windy/engines/';
            const modelPath = dir + modelFileName;

            // Verify model exists
            const info = await FileSystem.getInfoAsync(modelPath);
            if (!info.exists) {
                throw new Error(`Model not found: ${modelFileName}. Please download it first.`);
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

            this.ctx = await initWhisper({ filePath: modelPath });
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

        const result = await this.ctx.transcribe(audioUri, {
            language: language === 'auto' ? undefined : language,
            maxLen: 0,
            translate: false,
            onNewSegments: (newSegs: WhisperSegment[]) => {
                for (const seg of newSegs) {
                    const segment: TranscriptSegment = {
                        id: `seg-${Date.now()}-${segIndex}`,
                        text: seg.text.trim(),
                        startTime: seg.t0 / 100,  // centiseconds → seconds
                        endTime: seg.t1 / 100,
                        confidence: 0.9,  // whisper.rn doesn't expose per-segment confidence
                        isPartial: false,
                        speakerId: null,
                        language: language === 'auto' ? 'en' : language,
                    };
                    segments.push(segment);
                    segIndex++;
                    onSegment?.(segment);
                }
            },
        });

        return { text: result.result, segments };
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
