/**
 * 🧬 M1.4 — Engine configuration type definitions
 *
 * Types for the WindyTune intelligent engine auto-configuration system.
 * WindyTune detects device hardware capabilities and recommends the
 * optimal voice engine from local (Whisper) or cloud options.
 */

/**
 * All available voice engine identifiers.
 * Local engines use Whisper models of varying sizes.
 * Cloud engines route to the Windy Pro API.
 *
 * | Engine ID         | Type  | Size    | RAM    | Quality |
 * |-------------------|-------|---------|--------|---------|
 * | `tiny`            | Local | 75 MB   | 1 GB   | ★★★☆☆  |
 * | `base`            | Local | 140 MB  | 1.5 GB | ★★★★☆  |
 * | `small`           | Local | 460 MB  | 2.5 GB | ★★★★★  |
 * | `medium`          | Local | 1.5 GB  | 4 GB   | ★★★★★  |
 * | `large-v3`        | Local | 3 GB    | 8 GB   | ★★★★★+ |
 * | `large-v3-turbo`  | Local | 3 GB    | 6 GB   | ★★★★★+ |
 * | `cloud-standard`  | Cloud | 0       | 0      | ★★★★★  |
 * | `cloud-turbo`     | Cloud | 0       | 0      | ★★★★★+ |
 */
export type EngineId =
    | 'tiny'
    | 'base'
    | 'small'
    | 'medium'
    | 'large-v3'
    | 'large-v3-turbo'
    | 'cloud-standard'
    | 'cloud-turbo';

/**
 * Configuration and metadata for a voice engine.
 * Defines hardware requirements, capabilities, and download status.
 */
export interface EngineConfig {
    /** Unique engine identifier */
    id: EngineId;
    /** Human-readable display name (e.g. `"Large v3 Turbo"`) */
    displayName: string;
    /** Short description of the engine's characteristics */
    description: string;
    /** Download size in bytes (0 for cloud engines) */
    sizeBytes: number;
    /** Minimum RAM required in MB (0 for cloud engines) */
    ramRequired: number;
    /** `true` for local Whisper models, `false` for cloud API */
    isOnDevice: boolean;
    /** Whether the model has been downloaded to the device */
    isDownloaded: boolean;
    /** Download progress percentage (0–100) during active download */
    downloadProgress: number;
    /** ISO 639-1 language codes supported by this engine */
    languages: string[];
    /** Quality rating (1–10, higher is better) */
    quality: number;
    /** Speed rating (1–10, higher is faster) */
    speed: number;
}

/**
 * Result from WindyTune auto-configuration.
 * Returned by `getWindyTuneRecommendation()` with the optimal
 * engine choice based on detected device hardware.
 */
export interface WindyTuneResult {
    /** The engine ID WindyTune recommends for this device */
    recommendedEngine: EngineId;
    /** Human-readable explanation of why this engine was chosen */
    reason: string;
    /** Detected device hardware profile */
    deviceProfile: DeviceProfile;
    /** All compatible engines sorted by quality (descending) */
    allEngines: EngineConfig[];
}

/**
 * Device hardware profile detected by WindyTune.
 * Used to determine which on-device models the device
 * can run and whether hardware acceleration is available.
 */
export interface DeviceProfile {
    /** Device model name (e.g. `"iPhone 15 Pro"`, `"Pixel 8 Pro"`) */
    model: string;
    /** Operating system platform */
    platform: 'ios' | 'android';
    /** OS version string (e.g. `"17.2"`, `"14"`) */
    osVersion: string;
    /** Total device RAM in MB */
    totalRam: number;
    /** Available storage space in MB */
    availableStorage: number;
    /** Number of CPU cores */
    cpuCores: number;
    /** `true` if device has Apple Neural Engine (A11 Bionic or newer, ~3GB+ RAM) */
    hasNeuralEngine: boolean;
    /** `true` if device has Android NPU (Snapdragon 8 Gen 1+, ~8GB+ RAM) */
    hasNPU: boolean;
    /** Chipset identifier (e.g. `"A17 Pro"`, `"Snapdragon 8 Gen 3"`) or `null` */
    chipset: string | null;
}
