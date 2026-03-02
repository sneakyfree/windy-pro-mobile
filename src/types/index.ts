/**
 * 🧬 M1.4 — Type definitions barrel export
 */
export type {
    RecordingState,
    RecordingConfig,
    TranscriptSegment,
    AudioQuality,
    QualityLabel,
    MediaCapture,
    RecordingResult,
} from './recording';

export type {
    Session,
    SessionSource,
    GeoLocation,
    SessionSummary,
    SessionFilter,
    StorageUsage,
} from './session';

export type {
    EngineId,
    EngineConfig,
    WindyTuneResult,
    DeviceProfile,
} from './engine';

export type {
    CloudTranscribeMessage,
    CloudTranscribeAuthMessage,
    CloudTranscribeConfigMessage,
    CloudTranscribeStopMessage,
    CloudTranscribeResponse,
    CloudTranscriptResponse,
    CloudStateResponse,
    CloudErrorResponse,
    CloudAckResponse,
    LicenseValidation,
    LicenseTier,
    SyncStatus,
    SyncDestination,
    SyncConditions,
} from './api';
