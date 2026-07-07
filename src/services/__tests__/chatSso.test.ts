/**
 * Tests for chatSso.ts — Windy account → Matrix session bridge
 * (unified-login against chat.windychat.ai).
 */

// ── Mocks ─────────────────────────────────────────────────────

jest.mock('@/config/api', () => ({
    DEFAULT_CHAT_HOMESERVER: 'https://chat.windychat.ai',
}));

const mockAuthedFetch = jest.fn<Promise<Response | null>, unknown[]>();
const mockIsAuthenticated = jest.fn(() => true);
jest.mock('@/services/identityApi', () => ({
    identityApi: {
        authedFetch: (...args: unknown[]) => mockAuthedFetch(...args),
        isAuthenticated: () => mockIsAuthenticated(),
    },
}));

const mockLoginWithCredentials = jest.fn(
    async (..._args: unknown[]) => ({ success: true, userId: '@u:chat.windychat.ai' }),
);
const mockRestoreSession = jest.fn(async () => false);
const mockIsLoggedIn = jest.fn(() => false);
jest.mock('@/services/chatClient', () => ({
    chatClient: {
        isLoggedIn: () => mockIsLoggedIn(),
        restoreSession: () => mockRestoreSession(),
        getUserId: jest.fn(() => '@u:chat.windychat.ai'),
        loginWithCredentials: (...args: unknown[]) => mockLoginWithCredentials(...args),
    },
}));

jest.mock('../logger', () => ({
    createLogger: () => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    }),
}));

import { chatSso } from '../chatSso';

function jsonResponse(status: number, body: unknown): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    } as unknown as Response;
}

const FULL_RESPONSE = {
    matrix_user_id: '@grant:chat.windychat.ai',
    access_token: 'flat_token',
    device_id: 'flat_device',
    home_server: 'chat.windychat.ai',
    display_name: 'Grant',
    already_existed: true,
    matrix: {
        matrixUserId: '@grant:chat.windychat.ai',
        accessToken: 'syt_secret',
        deviceId: 'DEVICE1',
        homeServer: 'chat.windychat.ai',
    },
};

beforeEach(() => {
    jest.clearAllMocks();
    mockIsAuthenticated.mockReturnValue(true);
    mockIsLoggedIn.mockReturnValue(false);
    mockRestoreSession.mockResolvedValue(false);
    mockLoginWithCredentials.mockResolvedValue({ success: true, userId: '@u:chat.windychat.ai' });
});

describe('connectWithWindyAccount', () => {
    it('POSTs unified-login and logs the chat client in with the nested matrix session', async () => {
        mockAuthedFetch.mockResolvedValue(jsonResponse(200, FULL_RESPONSE));

        const result = await chatSso.connectWithWindyAccount();

        expect(mockAuthedFetch).toHaveBeenCalledWith(
            'https://chat.windychat.ai/api/v1/chat/provision/unified-login',
            expect.objectContaining({ method: 'POST' }),
        );
        expect(mockLoginWithCredentials).toHaveBeenCalledWith(
            'syt_secret',
            '@grant:chat.windychat.ai',
            'DEVICE1',
            'https://chat.windychat.ai',
        );
        expect(result.success).toBe(true);
        expect(result.matrixUserId).toBe('@grant:chat.windychat.ai');
        expect(result.displayName).toBe('Grant');
    });

    it('falls back to flat fields when the nested matrix object is absent', async () => {
        const { matrix: _matrix, ...flatOnly } = FULL_RESPONSE;
        mockAuthedFetch.mockResolvedValue(jsonResponse(200, flatOnly));

        const result = await chatSso.connectWithWindyAccount();

        expect(mockLoginWithCredentials).toHaveBeenCalledWith(
            'flat_token',
            '@grant:chat.windychat.ai',
            'flat_device',
            'https://chat.windychat.ai',
        );
        expect(result.success).toBe(true);
    });

    it('fails without connecting when the Windy account is signed out', async () => {
        mockIsAuthenticated.mockReturnValue(false);

        const result = await chatSso.connectWithWindyAccount();

        expect(result.success).toBe(false);
        expect(mockAuthedFetch).not.toHaveBeenCalled();
    });

    it('surfaces the email-verification gate on 403', async () => {
        mockAuthedFetch.mockResolvedValue(jsonResponse(403, { error: 'email_verification_required' }));

        const result = await chatSso.connectWithWindyAccount();

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/verify your email/i);
        expect(mockLoginWithCredentials).not.toHaveBeenCalled();
    });

    it('fails gracefully when unified-login returns no usable session (mint failed)', async () => {
        mockAuthedFetch.mockResolvedValue(jsonResponse(200, {
            matrix_user_id: '@grant:chat.windychat.ai',
            access_token: null,
            matrix: null,
            already_existed: true,
        }));

        const result = await chatSso.connectWithWindyAccount();

        expect(result.success).toBe(false);
        expect(mockLoginWithCredentials).not.toHaveBeenCalled();
    });

    it('fails gracefully on network error', async () => {
        mockAuthedFetch.mockRejectedValue(new Error('Network request failed'));

        const result = await chatSso.connectWithWindyAccount();

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/connection/i);
    });

    it('treats authedFetch null (refresh failed) as an expired session', async () => {
        mockAuthedFetch.mockResolvedValue(null);

        const result = await chatSso.connectWithWindyAccount();

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/sign in/i);
    });

    it('serializes concurrent connect calls into one request', async () => {
        let resolveFetch: (r: Response) => void = () => {};
        mockAuthedFetch.mockReturnValue(new Promise((res) => { resolveFetch = res; }));

        const p1 = chatSso.connectWithWindyAccount();
        const p2 = chatSso.connectWithWindyAccount();
        resolveFetch(jsonResponse(200, FULL_RESPONSE));
        const [r1, r2] = await Promise.all([p1, p2]);

        expect(mockAuthedFetch).toHaveBeenCalledTimes(1);
        expect(r1.success).toBe(true);
        expect(r2.success).toBe(true);
    });
});

describe('ensureChatSession', () => {
    it('returns immediately when the chat client is already logged in', async () => {
        mockIsLoggedIn.mockReturnValue(true);

        const result = await chatSso.ensureChatSession();

        expect(result.success).toBe(true);
        expect(mockRestoreSession).not.toHaveBeenCalled();
        expect(mockAuthedFetch).not.toHaveBeenCalled();
    });

    it('prefers a restored stored session over minting a new one', async () => {
        mockRestoreSession.mockImplementation(async () => {
            mockIsLoggedIn.mockReturnValue(true);
            return true;
        });

        const result = await chatSso.ensureChatSession();

        expect(result.success).toBe(true);
        expect(mockAuthedFetch).not.toHaveBeenCalled();
    });

    it('falls through to unified-login when nothing is stored', async () => {
        mockAuthedFetch.mockResolvedValue(jsonResponse(200, FULL_RESPONSE));

        const result = await chatSso.ensureChatSession();

        expect(result.success).toBe(true);
        expect(mockAuthedFetch).toHaveBeenCalledTimes(1);
    });
});
