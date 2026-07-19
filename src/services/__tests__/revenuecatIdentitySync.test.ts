/**
 * 🧪 RevenueCat ↔ Windy identity sync tests.
 *
 * Asserts the RevenueCat app_user_id follows the account-server user id:
 *   - identify(<user id>) after a successful login (auth change event)
 *   - identify(<user id>) on app start when a stored session already exists
 *   - Purchases.logOut (via subscriptionService.logout) on sign-out
 *   - idempotency: token refresh re-emitting the same id does NOT re-identify
 *
 * This is what makes the server-side RevenueCat webhook (windy-pro PR #269)
 * able to match purchases: app_user_id must equal account-server users.id.
 */

const mockInitialize = jest.fn();
const mockIdentify = jest.fn();
const mockRcLogout = jest.fn();

jest.mock('../subscription', () => ({
    subscriptionService: {
        initialize: (...args: unknown[]) => mockInitialize(...args),
        identify: (...args: unknown[]) => mockIdentify(...args),
        logout: (...args: unknown[]) => mockRcLogout(...args),
    },
}));

const mockIsAuthenticated = jest.fn();
const mockGetUserId = jest.fn();
// NOTE: must be `mock`-prefixed — jest hoists the jest.mock factory above
// this declaration and only allows out-of-scope refs named /^mock/i.
let mockChangeListeners: Array<() => void> = [];

jest.mock('../identityApi', () => ({
    identityApi: {
        isAuthenticated: () => mockIsAuthenticated(),
        getUserId: () => mockGetUserId(),
        onChange: (listener: () => void) => {
            mockChangeListeners.push(listener);
            return () => {
                mockChangeListeners = mockChangeListeners.filter((l) => l !== listener);
            };
        },
    },
}));

import {
    startRevenueCatIdentitySync,
    syncRevenueCatIdentity,
    _resetRevenueCatIdentitySyncForTests,
} from '../revenuecatIdentitySync';

/** Flush the initialize().then(identify) promise chain. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/** Simulate identityApi.emitChange() firing to all subscribers. */
const emitAuthChange = () => { [...mockChangeListeners].forEach((l) => l()); };

beforeEach(() => {
    jest.clearAllMocks();
    mockChangeListeners = [];
    _resetRevenueCatIdentitySyncForTests();
    mockInitialize.mockResolvedValue(true);
    mockIdentify.mockResolvedValue(undefined);
    mockRcLogout.mockResolvedValue(undefined);
    mockIsAuthenticated.mockReturnValue(false);
    mockGetUserId.mockReturnValue(null);
});

describe('startRevenueCatIdentitySync', () => {
    it('identifies with the account-server user id on app start when a stored session exists', async () => {
        mockIsAuthenticated.mockReturnValue(true);
        mockGetUserId.mockReturnValue('user-123');

        startRevenueCatIdentitySync();
        await flush();

        expect(mockInitialize).toHaveBeenCalled();
        expect(mockIdentify).toHaveBeenCalledTimes(1);
        expect(mockIdentify).toHaveBeenCalledWith('user-123');
        expect(mockRcLogout).not.toHaveBeenCalled();
    });

    it('does nothing on app start when signed out (no spurious RevenueCat logOut)', async () => {
        startRevenueCatIdentitySync();
        await flush();

        expect(mockIdentify).not.toHaveBeenCalled();
        expect(mockRcLogout).not.toHaveBeenCalled();
    });

    it('identifies with the user id after a successful login (auth change event)', async () => {
        startRevenueCatIdentitySync();
        await flush();
        expect(mockIdentify).not.toHaveBeenCalled();

        // Login succeeds → identityApi persists tokens and emits change.
        mockIsAuthenticated.mockReturnValue(true);
        mockGetUserId.mockReturnValue('user-456');
        emitAuthChange();
        await flush();

        expect(mockIdentify).toHaveBeenCalledTimes(1);
        expect(mockIdentify).toHaveBeenCalledWith('user-456');
    });

    it('is idempotent — a token refresh re-emitting the same user id does not re-identify', async () => {
        mockIsAuthenticated.mockReturnValue(true);
        mockGetUserId.mockReturnValue('user-123');

        startRevenueCatIdentitySync();
        await flush();

        // Refresh rotation re-emits the same authenticated state every ~15 min.
        emitAuthChange();
        emitAuthChange();
        await flush();

        expect(mockIdentify).toHaveBeenCalledTimes(1);
    });

    it('calls subscriptionService.logout on sign-out so a shared device cannot cross-attribute purchases', async () => {
        mockIsAuthenticated.mockReturnValue(true);
        mockGetUserId.mockReturnValue('user-123');
        startRevenueCatIdentitySync();
        await flush();

        // Sign-out from settings → identityApi.logout() clears state + emits.
        mockIsAuthenticated.mockReturnValue(false);
        mockGetUserId.mockReturnValue(null);
        emitAuthChange();
        await flush();

        expect(mockRcLogout).toHaveBeenCalledTimes(1);
    });

    it('re-identifies with the new id after an account switch (logout → login)', async () => {
        mockIsAuthenticated.mockReturnValue(true);
        mockGetUserId.mockReturnValue('user-123');
        startRevenueCatIdentitySync();
        await flush();

        mockIsAuthenticated.mockReturnValue(false);
        mockGetUserId.mockReturnValue(null);
        emitAuthChange();
        await flush();

        mockIsAuthenticated.mockReturnValue(true);
        mockGetUserId.mockReturnValue('user-789');
        emitAuthChange();
        await flush();

        expect(mockRcLogout).toHaveBeenCalledTimes(1);
        expect(mockIdentify).toHaveBeenCalledTimes(2);
        expect(mockIdentify).toHaveBeenLastCalledWith('user-789');
    });

    it('waits for subscriptionService.initialize() before identifying (boot race)', async () => {
        let resolveInit: (v: boolean) => void = () => { };
        mockInitialize.mockImplementation(
            () => new Promise<boolean>((resolve) => { resolveInit = resolve; }),
        );
        mockIsAuthenticated.mockReturnValue(true);
        mockGetUserId.mockReturnValue('user-123');

        startRevenueCatIdentitySync();
        await flush();
        expect(mockIdentify).not.toHaveBeenCalled();

        resolveInit(true);
        await flush();
        expect(mockIdentify).toHaveBeenCalledWith('user-123');
    });

    it('never throws when initialize or logout reject', async () => {
        mockInitialize.mockRejectedValue(new Error('rc down'));
        mockIsAuthenticated.mockReturnValue(true);
        mockGetUserId.mockReturnValue('user-123');
        expect(() => startRevenueCatIdentitySync()).not.toThrow();
        await flush();

        mockRcLogout.mockRejectedValue(new Error('rc down'));
        mockIsAuthenticated.mockReturnValue(false);
        mockGetUserId.mockReturnValue(null);
        expect(() => emitAuthChange()).not.toThrow();
        await flush();
    });

    it('unsubscribe stops reacting to further auth changes', async () => {
        const unsub = startRevenueCatIdentitySync();
        await flush();
        unsub();

        mockIsAuthenticated.mockReturnValue(true);
        mockGetUserId.mockReturnValue('user-123');
        emitAuthChange();
        await flush();

        expect(mockIdentify).not.toHaveBeenCalled();
    });
});

describe('syncRevenueCatIdentity', () => {
    it('is safe to call directly and repeatedly with unchanged state', async () => {
        mockIsAuthenticated.mockReturnValue(true);
        mockGetUserId.mockReturnValue('user-123');

        syncRevenueCatIdentity();
        syncRevenueCatIdentity();
        await flush();

        expect(mockIdentify).toHaveBeenCalledTimes(1);
        expect(mockIdentify).toHaveBeenCalledWith('user-123');
    });
});
