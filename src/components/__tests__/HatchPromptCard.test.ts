/**
 * shouldShowHatchPrompt — rule that decides whether the Home-tab
 * Hatch ribbon is rendered. The component itself is RN-heavy and
 * tested via visual/manual checks; the rule is the risky bit.
 */
import { shouldShowHatchPrompt } from '../HatchPromptCard.rules';

describe('shouldShowHatchPrompt', () => {
    it('hides when the user is not signed in', () => {
        expect(shouldShowHatchPrompt({ isAuthenticated: false, flyStatus: 'not_provisioned' })).toBe(false);
        expect(shouldShowHatchPrompt({ isAuthenticated: false })).toBe(false);
    });

    it('shows when signed in and fly product is not_provisioned', () => {
        expect(shouldShowHatchPrompt({ isAuthenticated: true, flyStatus: 'not_provisioned' })).toBe(true);
    });

    it('shows when signed in and ecosystem snapshot is missing', () => {
        expect(shouldShowHatchPrompt({ isAuthenticated: true })).toBe(true);
    });

    it('shows when signed in and status is `available` (upgrade path)', () => {
        expect(shouldShowHatchPrompt({ isAuthenticated: true, flyStatus: 'available' })).toBe(true);
    });

    it('hides once the agent is active', () => {
        expect(shouldShowHatchPrompt({ isAuthenticated: true, flyStatus: 'active' })).toBe(false);
    });

    it('hides when the agent is pending (hatch already in progress)', () => {
        expect(shouldShowHatchPrompt({ isAuthenticated: true, flyStatus: 'pending' })).toBe(false);
    });
});
