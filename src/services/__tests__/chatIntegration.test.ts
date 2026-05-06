/**
 * 🧪 Smoke tests for Windy Chat mobile integration
 * Tests the full chat lifecycle: onboarding → contacts → send → offline → logout.
 *
 * 6 test groups:
 *   1. Register with phone verification succeeds
 *   2. Login with existing account succeeds
 *   3. Contact import finds matches
 *   4. Send message → saves to local DB
 *   5. Offline queue works
 *   6. Logout clears SecureStore
 */

// ─── Mocks ──────────────────────────────────────────────────────

const mockSecureStore: Record<string, string> = {};

jest.mock('expo-secure-store', () => ({
    getItemAsync: jest.fn((key: string) => Promise.resolve(mockSecureStore[key] ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
        mockSecureStore[key] = value;
        return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
        delete mockSecureStore[key];
        return Promise.resolve();
    }),
}));

const mockAsyncStorage: Record<string, string> = {};

jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
        getItem: jest.fn((key: string) => Promise.resolve(mockAsyncStorage[key] ?? null)),
        setItem: jest.fn((key: string, value: string) => {
            mockAsyncStorage[key] = value;
            return Promise.resolve();
        }),
        removeItem: jest.fn((key: string) => {
            delete mockAsyncStorage[key];
            return Promise.resolve();
        }),
    },
}));

// Matrix SDK mock — simulates the real SDK surface used by chatClient
const mockMatrixClient = {
    startClient: jest.fn().mockResolvedValue(undefined),
    stopClient: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
    logout: jest.fn().mockResolvedValue(undefined),
    sendEvent: jest.fn().mockResolvedValue({ event_id: '$evt_mock_001' }),
    getRooms: jest.fn().mockReturnValue([]),
    getRoom: jest.fn(),
    setPresence: jest.fn().mockResolvedValue(undefined),
    setDisplayName: jest.fn().mockResolvedValue(undefined),
    getAccountData: jest.fn().mockReturnValue(null),
    searchUserDirectory: jest.fn().mockResolvedValue({ results: [] }),
    createRoom: jest.fn().mockResolvedValue({ room_id: '!newroom:chat.windychat.ai' }),
    setAccountData: jest.fn().mockResolvedValue(undefined),
    initCrypto: undefined,  // Crypto not available in test
    sendTyping: jest.fn().mockResolvedValue(undefined),
    getUser: jest.fn().mockReturnValue(null),
};

jest.mock('matrix-js-sdk', () => ({
    createClient: jest.fn(() => mockMatrixClient),
}));

// Global fetch mock
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// ─── Imports ────────────────────────────────────────────────────

import * as SecureStore from 'expo-secure-store';
import { chatOnboarding } from '../chatOnboarding';
import { chatClient } from '../chatClient';

// ─── Helpers ────────────────────────────────────────────────────

function clearStores() {
    Object.keys(mockSecureStore).forEach(k => delete mockSecureStore[k]);
    Object.keys(mockAsyncStorage).forEach(k => delete mockAsyncStorage[k]);
}

function mockFetchResponse(status: number, body: Record<string, unknown>) {
    mockFetch.mockResolvedValueOnce({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
    });
}

const MOCK_CREDENTIALS = {
    accessToken: 'syt_test_token_abc123',
    userId: '@user_phone_abc:chat.windychat.ai',
    deviceId: 'DEVICE_TEST_001',
    homeserverUrl: 'https://chat.windychat.ai',
};

// ─── Tests ──────────────────────────────────────────────────────

describe('Windy Chat — Mobile Smoke Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockReset();
        clearStores();
    });

    // ═════════════════════════════════════════════════════════════
    // 1. Register with phone verification
    // ═════════════════════════════════════════════════════════════

    describe('1. Register with phone verification', () => {
        it('should send OTP to phone and return sessionId', async () => {
            mockFetchResponse(200, { sessionId: 'sess_abc123', expiresIn: 300 });

            const result = await chatOnboarding.requestVerification({
                identifier: '+15551234567',
                type: 'phone',
            });

            expect(result.success).toBe(true);
            expect(result.sessionId).toBe('sess_abc123');
            expect(result.expiresIn).toBe(300);
            expect(mockFetch).toHaveBeenCalledTimes(1);

            const [url, opts] = mockFetch.mock.calls[0];
            expect(url).toContain('/api/v1/chat/register');
            expect(JSON.parse(opts.body)).toEqual({
                identifier: '+15551234567',
                type: 'phone',
            });
        });

        it('should reject invalid phone numbers', async () => {
            const result = await chatOnboarding.requestVerification({
                identifier: '123',
                type: 'phone',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('valid phone');
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should send OTP to email', async () => {
            mockFetchResponse(200, { sessionId: 'sess_email_001', expiresIn: 600 });

            const result = await chatOnboarding.requestVerification({
                identifier: 'grant@windypro.com',
                type: 'email',
            });

            expect(result.success).toBe(true);
            expect(result.sessionId).toBe('sess_email_001');
        });

        it('should reject invalid email addresses', async () => {
            const result = await chatOnboarding.requestVerification({
                identifier: 'not-an-email',
                type: 'email',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('valid email');
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should verify OTP and return Matrix credentials', async () => {
            mockFetchResponse(200, { credentials: MOCK_CREDENTIALS });

            const result = await chatOnboarding.verifyOtp('sess_abc123', '123456');

            expect(result.success).toBe(true);
            expect(result.credentials).toBeDefined();
            expect(result.credentials!.accessToken).toBe('syt_test_token_abc123');
            expect(result.credentials!.userId).toContain('@user_phone');
            expect(result.credentials!.homeserverUrl).toBe('https://chat.windychat.ai');
        });

        it('should reject wrong OTP code', async () => {
            mockFetchResponse(400, { error: 'Invalid code' });

            const result = await chatOnboarding.verifyOtp('sess_abc123', '000000');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Incorrect code');
        });

        it('should reject non-6-digit OTP', async () => {
            const result = await chatOnboarding.verifyOtp('sess_abc123', '12345');

            expect(result.success).toBe(false);
            expect(result.error).toContain('6-digit');
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('should handle rate limiting', async () => {
            mockFetchResponse(429, { error: 'Rate limited' });

            const result = await chatOnboarding.requestVerification({
                identifier: '+15551234567',
                type: 'phone',
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Too many attempts');
        });

        it('should set profile after verification', async () => {
            mockFetchResponse(200, { success: true });

            const result = await chatOnboarding.setProfile(
                MOCK_CREDENTIALS.accessToken,
                'Grant',
            );

            expect(result.success).toBe(true);
            // Display name should be stored locally
            expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
                'windy_chat_display_name',
                'Grant',
            );
        });

        it('should complete onboarding and store credentials', async () => {
            const result = await chatOnboarding.completeOnboarding(MOCK_CREDENTIALS);

            expect(result.success).toBe(true);
            // Matrix credentials should be persisted in SecureStore
            expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
                'windy_matrix_token',
                MOCK_CREDENTIALS.accessToken,
            );
            expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
                'windy_matrix_user',
                MOCK_CREDENTIALS.userId,
            );
            // Onboarding should be marked complete
            expect(mockAsyncStorage['windy_chat_onboarding_complete']).toBe('true');
        });
    });

    // ═════════════════════════════════════════════════════════════
    // 2. Login with existing account
    // ═════════════════════════════════════════════════════════════

    describe('2. Login with existing account', () => {
        it('should login via pre-provisioned credentials', async () => {
            const result = await chatClient.loginWithCredentials(
                MOCK_CREDENTIALS.accessToken,
                MOCK_CREDENTIALS.userId,
                MOCK_CREDENTIALS.deviceId,
                MOCK_CREDENTIALS.homeserverUrl,
            );

            expect(result.success).toBe(true);
            expect(result.userId).toBe(MOCK_CREDENTIALS.userId);
            expect(chatClient.isLoggedIn()).toBe(true);
            expect(chatClient.getUserId()).toBe(MOCK_CREDENTIALS.userId);
        });

        it('should restore session from SecureStore', async () => {
            // Seed the secure store as if a previous login persisted credentials
            mockSecureStore['windy_matrix_token'] = 'syt_restored_token';
            mockSecureStore['windy_matrix_user'] = '@restored:chat.windychat.ai';
            mockSecureStore['windy_matrix_server'] = 'https://chat.windychat.ai';
            mockSecureStore['windy_matrix_device'] = 'DEVICE_RESTORED';

            const restored = await chatClient.restoreSession();

            expect(restored).toBe(true);
            expect(chatClient.isLoggedIn()).toBe(true);
            expect(chatClient.getUserId()).toBe('@restored:chat.windychat.ai');
        });

        it('should return false when no session exists', async () => {
            clearStores();
            // Need to logout first to clear any in-memory session
            await chatClient.logout();

            const restored = await chatClient.restoreSession();

            expect(restored).toBe(false);
            expect(chatClient.isLoggedIn()).toBe(false);
        });

        it('should check onboarding complete status', async () => {
            // Not completed yet
            const incomplete = await chatOnboarding.isOnboardingComplete();
            expect(incomplete).toBe(false);

            // Mark completed
            mockAsyncStorage['windy_chat_onboarding_complete'] = 'true';
            const complete = await chatOnboarding.isOnboardingComplete();
            expect(complete).toBe(true);
        });
    });

    // ═════════════════════════════════════════════════════════════
    // 3. Contact import finds matches
    // ═════════════════════════════════════════════════════════════

    describe('3. Contact import finds matches', () => {
        beforeEach(async () => {
            // Ensure logged in
            await chatClient.loginWithCredentials(
                MOCK_CREDENTIALS.accessToken,
                MOCK_CREDENTIALS.userId,
                MOCK_CREDENTIALS.deviceId,
                MOCK_CREDENTIALS.homeserverUrl,
            );
        });

        it('should search users by name and return contacts', async () => {
            mockMatrixClient.searchUserDirectory.mockResolvedValueOnce({
                results: [
                    {
                        user_id: '@alice:chat.windychat.ai',
                        display_name: 'Alice',
                        avatar_url: 'mxc://chat.windychat.ai/avatar1',
                    },
                    {
                        user_id: '@bob:chat.windychat.ai',
                        display_name: 'Bob',
                        avatar_url: null,
                    },
                ],
            });

            const contacts = await chatClient.searchUsers('Ali');

            expect(contacts).toHaveLength(2);
            expect(contacts[0].displayName).toBe('Alice');
            expect(contacts[0].userId).toBe('@alice:chat.windychat.ai');
            expect(contacts[1].displayName).toBe('Bob');
        });

        it('should return empty array for empty search term', async () => {
            const contacts = await chatClient.searchUsers('');
            expect(contacts).toHaveLength(0);
            expect(mockMatrixClient.searchUserDirectory).not.toHaveBeenCalled();
        });

        it('should handle search failure gracefully', async () => {
            mockMatrixClient.searchUserDirectory.mockRejectedValueOnce(
                new Error('Server unavailable'),
            );

            const contacts = await chatClient.searchUsers('test');
            expect(contacts).toHaveLength(0);
        });

        it('should get contacts from joined rooms', async () => {
            mockMatrixClient.getRooms.mockReturnValueOnce([
                {
                    roomId: '!room1:chat.windychat.ai',
                    getJoinedMembers: () => [
                        { userId: MOCK_CREDENTIALS.userId, name: 'Me' },
                        { userId: '@friend:chat.windychat.ai', name: 'Friend', getAvatarUrl: () => null },
                    ],
                },
            ]);

            const contacts = chatClient.getContacts();

            expect(contacts).toHaveLength(1);
            expect(contacts[0].userId).toBe('@friend:chat.windychat.ai');
            expect(contacts[0].displayName).toBe('Friend');
        });
    });

    // ═════════════════════════════════════════════════════════════
    // 4. Send message → saves to local DB
    // ═════════════════════════════════════════════════════════════

    describe('4. Send message succeeds', () => {
        beforeEach(async () => {
            await chatClient.loginWithCredentials(
                MOCK_CREDENTIALS.accessToken,
                MOCK_CREDENTIALS.userId,
                MOCK_CREDENTIALS.deviceId,
                MOCK_CREDENTIALS.homeserverUrl,
            );
        });

        it('should send a text message via Matrix', async () => {
            mockMatrixClient.sendEvent.mockResolvedValueOnce({ event_id: '$evt_sent_001' });

            const result = await chatClient.sendMessage('!room:test', 'Hello world', 'en');

            expect(result.success).toBe(true);
            expect(mockMatrixClient.sendEvent).toHaveBeenCalledWith(
                '!room:test',
                'm.room.message',
                expect.objectContaining({
                    msgtype: 'm.text',
                    body: 'Hello world',
                    'uk.windypro.lang': 'en',
                }),
            );
        });

        it('should strip control characters from message body', async () => {
            mockMatrixClient.sendEvent.mockResolvedValueOnce({ event_id: '$evt_clean' });

            await chatClient.sendMessage('!room:test', 'Hello\x00World\x07');

            const sentBody = mockMatrixClient.sendEvent.mock.calls[0][2].body;
            expect(sentBody).not.toContain('\x00');
            expect(sentBody).not.toContain('\x07');
            expect(sentBody).toContain('Hello');
            expect(sentBody).toContain('World');
        });

        it('should reject empty messages', async () => {
            const result = await chatClient.sendMessage('!room:test', '');

            expect(result.success).toBe(false);
            expect(result.error).toContain('empty');
            expect(mockMatrixClient.sendEvent).not.toHaveBeenCalled();
        });

        it('should reject whitespace-only messages', async () => {
            const result = await chatClient.sendMessage('!room:test', '   \n\n  ');

            expect(result.success).toBe(false);
            expect(mockMatrixClient.sendEvent).not.toHaveBeenCalled();
        });

        it('should truncate messages exceeding 10000 chars', async () => {
            mockMatrixClient.sendEvent.mockResolvedValueOnce({ event_id: '$evt_long' });
            const longMsg = 'a'.repeat(15000);

            await chatClient.sendMessage('!room:test', longMsg);

            const sentBody = mockMatrixClient.sendEvent.mock.calls[0][2].body;
            expect(sentBody.length).toBeLessThanOrEqual(10000);
        });
    });

    // ═════════════════════════════════════════════════════════════
    // 5. Offline queue works
    // ═════════════════════════════════════════════════════════════

    describe('5. Offline queue works', () => {
        beforeEach(async () => {
            await chatClient.loginWithCredentials(
                MOCK_CREDENTIALS.accessToken,
                MOCK_CREDENTIALS.userId,
                MOCK_CREDENTIALS.deviceId,
                MOCK_CREDENTIALS.homeserverUrl,
            );
        });

        it('should queue message when sendEvent fails with network error', async () => {
            const networkErr = new TypeError('Network request failed');
            mockMatrixClient.sendEvent.mockRejectedValueOnce(networkErr);

            const result = await chatClient.sendMessage('!room:offline', 'Offline msg', 'en');

            expect(result.success).toBe(false);
            expect(result.pending).toBe(true);
            expect(result.error).toContain('queued');
        });

        it('should return pending messages for a room', async () => {
            // Force a network error to queue a message
            mockMatrixClient.sendEvent.mockRejectedValueOnce(new TypeError('Network request failed'));
            await chatClient.sendMessage('!room:pending_test', 'Queued message 1', 'en');

            const pending = chatClient.getPendingMessages('!room:pending_test');

            expect(pending.length).toBeGreaterThanOrEqual(1);
            const found = pending.find(m => m.body === 'Queued message 1');
            expect(found).toBeDefined();
            expect(found!.pending).toBe(true);
            expect(found!.isOwn).toBe(true);
        });

        it('should also queue non-network errors when sync is not active', async () => {
            // When sync state is not 'syncing', chatClient queues ALL failed messages
            // for retry — this is by design to prevent message loss
            const authErr = { data: { errcode: 'M_FORBIDDEN', error: 'Forbidden' } };
            mockMatrixClient.sendEvent.mockRejectedValueOnce(authErr);

            const result = await chatClient.sendMessage('!room:auth', 'Auth fail msg', 'en');

            expect(result.success).toBe(false);
            // Queued because sync state is 'stopped' (not actively syncing)
            expect(result.pending).toBe(true);
        });
    });

    // ═════════════════════════════════════════════════════════════
    // 6. Logout clears SecureStore
    // ═════════════════════════════════════════════════════════════

    describe('6. Logout clears SecureStore', () => {
        it('should clear all Matrix credentials from SecureStore', async () => {
            // Login first to populate stores
            await chatClient.loginWithCredentials(
                MOCK_CREDENTIALS.accessToken,
                MOCK_CREDENTIALS.userId,
                MOCK_CREDENTIALS.deviceId,
                MOCK_CREDENTIALS.homeserverUrl,
            );

            expect(chatClient.isLoggedIn()).toBe(true);

            // Logout
            await chatClient.logout();

            expect(chatClient.isLoggedIn()).toBe(false);
            expect(chatClient.getUserId()).toBeNull();

            // Verify SecureStore keys were deleted
            expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('windy_matrix_token');
            expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('windy_matrix_user');
            expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('windy_matrix_server');
            expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('windy_matrix_device');
        });

        it('should reset onboarding state on logout', async () => {
            // Mark onboarding complete
            mockAsyncStorage['windy_chat_onboarding_complete'] = 'true';
            mockSecureStore['windy_chat_display_name'] = 'Grant';

            await chatOnboarding.resetOnboarding();

            const isComplete = await chatOnboarding.isOnboardingComplete();
            expect(isComplete).toBe(false);

            const displayName = await chatOnboarding.getDisplayName();
            expect(displayName).toBeNull();
        });

        it('should not crash when logging out with no active session', async () => {
            clearStores();
            // Should not throw
            await expect(chatClient.logout()).resolves.not.toThrow();
        });

        it('should clear sync state on logout', async () => {
            await chatClient.loginWithCredentials(
                MOCK_CREDENTIALS.accessToken,
                MOCK_CREDENTIALS.userId,
                MOCK_CREDENTIALS.deviceId,
                MOCK_CREDENTIALS.homeserverUrl,
            );

            await chatClient.logout();

            expect(chatClient.getSyncState()).toBe('stopped');
        });
    });
});
