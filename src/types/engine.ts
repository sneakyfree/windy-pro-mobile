/**
 * 🧬 M1.4 — Engine configuration type definitions
 */

/** All available engine identifiers */
export type EngineId =
    | 'tiny'
    | 'base'
    | 'small'
    | 'medium'
    | 'large-v3'
    | 'large-v3-turbo'
    | 'cloud-standard'
    | 'cloud-turbo';

/** Configuration for a voice engine */
export interface EngineConfig {
    id: EngineId;
    displayName: string;        // "Large v3 Turbo"
    description: string;        // "Best quality for powerful devices"
    sizeBytes: number;          // download size (0 for cloud)
    ramRequired: number;        // MB of RAM needed
    isOnDevice: boolean;        // true = local, false = cloud
    isDownloaded: boolean;      // local models only
    downloadProgress: number;   // 0-100 during download
    languages: string[];        // supported language codes
    quality: number;            // 1-10 quality rating
    speed: number;              // 1-10 speed rating
}

/** Result from WindyTune auto-configuration */
export interface WindyTuneResult {
    recommendedEngine: EngineId;
    reason: string;             // "Best quality for your Apple chip"
    deviceProfile: DeviceProfile;
    allEngines: EngineConfig[]; // sorted by recommendation
}

/** Device hardware profile detected by WindyTune */
export interface DeviceProfile {
    model: string;              // "iPhone 15 Pro"
    platform: 'ios' | 'android';
    osVersion: string;          // "17.2"
    totalRam: number;           // MB
    availableStorage: number;   // MB
    cpuCores: number;
    hasNeuralEngine: boolean;   // iOS Neural Engine (A11+)
    hasNPU: boolean;            // Android NPU
    chipset: string | null;     // "A17 Pro", "Snapdragon 8 Gen 3"
}
