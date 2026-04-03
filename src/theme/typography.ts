/**
 * 🧬 M1.1.3 — Typography Constants
 * Clean, modern sans-serif (Inter font family)
 * fontSizes scale enables future Dynamic Type support.
 */
import { PixelRatio, TextStyle } from 'react-native';

export const fontFamily = 'Inter';

/**
 * Centralised font-size scale.
 * Every fontSize in the app should reference this object
 * so a single change propagates everywhere.
 */
/**
 * Scale a base font size by the user's system Dynamic Type / font scale preference.
 * Use this when you need runtime-responsive text sizing, e.g.:
 *   fontSize: scaledFontSize(fontSizes.base)
 *
 * For reactive scaling that updates on settings change, prefer the
 * useAccessibility() hook's `scaledFont` method instead.
 */
export function scaledFontSize(size: number): number {
    return Math.round(size * PixelRatio.getFontScale());
}

export const fontSizes = {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
    '5xl': 48,
} as const;

export const typography: Record<string, TextStyle> = {
    h1: {
        fontFamily,
        fontSize: 28,
        fontWeight: '700',
        lineHeight: 34,
    },
    h2: {
        fontFamily,
        fontSize: 22,
        fontWeight: '600',
        lineHeight: 28,
    },
    h3: {
        fontFamily,
        fontSize: fontSizes.lg,
        fontWeight: '600',
        lineHeight: 24,
    },
    body: {
        fontFamily,
        fontSize: fontSizes.base,
        fontWeight: '400',
        lineHeight: 24,
    },
    bodySmall: {
        fontFamily,
        fontSize: fontSizes.sm,
        fontWeight: '400',
        lineHeight: 20,
    },
    caption: {
        fontFamily,
        fontSize: fontSizes.xs,
        fontWeight: '400',
        lineHeight: 16,
    },
    mono: {
        fontFamily: 'monospace',
        fontSize: fontSizes.sm,
        fontWeight: '400',
        lineHeight: 20,
    },
    button: {
        fontFamily,
        fontSize: fontSizes.base,
        fontWeight: '600',
        lineHeight: 20,
    },
    tabLabel: {
        fontFamily,
        fontSize: 11,
        fontWeight: '500',
        lineHeight: 14,
    },
};
