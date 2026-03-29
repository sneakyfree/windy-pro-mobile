/**
 * 🧬 M1.4 — Session data type definitions
 *
 * Sessions are the core data model: each recording creates a Session
 * stored in SQLite with references to media files on disk.
 */
import { AudioQuality, MediaCapture, TranscriptSegment } from './recording';

/**
 * Full session record stored in SQLite.
 * Contains all data for a single recording: transcript, audio/video
 * file paths, quality metrics, sync status, and clone eligibility.
 */
export interface Session {
    /** Unique session identifier (UUID v4) */
    id: string;
    /** ISO 8601 timestamp of when the recording started */
    createdAt: string;
    /** Total recording duration in seconds */
    duration: number;
    /** Full concatenated transcript text */
    transcript: string;
    /** Individual transcript segments with timestamps and confidence */
    segments: TranscriptSegment[];
    /** Local file path to the WAV audio file, or `null` if no audio */
    audioFilePath: string | null;
    /** Local file path to the video file, or `null` if no video */
    videoFilePath: string | null;
    /** Audio quality assessment (score, SNR, clipping, etc.) */
    quality: AudioQuality;
    /** Engine ID that processed this session (e.g. `"cloud-standard"`, `"medium"`) */
    engineUsed: string;
    /** How the recording was initiated */
    source: SessionSource;
    /** ISO 639-1 codes of detected languages (e.g. `["en", "es"]`) */
    languages: string[];
    /** Which media types were captured in this session */
    mediaCapture: MediaCapture;
    /** Total file size in bytes (audio + video combined) */
    fileSize: number;
    /** Whether this session has been uploaded to cloud storage */
    synced: boolean;
    /** ISO 8601 timestamp of when the session was synced, or `null` */
    syncedAt: string | null;
    /** Whether the recording meets quality thresholds for clone training */
    cloneUsable: boolean;
    /** User-applied tags for organization */
    tags: string[];
    /** GPS coordinates where the recording was made, or `null` if disabled */
    location: GeoLocation | null;
    /** Device model string (e.g. `"iPhone 15 Pro"`, `"Pixel 8"`) */
    deviceModel: string;
}

/**
 * How a recording session was initiated.
 * - `record`: Main recording screen
 * - `translate`: Translation conversation mode
 * - `keyboard`: System keyboard integration
 * - `overlay`: Floating overlay button
 * - `ocr`: Camera OCR text capture
 */
export type SessionSource = 'record' | 'translate' | 'keyboard' | 'overlay' | 'ocr';

/** GPS coordinates for location-tagged recordings */
export interface GeoLocation {
    /** Latitude in decimal degrees */
    lat: number;
    /** Longitude in decimal degrees */
    lon: number;
}

/**
 * Lightweight session summary for list views.
 * Contains only the fields needed for rendering session cards
 * in the History screen (avoids loading full transcript + segments).
 */
export interface SessionSummary {
    /** Session UUID */
    id: string;
    /** ISO 8601 creation timestamp */
    createdAt: string;
    /** Duration in seconds */
    duration: number;
    /** First 100 characters of the transcript for preview */
    previewText: string;
    /** Quality assessment */
    quality: AudioQuality;
    /** Cloud sync status */
    synced: boolean;
    /** How the recording was initiated */
    source: SessionSource;
    /** Which media types were captured */
    mediaCapture: MediaCapture;
}

/**
 * Filter criteria for querying sessions from SQLite.
 * All fields are optional — `null` means "don't filter on this".
 */
export interface SessionFilter {
    /** Date range to filter sessions (inclusive) */
    dateRange: { start: string; end: string } | null;
    /** Filter by recording source type */
    source: SessionSource | null;
    /** Minimum quality score (0–100) */
    minQuality: number | null;
    /** Filter by sync status */
    synced: boolean | null;
    /** Full-text search query against transcript content */
    searchQuery: string | null;
    /** Max number of rows to return (for pagination) */
    limit?: number;
    /** Number of rows to skip (for pagination) */
    offset?: number;
}

/**
 * Storage usage breakdown for the Settings screen.
 * All sizes are in bytes.
 */
export interface StorageUsage {
    /** Total bytes used by audio recordings */
    audioBytes: number;
    /** Total bytes used by video recordings */
    videoBytes: number;
    /** Total bytes used by text/transcript data */
    textBytes: number;
    /** Total bytes used by downloaded on-device models */
    engineBytes: number;
    /** Sum of all storage categories */
    totalBytes: number;
    /** Total number of saved sessions */
    sessionCount: number;
}
