/**
 * Hub Mode — provenance classifier + hub API client.
 */
import {
    classifyRoomPlatform,
    getBridgeProtocolId,
    PLATFORM_META,
} from '../hubPlatforms';

// SecureStore is required lazily inside the module; mock for API tests.
jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn(async (key: string) =>
        key === 'windy_jwt_token' ? 'test-jwt' : null),
}));

describe('classifyRoomPlatform', () => {
    it('classifies by bridge protocol id when present', () => {
        expect(classifyRoomPlatform('telegram', [])).toBe('telegram');
        expect(classifyRoomPlatform('whatsapp', ['@someone:chat.windychat.ai'])).toBe('whatsapp');
    });

    it('ignores unknown protocol ids and falls back to members', () => {
        expect(classifyRoomPlatform('gmessages', ['@telegram_123:chat.windychat.ai'])).toBe('telegram');
    });

    it('classifies by puppet member prefixes', () => {
        expect(classifyRoomPlatform(null, ['@telegram_784322:chat.windychat.ai'])).toBe('telegram');
        expect(classifyRoomPlatform(null, ['@slack_U123:chat.windychat.ai'])).toBe('slack');
        expect(classifyRoomPlatform(null, ['@whatsapp_15551234:chat.windychat.ai'])).toBe('whatsapp');
        expect(classifyRoomPlatform(null, ['@discord_99:chat.windychat.ai'])).toBe('discord');
    });

    it('classifies by bridge bot membership', () => {
        expect(classifyRoomPlatform(null, ['@telegrambot:chat.windychat.ai'])).toBe('telegram');
    });

    it('classifies agent DMs', () => {
        expect(classifyRoomPlatform(null, ['@agent_et26-9n9p-krzf:chat.windychat.ai'])).toBe('agent');
        expect(classifyRoomPlatform(null, ['@windy_legacybot:chat.windychat.ai'])).toBe('agent');
    });

    it('defaults to native for regular humans', () => {
        expect(classifyRoomPlatform(null, ['@grant.whitmer:chat.windychat.ai'])).toBe('native');
        expect(classifyRoomPlatform(null, [])).toBe('native');
    });

    it('agent does not shadow a bridged platform in the same room', () => {
        expect(classifyRoomPlatform(null, [
            '@agent_et26-abcd-efgh:chat.windychat.ai',
            '@telegram_5:chat.windychat.ai',
        ])).toBe('telegram');
    });
});

describe('getBridgeProtocolId', () => {
    const roomWith = (type: string, protocolId?: string) => ({
        currentState: {
            getStateEvents: (t: string) =>
                t === type
                    ? [{ getContent: () => (protocolId ? { protocol: { id: protocolId } } : {}) }]
                    : [],
        },
    });

    it('reads m.bridge protocol id', () => {
        expect(getBridgeProtocolId(roomWith('m.bridge', 'telegram'))).toBe('telegram');
    });

    it('falls back to uk.half-shot.bridge', () => {
        expect(getBridgeProtocolId(roomWith('uk.half-shot.bridge', 'discord'))).toBe('discord');
    });

    it('returns null when absent or malformed', () => {
        expect(getBridgeProtocolId(roomWith('m.bridge'))).toBeNull();
        expect(getBridgeProtocolId({})).toBeNull();
        expect(getBridgeProtocolId(null)).toBeNull();
    });
});

describe('hubApi', () => {
    const realFetch = global.fetch;
    afterEach(() => { global.fetch = realFetch; jest.clearAllMocks(); });

    const mockFetch = (status: number, body: unknown) => {
        const fn = jest.fn(async () => ({
            ok: status >= 200 && status < 300,
            status,
            json: async () => body,
        })) as any;
        global.fetch = fn;
        return fn;
    };

    it('lists platforms with bearer auth', async () => {
        const fn = mockFetch(200, { platforms: [{ key: 'telegram', displayName: 'Telegram', connections: [] }] });
        const { hubApi } = require('../hubPlatforms');
        const platforms = await hubApi.getPlatforms();
        expect(platforms).toHaveLength(1);
        expect(platforms[0].key).toBe('telegram');
        const [url, init] = fn.mock.calls[0];
        expect(String(url)).toContain('/api/v1/hub/platforms');
        expect(init.headers.Authorization).toBe('Bearer test-jwt');
    });

    it('submits user_input step values to the typed step path', async () => {
        const fn = mockFetch(200, { login_id: 'L1', type: 'user_input', step_id: 'code' });
        const { hubApi } = require('../hubPlatforms');
        await hubApi.submitStep(
            'telegram',
            { login_id: 'L1', step_id: 'fi.mau.telegram.phone', type: 'user_input' },
            { phone_number: '+15551234567' },
        );
        const [url, init] = fn.mock.calls[0];
        expect(String(url)).toContain('/telegram/provision/v3/login/step/L1/fi.mau.telegram.phone/user_input');
        expect(JSON.parse(init.body)).toEqual({ phone_number: '+15551234567' });
    });

    it('surfaces server error codes as HubApiError', async () => {
        mockFetch(409, { error: 'no_chat_account', message: 'No chat yet' });
        const { hubApi, HubApiError } = require('../hubPlatforms');
        await expect(hubApi.getPlatforms()).rejects.toThrow(HubApiError);
        await expect(hubApi.getPlatforms()).rejects.toMatchObject({ code: 'no_chat_account', status: 409 });
    });

    it('has display meta for every connectable platform', () => {
        for (const key of ['telegram', 'slack', 'whatsapp', 'discord']) {
            expect(PLATFORM_META[key].label).toBeTruthy();
            expect(PLATFORM_META[key].color).toMatch(/^#/);
        }
    });
});
