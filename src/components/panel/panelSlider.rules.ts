/**
 * Pure math for the panel slider. Extracted so it can be unit-tested
 * without loading React Native through the component import graph
 * (same pattern as HatchPromptCard.rules.ts).
 */

export const SLIDER_MIN = 0;
export const SLIDER_MAX = 10;

/** Clamp + round to the nearest valid integer slider value. */
export function clampSliderValue(value: number): number {
    if (Number.isNaN(value)) return SLIDER_MIN;
    return Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, Math.round(value)));
}

/** Map a touch x-offset within a track of `width` px to a slider value. */
export function positionToValue(x: number, width: number): number {
    if (width <= 0) return SLIDER_MIN;
    return clampSliderValue((x / width) * SLIDER_MAX);
}

/** Fraction (0–1) of the track the thumb sits at for `value`. */
export function valueToFraction(value: number): number {
    return clampSliderValue(value) / SLIDER_MAX;
}
