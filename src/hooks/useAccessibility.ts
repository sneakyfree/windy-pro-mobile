/**
 * 🧬 Accessibility Hook
 * Helpers for VoiceOver/TalkBack announcements, Dynamic Type support,
 * common a11y props, and live region helpers.
 */
import { AccessibilityInfo, AccessibilityRole, PixelRatio, Platform } from 'react-native';
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
     * Default maxScale raised to 2.0 for iOS Dynamic Type compliance.
     */
    const scaledFont = useCallback(
        (baseSize: number, maxScale = 2.0): number => {
            return Math.min(baseSize * fontScale, baseSize * maxScale);
        },
        [fontScale]
    );

    /**
     * Whether the user has a large font scale (accessibility text size).
     */
    const isLargeText = fontScale > 1.2;

    /**
     * Helper to generate common accessibility props for touchable elements.
     * Usage: <Pressable {...a11yProps('Start recording', 'button', 'Double tap to start recording')}>
     */
    const a11yProps = useCallback(
        (label: string, role: AccessibilityRole = 'button', hint?: string) => ({
            accessible: true,
            accessibilityLabel: label,
            accessibilityRole: role,
            ...(hint ? { accessibilityHint: hint } : {}),
        }),
        []
    );

    /**
     * Props for dynamic content areas that should announce changes.
     * VoiceOver/TalkBack will read updates to elements with these props.
     */
    const liveRegion = useCallback(
        (label: string, assertive = false) => ({
            accessible: true,
            accessibilityLabel: label,
            accessibilityRole: 'text' as AccessibilityRole,
            accessibilityLiveRegion: (assertive ? 'assertive' : 'polite') as 'polite' | 'assertive',
        }),
        []
    );

    return {
        screenReaderActive,
        fontScale,
        isLargeText,
        announce,
        scaledFont,
        a11yProps,
        liveRegion,
    };
}
