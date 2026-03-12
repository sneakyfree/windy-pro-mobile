/**
 * 🧬 M1.1.2 — Theme Color Constants
 * Matches windypro.thewindstorm.uk design language
 */
export const colors = {
    // Backgrounds
    background: '#0f172a',        // Deep navy-black (primary bg)
    surface: '#1e293b',           // Card/panel background
    surfaceLight: '#334155',      // Elevated surface (modals, sheets)

    // Accent colors
    accent: '#a3e635',            // Lime green — primary action, brand
    accentSecondary: '#2dd4bf',   // Cyan/teal — secondary actions

    // Text
    textPrimary: '#f8fafc',       // White text
    textSecondary: '#94a3b8',     // Muted/secondary text
    textTertiary: '#7c8db0',      // Muted (meets WCAG AA 5.1:1)

    // Recording states
    stateRecording: '#22c55e',    // Green strobe — actively recording
    stateProcessing: '#eab308',   // Yellow — processing/transcribing
    stateError: '#ef4444',        // Red — error occurred
    stateIdle: '#8b95a5',         // Gray — idle (meets WCAG AA 5.0:1)

    // UI elements
    border: '#475569',            // Subtle borders
    borderLight: '#334155',       // Very subtle borders
    overlay: 'rgba(0, 0, 0, 0.6)', // Modal overlay

    // Quality score colors
    qualityExcellent: '#a3e635',  // Lime green
    qualityGood: '#2dd4bf',       // Teal
    qualityFair: '#eab308',       // Yellow
    qualityPoor: '#ef4444',       // Red

    // Transparent variants
    accentTransparent: 'rgba(163, 230, 53, 0.15)',
    recordingGlow: 'rgba(34, 197, 94, 0.3)',
    processingGlow: 'rgba(234, 179, 8, 0.3)',
} as const;

export type ColorKey = keyof typeof colors;
