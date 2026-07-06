/**
 * Tests for tier-access.ts — the M4 gating skeleton.
 * Free = chat + agent + OS dictation + Windy Nano; everything else is an
 * honest locked state keyed off the account tier (JWT claim → license).
 */

jest.mock('../logger', () => ({
    createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const mockIsFeatureUnlocked = jest.fn((_f: string) => false);
const mockIsCloudSttEnabled = jest.fn(() => false);
jest.mock('../license', () => ({
    licenseService: {
        isFeatureUnlocked: (f: string) => mockIsFeatureUnlocked(f),
        isCloudSttEnabled: () => mockIsCloudSttEnabled(),
    },
}));

import { tierAccess, LOCKED_TIER_LABEL } from '../tier-access';

function tierWith(features: string[]) {
    mockIsFeatureUnlocked.mockImplementation((f: string) => features.includes(f));
}

beforeEach(() => {
    jest.clearAllMocks();
    tierWith([]);
});

describe('tierAccess', () => {
    it('Windy Nano is standard for everyone — even on free', () => {
        expect(tierAccess.canUseEngine('tiny')).toBe(true);
    });

    it('bigger local engines and cloud engines are locked on free', () => {
        for (const id of ['base', 'small', 'medium', 'large-v3', 'large-v3-turbo', 'cloud-standard', 'cloud-turbo']) {
            expect(tierAccess.canUseEngine(id)).toBe(false);
        }
    });

    it('pro tier (all-engines) unlocks the bigger engines', () => {
        tierWith(['all-engines']);
        expect(tierAccess.canUseEngine('medium')).toBe(true);
        expect(tierAccess.canUseEngine('tiny')).toBe(true);
    });

    it('Translate is locked on free/pro, open on translate tiers', () => {
        expect(tierAccess.canUseTranslate()).toBe(false);
        tierWith(['all-engines']);
        expect(tierAccess.canUseTranslate()).toBe(false);
        tierWith(['all-engines', 'translate-cloud']);
        expect(tierAccess.canUseTranslate()).toBe(true);
    });

    it('Traveler follows the translate family', () => {
        expect(tierAccess.canUseTraveler()).toBe(false);
        tierWith(['translate-offline']);
        expect(tierAccess.canUseTraveler()).toBe(true);
    });

    it('cloud STT needs BOTH the tier and the server-side subscription check', () => {
        tierWith(['all-engines']);
        mockIsCloudSttEnabled.mockReturnValue(false);
        expect(tierAccess.canUseCloudStt()).toBe(false);
        mockIsCloudSttEnabled.mockReturnValue(true);
        expect(tierAccess.canUseCloudStt()).toBe(true);
    });

    it('the locked label carries no purchase language', () => {
        expect(LOCKED_TIER_LABEL).toBe('Included with higher Windy tiers');
        expect(LOCKED_TIER_LABEL).not.toMatch(/\$|buy|purchase|subscribe|upgrade now/i);
    });
});

describe('free tier matrix alignment (locked plan 2026-07-05)', () => {
    it('free no longer includes base or cloud STT features', () => {
        jest.isolateModules(() => {
            jest.dontMock('../license');
            const { FEATURE_MATRIX } = jest.requireActual('../license');
            expect(FEATURE_MATRIX.free).toContain('transcribe-local-tiny');
            expect(FEATURE_MATRIX.free).not.toContain('transcribe-local-base');
            expect(FEATURE_MATRIX.free).not.toContain('transcribe-cloud-standard');
        });
    });
});
