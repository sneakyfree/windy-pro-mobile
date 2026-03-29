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
    defaultTargetLanguage: string;
    highQualityAudio: boolean;
    locationTagging: boolean;
    audioQualityPreset: 'low' | 'medium' | 'high';
    selectedVoice: string | null; // voice ID (system or cloned)
    setDefaultLanguage: (lang: string) => void;
    setDefaultTargetLanguage: (lang: string) => void;
    setHighQualityAudio: (on: boolean) => void;
    setLocationTagging: (on: boolean) => void;
    setAudioQualityPreset: (preset: 'low' | 'medium' | 'high') => void;
    setSelectedVoice: (voice: string | null) => void;

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

    // Identity (cross-product correlation)
    windyIdentityId: string | null;
    setWindyIdentityId: (id: string | null) => void;

    // Theme
    theme: 'dark' | 'light' | 'system';
    setTheme: (theme: 'dark' | 'light' | 'system') => void;

    // Notifications
    notifyRecordingComplete: boolean;
    notifySyncComplete: boolean;
    notifyCloneMilestone: boolean;
    setNotifyRecordingComplete: (on: boolean) => void;
    setNotifySyncComplete: (on: boolean) => void;
    setNotifyCloneMilestone: (on: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>()(
    persist(
        (set) => ({
            // Defaults
            onboardingComplete: false,
            setOnboardingComplete: (done) => set({ onboardingComplete: done }),

            selectedEngine: null,
            windyTuneAutoSelect: true,
            cloudFallbackEnabled: false,
            setSelectedEngine: (id) => set({ selectedEngine: id }),
            setWindyTuneAutoSelect: (on) => set({ windyTuneAutoSelect: on }),
            setCloudFallbackEnabled: (on) => set({ cloudFallbackEnabled: on }),

            defaultLanguage: 'en',
            defaultTargetLanguage: 'es',
            highQualityAudio: true,
            locationTagging: false,
            audioQualityPreset: 'high',
            selectedVoice: null,
            setDefaultLanguage: (lang) => set({ defaultLanguage: lang }),
            setDefaultTargetLanguage: (lang) => set({ defaultTargetLanguage: lang }),
            setHighQualityAudio: (on) => set({ highQualityAudio: on }),
            setLocationTagging: (on) => set({ locationTagging: on }),
            setAudioQualityPreset: (preset) => set({ audioQualityPreset: preset }),
            setSelectedVoice: (voice) => set({ selectedVoice: voice }),

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

            windyIdentityId: null,
            setWindyIdentityId: (id) => set({ windyIdentityId: id }),

            theme: 'dark',
            setTheme: (theme) => set({ theme }),

            notifyRecordingComplete: true,
            notifySyncComplete: true,
            notifyCloneMilestone: true,
            setNotifyRecordingComplete: (on) => set({ notifyRecordingComplete: on }),
            setNotifySyncComplete: (on) => set({ notifySyncComplete: on }),
            setNotifyCloneMilestone: (on) => set({ notifyCloneMilestone: on }),
        }),
        {
            name: 'windy-settings',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
