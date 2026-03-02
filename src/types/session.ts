/**
 * 🧬 M1.4 — Session data type definitions
 */
import { AudioQuality, MediaCapture, TranscriptSegment } from './recording';

/** Full session record (stored in SQLite + JSON files) */
export interface Session {
    id: string;                 // uuid
    createdAt: string;          // ISO 8601
    duration: number;           // seconds
    transcript: string;         // full concatenated text
    segments: TranscriptSegment[];
    audioFilePath: string | null;
    videoFilePath: string | null;
    quality: AudioQuality;
    engineUsed: string;         // engine ID that processed this
    source: SessionSource;
    languages: string[];        // detected languages
    mediaCapture: MediaCapture;
    fileSize: number;           // total bytes (audio + video)
    synced: boolean;            // uploaded to cloud?
    syncedAt: string | null;    // when uploaded
    cloneUsable: boolean;       // good enough for clone training?
    tags: string[];             // user-applied tags
    location: GeoLocation | null;
    deviceModel: string;        // "iPhone 15 Pro", "Pixel 8"
}

export type SessionSource = 'record' | 'translate' | 'keyboard' | 'overlay' | 'ocr';

export interface GeoLocation {
    lat: number;
    lon: number;
}

/** Lightweight session summary for list views */
export interface SessionSummary {
    id: string;
    createdAt: string;
    duration: number;
    previewText: string;        // first 100 chars of transcript
    quality: AudioQuality;
    synced: boolean;
    source: SessionSource;
    mediaCapture: MediaCapture;
}

/** Filter criteria for session queries */
export interface SessionFilter {
    dateRange: { start: string; end: string } | null;
    source: SessionSource | null;
    minQuality: number | null;
    synced: boolean | null;
    searchQuery: string | null;
}

/** Storage usage breakdown */
export interface StorageUsage {
    audioBytes: number;
    videoBytes: number;
    textBytes: number;
    engineBytes: number;
    totalBytes: number;
    sessionCount: number;
}
