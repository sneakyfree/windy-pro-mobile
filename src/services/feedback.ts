/**
 * 🧬 RP-1.4 — Feedback Service
 * Haptic + audio feedback, respects user settings
 */
import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { createLogger } from './logger';

const log = createLogger('Feedback');

class FeedbackService {
    /**
     * Record started — medium haptic
     */
    async recordStart(): Promise<void> {
        const { hapticFeedback } = useSettingsStore.getState();
        if (hapticFeedback) {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
    }

    /**
     * Record stopped — heavy haptic
     */
    async recordStop(): Promise<void> {
        const { hapticFeedback } = useSettingsStore.getState();
        if (hapticFeedback) {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }
    }

    /**
     * Generic success (copy, save, milestone)
     */
    async success(): Promise<void> {
        const { hapticFeedback } = useSettingsStore.getState();
        if (hapticFeedback) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
    }

    /**
     * Error occurred
     */
    async error(): Promise<void> {
        const { hapticFeedback } = useSettingsStore.getState();
        if (hapticFeedback) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    }

    /**
     * Light tap for toggles and button presses
     */
    async tap(): Promise<void> {
        const { hapticFeedback } = useSettingsStore.getState();
        if (hapticFeedback) {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
    }
}

export const feedbackService = new FeedbackService();
