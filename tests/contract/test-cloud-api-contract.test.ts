/**
 * Contract Test: CloudApi Authentication Flow
 * Verifies request/response contracts match the account-server API.
 */

jest.mock('expo-secure-store', () => {
    const store: Record<string, string> = {};
    return {
        getItemAsync: jest.fn((key: string) => Promise.resolve(store[key] || null)),
        setItemAsync: jest.fn((key: string, value: string) => { store[key] = value; return Promise.resolve(); }),
        deleteItemAsync: jest.fn((key: string) => { delete store[key]; return Promise.resolve(); }),
        __store: store,
    };
});

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

import * as SecureStore from 'expo-secure-store';

// Helper: create a fake JWT with a payload
function createFakeJwt(payload: Record<string, unknown>): string {
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = btoa(JSON.stringify(payload));
    const sig = btoa('test-signature');
    return `${header}.${body}.${sig}`;
}

// Fresh import for each test suite
let cloudApi: typeof import('../../src/services/cloudApi').cloudApi;

beforeAll(() => {
    cloudApi = require('../../src/services/cloudApi').cloudApi;
});

describe('CloudApi Auth Contract', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockReset();
        // Clear SecureStore
        const store = (SecureStore as any).__store;
        for (const key of Object.keys(store)) delete store[key];
    });

    // ─── POST /api/auth/register ────────────────────────────────

    describe('POST /api/auth/register', () => {
        it('sends correct request body and parses response', async () => {
            const fakeToken = createFakeJwt({
                sub: 'u-1',
                email: 'test@example.com',
                windy_identity_id: 'wid-abc-123',
                tier: 'pro',
            });

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    token: fakeToken,
                    userId: 'u-1',
                    refreshToken: 'rt-1',
                }),
            });

            const result = await cloudApi.register('test@example.com', 'securepass');

            // Verify request
            expect(mockFetch).toHaveBeenCalledTimes(1);
            const [url, opts] = mockFetch.mock.calls[0];
            expect(url).toContain('/api/auth/register');
            expect(opts.method).toBe('POST');
            expect(JSON.parse(opts.body)).toEqual({
                email: 'test@example.com',
                password: 'securepass',
            });
            expect(opts.headers['Content-Type']).toBe('application/json');

            // Verify response parsing
            expect(result.success).toBe(true);
            expect(result.token).toBe(fakeToken);
            expect(result.userId).toBe('u-1');
        });

        it('stores tokens in SecureStore with correct keys', async () => {
            const fakeToken = createFakeJwt({
                sub: 'u-1',
                windy_identity_id: 'wid-xyz',
                tier: 'free',
            });

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    token: fakeToken,
                    userId: 'u-1',
                    refreshToken: 'rt-register',
                }),
            });

            await cloudApi.register('user@test.com', 'pass');

            expect(SecureStore.setItemAsync).toHaveBeenCalledWith('windy_cloud_jwt', fakeToken);
            expect(SecureStore.setItemAsync).toHaveBeenCalledWith('windy_cloud_refresh_token', 'rt-register');
            expect(SecureStore.setItemAsync).toHaveBeenCalledWith('windy_cloud_user_id', 'u-1');
            expect(SecureStore.setItemAsync).toHaveBeenCalledWith('windy_cloud_email', 'user@test.com');
        });

        it('extracts windy_identity_id from JWT and stores it', async () => {
            const fakeToken = createFakeJwt({
                sub: 'u-1',
                windy_identity_id: 'wid-identity-456',
                tier: 'pro',
            });

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    token: fakeToken,
                    userId: 'u-1',
                    refreshToken: 'rt-1',
                }),
            });

            await cloudApi.register('id@test.com', 'pass');

            expect(SecureStore.setItemAsync).toHaveBeenCalledWith('windy_identity_id', 'wid-identity-456');
            expect(cloudApi.getWindyIdentityId()).toBe('wid-identity-456');
        });
    });

    // ─── POST /api/auth/login ───────────────────────────────────

    describe('POST /api/auth/login', () => {
        it('sends correct request body and parses response', async () => {
            const fakeToken = createFakeJwt({
                sub: 'u-2',
                email: 'login@test.com',
                windy_identity_id: 'wid-login',
                tier: 'ultra',
            });

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    token: fakeToken,
                    userId: 'u-2',
                    refreshToken: 'rt-login',
                }),
            });

            const result = await cloudApi.login('login@test.com', 'mypass');

            const [url, opts] = mockFetch.mock.calls[0];
            expect(url).toContain('/api/auth/login');
            expect(opts.method).toBe('POST');
            expect(JSON.parse(opts.body)).toEqual({
                email: 'login@test.com',
                password: 'mypass',
            });

            expect(result.success).toBe(true);
            expect(result.token).toBe(fakeToken);
            expect(result.userId).toBe('u-2');
        });

        it('stores tokens in correct SecureStore keys', async () => {
            const fakeToken = createFakeJwt({ sub: 'u-2', windy_identity_id: 'wid-2', tier: 'pro' });

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    token: fakeToken,
                    userId: 'u-2',
                    refreshToken: 'rt-login-2',
                }),
            });

            await cloudApi.login('user2@test.com', 'pass2');

            expect(SecureStore.setItemAsync).toHaveBeenCalledWith('windy_cloud_jwt', fakeToken);
            expect(SecureStore.setItemAsync).toHaveBeenCalledWith('windy_cloud_refresh_token', 'rt-login-2');
            expect(SecureStore.setItemAsync).toHaveBeenCalledWith('windy_identity_id', 'wid-2');
        });

        it('handles login failure with error message', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: () => Promise.resolve({ error: 'Invalid credentials' }),
            });

            const result = await cloudApi.login('bad@test.com', 'wrong');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid credentials');
        });
    });

    // ─── POST /api/auth/refresh ─────────────────────────────────

    describe('POST /api/auth/refresh', () => {
        it('sends refresh token and stores new tokens', async () => {
            // First login to set refresh token
            const loginToken = createFakeJwt({ sub: 'u-3', windy_identity_id: 'wid-3', tier: 'free' });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ token: loginToken, userId: 'u-3', refreshToken: 'rt-old' }),
            });
            await cloudApi.login('refresh@test.com', 'pass');
            jest.clearAllMocks();

            // Mock sequence: 1) listFiles gets 401, 2) refresh succeeds, 3) retry listFiles succeeds
            const newToken = createFakeJwt({ sub: 'u-3', windy_identity_id: 'wid-3', tier: 'pro' });
            mockFetch
                .mockResolvedValueOnce({ ok: false, status: 401 }) // listFiles → 401
                .mockResolvedValueOnce({ // refresh → success
                    ok: true,
                    json: () => Promise.resolve({ token: newToken, refreshToken: 'rt-new' }),
                })
                .mockResolvedValueOnce({ // retry listFiles → success
                    ok: true,
                    json: () => Promise.resolve({ files: [] }),
                });

            await cloudApi.listFiles();

            // Find the refresh call (second call)
            const allCalls = mockFetch.mock.calls;
            const refreshCall = allCalls.find(
                ([url, opts]: [string, any]) => url.includes('/api/auth/refresh') && opts?.method === 'POST'
            );
            expect(refreshCall).toBeDefined();

            const refreshBody = JSON.parse(refreshCall![1].body);
            expect(refreshBody).toEqual({ refreshToken: 'rt-old' });

            // Verify new token stored
            expect(SecureStore.setItemAsync).toHaveBeenCalledWith('windy_cloud_jwt', newToken);
            expect(SecureStore.setItemAsync).toHaveBeenCalledWith('windy_cloud_refresh_token', 'rt-new');
        });
    });
});
