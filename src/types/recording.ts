/**
 * 🧬 M1.4 — Recording-related type definitions
 *
 * Core types for the audio/video recording pipeline,
 * quality assessment, and transcript segments.
 */

/**
 * Current state of the recording engine.
 * - `idle`: No active recording, ready to start
 * - `recording`: Actively capturing audio/video
 * - `processing`: Recording stopped, transcription in progress
 * - `error`: An error occurred during recording or processing
 */
export type RecordingState = 'idle' | 'recording' | 'processing' | 'error';

/**
 * Configuration for audio recording sessions.
 * All recordings use uncompressed WAV for maximum quality,
 * with metering enabled for real-time waveform display.
 */
export interface RecordingConfig {
    /** Sample rate in Hz — 44100 for device maximum quality */
    sampleRate: number;
    /** Always mono (1 channel) for voice capture */
    channels: 1;
    /** Always WAV (uncompressed) during capture — compressed on export only */
    encoding: 'wav';
    /** Enable real-time level metering for waveform UI (0.0–1.0) */
    meteringEnabled: boolean;
    /** Maximum recording duration in seconds (tier-dependent: 300 free, 3600 pro) */
    maxDuration: number;
}

/**
 * A single segment of transcribed text within a session.
 * Segments arrive in real-time from the transcription engine
 * and can be partial (still being processed) or final.
 */
export interface TranscriptSegment {
    /** Unique segment identifier (UUID) */
    id: string;
    /** Transcribed text content */
    text: string;
    /** Start time in seconds from session start */
    startTime: number;
    /** End time in seconds from session start */
    endTime: number;
    /** Confidence score from the transcription engine (0.0–1.0) */
    confidence: number;
    /** `true` if this segment is still being refined by the engine */
    isPartial: boolean;
    /** Speaker identifier for diarization — `null` if not available (Pro feature) */
    speakerId: string | null;
    /** ISO 639-1 code of the detected language (e.g. `"en"`, `"es"`) */
    language: string;
}

/**
 * Audio quality assessment result.
 * Produced by `scoreAudioQuality()` after each recording,
 * used by the clone tracker to weight session contributions.
 */
export interface AudioQuality {
    /** Overall quality score (0–100) */
    score: number;
    /** Human-readable quality classification */
    label: QualityLabel;
    /** Estimated signal-to-noise ratio in dB */
    snrDb: number;
    /** Estimated ratio of speech vs silence (0.0–1.0) */
    speechRatio: number;
    /** `true` if audio clipping (distortion) was detected (peak > 0.98) */
    hasClipping: boolean;
    /** Actual sample rate used during capture (Hz) */
    sampleRate: number;
}

/**
 * Quality classification labels.
 * Maps to quality weights in the clone tracker:
 * - `excellent` (≥80): 1.0× weight
 * - `good` (60–79): 0.8× weight
 * - `fair` (40–59): 0.5× weight
 * - `poor` (<40): 0.0× weight (does not count toward clone)
 */
export type QualityLabel = 'excellent' | 'good' | 'fair' | 'poor';

/**
 * Flags indicating which media types are being captured
 * in the current recording session.
 */
export interface MediaCapture {
    /** Audio recording active (default: `true`) */
    audio: boolean;
    /** Video recording active (default: `false`, Pro feature) */
    video: boolean;
    /** Text transcript generation (always `true`) */
    text: boolean;
}

/**
 * Result returned after stopping a recording.
 * Contains the file path and metadata needed to
 * save the session to local storage.
 */
export interface RecordingResult {
    /** UUID for the session */
    sessionId: string;
    /** Local file URI (e.g. `file:///path/to/recording.wav`) */
    uri: string;
    /** Recording duration in seconds */
    duration: number;
    /** File size in bytes */
    fileSize: number;
}
