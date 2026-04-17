/**
 * Unit tests for IdentityApiClient (OAuth2 device-code flow).
 *
 * Covers:
 *   - startDeviceFlow → POST /oauth/device, returns DeviceCodeStart
 *   - pollForToken → authorization_pending loop, success, expired, denied
 *   - refresh → POST /oauth/token with refresh_token grant
 *   - authedFetch → 401 refresh + retry path
 *   - restoreSession + logout
 */

jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(),
    setItemAsync: jest.fn().mockResolvedValue(undefined),
    deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../ecosystem-status', () => ({
    getEcosystemStatus: jest.fn().mockResolvedValue(null),
}));

jest.mock('../license', () => ({
    normalizeBackendTier: (tier: string) => tier,
}));

// Very short polling interval so tests don't wait 5 seconds.
jest.mock('@/config/identity', () => {
    const actual = jest.requireActual('@/config/identity');
    return {
        ...actual,
        DEFAULT_POLL_INTERVAL_MS: 1,
        IDENTITY_REQUEST_TIMEOUT_MS: 1000,
    };
});

const mockFetch = jest.fn();
global.fetch = mockFetch;

import * as SecureStore from 'expo-secure-store';
import { identityApi } from '../identityApi';

function makeJwt(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${header}.${body}.signature`;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    // Fully reset the singleton's state between tests
    return identityApi.logout();
});

describe('identityApi.startDeviceFlow', () => {
    it('POSTs to /api/v1/oauth/device with client_id + scope', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({
                device_code: 'dc_abc',
                user_code: 'ABCD-EFGH',
                verification_uri: 'https://windyword.ai/device',
                verification_uri_complete: 'https://windyword.ai/device?code=ABCD-EFGH',
                expires_in: 900,
                interval: 5,
            }),
        });

        const start = await identityApi.startDeviceFlow();

        expect(start.user_code).toBe('ABCD-EFGH');
        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toContain('/api/v1/oauth/device');
        const body = JSON.parse(init.body);
        expect(body.client_id).toBe('windy_pro_mobile');
        expect(body.scope).toContain('openid');
    });

    it('throws when server returns error', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 400,
            json: () => Promise.resolve({ error: 'invalid_client' }),
        });
        await expect(identityApi.startDeviceFlow()).rejects.toThrow(/invalid_client/);
    });
});

describe('identityApi.pollForToken', () => {
    beforeEach(async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                device_code: 'dc1', user_code: 'XXXX-YYYY',
                verification_uri: 'https://windyword.ai/device',
                verification_uri_complete: 'https://windyword.ai/device?code=XXXX-YYYY',
                expires_in: 900, interval: 1,
            }),
        });
        await identityApi.startDeviceFlow();
    });

    it('resolves success on approval', async () => {
        const jwt = makeJwt({ sub: 'user_1', email: 'u@ex.com', windy_identity_id: 'id_1' });
        mockFetch
            .mockResolvedValueOnce({
                ok: false, status: 400,
                json: () => Promise.resolve({ error: 'authorization_pending' }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    access_token: jwt,
                    refresh_token: 'rt1',
                    token_type: 'Bearer',
                    expires_in: 900,
                    scope: 'openid',
                }),
            });

        const outcome = await identityApi.pollForToken();
        expect(outcome.success).toBe(true);
        if (outcome.success) {
            expect(outcome.userId).toBe('user_1');
            expect(outcome.email).toBe('u@ex.com');
        }
        expect(identityApi.getToken()).toBe(jwt);
        expect(identityApi.getWindyIdentityId()).toBe('id_1');
    });

    it('resolves expired on expired_token', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false, status: 400,
            json: () => Promise.resolve({ error: 'expired_token' }),
        });
        const outcome = await identityApi.pollForToken();
        expect(outcome.success).toBe(false);
        if (!outcome.success) expect(outcome.error).toBe('expired');
    });

    it('resolves denied on access_denied', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false, status: 400,
            json: () => Promise.resolve({ error: 'access_denied' }),
        });
        const outcome = await identityApi.pollForToken();
        expect(outcome.success).toBe(false);
        if (!outcome.success) expect(outcome.error).toBe('denied');
    });

    it('resolves cancelled when cancelDeviceFlow is called', async () => {
        // pending forever, then cancel
        mockFetch.mockResolvedValue({
            ok: false, status: 400,
            json: () => Promise.resolve({ error: 'authorization_pending' }),
        });
        const promise = identityApi.pollForToken();
        await new Promise(r => setTimeout(r, 5));
        identityApi.cancelDeviceFlow();
        const outcome = await promise;
        expect(outcome.success).toBe(false);
        if (!outcome.success) expect(outcome.error).toBe('cancelled');
    });
});

describe('identityApi.refresh', () => {
    it('POSTs to /oauth/token with refresh_token grant', async () => {
        // Prime the refresh token via a successful device-code exchange
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    device_code: 'dc2', user_code: 'AAAA-BBBB',
                    verification_uri: 'https://x/d', verification_uri_complete: 'https://x/d',
                    expires_in: 900, interval: 1,
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    access_token: makeJwt({ sub: 'u', email: 'a@b.c' }),
                    refresh_token: 'rt_initial',
                    expires_in: 900,
                }),
            });
        await identityApi.startDeviceFlow();
        await identityApi.pollForToken();

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                access_token: makeJwt({ sub: 'u', email: 'a@b.c' }),
                refresh_token: 'rt_rotated',
                expires_in: 900,
            }),
        });
        const ok = await identityApi.refresh();
        expect(ok).toBe(true);
        const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
        expect(url).toContain('/api/v1/oauth/token');
        const body = JSON.parse(init.body);
        expect(body.grant_type).toBe('refresh_token');
        expect(body.refresh_token).toBe('rt_initial');
        expect(identityApi.getRefreshToken()).toBe('rt_rotated');
    });

    it('returns false when no refresh token stored', async () => {
        const ok = await identityApi.refresh();
        expect(ok).toBe(false);
    });
});

describe('identityApi.authedFetch', () => {
    async function primeSession(): Promise<void> {
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    device_code: 'dc3', user_code: 'CCCC-DDDD',
                    verification_uri: 'x', verification_uri_complete: 'x',
                    expires_in: 900, interval: 1,
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    access_token: makeJwt({ sub: 's', email: 'e@f.g', windy_identity_id: 'id' }),
                    refresh_token: 'rt',
                    expires_in: 900,
                }),
            });
        await identityApi.startDeviceFlow();
        await identityApi.pollForToken();
    }

    it('adds Authorization header', async () => {
        await primeSession();
        mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({}) });
        await identityApi.authedFetch('https://api.example/x');
        const init = mockFetch.mock.calls[mockFetch.mock.calls.length - 1][1];
        expect(init.headers.Authorization).toMatch(/^Bearer /);
        expect(init.headers['X-Windy-Identity-Id']).toBe('id');
    });

    it('refreshes and retries on 401', async () => {
        await primeSession();
        mockFetch
            .mockResolvedValueOnce({ status: 401, ok: false, json: () => Promise.resolve({}) })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    access_token: makeJwt({ sub: 's', email: 'e@f.g' }),
                    refresh_token: 'rt2',
                    expires_in: 900,
                }),
            })
            .mockResolvedValueOnce({ status: 200, ok: true, json: () => Promise.resolve({ ok: 1 }) });
        const res = await identityApi.authedFetch('https://api.example/y');
        expect(res!.status).toBe(200);
    });

    it('returns null and fires authExpired when no token', async () => {
        const handler = jest.fn();
        identityApi.setAuthExpiredHandler(handler);
        const res = await identityApi.authedFetch('https://api.example/z');
        expect(res).toBeNull();
        expect(handler).toHaveBeenCalled();
    });
});

describe('identityApi.restoreSession', () => {
    it('returns false when no token stored', async () => {
        (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
        const ok = await identityApi.restoreSession();
        expect(ok).toBe(false);
    });

    it('returns true and hydrates state when token exists', async () => {
        (SecureStore.getItemAsync as jest.Mock)
            .mockResolvedValueOnce('stored_jwt')
            .mockResolvedValueOnce('stored_rt')
            .mockResolvedValueOnce('stored_uid')
            .mockResolvedValueOnce('stored_email')
            .mockResolvedValueOnce('stored_identity');
        const ok = await identityApi.restoreSession();
        expect(ok).toBe(true);
        expect(identityApi.getToken()).toBe('stored_jwt');
        expect(identityApi.getUserId()).toBe('stored_uid');
    });
});

describe('identityApi exp-claim handling', () => {
    function futureJwt(offsetSeconds: number): string {
        const exp = Math.floor(Date.now() / 1000) + offsetSeconds;
        return makeJwt({ sub: 'u', email: 'a@b.c', exp });
    }

    it('restoreSession refreshes proactively when the stored JWT is expired and a refresh token exists', async () => {
        const staleJwt = futureJwt(-3600);
        const freshJwt = futureJwt(900);
        (SecureStore.getItemAsync as jest.Mock)
            .mockResolvedValueOnce(staleJwt)
            .mockResolvedValueOnce('stored_rt')
            .mockResolvedValueOnce('stored_uid')
            .mockResolvedValueOnce('a@b.c')
            .mockResolvedValueOnce('stored_identity');

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({
                access_token: freshJwt,
                refresh_token: 'rt_rotated',
                expires_in: 900,
            }),
        });

        const ok = await identityApi.restoreSession();
        expect(ok).toBe(true);
        expect(identityApi.getToken()).toBe(freshJwt);
        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.grant_type).toBe('refresh_token');
        expect(body.refresh_token).toBe('stored_rt');
    });

    it('restoreSession logs out if the stored JWT is expired and no refresh token exists', async () => {
        (SecureStore.getItemAsync as jest.Mock)
            .mockResolvedValueOnce(futureJwt(-3600))
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce('stored_uid')
            .mockResolvedValueOnce('a@b.c')
            .mockResolvedValueOnce('stored_identity');

        const ok = await identityApi.restoreSession();
        expect(ok).toBe(false);
        expect(identityApi.getToken()).toBeNull();
        expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('windy_jwt_token');
    });

    it('restoreSession logs out if the stored JWT is expired and refresh fails', async () => {
        (SecureStore.getItemAsync as jest.Mock)
            .mockResolvedValueOnce(futureJwt(-3600))
            .mockResolvedValueOnce('bad_rt')
            .mockResolvedValueOnce('stored_uid')
            .mockResolvedValueOnce('a@b.c')
            .mockResolvedValueOnce('stored_identity');

        mockFetch.mockResolvedValueOnce({
            ok: false, status: 400,
            json: () => Promise.resolve({ error: 'invalid_grant' }),
        });

        const ok = await identityApi.restoreSession();
        expect(ok).toBe(false);
        expect(identityApi.getToken()).toBeNull();
    });

    it('isAuthenticated returns false for an expired token already in memory', async () => {
        // Prime a not-yet-expired session so persistTokens runs, then monkey-patch.
        mockFetch
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    device_code: 'dc', user_code: 'AAAA-BBBB',
                    verification_uri: 'x', verification_uri_complete: 'x',
                    expires_in: 900, interval: 1,
                }),
            })
            .mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({
                    access_token: futureJwt(-3600), // server lied: token actually expired
                    refresh_token: 'rt',
                    expires_in: 900,
                }),
            });
        await identityApi.startDeviceFlow();
        const outcome = await identityApi.pollForToken();
        expect(outcome.success).toBe(true);
        // But the JWT we stored is already past exp → isAuthenticated sees it.
        expect(identityApi.isAuthenticated()).toBe(false);
    });

    it('isAuthenticated returns true when the token has no exp claim (trust server)', async () => {
        (SecureStore.getItemAsync as jest.Mock)
            .mockResolvedValueOnce(makeJwt({ sub: 'u', email: 'a@b.c' })) // no exp
            .mockResolvedValueOnce('rt')
            .mockResolvedValueOnce('uid')
            .mockResolvedValueOnce('a@b.c')
            .mockResolvedValueOnce('id');
        await identityApi.restoreSession();
        expect(identityApi.isAuthenticated()).toBe(true);
    });
});
