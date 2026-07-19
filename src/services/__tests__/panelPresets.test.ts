/**
 * Data-integrity tests for the panel presets (windy.panel.v1 §2.5).
 * The values are copied from windy-agent control_panel.py PRESETS,
 * restricted to the 8 supported Type-B sliders — these tests keep that
 * copy honest (right keys, right range) and pin matchPreset behavior.
 */
import {
    PANEL_PRESETS, SUPPORTED_SLIDERS, getPreset, matchPreset,
} from '../panelPresets';

const BACKEND_PRESET_NAMES = [
    'buddy', 'engineer', 'powerhouse', 'coder', 'friend', 'writer', 'researcher', 'silent',
];

describe('PANEL_PRESETS data', () => {
    it('ships exactly the backend\'s 8 presets', () => {
        expect(PANEL_PRESETS.map(p => p.name).sort()).toEqual([...BACKEND_PRESET_NAMES].sort());
    });

    it.each(PANEL_PRESETS.map(p => [p.name, p] as const))(
        '%s only uses supported sliders with integer values 0–10',
        (_name, preset) => {
            const supported = new Set<string>(SUPPORTED_SLIDERS);
            expect(Object.keys(preset.values).sort()).toEqual([...supported].sort());
            for (const value of Object.values(preset.values)) {
                expect(Number.isInteger(value)).toBe(true);
                expect(value).toBeGreaterThanOrEqual(0);
                expect(value).toBeLessThanOrEqual(10);
            }
            expect(preset.label.length).toBeGreaterThan(0);
        },
    );

    it('getPreset finds by name and returns undefined for unknowns', () => {
        expect(getPreset('buddy')?.label).toBe('Buddy');
        expect(getPreset('nope')).toBeUndefined();
    });
});

describe('matchPreset', () => {
    it('recognizes an exact preset', () => {
        expect(matchPreset({ ...getPreset('coder')!.values })).toBe('coder');
    });

    it('recognizes a preset even when the server serves extra sliders', () => {
        expect(matchPreset({ ...getPreset('silent')!.values, future_slider: 3 })).toBe('silent');
    });

    it('returns custom when any value differs', () => {
        expect(matchPreset({ ...getPreset('coder')!.values, humor: 9 })).toBe('custom');
    });

    it('returns custom for an empty slider map', () => {
        // {} vacuously matches nothing meaningful — but every(([k,v]) => ...) on
        // preset entries fails because values are missing, so this stays custom.
        expect(matchPreset({})).toBe('custom');
    });
});
