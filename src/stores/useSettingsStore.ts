/**
 * 🧬 M1 — Settings store (Zustand + AsyncStorage persistence)
 * All user preferences, persisted across app restarts
 *
 * RP-1.2: Zustand persist middleware wired to AsyncStorage
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EngineId, LicenseTier } from '@/types';

interface SettingsStore {
    // Onboarding
    onboardingComplete: boolean;
    setOnboardingComplete: (done: boolean) => void;

    // Engine
    selectedEngine: EngineId | null;
    windyTuneAutoSelect: boolean;
    cloudFallbackEnabled: boolean;
    setSelectedEngine: (id: EngineId | null) => void;
    setWindyTuneAutoSelect: (on: boolean) => void;
    setCloudFallbackEnabled: (on: boolean) => void;

    // Recording
    defaultLanguage: string;
    highQualityAudio: boolean;
    locationTagging: boolean;
    setDefaultLanguage: (lang: string) => void;
    setHighQualityAudio: (on: boolean) => void;
    setLocationTagging: (on: boolean) => void;

    // UI
    hapticFeedback: boolean;
    audioFeedback: boolean;
    setHapticFeedback: (on: boolean) => void;
    setAudioFeedback: (on: boolean) => void;

    // Sync
    syncEnabled: boolean;
    wifiOnlySync: boolean;
    pluggedInOnlySync: boolean;
    setSyncEnabled: (on: boolean) => void;
    setWifiOnlySync: (on: boolean) => void;
    setPluggedInOnlySync: (on: boolean) => void;

    // Clone
    cloneTrackingEnabled: boolean;
    setCloneTrackingEnabled: (on: boolean) => void;

    // License
    licenseTier: LicenseTier;
    licenseKey: string | null;
    setLicense: (tier: LicenseTier, key: string | null) => void;
}

export const useSettingsStore = create<SettingsStore>()(
    persist(
        (set) => ({
            // Defaults
            onboardingComplete: false,
            setOnboardingComplete: (done) => set({ onboardingComplete: done }),

            selectedEngine: null,
            windyTuneAutoSelect: true,
            cloudFallbackEnabled: true,
            setSelectedEngine: (id) => set({ selectedEngine: id }),
            setWindyTuneAutoSelect: (on) => set({ windyTuneAutoSelect: on }),
            setCloudFallbackEnabled: (on) => set({ cloudFallbackEnabled: on }),

            defaultLanguage: 'en',
            highQualityAudio: true,
            locationTagging: false,
            setDefaultLanguage: (lang) => set({ defaultLanguage: lang }),
            setHighQualityAudio: (on) => set({ highQualityAudio: on }),
            setLocationTagging: (on) => set({ locationTagging: on }),

            hapticFeedback: true,
            audioFeedback: true,
            setHapticFeedback: (on) => set({ hapticFeedback: on }),
            setAudioFeedback: (on) => set({ audioFeedback: on }),

            syncEnabled: false,
            wifiOnlySync: true,
            pluggedInOnlySync: true,
            setSyncEnabled: (on) => set({ syncEnabled: on }),
            setWifiOnlySync: (on) => set({ wifiOnlySync: on }),
            setPluggedInOnlySync: (on) => set({ pluggedInOnlySync: on }),

            cloneTrackingEnabled: true,
            setCloneTrackingEnabled: (on) => set({ cloneTrackingEnabled: on }),

            licenseTier: 'free',
            licenseKey: null,
            setLicense: (tier, key) => set({ licenseTier: tier, licenseKey: key }),
        }),
        {
            name: 'windy-settings',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
