/**
 * Unit tests for the panel slider math (pure, no React Native).
 */
import {
    SLIDER_MIN, SLIDER_MAX, clampSliderValue, positionToValue, valueToFraction,
} from '../panel/panelSlider.rules';

describe('clampSliderValue', () => {
    it('rounds to the nearest integer', () => {
        expect(clampSliderValue(4.4)).toBe(4);
        expect(clampSliderValue(4.6)).toBe(5);
    });
    it('clamps below 0 and above 10', () => {
        expect(clampSliderValue(-3)).toBe(SLIDER_MIN);
        expect(clampSliderValue(42)).toBe(SLIDER_MAX);
    });
    it('handles NaN safely', () => {
        expect(clampSliderValue(NaN)).toBe(SLIDER_MIN);
    });
});

describe('positionToValue', () => {
    it('maps track edges to 0 and 10', () => {
        expect(positionToValue(0, 300)).toBe(0);
        expect(positionToValue(300, 300)).toBe(10);
    });
    it('maps the middle to 5', () => {
        expect(positionToValue(150, 300)).toBe(5);
    });
    it('clamps touches past the track edges', () => {
        expect(positionToValue(-50, 300)).toBe(0);
        expect(positionToValue(999, 300)).toBe(10);
    });
    it('returns 0 for a zero-width track (pre-layout)', () => {
        expect(positionToValue(100, 0)).toBe(0);
    });
});

describe('valueToFraction', () => {
    it('maps 0..10 to 0..1', () => {
        expect(valueToFraction(0)).toBe(0);
        expect(valueToFraction(5)).toBe(0.5);
        expect(valueToFraction(10)).toBe(1);
    });
});
