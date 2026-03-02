/**
 * 🧬 Haptic Feedback Hook
 * Settings-aware haptic feedback — respects user preference.
 * Uses expo-haptics with named semantic methods.
 */
import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useCallback } from 'react';

export function useHaptic() {
    const enabled = useSettingsStore((s) => s.hapticFeedback);

    const light = useCallback(() => {
        if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }, [enabled]);

    const medium = useCallback(() => {
        if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }, [enabled]);

    const heavy = useCallback(() => {
        if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }, [enabled]);

    const success = useCallback(() => {
        if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, [enabled]);

    const warning = useCallback(() => {
        if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }, [enabled]);

    const error = useCallback(() => {
        if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }, [enabled]);

    const selection = useCallback(() => {
        if (enabled) Haptics.selectionAsync();
    }, [enabled]);

    return { light, medium, heavy, success, warning, error, selection };
}
