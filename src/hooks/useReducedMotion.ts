/**
 * 🧬 Reduced Motion Hook
 * Respects iOS "Reduce Motion" setting.
 * Returns boolean + helper to skip or shorten animations.
 */
import { AccessibilityInfo, Platform } from 'react-native';
import { useCallback, useEffect, useState } from 'react';

export function useReducedMotion() {
    const [reduceMotion, setReduceMotion] = useState(false);

    useEffect(() => {
        AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);

        const sub = AccessibilityInfo.addEventListener(
            'reduceMotionChanged',
            setReduceMotion
        );

        return () => sub.remove();
    }, []);

    /**
     * Returns 0 duration if reduce motion is on, otherwise the given duration.
     */
    const animDuration = useCallback(
        (ms: number): number => (reduceMotion ? 0 : ms),
        [reduceMotion]
    );

    return {
        reduceMotion,
        animDuration,
    };
}
