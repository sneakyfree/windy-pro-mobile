/**
 * 🧬 RP-7.2 — iOS Keyboard Extension (React Native Bridge)
 * This is the JavaScript side of the native Swift keyboard extension.
 *
 * The Swift native side will live at:
 *   ios/WindyKeyboard/
 *     - KeyboardViewController.swift
 *     - Info.plist
 *     - WindyKeyboard.entitlements (App Group)
 *
 * Communication between main app and keyboard extension is via:
 *   - App Group shared UserDefaults (settings sync)
 *   - App Group shared container (audio files, engine models)
 *
 * This JS wrapper provides the main app's side of that communication.
 */
import { NativeModules, Platform, Linking, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { WindyKeyboard } = NativeModules;

const isAvailable = Platform.OS === 'ios' && WindyKeyboard != null;

const APP_GROUP_ID = 'group.uk.thewindstorm.windypro';

class KeyboardService {
    /**
     * Check if keyboard extension is enabled in iOS Settings
     */
    async isEnabled(): Promise<boolean> {
        if (!isAvailable) return false;
        try {
            return await WindyKeyboard.isKeyboardEnabled();
        } catch {
            return false;
        }
    }

    /**
     * Open iOS Settings to keyboard manager
     */
    openKeyboardSettings(): void {
        if (Platform.OS !== 'ios') {
            Alert.alert('Not Available', 'Keyboard extension is only available on iOS');
            return;
        }

        // Deep link to keyboard settings
        Linking.openURL('app-settings:');
    }

    /**
     * Sync settings to App Group shared UserDefaults
     * Called whenever settings change in main app
     */
    async syncSettingsToKeyboard(settings: {
        selectedEngine: string | null;
        defaultLanguage: string;
        hapticFeedback: boolean;
    }): Promise<void> {
        if (!isAvailable) return;
        try {
            await WindyKeyboard.syncSettings(settings);
        } catch (err) {
            console.warn('[Keyboard] Settings sync failed:', err);
        }
    }

    /**
     * Get transcript from keyboard extension
     * (Keyboard records, main app gets the data)
     */
    async getPendingTranscripts(): Promise<{
        id: string;
        text: string;
        timestamp: number;
    }[]> {
        if (!isAvailable) return [];
        try {
            return await WindyKeyboard.getPendingTranscripts();
        } catch {
            return [];
        }
    }

    /**
     * Clear pending transcripts after importing to main app
     */
    async clearPendingTranscripts(): Promise<void> {
        if (!isAvailable) return;
        await WindyKeyboard.clearPendingTranscripts();
    }

    /**
     * Check if Live Activity (Dynamic Island) is supported
     */
    async isLiveActivitySupported(): Promise<boolean> {
        if (!isAvailable) return false;
        try {
            return await WindyKeyboard.isLiveActivitySupported();
        } catch {
            return false;
        }
    }

    /**
     * Start a Live Activity for recording status
     */
    async startLiveActivity(sessionId: string): Promise<void> {
        if (!isAvailable) return;
        await WindyKeyboard.startLiveActivity({ sessionId });
    }

    /**
     * Update Live Activity with duration and status
     */
    async updateLiveActivity(
        duration: number,
        status: 'recording' | 'processing'
    ): Promise<void> {
        if (!isAvailable) return;
        await WindyKeyboard.updateLiveActivity({ duration, status });
    }

    /**
     * End Live Activity
     */
    async endLiveActivity(): Promise<void> {
        if (!isAvailable) return;
        await WindyKeyboard.endLiveActivity();
    }

    isSupported(): boolean {
        return Platform.OS === 'ios';
    }
}

export const keyboardService = new KeyboardService();
