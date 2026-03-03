/**
 * 🧬 M3.2 — Transcription Service
 * RP-2.2: Cloud WebSocket with real audio chunk sending
 * Routes audio to on-device (whisper.rn) or cloud (WebSocket)
 */
import * as FileSystem from 'expo-file-system';
import type {
    EngineId,
    TranscriptSegment,
    CloudTranscribeResponse,
} from '@/types';
import { ENGINE_REGISTRY } from './windy-tune';

const CLOUD_WS_URL = 'wss://windypro.thewindstorm.uk/ws/transcribe';

class TranscriptionService {
    private activeEngine: EngineId = 'cloud-standard';
    private isProcessing = false;
    private ws: WebSocket | null = null;

    /** Callback for each new transcript segment */
    public onSegment: ((segment: TranscriptSegment) => void) | null = null;
    /** Callback for errors */
    public onError: ((error: Error) => void) | null = null;

    setEngine(engineId: EngineId): void {
        this.activeEngine = engineId;
    }

    /**
     * Transcribe an audio file
     */
    async transcribeFile(
        uri: string,
        engine?: EngineId
    ): Promise<TranscriptSegment[]> {
        const engineId = engine || this.activeEngine;
        const engineConfig = ENGINE_REGISTRY[engineId];

        if (!engineConfig) {
            throw new Error(`Unknown engine: ${engineId}`);
        }

        this.isProcessing = true;

        try {
            if (engineConfig.isOnDevice) {
                return await this.localTranscribe(uri, engineId);
            } else {
                return await this.cloudTranscribe(uri, engineId);
            }
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Local transcription via whisper.rn
     * Will be fully functional once whisper.rn is installed
     */
    private async localTranscribe(
        uri: string,
        engine: EngineId
    ): Promise<TranscriptSegment[]> {
        // console.log(`[Transcription] Local transcription with ${engine}: ${uri}`);

        try {
            // Use WhisperManager for model loading + transcription
            const { whisperManager } = require('./whisper-manager');
            await whisperManager.loadModel(engine);

            const segments = await whisperManager.transcribe(uri, {
                onSegment: (segment: TranscriptSegment) => {
                    this.onSegment?.(segment);
                },
            });

            await whisperManager.release();
            return segments;
        } catch (err) {
            console.warn('[Transcription] Local failed, falling back to cloud:', err);
            return this.cloudTranscribe(uri, 'cloud-standard');
        }
    }

    /**
     * RP-2.2: Cloud transcription via WebSocket with REAL audio chunks
     */
    private async cloudTranscribe(
        uri: string,
        engine: EngineId
    ): Promise<TranscriptSegment[]> {
        return new Promise<TranscriptSegment[]>(async (resolve, reject) => {
            const segments: TranscriptSegment[] = [];
            let resolved = false;

            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    this.ws?.close();
                    reject(new Error('Cloud transcription timed out (30s)'));
                }
            }, 30000);

            try {
                this.ws = new WebSocket(CLOUD_WS_URL);

                this.ws.onopen = async () => {
                    try {
                        // Send auth
                        this.ws?.send(JSON.stringify({
                            type: 'auth',
                            token: (() => { try { return require('@/stores/useSettingsStore').useSettingsStore.getState().licenseKey || 'anonymous'; } catch { return 'anonymous'; } })(),
                        }));

                        // Send config
                        this.ws?.send(JSON.stringify({
                            type: 'config',
                            language: 'auto',
                            engine: engine,
                        }));

                        // RP-2.2: Read audio file and send as binary chunks
                        const base64 = await FileSystem.readAsStringAsync(uri, {
                            encoding: FileSystem.EncodingType.Base64,
                        });

                        // Decode base64 to binary and send in 16KB chunks
                        const binaryString = atob(base64);
                        const CHUNK_SIZE = 16384; // 16KB

                        for (let i = 0; i < binaryString.length; i += CHUNK_SIZE) {
                            const chunkStr = binaryString.slice(i, i + CHUNK_SIZE);
                            const bytes = new Uint8Array(chunkStr.length);
                            for (let j = 0; j < chunkStr.length; j++) {
                                bytes[j] = chunkStr.charCodeAt(j);
                            }

                            this.ws?.send(bytes.buffer);

                            // Yield to event loop every 10 chunks to prevent blocking
                            if ((i / CHUNK_SIZE) % 10 === 0) {
                                await new Promise((r) => setTimeout(r, 0));
                            }
                        }

                        // Send stop signal
                        this.ws?.send(JSON.stringify({ type: 'stop' }));
                        // console.log('[Transcription] Audio sent, waiting for transcription...');
                    } catch (err) {
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timeout);
                            reject(err);
                        }
                    }
                };

                this.ws.onmessage = (event) => {
                    try {
                        const response: CloudTranscribeResponse = JSON.parse(event.data);

                        if (response.type === 'transcript') {
                            const segment: TranscriptSegment = {
                                id: `seg-${Date.now()}-${segments.length}`,
                                text: response.text,
                                startTime: response.startTime,
                                endTime: response.endTime,
                                confidence: response.confidence,
                                isPartial: response.partial,
                                speakerId: null,
                                language: response.language,
                            };
                            segments.push(segment);
                            this.onSegment?.(segment);
                        } else if (response.type === 'error') {
                            if (!resolved) {
                                resolved = true;
                                clearTimeout(timeout);
                                reject(new Error(response.message));
                            }
                        }
                    } catch (e) {
                        // Parse error — ignore
                    }
                };

                this.ws.onerror = () => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        reject(new Error('WebSocket connection failed'));
                    }
                };

                this.ws.onclose = () => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeout);
                        resolve(segments);
                    }
                    this.ws = null;
                };
            } catch (error) {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    reject(error);
                }
            }
        });
    }

    /** Switch to cloud processing (fallback) */
    async switchToCloud(): Promise<void> {
        this.activeEngine = 'cloud-standard';
        // console.log('[Transcription] Switched to cloud processing');
    }

    /** Switch to a local engine */
    async switchToLocal(engine: EngineId): Promise<void> {
        const config = ENGINE_REGISTRY[engine];
        if (!config?.isOnDevice) {
            throw new Error(`${engine} is not an on-device engine`);
        }
        this.activeEngine = engine;
        // console.log(`[Transcription] Switched to local engine: ${engine}`);
    }

    /** Cancel active transcription */
    cancel(): void {
        this.ws?.close();
        this.ws = null;
        this.isProcessing = false;
    }

    getIsProcessing(): boolean {
        return this.isProcessing;
    }

    getActiveEngine(): EngineId {
        return this.activeEngine;
    }
}

export const transcriptionService = new TranscriptionService();
