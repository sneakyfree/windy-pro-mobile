/**
 * Tests for push-notifications.ts — chat push pipeline:
 * device-token registration at the chat push-gateway + Synapse pusher.
 */

// ── Mocks ─────────────────────────────────────────────────────

jest.mock('expo-notifications', () => ({
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
    requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
    getDevicePushTokenAsync: jest.fn(async () => ({ data: 'native-device-token-abc' })),
    setNotificationChannelAsync: jest.fn(async () => undefined),
    scheduleNotificationAsync: jest.fn(async () => 'id'),
    addNotificationReceivedListener: jest.fn(),
    addNotificationResponseReceivedListener: jest.fn(),
    getBadgeCountAsync: jest.fn(async () => 0),
    setBadgeCountAsync: jest.fn(async () => undefined),
    AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3, LOW: 2 },
}));

jest.mock('expo-device', () => ({
    isDevice: true,
    modelName: 'iPhone 15',
}));

jest.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));

// windy JWT whose payload carries BOTH claims — the gateway keys its
// ownership check on windy_identity_id first, so that MUST win over sub.
const mockJwtPayload = Buffer.from(JSON.stringify({
    sub: 'user-sub-legacy',
    windy_identity_id: 'wid-12345',
})).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const mockFakeJwt = `eyJhbGciOiJSUzI1NiJ9.${mockJwtPayload}.sig`;

jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(async (key: string) => (key === 'windy_jwt_token' ? mockFakeJwt : null)),
    setItemAsync: jest.fn(async () => undefined),
    deleteItemAsync: jest.fn(async () => undefined),
}));

const mockFetchWithTimeout = jest.fn(async (..._args: unknown[]) => ({ ok: true, status: 200 }));
jest.mock('@/utils/fetch-timeout', () => ({
    fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}));

jest.mock('@/config/api', () => ({
    API_BASE_URL: 'https://account.windyword.ai',
    PUSH_TOKEN_ENDPOINT_URL: 'https://chat.windychat.ai/api/v1/chat/push/register',
    CHAT_PUSH_BASE_URL: 'https://chat.windychat.ai',
}));

const mockGetAccessToken = jest.fn(() => 'syt_matrix_token');
const mockGetHomeserver = jest.fn(() => 'https://chat.windychat.ai');
jest.mock('../chatClient', () => ({
    chatClient: {
        getAccessToken: () => mockGetAccessToken(),
        getHomeserver: () => mockGetHomeserver(),
    },
}));

jest.mock('../logger', () => ({
    createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

import { pushNotificationService } from '../push-notifications';

beforeEach(() => {
    jest.clearAllMocks();
    mockFetchWithTimeout.mockResolvedValue({ ok: true, status: 200 });
    mockGetAccessToken.mockReturnValue('syt_matrix_token');
});

describe('registerForChatPush', () => {
    it('registers the device token at the gateway with windy_identity_id, then sets the Synapse pusher with the SAME pushkey', async () => {
        const result = await pushNotificationService.registerForChatPush();

        expect(result).toEqual({ gateway: true, pusher: true });
        expect(mockFetchWithTimeout).toHaveBeenCalledTimes(2);

        // Leg 1 — push-gateway register
        const [gatewayUrl, gatewayInit] = mockFetchWithTimeout.mock.calls[0] as unknown as [string, RequestInit];
        expect(gatewayUrl).toBe('https://chat.windychat.ai/api/v1/chat/push/register');
        const gatewayBody = JSON.parse(gatewayInit.body as string);
        expect(gatewayBody.userId).toBe('wid-12345'); // windy_identity_id wins over sub
        expect(gatewayBody.pushkey).toBe('native-device-token-abc');
        expect(gatewayBody.platform).toBe('ios');
        expect((gatewayInit.headers as Record<string, string>).Authorization).toBe(`Bearer ${mockFakeJwt}`);

        // Leg 2 — Synapse pusher
        const [pusherUrl, pusherInit] = mockFetchWithTimeout.mock.calls[1] as unknown as [string, RequestInit];
        expect(pusherUrl).toBe('https://chat.windychat.ai/_matrix/client/v3/pushers/set');
        const pusherBody = JSON.parse(pusherInit.body as string);
        expect(pusherBody.pushkey).toBe('native-device-token-abc'); // join key with leg 1
        expect(pusherBody.kind).toBe('http');
        expect(pusherBody.append).toBe(false);
        expect(pusherBody.data.url).toBe('https://chat.windychat.ai/_matrix/push/v1/notify');
        expect((pusherInit.headers as Record<string, string>).Authorization).toBe('Bearer syt_matrix_token');
    });

    it('reports pusher=false (gateway still true) when no Matrix session exists yet', async () => {
        mockGetAccessToken.mockReturnValue(null as unknown as string);

        const result = await pushNotificationService.registerForChatPush();

        expect(result).toEqual({ gateway: true, pusher: false });
        expect(mockFetchWithTimeout).toHaveBeenCalledTimes(1); // no pushers/set call
    });

    it('reports gateway=false on a gateway 403 (ownership mismatch) without aborting the pusher leg', async () => {
        mockFetchWithTimeout
            .mockResolvedValueOnce({ ok: false, status: 403 })
            .mockResolvedValueOnce({ ok: true, status: 200 });

        const result = await pushNotificationService.registerForChatPush();

        expect(result).toEqual({ gateway: false, pusher: true });
    });

    it('does nothing without notification permission', async () => {
        const Notifications = require('expo-notifications');
        Notifications.getPermissionsAsync.mockResolvedValueOnce({ status: 'denied' });

        const result = await pushNotificationService.registerForChatPush();

        expect(result).toEqual({ gateway: false, pusher: false });
        expect(mockFetchWithTimeout).not.toHaveBeenCalled();
    });
});
