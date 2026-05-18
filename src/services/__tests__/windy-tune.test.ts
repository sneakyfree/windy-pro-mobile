/**
 * 🧪 Unit tests for WindyTune engine recommendation
 * Tests device profiling and engine selection logic
 */

// Mock device/platform dependencies
jest.mock('react-native', () => ({
    Platform: { OS: 'ios', Version: '17.2' },
}));
jest.mock('expo-device', () => ({
    totalMemory: 8 * 1024 * 1024 * 1024, // 8GB
    modelName: 'iPhone 15 Pro',
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn().mockResolvedValue(null),
        setItem: jest.fn().mockResolvedValue(undefined),
        removeItem: jest.fn().mockResolvedValue(undefined),
    },
}));
jest.mock('expo-file-system/legacy', () => ({
    documentDirectory: '/mock/documents/',
    makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
    deleteAsync: jest.fn().mockResolvedValue(undefined),
    getInfoAsync: jest.fn().mockResolvedValue({ exists: true, size: 1000 }),
    createDownloadResumable: jest.fn().mockReturnValue({
        downloadAsync: jest.fn().mockResolvedValue({ uri: '/mock/model.bin' }),
    }),
}));

import { getWindyTuneRecommendation, ENGINE_REGISTRY } from '../windy-tune';
import type { DeviceProfile, EngineId } from '@/types';

function makeProfile(overrides: Partial<DeviceProfile> = {}): DeviceProfile {
    return {
        model: 'Test Device',
        platform: 'ios',
        osVersion: '17.2',
        totalRam: 4000,
        availableStorage: 10000,
        cpuCores: 4,
        hasNeuralEngine: false,
        hasNPU: false,
        chipset: null,
        ...overrides,
    };
}

describe('WindyTune Engine Recommendation', () => {
    // ─── Engine Registry ────────────────────────────────────────
    describe('ENGINE_REGISTRY', () => {
        it('should have 8 engines registered', () => {
            expect(Object.keys(ENGINE_REGISTRY)).toHaveLength(8);
        });

        it('should have all expected engine IDs', () => {
            const ids: EngineId[] = ['tiny', 'base', 'small', 'medium', 'large-v3', 'large-v3-turbo', 'cloud-standard', 'cloud-turbo'];
            for (const id of ids) {
                expect(ENGINE_REGISTRY).toHaveProperty(id);
            }
        });

        it('should mark cloud engines as not on-device', () => {
            expect(ENGINE_REGISTRY['cloud-standard'].isOnDevice).toBe(false);
            expect(ENGINE_REGISTRY['cloud-turbo'].isOnDevice).toBe(false);
        });

        it('should mark local engines as on-device', () => {
            expect(ENGINE_REGISTRY['tiny'].isOnDevice).toBe(true);
            expect(ENGINE_REGISTRY['base'].isOnDevice).toBe(true);
            expect(ENGINE_REGISTRY['small'].isOnDevice).toBe(true);
            expect(ENGINE_REGISTRY['medium'].isOnDevice).toBe(true);
            expect(ENGINE_REGISTRY['large-v3'].isOnDevice).toBe(true);
            expect(ENGINE_REGISTRY['large-v3-turbo'].isOnDevice).toBe(true);
        });

        it('should have cloud engines with 0 download size', () => {
            expect(ENGINE_REGISTRY['cloud-standard'].sizeBytes).toBe(0);
            expect(ENGINE_REGISTRY['cloud-turbo'].sizeBytes).toBe(0);
        });

        it('should have quality and speed ratings between 1-10', () => {
            for (const engine of Object.values(ENGINE_REGISTRY)) {
                expect(engine.quality).toBeGreaterThanOrEqual(1);
                expect(engine.quality).toBeLessThanOrEqual(10);
                expect(engine.speed).toBeGreaterThanOrEqual(1);
                expect(engine.speed).toBeLessThanOrEqual(10);
            }
        });
    });

    // ─── Recommendation Logic ──────────────────────────────────
    describe('getWindyTuneRecommendation', () => {
        it('should recommend large-v3-turbo for iOS Neural Engine with 6GB+ RAM', () => {
            const profile = makeProfile({ totalRam: 6000, hasNeuralEngine: true, platform: 'ios' });
            const result = getWindyTuneRecommendation(profile);
            expect(result.recommendedEngine).toBe('large-v3-turbo');
            expect(result.reason).toContain('Neural Engine');
        });

        it('should recommend large-v3-turbo for Android NPU with 6GB+ RAM', () => {
            const profile = makeProfile({ totalRam: 6000, hasNPU: true, platform: 'android' });
            const result = getWindyTuneRecommendation(profile);
            expect(result.recommendedEngine).toBe('large-v3-turbo');
            expect(result.reason).toContain('NPU');
        });

        it('should recommend large-v3 for 8GB+ RAM without Neural Engine/NPU', () => {
            const profile = makeProfile({ totalRam: 8000 });
            const result = getWindyTuneRecommendation(profile);
            expect(result.recommendedEngine).toBe('large-v3');
        });

        it('should recommend medium for 4GB RAM', () => {
            const profile = makeProfile({ totalRam: 4000 });
            const result = getWindyTuneRecommendation(profile);
            expect(result.recommendedEngine).toBe('medium');
        });

        it('should recommend small for 2.5GB RAM', () => {
            const profile = makeProfile({ totalRam: 2500 });
            const result = getWindyTuneRecommendation(profile);
            expect(result.recommendedEngine).toBe('small');
        });

        it('should recommend base for 1.5GB RAM', () => {
            const profile = makeProfile({ totalRam: 1500 });
            const result = getWindyTuneRecommendation(profile);
            expect(result.recommendedEngine).toBe('base');
        });

        it('should fall back to cloud for very low RAM (<1500) when cloud fallback enabled', () => {
            const profile = makeProfile({ totalRam: 1000 });
            const result = getWindyTuneRecommendation(profile, new Set(), true);
            expect(result.recommendedEngine).toBe('cloud-standard');
        });

        it('should use tiny model for very low RAM (<1500) when cloud fallback disabled', () => {
            const profile = makeProfile({ totalRam: 1000 });
            const result = getWindyTuneRecommendation(profile);
            expect(result.recommendedEngine).toBe('tiny');
        });

        it('should note download required when engine not downloaded', () => {
            const profile = makeProfile({ totalRam: 4000 });
            const result = getWindyTuneRecommendation(profile, new Set());
            expect(result.reason).toContain('download required');
        });

        it('should not mention download when engine is downloaded', () => {
            const profile = makeProfile({ totalRam: 4000 });
            const result = getWindyTuneRecommendation(profile, new Set(['medium' as EngineId]));
            expect(result.reason).not.toContain('download required');
        });
    });

    // ─── Result Structure ──────────────────────────────────────
    describe('result structure', () => {
        it('should include device profile in result', () => {
            const profile = makeProfile();
            const result = getWindyTuneRecommendation(profile);
            expect(result.deviceProfile).toEqual(profile);
        });

        it('should include sorted engine list', () => {
            const profile = makeProfile({ totalRam: 4000 });
            const result = getWindyTuneRecommendation(profile);
            expect(result.allEngines.length).toBeGreaterThan(0);
            // Should be sorted by quality descending
            for (let i = 1; i < result.allEngines.length; i++) {
                expect(result.allEngines[i - 1].quality).toBeGreaterThanOrEqual(result.allEngines[i].quality);
            }
        });

        it('should filter out engines requiring more RAM than available', () => {
            const profile = makeProfile({ totalRam: 1500 });
            const result = getWindyTuneRecommendation(profile);
            for (const engine of result.allEngines) {
                if (engine.isOnDevice) {
                    expect(engine.ramRequired).toBeLessThanOrEqual(1500);
                }
            }
        });

        it('should mark downloaded engines correctly', () => {
            const profile = makeProfile({ totalRam: 4000 });
            const downloaded = new Set(['base'] as EngineId[]);
            const result = getWindyTuneRecommendation(profile, downloaded);
            const baseEngine = result.allEngines.find((e) => e.id === 'base');
            expect(baseEngine?.isDownloaded).toBe(true);
            const smallEngine = result.allEngines.find((e) => e.id === 'small');
            expect(smallEngine?.isDownloaded).toBe(false);
        });
    });
});
