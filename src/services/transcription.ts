/**
 * 🧬 M3.2 — Transcription Service
 * RP-2.2: Cloud transcription via HTTP POST (primary) + WebSocket (streaming)
 * Routes audio to on-device (whisper.rn) or cloud
 */
import * as FileSystem from 'expo-file-system';
import type {
    EngineId,
    TranscriptSegment,
    CloudTranscribeResponse,
} from '@/types';
import { ENGINE_REGISTRY } from './windy-tune';
import { API_BASE_URL, ENDPOINTS, apiUrl, wsUrl } from '@/config/api';
import { parseUploadError, isAuthError, isRateLimited } from '@/utils/api-error';

/** Default server URL — configurable via Settings */
let SERVER_URL = API_BASE_URL;

/**
 * Set the transcription server URL (called from Settings)
 */
export function setTranscriptionServerUrl(url: string) {
    SERVER_URL = url.replace(/\/+$/, ''); // strip trailing slash
}

export function getTranscriptionServerUrl(): string {
    return SERVER_URL;
}

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
        try {
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
     * Cloud transcription — tries HTTP POST first (reliable), WebSocket second (streaming)
     */
    private async cloudTranscribe(
        uri: string,
        engine: EngineId
    ): Promise<TranscriptSegment[]> {
        // Primary: HTTP POST (most reliable for one-shot transcription)
        try {
            const segments = await this.httpTranscribe(uri, engine);
            if (segments.length > 0) return segments;
        } catch (httpErr) {
            console.warn('[Transcription] HTTP POST failed:', httpErr);
        }

        // Fallback: WebSocket streaming
        try {
            const segments = await this.wsTranscribe(uri, engine);
            if (segments.length > 0) return segments;
        } catch (wsErr) {
            console.warn('[Transcription] WebSocket failed:', wsErr);
        }

        // Both failed — throw so the caller can handle it
        throw new Error('Cloud transcription failed — check your internet connection and server URL');
    }

    /**
     * HTTP POST transcription — upload audio file, get transcript back
     * Most reliable method for complete file transcription
     */
    private async httpTranscribe(
        uri: string,
        engine: EngineId
    ): Promise<TranscriptSegment[]> {
        const endpoint = apiUrl(ENDPOINTS.TRANSCRIBE, SERVER_URL);

        // Get auth token
        const token = (() => {
            try {
                return require('@/stores/useSettingsStore').useSettingsStore.getState().licenseKey || '';
            } catch { return ''; }
        })();

        const response = await FileSystem.uploadAsync(endpoint, uri, {
            httpMethod: 'POST',
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            fieldName: 'audio',
            headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            parameters: {
                engine,
                language: 'auto',
            },
        });

        if (response.status < 200 || response.status >= 300) {
            const apiErr = parseUploadError(response.status, response.body);
            if (isAuthError(response.status)) {
                throw new Error('Session expired — please log in again');
            }
            if (isRateLimited(response.status)) {
                throw new Error('Too many attempts, please try again later');
            }
            throw new Error(apiErr.message);
        }

        const data = JSON.parse(response.body);

        // Parse response — support multiple response formats
        const rawSegments: any[] = data.segments || data.results || [];
        const fullText: string = data.text || data.transcript || '';

        const segments: TranscriptSegment[] = rawSegments.length > 0
            ? rawSegments.map((seg: any, i: number) => {
                const segment: TranscriptSegment = {
                    id: `seg-http-${Date.now()}-${i}`,
                    text: seg.text || seg.transcript || '',
                    startTime: seg.start ?? seg.startTime ?? 0,
                    endTime: seg.end ?? seg.endTime ?? 0,
                    confidence: seg.confidence ?? 0.9,
                    isPartial: false,
                    speakerId: null,
                    language: seg.language || data.language || 'en',
                };
                this.onSegment?.(segment);
                return segment;
            })
            : fullText ? [{
                id: `seg-http-${Date.now()}-0`,
                text: fullText,
                startTime: 0,
                endTime: 0,
                confidence: data.confidence ?? 0.9,
                isPartial: false,
                speakerId: null,
                language: data.language || 'en',
            }] : [];

        // Emit single-segment if only fullText was returned
        if (segments.length === 1 && rawSegments.length === 0) {
            this.onSegment?.(segments[0]);
        }

        return segments;
    }

    /**
     * WebSocket streaming transcription — sends audio chunks in real-time
     */
    private async wsTranscribe(
        uri: string,
        engine: EngineId
    ): Promise<TranscriptSegment[]> {
        const wsEndpoint = wsUrl(ENDPOINTS.WS_TRANSCRIBE, SERVER_URL);

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
                this.ws = new WebSocket(wsEndpoint);

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
    }

    /** Switch to a local engine */
    async switchToLocal(engine: EngineId): Promise<void> {
        const config = ENGINE_REGISTRY[engine];
        if (!config?.isOnDevice) {
            throw new Error(`${engine} is not an on-device engine`);
        }
        this.activeEngine = engine;
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

