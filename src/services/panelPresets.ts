/**
 * Personality presets for the Fly control panel — windy.panel.v1 §2.5.
 *
 * These are the gateway backend's 8 real presets (windy-agent
 * `control_panel.py` PRESETS), restricted to the 8 sliders the Type-B
 * cloud agent supports. Client-side data only — presets are applied as
 * sequential PUT /sliders/:name calls, there is no preset endpoint.
 * Value maps copied verbatim from control_panel.py; do not tune here.
 */

/** The Type-B v1 slider subset (contract §2.4). Used for preset data
 *  validation only — the UI renders whatever /sliders/info returns. */
export const SUPPORTED_SLIDERS = [
    'personality', 'humor', 'warmth', 'formality', 'verbosity',
    'proactivity', 'creativity', 'response_length',
] as const;

export interface PanelPreset {
    /** Backend preset name — sent as `updated_by: "preset:<name>"`. */
    name: string;
    /** Grandma-facing chip label. */
    label: string;
    emoji: string;
    values: Record<string, number>;
}

export const PANEL_PRESETS: PanelPreset[] = [
    {
        name: 'buddy', label: 'Buddy', emoji: '🤝',
        values: { personality: 8, humor: 7, warmth: 7, formality: 4, verbosity: 6, proactivity: 7, creativity: 6, response_length: 5 },
    },
    {
        name: 'friend', label: 'Friend', emoji: '💛',
        values: { personality: 10, humor: 3, warmth: 10, formality: 2, verbosity: 7, proactivity: 8, creativity: 5, response_length: 6 },
    },
    {
        name: 'powerhouse', label: 'Powerhouse', emoji: '⚡',
        values: { personality: 9, humor: 7, warmth: 7, formality: 5, verbosity: 7, proactivity: 8, creativity: 7, response_length: 9 },
    },
    {
        name: 'writer', label: 'Writer', emoji: '✍️',
        values: { personality: 7, humor: 5, warmth: 6, formality: 5, verbosity: 9, proactivity: 6, creativity: 10, response_length: 9 },
    },
    {
        name: 'engineer', label: 'Engineer', emoji: '🛠️',
        values: { personality: 3, humor: 1, warmth: 3, formality: 5, verbosity: 4, proactivity: 3, creativity: 3, response_length: 7 },
    },
    {
        name: 'coder', label: 'Coder', emoji: '💻',
        values: { personality: 1, humor: 0, warmth: 1, formality: 2, verbosity: 3, proactivity: 3, creativity: 4, response_length: 10 },
    },
    {
        name: 'researcher', label: 'Researcher', emoji: '🔬',
        values: { personality: 2, humor: 0, warmth: 2, formality: 7, verbosity: 7, proactivity: 5, creativity: 3, response_length: 8 },
    },
    {
        name: 'silent', label: 'Silent', emoji: '🤫',
        values: { personality: 1, humor: 0, warmth: 3, formality: 5, verbosity: 1, proactivity: 1, creativity: 3, response_length: 2 },
    },
];

export function getPreset(name: string): PanelPreset | undefined {
    return PANEL_PRESETS.find(p => p.name === name);
}

/**
 * Which preset (if any) exactly matches the current slider values?
 * Only the keys a preset defines are compared, so a server that serves a
 * sub- or superset of sliders still matches. Returns 'custom' when none do.
 */
export function matchPreset(sliders: Record<string, number>): string {
    for (const preset of PANEL_PRESETS) {
        const entries = Object.entries(preset.values);
        if (entries.every(([key, value]) => sliders[key] === value)) return preset.name;
    }
    return 'custom';
}
