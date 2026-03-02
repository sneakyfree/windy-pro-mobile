/**
 * 🧬 M1.4 — Recording-related type definitions
 */

/** Current state of the recording engine */
export type RecordingState = 'idle' | 'recording' | 'processing' | 'error';

/** Configuration for audio recording */
export interface RecordingConfig {
    sampleRate: number;        // 44100 (device max)
    channels: 1;               // mono always
    encoding: 'wav';           // uncompressed during capture
    meteringEnabled: boolean;  // for waveform UI
    maxDuration: number;       // seconds (300 free, 1800 pro)
}

/** A single segment of transcribed text */
export interface TranscriptSegment {
    id: string;                // uuid
    text: string;              // transcribed text
    startTime: number;         // seconds from session start
    endTime: number;           // seconds from session start
    confidence: number;        // 0.0 - 1.0
    isPartial: boolean;        // true = still being processed
    speakerId: string | null;  // for diarization (Pro feature)
    language: string;          // ISO 639-1 detected language
}

/** Audio quality assessment */
export interface AudioQuality {
    score: number;             // 0-100
    label: QualityLabel;
    snrDb: number;             // signal-to-noise ratio in dB
    speechRatio: number;       // 0.0-1.0 (% of recording that is speech)
    hasClipping: boolean;      // audio distortion detected
    sampleRate: number;        // actual capture sample rate
}

export type QualityLabel = 'excellent' | 'good' | 'fair' | 'poor';

/** Which media types are being captured */
export interface MediaCapture {
    audio: boolean;            // default: true
    video: boolean;            // default: false
    text: boolean;             // default: true (always generate transcript)
}

/** Result from stopping a recording */
export interface RecordingResult {
    sessionId: string;
    uri: string;               // file:///path/to/recording.wav
    duration: number;          // seconds
    fileSize: number;          // bytes
}
