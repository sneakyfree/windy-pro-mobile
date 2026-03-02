/**
 * 🧬 M1.1.3 — Typography Constants
 * Clean, modern sans-serif (Inter font family)
 */
import { TextStyle } from 'react-native';

export const fontFamily = 'Inter';

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
        fontSize: 18,
        fontWeight: '600',
        lineHeight: 24,
    },
    body: {
        fontFamily,
        fontSize: 16,
        fontWeight: '400',
        lineHeight: 24,
    },
    bodySmall: {
        fontFamily,
        fontSize: 14,
        fontWeight: '400',
        lineHeight: 20,
    },
    caption: {
        fontFamily,
        fontSize: 12,
        fontWeight: '400',
        lineHeight: 16,
    },
    mono: {
        fontFamily: 'monospace',
        fontSize: 14,
        fontWeight: '400',
        lineHeight: 20,
    },
    button: {
        fontFamily,
        fontSize: 16,
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
