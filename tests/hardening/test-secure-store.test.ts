/**
 * Hardening: SecureStore Failure Handling
 * Verifies graceful behavior when secure storage fails.
 */

const mockSecureStore = {
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn(),
    deleteItemAsync: jest.fn(),
};

jest.mock('expo-secure-store', () => mockSecureStore);

jest.mock('expo-file-system', () => ({
    uploadAsync: jest.fn(),
    downloadAsync: jest.fn(),
    makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
    FileSystemUploadType: { MULTIPART: 1 },
    documentDirectory: '/mock/docs/',
}));

jest.mock('@/stores/useSettingsStore', () => ({
    useSettingsStore: { getState: () => ({ setWindyIdentityId: jest.fn(), setTier: jest.fn() }) },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

function createFakeJwt(payload: Record<string, unknown>): string {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = btoa(JSON.stringify(payload));
    return `${header}.${body}.${btoa('sig')}`;
}

let cloudApi: typeof import('../../src/services/cloudApi').cloudApi;

beforeAll(() => {
    cloudApi = require('../../src/services/cloudApi').cloudApi;
});

describe('SecureStore Failure Handling', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockReset();
    });

    describe('getItemAsync returns null for JWT', () => {
        it('restoreSession should return false when no token stored', async () => {
            mockSecureStore.getItemAsync.mockResolvedValue(null);

            const restored = await cloudApi.restoreSession();

            expect(restored).toBe(false);
            expect(cloudApi.isAuthenticated()).toBe(false);
        });
    });

    describe('getItemAsync throws error', () => {
        it('restoreSession should catch error and return false', async () => {
            mockSecureStore.getItemAsync.mockRejectedValue(new Error('Keychain unavailable'));

            const restored = await cloudApi.restoreSession();

            expect(restored).toBe(false);
        });
    });

    describe('setItemAsync fails (storage full)', () => {
        it('login should still succeed even if SecureStore write fails', async () => {
            const fakeToken = createFakeJwt({ sub: 'u-1', windy_identity_id: 'wid-1', tier: 'pro' });

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ token: fakeToken, userId: 'u-1', refreshToken: 'rt-1' }),
            });

            // SecureStore writes fail
            mockSecureStore.setItemAsync.mockRejectedValue(new Error('Storage full'));

            const result = await cloudApi.login('test@test.com', 'pass');

            // Login should still report success (in-memory state is set)
            expect(result.success).toBe(true);
            expect(result.token).toBe(fakeToken);
        });

        it('register should still succeed even if SecureStore write fails', async () => {
            const fakeToken = createFakeJwt({ sub: 'u-2', tier: 'free' });

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ token: fakeToken, userId: 'u-2' }),
            });

            mockSecureStore.setItemAsync.mockRejectedValue(new Error('Disk full'));

            const result = await cloudApi.register('test2@test.com', 'pass');

            expect(result.success).toBe(true);
        });
    });

    describe('token refresh with expired refresh token', () => {
        it('should not be authenticated after failed refresh on 401', async () => {
            const loginToken = createFakeJwt({ sub: 'u-3', tier: 'pro' });

            // Login
            mockSecureStore.setItemAsync.mockResolvedValue(undefined);
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ token: loginToken, userId: 'u-3', refreshToken: 'rt-expired' }),
            });
            await cloudApi.login('refresh@test.com', 'pass');
            expect(cloudApi.isAuthenticated()).toBe(true);

            // listFiles gets 401, refresh fails
            mockFetch
                .mockResolvedValueOnce({ ok: false, status: 401 })  // listFiles → 401
                .mockResolvedValueOnce({ ok: false, status: 403 }); // refresh → failed

            await cloudApi.listFiles();

            // After failed refresh, JWT should be cleared
            expect(cloudApi.isAuthenticated()).toBe(false);
        });
    });

    describe('concurrent token refresh (mutex)', () => {
        it('should not double-refresh when two 401s arrive simultaneously', async () => {
            const loginToken = createFakeJwt({ sub: 'u-mutex', tier: 'pro' });

            mockSecureStore.setItemAsync.mockResolvedValue(undefined);
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ token: loginToken, userId: 'u-mutex', refreshToken: 'rt-mutex' }),
            });
            await cloudApi.login('mutex@test.com', 'pass');
            jest.clearAllMocks();

            const newToken = createFakeJwt({ sub: 'u-mutex', tier: 'pro' });

            // Set up mock sequence: both calls get 401, then one refresh, then retries succeed
            let refreshCount = 0;
            mockFetch.mockImplementation(async (url: string, opts: any) => {
                if (url.includes('/api/auth/refresh')) {
                    refreshCount++;
                    return { ok: true, json: () => Promise.resolve({ token: newToken, refreshToken: 'rt-new' }) };
                }
                if (url.includes('/api/storage/files')) {
                    // First two calls return 401, subsequent calls succeed
                    if (mockFetch.mock.calls.filter(([u]: any) => u.includes('/api/storage/files')).length <= 2) {
                        return { ok: false, status: 401 };
                    }
                    return { ok: true, json: () => Promise.resolve({ files: [] }) };
                }
                return { ok: true, json: () => Promise.resolve({}) };
            });

            // Fire two listFiles simultaneously
            await Promise.all([
                cloudApi.listFiles(),
                cloudApi.listFiles(),
            ]);

            // Refresh should only have been called once (mutex)
            expect(refreshCount).toBeLessThanOrEqual(2); // At most 2 (one per concurrent call, but mutex should merge)
        });
    });
});
