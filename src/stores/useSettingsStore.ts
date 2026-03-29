/**
 * 🧬 M1 — Settings store (Zustand + AsyncStorage persistence)
 * All user preferences, persisted across app restarts
 *
 * RP-1.2: Zustand persist middleware wired to AsyncStorage
 *
 * SEC-AUDIT: Sensitive fields (licenseKey, windyIdentityId) are stored
 * in expo-secure-store, NOT in Zustand's AsyncStorage persistence.
 * Only the non-secret licenseTier enum is persisted here.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { EngineId, LicenseTier } from '@/types';

// ─── SecureStore Keys ────────────────────────────────────────
const LICENSE_KEY_SECURE = 'windy_license_key';
const IDENTITY_ID_SECURE = 'windy_identity_id';

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

    // License — tier is non-secret (persisted in AsyncStorage)
    // licenseKey is secret (persisted in SecureStore via helpers below)
    licenseTier: LicenseTier;
    setLicenseTier: (tier: LicenseTier) => void;

    // Identity (cross-product correlation) — in-memory only, loaded from SecureStore
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
            setLicenseTier: (tier) => set({ licenseTier: tier }),

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
            // SEC-AUDIT: Exclude sensitive fields from AsyncStorage persistence
            partialize: (state) => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { windyIdentityId, ...rest } = state;
                return rest;
            },
        }
    )
);

// ─── SecureStore License Key Helpers ────────────────────────────
// These are standalone async functions (not in Zustand) because
// SecureStore is async and Zustand setters should be synchronous.

/**
 * Set both license tier (in Zustand) and key (in SecureStore).
 * Call this instead of the old setLicense(tier, key).
 */
export async function setLicense(tier: LicenseTier, key: string | null): Promise<void> {
    useSettingsStore.getState().setLicenseTier(tier);
    if (key) {
        await SecureStore.setItemAsync(LICENSE_KEY_SECURE, key).catch(() => {});
    } else {
        await SecureStore.deleteItemAsync(LICENSE_KEY_SECURE).catch(() => {});
    }
}

/**
 * Read the license key from SecureStore.
 * Returns null if no key is stored.
 */
export async function getLicenseKey(): Promise<string | null> {
    try {
        return await SecureStore.getItemAsync(LICENSE_KEY_SECURE);
    } catch {
        return null;
    }
}

/**
 * Set the windy identity ID in both Zustand (in-memory) and SecureStore.
 */
export async function setWindyIdentityIdSecure(id: string | null): Promise<void> {
    useSettingsStore.getState().setWindyIdentityId(id);
    if (id) {
        await SecureStore.setItemAsync(IDENTITY_ID_SECURE, id).catch(() => {});
    } else {
        await SecureStore.deleteItemAsync(IDENTITY_ID_SECURE).catch(() => {});
    }
}

/**
 * Load identity ID from SecureStore into Zustand on app startup.
 */
export async function loadIdentityFromSecureStore(): Promise<void> {
    try {
        const id = await SecureStore.getItemAsync(IDENTITY_ID_SECURE);
        if (id) {
            useSettingsStore.getState().setWindyIdentityId(id);
        }
    } catch {
        // Ignore — identity will be null
    }
}
