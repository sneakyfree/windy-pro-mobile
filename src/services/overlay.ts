/**
 * 🧬 RP-7.1 — Android Floating Overlay Service (React Native Bridge)
 * This is the JavaScript side of the native Kotlin module.
 *
 * The Kotlin native side lives at:
 *   android/app/src/main/java/uk/thewindstorm/windypro/
 *     - FloatingOverlayService.kt
 *     - OverlayPermissionHelper.kt
 *     - PasteAccessibilityService.kt
 *     - WindyOverlayModule.kt
 *     - WindyOverlayPackage.kt
 *
 * This JS wrapper provides a clean API for the React layer.
 */
import { NativeModules, Platform, Linking, Alert } from 'react-native';
import { createLogger } from './logger';

const log = createLogger('Overlay');

const { WindyOverlay } = NativeModules;

/**
 * Check if the native module is available
 * (Only exists on Android after building custom dev client)
 */
const isAvailable = Platform.OS === 'android' && WindyOverlay != null;

class OverlayService {
    /**
     * Check if overlay permission is granted
     */
    async hasPermission(): Promise<boolean> {
        if (!isAvailable) return false;
        try {
            return await WindyOverlay.hasOverlayPermission();
        } catch (err) { console.warn('[Overlay] Error:', err);
            return false;
        }
    }

    /**
     * Request SYSTEM_ALERT_WINDOW permission
     */
    async requestPermission(): Promise<boolean> {
        if (!isAvailable) {
            Alert.alert(
                'Not Available',
                'Floating button is only available on Android'
            );
            return false;
        }

        try {
            const granted = await WindyOverlay.requestOverlayPermission();
            if (!granted) {
                Alert.alert(
                    'Permission Required',
                    'To use the floating Windy button, please grant "Display over other apps" permission in Settings.',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        {
                            text: 'Open Settings',
                            onPress: () => {
                                Linking.openSettings();
                            },
                        },
                    ]
                );
            }
            return granted;
        } catch (err) { console.warn('[Overlay] Error:', err);
            return false;
        }
    }

    /**
     * Show the floating tornado button
     */
    async start(): Promise<void> {
        if (!isAvailable) return;
        const hasPerm = await this.hasPermission();
        if (!hasPerm) {
            const granted = await this.requestPermission();
            if (!granted) return;
        }
        await WindyOverlay.startOverlay();
    }

    /**
     * Hide the floating tornado button
     */
    async stop(): Promise<void> {
        if (!isAvailable) return;
        await WindyOverlay.stopOverlay();
    }

    /**
     * Check if overlay is currently showing
     */
    async isActive(): Promise<boolean> {
        if (!isAvailable) return false;
        try {
            return await WindyOverlay.isOverlayActive();
        } catch (err) { console.warn('[Overlay] Error:', err);
            return false;
        }
    }

    /**
     * Paste text at current cursor position via AccessibilityService
     */
    async pasteText(text: string): Promise<void> {
        if (!isAvailable) return;
        await WindyOverlay.pasteText(text);
    }

    /**
     * Update overlay state (recording/processing/idle)
     */
    async setState(state: 'idle' | 'recording' | 'processing' | 'error'): Promise<void> {
        if (!isAvailable) return;
        await WindyOverlay.setOverlayState(state);
    }

    /**
     * Check if this platform supports overlay
     */
    isSupported(): boolean {
        return Platform.OS === 'android';
    }
}

export const overlayService = new OverlayService();
