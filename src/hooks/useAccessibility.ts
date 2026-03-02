/**
 * 🧬 Accessibility Hook
 * Helpers for VoiceOver announcements and Dynamic Type support.
 */
import { AccessibilityInfo, PixelRatio, Platform } from 'react-native';
import { useCallback, useEffect, useState } from 'react';

export function useAccessibility() {
    const [screenReaderActive, setScreenReaderActive] = useState(false);
    const [fontScale, setFontScale] = useState(PixelRatio.getFontScale());

    useEffect(() => {
        // Check initial screen reader state
        AccessibilityInfo.isScreenReaderEnabled().then(setScreenReaderActive);

        // Listen for changes
        const sub = AccessibilityInfo.addEventListener(
            'screenReaderChanged',
            setScreenReaderActive
        );

        return () => sub.remove();
    }, []);

    useEffect(() => {
        setFontScale(PixelRatio.getFontScale());
    }, []);

    /**
     * Announce a message for assistive technologies (VoiceOver/TalkBack).
     */
    const announce = useCallback((message: string) => {
        AccessibilityInfo.announceForAccessibility(message);
    }, []);

    /**
     * Scale a font size for Dynamic Type.
     * Returns the scaled size clamped between min and max.
     */
    const scaledFont = useCallback(
        (baseSize: number, maxScale = 1.5): number => {
            return Math.min(baseSize * fontScale, baseSize * maxScale);
        },
        [fontScale]
    );

    /**
     * Whether the user has a large font scale (accessibility text size).
     */
    const isLargeText = fontScale > 1.2;

    return {
        screenReaderActive,
        fontScale,
        isLargeText,
        announce,
        scaledFont,
    };
}
