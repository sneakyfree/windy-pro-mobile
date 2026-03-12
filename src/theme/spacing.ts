/**
 * 🧬 M1.1.4 — Spacing & Layout Constants
 */
export const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
    screenPadding: 20,
} as const;

export const borderRadius = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    full: 9999,
} as const;

export const hitSlop = {
    top: 12,
    bottom: 12,
    left: 12,
    right: 12,
} as const;

/**
 * Minimum touch target size — satisfies both:
 * - iOS HIG: 44pt × 44pt
 * - Material Design: 48dp × 48dp
 */
export const minTouchTarget = 48;

/**
 * Extended hit slop for small interactive icons (stars, emojis, etc.)
 * Ensures the touchable area meets minimum accessibility requirements
 * even when the visual element is smaller.
 */
export const accessibleHitSlop = {
    top: 16,
    bottom: 16,
    left: 16,
    right: 16,
} as const;
