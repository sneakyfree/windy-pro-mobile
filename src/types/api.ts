/**
 * 🧬 M1.4 — API communication type definitions
 */

/** Messages sent over WebSocket to Cloud API */
export interface CloudTranscribeAuthMessage {
    type: 'auth';
    token: string;
}

export interface CloudTranscribeConfigMessage {
    type: 'config';
    language: string;
    engine: string;
}

export interface CloudTranscribeStopMessage {
    type: 'stop';
}

export type CloudTranscribeMessage =
    | CloudTranscribeAuthMessage
    | CloudTranscribeConfigMessage
    | CloudTranscribeStopMessage;
// Audio messages are sent as binary WebSocket frames

/** Responses received from Cloud API */
export interface CloudTranscriptResponse {
    type: 'transcript';
    text: string;
    partial: boolean;
    confidence: number;
    startTime: number;
    endTime: number;
    language: string;
}

export interface CloudStateResponse {
    type: 'state';
    state: 'listening' | 'processing';
    previous: string;
}

export interface CloudErrorResponse {
    type: 'error';
    message: string;
    code: string;
}

export interface CloudAckResponse {
    type: 'ack';
    action: string;
    success: boolean;
}

export type CloudTranscribeResponse =
    | CloudTranscriptResponse
    | CloudStateResponse
    | CloudErrorResponse
    | CloudAckResponse;

/** License validation result */
export interface LicenseValidation {
    key: string;
    tier: LicenseTier;
    validUntil: string | null;  // null = lifetime
    devicesUsed: number;
    devicesMax: number;          // 5
    features: string[];          // unlocked feature list
}

export type LicenseTier = 'free' | 'pro' | 'translate' | 'translate_pro';

/** Cloud sync status */
export interface SyncStatus {
    totalSessions: number;
    syncedSessions: number;
    pendingUploadBytes: number;
    lastSyncAt: string | null;
    storageUsed: number;         // bytes on cloud
    storageQuota: number;        // bytes allowed
}

/** Cloud sync destination configuration */
export interface SyncDestination {
    type: 'windy-cloud' | 'custom-s3' | 'none';
    endpoint: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    region: string;
}

/** Conditions that must be met before syncing */
export interface SyncConditions {
    wifiOnly: boolean;
    pluggedInOnly: boolean;
    syncAudio: boolean;
    syncVideo: boolean;
    syncText: boolean;
}
