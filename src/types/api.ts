/**
 * 🧬 M1.4 — API communication type definitions
 *
 * Types for the WebSocket cloud transcription protocol
 * and REST API interactions (license validation, cloud sync).
 */

// ─── WebSocket Transcription Protocol ─────────────────────────

/**
 * Authentication message sent immediately after WebSocket connection.
 * Must be the first message sent on every new connection.
 */
export interface CloudTranscribeAuthMessage {
    type: 'auth';
    /** License key or `"anonymous"` for free tier */
    token: string;
}

/**
 * Configuration message sent after auth.
 * Tells the server which language/engine to use for transcription.
 */
export interface CloudTranscribeConfigMessage {
    type: 'config';
    /** ISO 639-1 language code, or `"auto"` for auto-detection */
    language: string;
    /** Engine ID to use for cloud processing */
    engine: string;
}

/**
 * Stop signal sent after all audio chunks have been transmitted.
 * Server will finalize transcription and close the connection.
 */
export interface CloudTranscribeStopMessage {
    type: 'stop';
}

/**
 * Union of all client→server WebSocket messages.
 * Audio data is sent as binary WebSocket frames (16KB chunks).
 */
export type CloudTranscribeMessage =
    | CloudTranscribeAuthMessage
    | CloudTranscribeConfigMessage
    | CloudTranscribeStopMessage;

// ─── WebSocket Server Responses ───────────────────────────────

/**
 * A transcript segment received from the cloud transcription engine.
 * Segments can be partial (still being refined) or final.
 */
export interface CloudTranscriptResponse {
    type: 'transcript';
    /** Transcribed text for this segment */
    text: string;
    /** `true` if this segment may still change as more audio arrives */
    partial: boolean;
    /** Confidence score (0.0–1.0) */
    confidence: number;
    /** Start time in seconds relative to the audio stream */
    startTime: number;
    /** End time in seconds relative to the audio stream */
    endTime: number;
    /** ISO 639-1 code of the detected language */
    language: string;
}

/** Server state transition notification */
export interface CloudStateResponse {
    type: 'state';
    /** Current server state */
    state: 'listening' | 'processing';
    /** Previous state before transition */
    previous: string;
}

/** Error response from the transcription server */
export interface CloudErrorResponse {
    type: 'error';
    /** Human-readable error message */
    message: string;
    /** Machine-readable error code (e.g. `"AUTH_FAILED"`, `"RATE_LIMITED"`) */
    code: string;
}

/** Acknowledgment of a client message (auth, config, etc.) */
export interface CloudAckResponse {
    type: 'ack';
    /** Which action was acknowledged */
    action: string;
    /** Whether the action succeeded */
    success: boolean;
}

/**
 * Union of all server→client WebSocket messages.
 */
export type CloudTranscribeResponse =
    | CloudTranscriptResponse
    | CloudStateResponse
    | CloudErrorResponse
    | CloudAckResponse;

// ─── License API ──────────────────────────────────────────────

/**
 * Result from license key validation against the Stripe-backed API.
 * Determines which features and recording limits are available.
 */
export interface LicenseValidation {
    /** The license key that was validated */
    key: string;
    /** Tier unlocked by this license */
    tier: LicenseTier;
    /** Billing type: 'subscription' (monthly/annual) or 'lifetime' (one-time) */
    billingType: 'subscription' | 'lifetime' | null;
    /** Whether cloud processing is enabled (subscription only — lifetime gets local engines only) */
    cloudSttEnabled: boolean;
    /** ISO 8601 expiration date, or `null` for lifetime licenses */
    validUntil: string | null;
    /** Number of devices currently using this license */
    devicesUsed: number;
    /** Maximum devices allowed for this license (default: 5) */
    devicesMax: number;
    /** List of unlocked feature identifiers */
    features: string[];
}

/**
 * License tier levels (maps to Stripe products).
 * - `free`: Basic voice-to-text, 5-minute limit
 * - `pro`: Unlimited recording, models, cloud sync ($49)
 * - `translate`: Real-time translation add-on ($29)
 * - `translate_pro`: Pro + Translate bundle ($69)
 */
export type LicenseTier = 'free' | 'pro' | 'translate' | 'translate_pro';

// ─── Cloud Sync API ───────────────────────────────────────────

/**
 * Current sync status summary returned by the sync API.
 * Displayed in the Settings → Cloud Sync section.
 */
export interface SyncStatus {
    /** Total sessions on the device */
    totalSessions: number;
    /** Sessions successfully uploaded to cloud */
    syncedSessions: number;
    /** Bytes pending upload */
    pendingUploadBytes: number;
    /** ISO 8601 timestamp of last successful sync, or `null` if never synced */
    lastSyncAt: string | null;
    /** Bytes used on cloud storage */
    storageUsed: number;
    /** Bytes quota on cloud storage */
    storageQuota: number;
}

/**
 * Cloud sync destination configuration.
 * Supports Windy Cloud (MinIO) or user-provided S3-compatible storage.
 */
export interface SyncDestination {
    /** Sync backend type */
    type: 'windy-cloud' | 'custom-s3' | 'none';
    /** S3-compatible endpoint URL */
    endpoint: string;
    /** Bucket name */
    bucket: string;
    /** Access key for authentication */
    accessKey: string;
    /** Secret key for authentication */
    secretKey: string;
    /** AWS region (e.g. `"us-east-1"`, `"eu-west-1"`) */
    region: string;
}

/**
 * Conditions that must be met before background sync starts.
 * Configured in Settings → Cloud Sync.
 */
export interface SyncConditions {
    /** Only sync on Wi-Fi (not cellular) */
    wifiOnly: boolean;
    /** Only sync while charging */
    pluggedInOnly: boolean;
    /** Include audio files in sync */
    syncAudio: boolean;
    /** Include video files in sync */
    syncVideo: boolean;
    /** Include transcript text in sync */
    syncText: boolean;
}
