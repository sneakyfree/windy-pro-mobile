/**
 * 🧬 M3.1 — WindyTune: Intelligent Engine Auto-Configuration
 * Detects device hardware capabilities and recommends the
 * optimal voice engine. Like an orchestra conductor choosing
 * the best instrument for each performance.
 */
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import type { DeviceProfile, EngineConfig, EngineId, WindyTuneResult } from '@/types';

/**
 * 🧬 M3.1.1 — Device capability detection
 */
export async function detectDeviceProfile(): Promise<DeviceProfile> {
    const totalRam = Device.totalMemory
        ? Math.round(Device.totalMemory / (1024 * 1024))
        : 4000; // Default 4GB if unavailable

    return {
        model: Device.modelName || 'Unknown',
        platform: Platform.OS as 'ios' | 'android',
        osVersion: Platform.Version?.toString() || 'unknown',
        totalRam,
        availableStorage: 0, // Will be populated by FileSystem check
        cpuCores: 4, // Default; native module needed for exact count
        hasNeuralEngine: Platform.OS === 'ios' && totalRam >= 3000, // A11+ ~= 3GB+
        hasNPU: Platform.OS === 'android' && totalRam >= 8000, // Snapdragon 8 Gen 1+
        chipset: Device.modelName || null,
    };
}

/**
 * 🧬 M3.1.2 — Engine Registry
 * All available voice engines with their requirements
 */
export const ENGINE_REGISTRY: Record<EngineId, Omit<EngineConfig, 'isDownloaded' | 'downloadProgress'>> = {
    'tiny': {
        id: 'tiny',
        displayName: 'Tiny',
        description: 'Fastest, English only, lowest quality',
        sizeBytes: 75_000_000,
        ramRequired: 1000,
        isOnDevice: true,
        languages: ['en'],
        quality: 3,
        speed: 10,
    },
    'base': {
        id: 'base',
        displayName: 'Base',
        description: 'Good balance for older devices',
        sizeBytes: 140_000_000,
        ramRequired: 1500,
        isOnDevice: true,
        languages: ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'ko', 'ar', 'hi', 'ru'],
        quality: 5,
        speed: 8,
    },
    'small': {
        id: 'small',
        displayName: 'Small',
        description: 'Great quality for mid-range devices',
        sizeBytes: 460_000_000,
        ramRequired: 2500,
        isOnDevice: true,
        languages: ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'ko', 'ar', 'hi', 'ru'],
        quality: 7,
        speed: 6,
    },
    'medium': {
        id: 'medium',
        displayName: 'Medium',
        description: 'High quality for powerful devices',
        sizeBytes: 1_500_000_000,
        ramRequired: 4000,
        isOnDevice: true,
        languages: ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'ko', 'ar', 'hi', 'ru'],
        quality: 8,
        speed: 4,
    },
    'large-v3': {
        id: 'large-v3',
        displayName: 'Large v3',
        description: 'Maximum on-device quality (requires 8GB+ RAM)',
        sizeBytes: 3_000_000_000,
        ramRequired: 8000,
        isOnDevice: true,
        languages: ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'ko', 'ar', 'hi', 'ru'],
        quality: 10,
        speed: 3,
    },
    'large-v3-turbo': {
        id: 'large-v3-turbo',
        displayName: 'Large v3 Turbo',
        description: 'Best quality + speed with GPU/NPU acceleration',
        sizeBytes: 3_000_000_000,
        ramRequired: 6000,
        isOnDevice: true,
        languages: ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'ko', 'ar', 'hi', 'ru'],
        quality: 10,
        speed: 7,
    },
    'cloud-standard': {
        id: 'cloud-standard',
        displayName: 'Cloud',
        description: 'Cloud processing — works on any device',
        sizeBytes: 0,
        ramRequired: 0,
        isOnDevice: false,
        languages: ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'ko', 'ar', 'hi', 'ru',
            'tr', 'vi', 'nl', 'pl', 'sv', 'no', 'da', 'fi', 'th', 'id', 'ms', 'tl',
            'uk', 'cs', 'ro', 'hu', 'el', 'he', 'fa'],
        quality: 9,
        speed: 8,
    },
    'cloud-turbo': {
        id: 'cloud-turbo',
        displayName: 'Cloud Turbo',
        description: 'NVIDIA 5090 — maximum quality, blazing speed',
        sizeBytes: 0,
        ramRequired: 0,
        isOnDevice: false,
        languages: ['en', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'ko', 'ar', 'hi', 'ru',
            'tr', 'vi', 'nl', 'pl', 'sv', 'no', 'da', 'fi', 'th', 'id', 'ms', 'tl',
            'uk', 'cs', 'ro', 'hu', 'el', 'he', 'fa'],
        quality: 10,
        speed: 10,
    },
};

/**
 * 🧬 M3.1 — WindyTune recommendation engine
 * Given a device profile, recommend the best engine
 */
export function getWindyTuneRecommendation(
    profile: DeviceProfile,
    downloadedEngines: Set<EngineId> = new Set()
): WindyTuneResult {
    const ram = profile.totalRam;
    let recommendedEngine: EngineId;
    let reason: string;

    if (profile.hasNeuralEngine && ram >= 6000) {
        recommendedEngine = 'large-v3-turbo';
        reason = 'Your device has Apple Neural Engine — turbo mode for maximum quality + speed';
    } else if (profile.hasNPU && ram >= 6000) {
        recommendedEngine = 'large-v3-turbo';
        reason = 'Your device has an NPU — turbo mode for maximum quality + speed';
    } else if (ram >= 8000) {
        recommendedEngine = 'large-v3';
        reason = 'Your device has plenty of RAM for the highest quality model';
    } else if (ram >= 4000) {
        recommendedEngine = 'medium';
        reason = 'Great balance of quality and speed for your device';
    } else if (ram >= 2500) {
        recommendedEngine = 'small';
        reason = 'Optimized for your device\'s memory';
    } else if (ram >= 1500) {
        recommendedEngine = 'base';
        reason = 'Lightweight model that runs smoothly on your device';
    } else {
        recommendedEngine = 'cloud-standard';
        reason = 'Cloud processing gives you the best experience on this device';
    }

    // If recommended on-device engine isn't downloaded, suggest cloud fallback
    const engineInfo = ENGINE_REGISTRY[recommendedEngine];
    if (engineInfo.isOnDevice && !downloadedEngines.has(recommendedEngine)) {
        reason += ' (download required — using cloud in the meantime)';
    }

    // Build sorted engine list
    const allEngines: EngineConfig[] = (Object.values(ENGINE_REGISTRY) as (Omit<EngineConfig, 'isDownloaded' | 'downloadProgress'>)[])
        .filter((e) => !e.isOnDevice || e.ramRequired <= ram)
        .map((e) => ({
            ...e,
            isDownloaded: downloadedEngines.has(e.id),
            downloadProgress: downloadedEngines.has(e.id) ? 100 : 0,
        }))
        .sort((a, b) => b.quality - a.quality);

    return {
        recommendedEngine,
        reason,
        deviceProfile: profile,
        allEngines,
    };
}
